import path from 'node:path';
import { fileURLToPath } from 'node:url';

import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';

import { layout, esc, card, csrfField, statusPill } from '../../platform/src/ui.js';
import { BLOCK_SKELETONS, CHECKPOINT_SKELETON, freshBlock } from './skeletons.js';
import { EditorStore } from './store.js';
import { LabValidator } from './validate.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Identify an image by its magic bytes, never by the client's declared
 * type or filename. Returns the format and the extension it may be
 * stored under, or null when the bytes are not one of the four raster
 * formats the platform serves.
 * @param {Buffer} data
 * @returns {{ format: string, extension: string } | null}
 */
function sniffImage(data) {
  const starts = (...bytes) => bytes.every((byte, index) => data[index] === byte);
  if (starts(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)) return { format: 'png', extension: '.png' };
  if (starts(0xFF, 0xD8, 0xFF)) return { format: 'jpeg', extension: '.jpg' };
  if (starts(0x47, 0x49, 0x46, 0x38)) return { format: 'gif', extension: '.gif' };
  if (starts(0x52, 0x49, 0x46, 0x46)
    && data.length > 12 && data.toString('latin1', 8, 12) === 'WEBP') return { format: 'webp', extension: '.webp' };
  return null;
}

/**
 * The content editor — a Fastify plugin the platform mounts under the
 * same session, roles, and CSRF as the rest of the console. See
 * docs/decisions/adr-001-cms.md for why this exists instead of a
 * self-hosted Pages CMS.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {object} opts Injected platform internals.
 */
