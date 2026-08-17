import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import Fastify from 'fastify';

import { editorRoutes } from '../src/routes.js';
import { BLOCK_SKELETONS, CHECKPOINT_SKELETON, freshBlock } from '../src/skeletons.js';
import { LabValidator } from '../src/validate.js';

const REPO = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
const FIXTURE = path.join(REPO, 'renderer', 'test', 'fixtures', 'mini-course');

/**
 * A throwaway git repository holding a copy of the mini fixture
 * course, plus the editor plugin mounted on a bare Fastify app with a
 * fake session layer — the platform's own auth/CSRF stack has its own
 * tests.
 */
async function editorApp() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sept-editor-'));
  const courseDir = path.join(tmp, 'content', 'courses', 'mini');
  fs.cpSync(FIXTURE, courseDir, { recursive: true });
  const git = (...args) => execFileSync('git', ['-C', tmp, ...args], { stdio: 'pipe' });
  git('init', '-q');
  git('-c', 'user.name=Test', '-c', 'user.email=test@demo', 'add', '-A');
  git('-c', 'user.name=Test', '-c', 'user.email=test@demo', 'commit', '-q', '-m', 'seed');

  const user = { email: 'prof@demo', role: 'instructor', courses: ['mini'] };
  const auth = {
    requireUser: () => async (request) => { request.user = user; request.sessionId = 's1'; },
    canAccessCourse: (account, courseId) => account.role === 'admin' || account.courses.includes(courseId),
    csrfToken: () => 'test-csrf',
  };
  const app = Fastify({ logger: false });
  await app.register(editorRoutes, {
    auth,
    publisher: { courses: () => ['mini'] },
    config: { contentDir: path.join(tmp, 'content'), dataDir: path.join(tmp, 'data'), repoDir: tmp },
    courseInfo: () => ({
      id: 'mini', code: 'MINI 1AA3', title: 'Mini course',
      labs: [{ id: 'lab-01', number: 1, kind: 'lab', title: 'Mini lab' }],
    }),
  });
  const cleanup = async () => {
    await app.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  };
  return { app, tmp, git, user, cleanup };
}

/* ── Skeletons stay valid against the live schema ──────────────────── */

test('every palette skeleton produces a schema-valid document when inserted', () => {
  const validator = new LabValidator();
  const base = JSON.parse(fs.readFileSync(
    fs.readdirSync(path.join(FIXTURE, 'labs'))
      .map((entry) => path.join(FIXTURE, 'labs', entry))[0], 'utf8'));
  assert.equal(validator.labErrors(base).length, 0, 'the fixture itself must be valid');

  for (const type of Object.keys(BLOCK_SKELETONS)) {
    const doc = structuredClone(base);
    doc.checkpoints[0].blocks.push(freshBlock(type, 7));
    const errors = validator.labErrors(doc);
    assert.equal(errors.length, 0,
      `skeleton "${type}" must validate: ${errors.map((error) => `${error.path} ${error.message}`).join('; ')}`);
  }

  const withCheckpoint = structuredClone(base);
  withCheckpoint.checkpoints.push(structuredClone(CHECKPOINT_SKELETON));
  assert.equal(validator.labErrors(withCheckpoint).length, 0, 'checkpoint skeleton must validate');
});

test('freshBlock uniquifies placeholder keys and leaves the master copies alone', () => {
  const first = freshBlock('quiz', 3);
  assert.equal(first.id, 'new-3-quiz');
  assert.equal(BLOCK_SKELETONS.quiz.id, 'new-quiz', 'master skeleton untouched');
  const fields = freshBlock('fields', 9);
  assert.equal(fields.fields[0].key, 'new-9-field');
  assert.equal(freshBlock('nope', 1), null);
});

/* ── Draft → validate → apply ──────────────────────────────────────── */

