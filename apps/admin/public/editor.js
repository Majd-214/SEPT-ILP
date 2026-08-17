/**
 * The block editor client. State lives in one document object; every
 * mutation re-renders the outline. Blocks are edited as JSON with the
 * server's AJV errors pinned to the exact block they belong to —
 * see docs/decisions/adr-001-cms.md for the reasoning.
 */
const root = document.getElementById('editor-root');
const status = document.getElementById('editor-status');
const { course, lab, csrf } = root.dataset;

const API = `/admin/api/editor/${course}/${lab}`;
const HEADERS = { 'content-type': 'application/json', 'x-csrf-token': csrf };
// Bodyless requests must not claim a JSON body — Fastify rejects
// content-type: application/json with an empty payload.
const BARE_HEADERS = { 'x-csrf-token': csrf };

let doc = null;
let palette = [];
let errors = [];
let dirty = false;
/** @type {Set<string>} Open block editors, as "checkpoint.block" keys. */
const open = new Set();

const esc = (text) => String(text ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

function say(message, isError = false) {
  status.textContent = message;
  status.className = isError ? 'c-admin-error' : '';
}

/** Server AJV errors whose path points into checkpoint ci, block bi. */
function blockErrors(ci, bi) {
  const prefix = `/checkpoints/${ci}/blocks/${bi}`;
  return errors.filter((error) => error.path === prefix || error.path.startsWith(`${prefix}/`));
}

function documentErrors() {
  return errors.filter((error) => !/^\/checkpoints\/\d+\/blocks\//.test(error.path));
}

/** A one-line human summary of a block's content. */
function summarize(block) {
  const text = block.title ?? block.prompt ?? block.label ?? block.summary
    ?? block.paragraphs?.[0] ?? block.items?.[0]?.label ?? block.items?.[0]
    ?? block.code ?? block.expression ?? '';
  const flat = typeof text === 'string' ? text : JSON.stringify(text);
  return flat.length > 90 ? `${flat.slice(0, 90)}…` : flat;
}

function render() {
  const sections = doc.checkpoints.map((checkpoint, ci) => {
    const blocks = checkpoint.blocks.map((block, bi) => {
      const key = `${ci}.${bi}`;
      const pinned = blockErrors(ci, bi);
      const editor = open.has(key) ? `
<div class="c-admin-breakdown">
  <label class="c-field"><span class="c-field__label">Block JSON</span>
  <span class="c-field__row"><textarea class="c-field__control" rows="14"
    data-edit="${key}" spellcheck="false">${esc(JSON.stringify(block, null, 2))}</textarea></span></label>
  <div data-parse-error="${key}"></div>
</div>` : '';
      return `
<div class="c-admin-block${pinned.length ? ' has-errors' : ''}">
  <span class="c-admin-block__type">${esc(block.type)}</span>
  <span class="c-admin-block__summary">${esc(summarize(block))}</span>
  <span class="c-admin-block__tools">
    <button class="c-btn c-btn--text" type="button" data-move="${key}:-1" aria-label="Move block up">↑</button>
    <button class="c-btn c-btn--text" type="button" data-move="${key}:1" aria-label="Move block down">↓</button>
    <button class="c-btn c-btn--text" type="button" data-open="${key}" aria-expanded="${open.has(key)}">${open.has(key) ? 'Close' : 'Edit'}</button>
    <button class="c-btn c-btn--text" type="button" data-delete="${key}" aria-label="Delete block">✕</button>
  </span>
</div>
${pinned.map((error) => `<p class="c-admin-error">${esc(error.path.slice(`/checkpoints/${ci}/blocks/`.length))}: ${esc(error.message)}</p>`).join('')}
${editor}`;
    }).join('\n');

    return `<section class="c-card o-stack o-stack--tight" aria-label="${esc(checkpoint.title)}">
<h2 class="c-card__title">${ci + 1}. ${esc(checkpoint.title)}
  <span class="c-admin-link">${esc(checkpoint.id)}</span></h2>
<div class="o-stack o-stack--tight">${blocks}</div>
<div class="o-cluster">
  <label class="c-field"><span class="c-field__label u-visually-hidden">Block type to add</span>
    <span class="c-field__row"><select class="c-field__control" data-palette="${ci}">
      ${palette.map((type) => `<option value="${type}">${type}</option>`).join('')}
    </select></span></label>
  <button class="c-btn c-btn--tonal" type="button" data-add="${ci}">Add block</button>
</div>
</section>`;
  }).join('\n');

  const pageErrors = documentErrors();
  root.innerHTML = `
${pageErrors.length ? `<section class="c-card o-stack o-stack--tight" aria-label="Document problems">
<h2 class="c-card__title">Document problems</h2>
${pageErrors.map((error) => `<p class="c-admin-error">${esc(error.path)}: ${esc(error.message)}</p>`).join('')}
</section>` : ''}
${sections}`;
}

/* ── Mutations ─────────────────────────────────────────────────────── */

function locate(key) {
  const [ci, bi] = key.split('.').map(Number);
  return { ci, bi, list: doc.checkpoints[ci].blocks };
}

root.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;

  if (button.dataset.open) {
    const key = button.dataset.open;
    if (open.has(key)) open.delete(key); else open.add(key);
    render();
  }

  if (button.dataset.delete) {
    const { bi, list } = locate(button.dataset.delete);
    list.splice(bi, 1);
    open.delete(button.dataset.delete);
    dirty = true;
    say('Block deleted — save the draft to keep it.');
    render();
  }

  if (button.dataset.move) {
    const [key, delta] = button.dataset.move.split(':');
    const { bi, list } = locate(key);
    const to = bi + Number(delta);
    if (to < 0 || to >= list.length) return;
    [list[bi], list[to]] = [list[to], list[bi]];
    dirty = true;
    render();
  }

  if (button.dataset.add !== undefined) {
    const ci = Number(button.dataset.add);
    const type = root.querySelector(`[data-palette="${ci}"]`).value;
    const response = await fetch(`/admin/api/editor/skeleton/${type}`, { headers: BARE_HEADERS });
    const { block } = await response.json();
    doc.checkpoints[ci].blocks.push(block);
    const key = `${ci}.${doc.checkpoints[ci].blocks.length - 1}`;
    open.add(key);
    dirty = true;
    say(`Added a ${type} block — edit its placeholders, then save the draft.`);
    render();
  }
});

