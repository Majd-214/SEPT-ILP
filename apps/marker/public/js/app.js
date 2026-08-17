/**
 * The marker's UI shell. All marking logic lives in engine.js; this
 * file only moves data between the page and the engine.
 *
 * Network policy: the ONLY network calls in the marker are same-origin
 * GETs for answer keys (/keys…), and the server sends this page with a
 * Content-Security-Policy whose connect-src is 'self' and form-action
 * is 'none'. Student submissions are read with FileReader and never
 * leave this browser.
 */
import {
  batchFlags, isAnswerKey, markSession, matchKey, normalizeSubmission,
  resolveEvidence, verifyExportHash,
} from './engine.js';
import { readZip, storeZip } from './zip.js';
import { allFlags, brightspaceCsv, feedbackFile, genericCsv } from './csv.js';

const keys = [];
/** @type {{ result: object, expanded: boolean }[]} */
const batch = [];
const failures = [];

const el = (id) => document.getElementById(id);
const esc = (text) => String(text ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

/* ── Keys ──────────────────────────────────────────────────────────── */

function addKey(doc, origin) {
  const existing = keys.findIndex((key) => key.labId === doc.labId
    && key.contentVersion === doc.contentVersion && key.courseId === doc.courseId);
  if (existing !== -1) keys.splice(existing, 1);
  keys.push({ ...doc, origin });
  renderKeys();
  remarkAll();
}

async function loadServerKeys() {
  try {
    const index = await (await fetch('/keys')).json();
    for (const courseId of index.courses ?? []) {
      const listing = await (await fetch(`/keys/${courseId}`)).json();
      for (const summary of listing.keys ?? []) {
        const doc = await (await fetch(summary.href)).json();
        if (isAnswerKey(doc)) addKey(doc, 'server');
      }
    }
    el('keys-status').textContent = keys.length > 0
      ? `${keys.length} answer key${keys.length === 1 ? '' : 's'} loaded from the live release.`
      : 'No published answer keys found — drop key files below to mark offline.';
  } catch {
    el('keys-status').textContent = 'Could not reach the platform — drop answer-key files below to mark offline.';
  }
}

function renderKeys() {
  const body = keys.map((key) => `<tr>
<td>${esc(key.courseId)}</td>
<td><strong>${esc(key.labId)}</strong> — ${esc(key.labTitle)}</td>
<td class="c-admin-link">${esc(key.contentVersion)}</td>
<td class="u-numeric">${key.totals.items}</td>
<td class="u-numeric">${key.totals.points}${key.totals.override ? ` → /${key.totals.override}` : ''}</td>
<td>${esc(key.origin)}</td></tr>`).join('');
  el('keys-table').innerHTML = body
    || '<tr><td colspan="6">No keys yet. Keys load automatically from the platform when signed in, or drop .key.json files here.</td></tr>';
}

/* ── Intake ────────────────────────────────────────────────────────── */

async function handleFiles(files) {
  for (const file of files) {
    try {
      if (/\.zip$/i.test(file.name)) await intakeZip(file);
      else if (/\.json$/i.test(file.name)) await intakeJson(file);
      else failures.push({ file: file.name, error: 'not a .zip or .json file' });
    } catch (error) {
      failures.push({ file: file.name, error: error.message });
    }
  }
  renderBatch();
}

async function intakeZip(file) {
  const entries = await readZip(await file.arrayBuffer());
  const completion = entries.find((entry) => entry.name === 'completion.json'
    || entry.name.endsWith('/completion.json'));
  if (!completion) throw new Error('no completion.json inside the ZIP');
  const doc = JSON.parse(new TextDecoder().decode(completion.data));
  const normalized = normalizeSubmission(file.name, doc);
  if (!normalized.ok) throw new Error(normalized.error);
  const { session } = normalized;
  session.zipEntries = entries.map((entry) => ({ name: entry.name, size: entry.data.length }));
  const badCrc = entries.filter((entry) => !entry.crcOk).map((entry) => entry.name);
  session.intakeFlags = badCrc.length > 0
    ? [`ZIP entries failed their checksum (${badCrc.join(', ')}) — review suggested`] : [];
  session.integrityChecked = await verifyExportHash(doc);
  enqueue(session);
}

async function intakeJson(file) {
  const doc = JSON.parse(await file.text());
  if (isAnswerKey(doc)) { addKey(doc, 'file'); return; }
  const normalized = normalizeSubmission(file.name, doc);
  if (!normalized.ok) throw new Error(normalized.error);
  const { session } = normalized;
  session.zipEntries = [];
  session.intakeFlags = [];
  session.integrityChecked = await verifyExportHash(doc);
  enqueue(session);
}

function enqueue(session) {
  const index = batch.findIndex((row) => row.result.session.source === session.source);
  if (index !== -1) batch.splice(index, 1);
  batch.push({ result: mark(session), expanded: false });
}

function mark(session) {
  const match = matchKey(session, keys);
  if (!match) {
    return {
      session,
      key: null,
      items: [],
      flags: [...session.intakeFlags,
        `no answer key for lab "${session.labId || 'unknown'}" — load its key and it will be re-marked`],
      totals: { points: 0, earned: 0, override: null, scaled: null, out_of: 0, grade: 0 },
    };
  }
  resolveEvidence(session, match.key, session.zipEntries);
  const result = markSession(session, match.key, match);
  result.flags.unshift(...session.intakeFlags);
  return result;
}

function remarkAll() {
  for (const row of batch) row.result = mark(row.result.session);
  renderBatch();
}

/* ── Results table ─────────────────────────────────────────────────── */

function renderBatch() {
  batchFlags(batch.map((row) => row.result));
  const rows = [];
  batch.forEach((row, index) => {
    const { result } = row;
    const { session, totals } = result;
    const flags = allFlags(result);
    rows.push(`<tr>
<td><span class="c-admin-link">${esc(session.source)}</span></td>
<td>${esc(session.student?.name_or_team ?? '')}<br><span class="c-admin-link">${esc(session.student?.student_numbers ?? '')}</span></td>
<td>${result.key ? `${esc(result.key.labId)}` : '<span class="c-admin-status c-admin-status--fail">no key</span>'}</td>
<td class="u-numeric"><strong>${totals.earned}</strong> / ${totals.points}${totals.override !== null ? `<br>→ ${totals.scaled} / ${totals.override}` : ''}</td>
<td>${flags.length > 0 ? `<span class="c-admin-flag">⚑ ${flags.length} review note${flags.length === 1 ? '' : 's'}</span>` : '<span class="c-admin-status c-admin-status--ok">clean</span>'}</td>
<td><button class="c-btn c-btn--text" type="button" data-toggle="${index}" aria-expanded="${row.expanded}">${row.expanded ? 'Hide' : 'Details'}</button>
<button class="c-btn c-btn--text" type="button" data-remove="${index}">Remove</button></td></tr>`);
    if (row.expanded) {
      rows.push(`<tr><td colspan="6"><div class="c-admin-breakdown">
${result.items.map((item) => `<div class="c-admin-item-row">
<span>${esc(item.label)}<br><span class="c-admin-link">${esc(item.id)}</span> — ${esc(item.detail)}${item.unitsNote ? `<br>${esc(item.unitsNote)}` : ''}</span>
<span class="c-admin-item-points">${item.earned}/${item.points}</span></div>`).join('')}
${flags.length > 0 ? `<div class="c-admin-item-row"><span>${flags.map((flag) => `<span class="c-admin-flag">⚑ ${esc(flag)}</span>`).join('<br>')}</span></div>` : ''}
</div></td></tr>`);
    }
  });
  el('batch-table').innerHTML = rows.join('')
    || '<tr><td colspan="6">Drop submission ZIPs or progress files above to mark them.</td></tr>';

  el('failures').innerHTML = failures.map((failure) =>
    `<p class="c-admin-error">${esc(failure.file)}: ${esc(failure.error)}</p>`).join('');

  const marked = batch.filter((row) => row.result.key);
  el('export-tools').hidden = marked.length === 0;
  el('batch-summary').textContent = batch.length === 0 ? ''
    : `${batch.length} submission${batch.length === 1 ? '' : 's'} · ${marked.length} marked · ${batch.length - marked.length} awaiting a key`;
}

/* ── Exports ───────────────────────────────────────────────────────── */

function download(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function markedByLab() {
  const groups = new Map();
  for (const row of batch) {
    if (!row.result.key) continue;
    const labId = row.result.key.labId;
    if (!groups.has(labId)) groups.set(labId, []);
    groups.get(labId).push(row.result);
  }
  return groups;
}

function exportBrightspace() {
  const groups = markedByLab();
  const itemName = el('grade-item-name').value.trim();
  const files = [...groups.entries()].map(([labId, results]) => {
    const name = (groups.size === 1 && itemName) || results[0].key.labTitle;
    const { csv, skipped } = brightspaceCsv(results, name);
    if (skipped.length > 0) {
      failures.push({
        file: `brightspace-${labId}.csv`,
        error: `no student numbers found in: ${skipped.map((result) => result.session.source).join(', ')} — enter those grades manually`,
      });
    }
    return { name: `brightspace-${labId}.csv`, data: new TextEncoder().encode(csv) };
  });
  if (files.length === 1) download(files[0].name, files[0].data, 'text/csv');
  else download('brightspace-import.zip', storeZip(files), 'application/zip');
  renderBatch();
}

function exportGeneric() {
  const results = [...markedByLab().values()].flat();
  download('marks.csv', genericCsv(results), 'text/csv');
}

function exportFeedback() {
  const results = [...markedByLab().values()].flat();
  const files = results.map((result) => {
    const feedback = feedbackFile(result);
    return { name: feedback.name, data: new TextEncoder().encode(feedback.text) };
  });
  download('feedback-files.zip', storeZip(files), 'application/zip');
}

/* ── Wiring ────────────────────────────────────────────────────────── */

function wireDropzone(zone, input, onFiles) {
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input.click(); }
  });
  zone.addEventListener('dragover', (event) => {
    event.preventDefault();
    zone.classList.add('is-dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-dragover'));
  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    zone.classList.remove('is-dragover');
    onFiles([...event.dataTransfer.files]);
  });
  input.addEventListener('change', () => {
    onFiles([...input.files]);
    input.value = '';
  });
}

document.addEventListener('click', (event) => {
  const toggle = event.target.closest('[data-toggle]');
  if (toggle) {
    const row = batch[Number(toggle.dataset.toggle)];
    row.expanded = !row.expanded;
    renderBatch();
    return;
  }
  const remove = event.target.closest('[data-remove]');
  if (remove) {
    batch.splice(Number(remove.dataset.remove), 1);
    renderBatch();
  }
});

el('export-brightspace').addEventListener('click', exportBrightspace);
el('export-generic').addEventListener('click', exportGeneric);
el('export-feedback').addEventListener('click', exportFeedback);
el('clear-failures').addEventListener('click', () => { failures.length = 0; renderBatch(); });

wireDropzone(el('dropzone'), el('file-input'), handleFiles);
renderKeys();
renderBatch();
loadServerKeys();