export async function editorRoutes(app, opts) {
  const { auth, publisher, config, courseInfo } = opts;
  const store = new EditorStore({
    contentDir: path.join(config.contentDir, 'courses'),
    draftsDir: path.join(config.dataDir, 'drafts'),
  });
  const validator = new LabValidator();

  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
  await app.register(fastifyStatic, {
    root: path.join(HERE, '..', 'public'),
    prefix: '/admin/editor-assets/',
    decorateReply: false,
  });

  const visibleCourses = (user) => publisher.courses()
    .filter((courseId) => auth.canAccessCourse(user, courseId));

  const requireCourse = (request, reply) => {
    const { courseId } = request.params;
    if (!auth.canAccessCourse(request.user, courseId)) {
      reply.code(403).send({ error: 'not an instructor for this course' });
      return null;
    }
    return courseId;
  };

  /* ── Pages ──────────────────────────────────────────────────────── */

  app.get('/admin/editor/:courseId?', { preHandler: auth.requireUser() }, async (request, reply) => {
    const user = { ...request.user, _csrf: auth.csrfToken(request.sessionId) };
    const sections = visibleCourses(request.user)
      .filter((courseId) => !request.params.courseId || courseId === request.params.courseId)
      .map((courseId) => {
        const info = courseInfo(courseId);
        const rows = info.labs.map((lab) => {
          const state = store.load(courseId, lab.id);
          return `<tr>
<td>${lab.kind === 'project' ? esc(lab.title) : `Lab ${lab.number} — ${esc(lab.title)}`}</td>
<td>${state?.draft ? '<span class="c-admin-status c-admin-status--running">draft in progress</span>' : statusPill('ok')}</td>
<td><a href="/admin/editor/${esc(courseId)}/${esc(lab.id)}">Edit</a></td></tr>`;
        }).join('');
        return card(`${info.code} — content`, `
<div class="o-scroll-x"><table class="c-admin-table">
<thead><tr><th scope="col">Lab</th><th scope="col">State</th><th scope="col">Open</th></tr></thead>
<tbody>${rows}</tbody></table></div>`);
      }).join('\n');
    reply.type('text/html').send(layout({
      title: 'Editor', user, active: 'editor',
      body: [`<section class="c-card o-stack o-stack--tight" aria-label="How editing works">
<h1 class="c-card__title">Content editor</h1>
<p>Edits save as drafts first — drafts live outside the repository and may be a work in progress.
<strong>Apply</strong> validates a draft against the content schemas and, only when clean, commits
it to the repository under your name. <strong>Publish</strong> then runs the full gated build;
nothing reaches students without every gate passing.</p>
</section>`, sections].join('\n'),
    }));
  });

  app.get('/admin/editor/:courseId/:labId', { preHandler: auth.requireUser() }, async (request, reply) => {
    if (!requireCourse(request, reply)) return;
    const { courseId, labId } = request.params;
    const state = store.load(courseId, labId);
    if (!state) return reply.code(404).send('No such lab.');
    const user = { ...request.user, _csrf: auth.csrfToken(request.sessionId) };
    const checkpointOptions = state.document.checkpoints
      .map((checkpoint, index) => `<option value="${index}">${esc(checkpoint.title)}</option>`)
      .join('');
    reply.type('text/html').send(layout({
      title: `Edit ${state.document.title}`, user, active: 'editor',
      body: `
<section class="c-card o-stack o-stack--tight" aria-label="Editing toolbar">
  <h1 class="c-card__title">${esc(state.document.title)}</h1>
  <p><a href="/admin/editor/${esc(courseId)}">← All labs</a> · content version
  <span class="c-admin-link">${esc(state.document.contentVersion)}</span></p>
  <div class="o-cluster">
    <button class="c-btn c-btn--filled" type="button" id="save-draft">Save draft</button>
    <button class="c-btn c-btn--tonal" type="button" id="apply">Apply to repository</button>
    <button class="c-btn c-btn--text" type="button" id="discard">Discard draft</button>
  </div>
  <p id="editor-status" role="status"></p>
  ${request.user.role === 'admin'
    ? `<form method="post" action="/admin/publish">${csrfField(user._csrf)}
<div class="o-cluster"><button class="c-btn c-btn--text" type="submit">Publish all courses (runs every gate)</button></div></form>`
    : '<p>Publishing runs from the dashboard by an administrator once your change is applied.</p>'}
  <div class="c-field-grid">
    <label class="c-field"><span class="c-field__label">Upload image (inserts a figure block)</span>
      <span class="c-field__row"><input class="c-field__control" type="file" id="upload-file" accept="image/*"></span></label>
    <label class="c-field"><span class="c-field__label">Alt text (required)</span>
      <span class="c-field__row"><input class="c-field__control" type="text" id="upload-alt"
        placeholder="What the image shows, for screen readers"></span></label>
    <label class="c-field"><span class="c-field__label">Into checkpoint</span>
      <span class="c-field__row"><select class="c-field__control" id="upload-checkpoint">${checkpointOptions}</select></span></label>
  </div>
  <div class="o-cluster"><button class="c-btn c-btn--tonal" type="button" id="upload-go">Upload image</button></div>
</section>
<div id="editor-root" class="o-stack" data-course="${esc(courseId)}" data-lab="${esc(labId)}"
     data-csrf="${esc(user._csrf)}"></div>
<script type="module" src="/admin/editor-assets/editor.js"></script>`,
    }));
  });

  /* ── APIs (JSON, CSRF via x-csrf-token header) ──────────────────── */

  app.get('/admin/api/editor/:courseId/:labId', { preHandler: auth.requireUser() }, async (request, reply) => {
    if (!requireCourse(request, reply)) return;
    const { courseId, labId } = request.params;
    const state = store.load(courseId, labId);
    if (!state) return reply.code(404).send({ error: 'no such lab' });
    return reply.send({
      ...state,
      palette: Object.keys(BLOCK_SKELETONS),
      errors: validator.labErrors(state.document),
    });
  });

  app.get('/admin/api/editor/skeleton/:type', { preHandler: auth.requireUser() }, async (request, reply) => {
    if (request.params.type === 'checkpoint') {
      return reply.send({ block: structuredClone(CHECKPOINT_SKELETON) });
    }
    const block = freshBlock(request.params.type, Date.now() % 100_000);
    if (!block) return reply.code(404).send({ error: 'unknown block type' });
    return reply.send({ block });
  });

  app.put('/admin/api/editor/:courseId/:labId/draft', { preHandler: auth.requireUser() }, async (request, reply) => {
    if (!requireCourse(request, reply)) return;
    const { courseId, labId } = request.params;
    const { document } = request.body ?? {};
    if (!document || typeof document !== 'object') {
      return reply.code(400).send({ error: 'body must be { document }' });
    }
    store.saveDraft(courseId, labId, document);
    const errors = validator.labErrors(document);
    return reply.send({ ok: errors.length === 0, draft: true, errors });
  });

  app.delete('/admin/api/editor/:courseId/:labId/draft', { preHandler: auth.requireUser() }, async (request, reply) => {
    if (!requireCourse(request, reply)) return;
    store.discardDraft(request.params.courseId, request.params.labId);
    return reply.send({ ok: true });
  });

  app.post('/admin/api/editor/:courseId/:labId/apply', { preHandler: auth.requireUser() }, async (request, reply) => {
    if (!requireCourse(request, reply)) return;
    const { courseId, labId } = request.params;
    const state = store.load(courseId, labId);
    if (!state) return reply.code(404).send({ error: 'no such lab' });
    if (!state.draft) return reply.code(409).send({ error: 'nothing to apply — no draft' });
    const errors = validator.labErrors(state.document);
    if (errors.length > 0) {
      return reply.code(422).send({ ok: false, errors });
    }
    const commit = await store.apply(courseId, labId, state.document, request.user.email);
    return reply.send({ ok: true, commit });
  });

  app.post('/admin/api/editor/:courseId/upload', { preHandler: auth.requireUser() }, async (request, reply) => {
    if (!requireCourse(request, reply)) return;
    const upload = await request.file();
    if (!upload) return reply.code(400).send({ error: 'attach an image file' });
    const alt = String(upload.fields.alt?.value ?? '').trim();
    if (alt === '') {
      return reply.code(400).send({ error: 'alt text is required — describe the image for screen readers' });
    }
    // The declared MIME type and the filename are both attacker-chosen:
    // an "image/png" part named evil.svg or evil.html would otherwise be
    // written into the course assets and served from the site's own
    // origin as executable markup. Trust the bytes, and only store an
    // extension the sniffed format actually justifies. SVG is excluded
    // deliberately — it is a script-bearing document, not a flat image.
    const data = await upload.toBuffer();
    const format = sniffImage(data);
    if (!format) {
      return reply.code(400).send({
        error: 'only PNG, JPEG, GIF, or WebP images are accepted (SVG is not, since it can carry scripts)',
      });
    }
    const src = store.saveAsset(request.params.courseId, upload.filename, data, format.extension);
    return reply.send({ ok: true, src, alt });
  });
}