test('drafts may be invalid; apply refuses them; valid drafts commit to git', async () => {
  const { app, tmp, git, cleanup } = await editorApp();
  try {
    const loaded = await app.inject({ url: '/admin/api/editor/mini/lab-01' });
    assert.equal(loaded.statusCode, 200);
    const { document, draft, palette } = loaded.json();
    assert.equal(draft, false);
    assert.ok(palette.includes('quiz'));

    // Break the document: drop a required property.
    const broken = structuredClone(document);
    delete broken.checkpoints[0].blocks[0].type;
    const saved = await app.inject({
      method: 'PUT', url: '/admin/api/editor/mini/lab-01/draft',
      payload: { document: broken },
    });
    assert.equal(saved.statusCode, 200);
    const verdict = saved.json();
    assert.equal(verdict.ok, false);
    assert.ok(verdict.errors.some((error) => error.path.startsWith('/checkpoints/0/blocks/0')),
      'errors are pinned to the offending block');

    // The draft persists — and apply refuses it.
    assert.equal((await app.inject({ url: '/admin/api/editor/mini/lab-01' })).json().draft, true);
    const refused = await app.inject({ method: 'POST', url: '/admin/api/editor/mini/lab-01/apply' });
    assert.equal(refused.statusCode, 422);

    // Fix it with a real edit and apply: the repo gains a commit
    // authored by the signed-in editor, and the draft is gone.
    const fixed = structuredClone(document);
    fixed.checkpoints[0].blocks.push({ type: 'text', paragraphs: ['Added by the editor test.'] });
    await app.inject({
      method: 'PUT', url: '/admin/api/editor/mini/lab-01/draft',
      payload: { document: fixed },
    });
    const applied = await app.inject({ method: 'POST', url: '/admin/api/editor/mini/lab-01/apply' });
    assert.equal(applied.statusCode, 200);
    assert.match(applied.json().commit, /^[0-9a-f]{40}$/);

    const author = git('log', '-1', '--format=%ae').toString().trim();
    assert.equal(author, 'prof@demo');
    const onDisk = JSON.parse(fs.readFileSync(
      path.join(tmp, 'content', 'courses', 'mini', 'labs', 'lab-01.json'), 'utf8'));
    assert.equal(onDisk.checkpoints[0].blocks.at(-1).paragraphs[0], 'Added by the editor test.');
    assert.equal((await app.inject({ url: '/admin/api/editor/mini/lab-01' })).json().draft, false);

    // A second apply with no draft is a 409, not a duplicate commit.
    assert.equal((await app.inject({ method: 'POST', url: '/admin/api/editor/mini/lab-01/apply' })).statusCode, 409);
  } finally {
    await cleanup();
  }
});

test('course access is enforced on every editor surface', async () => {
  const { app, user, cleanup } = await editorApp();
  try {
    user.courses = ['other-course'];
    for (const probe of [
      { url: '/admin/api/editor/mini/lab-01' },
      { method: 'PUT', url: '/admin/api/editor/mini/lab-01/draft', payload: { document: {} } },
      { method: 'POST', url: '/admin/api/editor/mini/lab-01/apply' },
      { url: '/admin/editor/mini/lab-01' },
    ]) {
      const response = await app.inject(probe);
      assert.equal(response.statusCode, 403, `${probe.url} must be 403`);
    }
  } finally {
    await cleanup();
  }
});

/* ── Image upload with mandatory alt text ──────────────────────────── */

function multipartBody(parts) {
  const boundary = '----septtestboundary';
  const chunks = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if (part.filename) {
      chunks.push(Buffer.from(
        `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n`
        + `Content-Type: ${part.type}\r\n\r\n`));
    } else {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${part.name}"\r\n\r\n`));
    }
    chunks.push(Buffer.isBuffer(part.value) ? part.value : Buffer.from(String(part.value)));
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(chunks),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

test('image uploads require alt text and land in the course assets', async () => {
  const { app, tmp, cleanup } = await editorApp();
  try {
    const png = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3]);

    const withoutAlt = multipartBody([
      { name: 'alt', value: '   ' },
      { name: 'file', filename: 'wiring photo.png', type: 'image/png', value: png },
    ]);
    const refused = await app.inject({
      method: 'POST', url: '/admin/api/editor/mini/upload', ...withoutAlt,
    });
    assert.equal(refused.statusCode, 400);
    assert.match(refused.json().error, /alt text is required/);

    const withAlt = multipartBody([
      { name: 'alt', value: 'Breadboard wiring for exercise two' },
      { name: 'file', filename: 'wiring photo.png', type: 'image/png', value: png },
    ]);
    const accepted = await app.inject({
      method: 'POST', url: '/admin/api/editor/mini/upload', ...withAlt,
    });
    assert.equal(accepted.statusCode, 200);
    const { src, alt } = accepted.json();
    assert.match(src, /^wiring-photo\.png$/);
    assert.equal(alt, 'Breadboard wiring for exercise two');
    assert.ok(fs.existsSync(path.join(tmp, 'content', 'courses', 'mini', 'assets', src)));

    // Non-images are refused even with alt text.
    const script = multipartBody([
      { name: 'alt', value: 'not an image' },
      { name: 'file', filename: 'evil.html', type: 'text/html', value: '<script>' },
    ]);
    assert.equal((await app.inject({
      method: 'POST', url: '/admin/api/editor/mini/upload', ...script,
    })).statusCode, 400);
  } finally {
    await cleanup();
  }
});