root.addEventListener('input', (event) => {
  const textarea = event.target.closest('[data-edit]');
  if (!textarea) return;
  const key = textarea.dataset.edit;
  const errorBox = root.querySelector(`[data-parse-error="${CSS.escape(key)}"]`);
  try {
    const parsed = JSON.parse(textarea.value);
    const { bi, list } = locate(key);
    list[bi] = parsed;
    dirty = true;
    errorBox.innerHTML = '';
    // Refresh this block's summary line without re-rendering (and
    // stealing focus from) the textarea being typed in.
    const row = textarea.closest('.c-admin-breakdown').previousElementSibling;
    const typeEl = row?.querySelector('.c-admin-block__type');
    const summaryEl = row?.querySelector('.c-admin-block__summary');
    if (typeEl) typeEl.textContent = parsed.type ?? '?';
    if (summaryEl) summaryEl.textContent = summarize(parsed);
  } catch (error) {
    errorBox.innerHTML = `<p class="c-admin-error">Not valid JSON yet: ${esc(error.message)}</p>`;
  }
});

/* ── Toolbar ───────────────────────────────────────────────────────── */

document.getElementById('save-draft').addEventListener('click', async () => {
  const response = await fetch(`${API}/draft`, {
    method: 'PUT', headers: HEADERS, body: JSON.stringify({ document: doc }),
  });
  const result = await response.json();
  errors = result.errors ?? [];
  dirty = false;
  say(result.ok
    ? 'Draft saved — valid against the content schemas. Apply when ready.'
    : `Draft saved with ${errors.length} validation issue${errors.length === 1 ? '' : 's'} — they are pinned below.`,
  !result.ok);
  render();
});

document.getElementById('apply').addEventListener('click', async () => {
  if (dirty) { say('Save the draft first — Apply commits the saved draft.', true); return; }
  const response = await fetch(`${API}/apply`, { method: 'POST', headers: BARE_HEADERS });
  const result = await response.json();
  if (result.ok) {
    errors = [];
    say(`Applied and committed (${result.commit.slice(0, 10)}). Publish from the dashboard to run the gates.`);
  } else if (result.errors) {
    errors = result.errors;
    say('Apply refused — the draft has validation issues, pinned below.', true);
  } else {
    say(result.error ?? 'Apply failed.', true);
  }
  render();
});

document.getElementById('discard').addEventListener('click', async () => {
  await fetch(`${API}/draft`, { method: 'DELETE', headers: BARE_HEADERS });
  await boot();
  say('Draft discarded — showing the committed version.');
});

document.getElementById('upload-go').addEventListener('click', async () => {
  const file = document.getElementById('upload-file').files[0];
  const alt = document.getElementById('upload-alt').value.trim();
  if (!file) { say('Choose an image file first.', true); return; }
  if (!alt) { say('Alt text is required — describe the image for screen readers.', true); return; }
  const body = new FormData();
  body.append('alt', alt);
  body.append('file', file, file.name);
  const response = await fetch(`/admin/api/editor/${course}/upload`, {
    method: 'POST', headers: { 'x-csrf-token': csrf }, body,
  });
  const result = await response.json();
  if (!result.ok) { say(result.error ?? 'Upload failed.', true); return; }
  const ci = Number(document.getElementById('upload-checkpoint').value);
  doc.checkpoints[ci].blocks.push({ type: 'figure', src: result.src, alt: result.alt });
  dirty = true;
  say(`Uploaded ${result.src} and inserted a figure block — save the draft to keep it.`);
  render();
});

/* ── Boot ──────────────────────────────────────────────────────────── */

async function boot() {
  const response = await fetch(API, { headers: BARE_HEADERS });
  if (!response.ok) { say('Could not load the lab.', true); return; }
  const state = await response.json();
  doc = state.document;
  palette = state.palette;
  errors = state.errors ?? [];
  dirty = false;
  open.clear();
  render();
  if (state.draft) say('A draft is in progress — you are editing the draft, not the committed version.');
}

boot();
