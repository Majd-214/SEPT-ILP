import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

/**
 * The invariant: student submissions never leave the instructor's
 * browser. Three layers enforce it — the platform's CSP on /marker/
 * (connect-src 'self', form-action 'none'), the absence of any student
 * POST route on the server, and the marker source itself. This test
 * pins the third layer: no network primitive other than the
 * answer-key GETs may appear anywhere in the marker's code.
 */

const PUBLIC = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'public');

const sources = () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|html)$/.test(entry.name)) files.push(full);
    }
  };
  walk(PUBLIC);
  return files.map((file) => ({ file: path.relative(PUBLIC, file), text: fs.readFileSync(file, 'utf8') }));
};

test('no network primitive exists in the marker besides same-origin key fetches', () => {
  const forbidden = [
    /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /EventSource/,
    /serviceWorker/, /importScripts/, /new\s+Worker/,
    /\bimport\s*\(/, // dynamic import could pull remote code
  ];
  for (const { file, text } of sources()) {
    for (const pattern of forbidden) {
      assert.ok(!pattern.test(text), `${file} must not use ${pattern}`);
    }
  }
});

test('every fetch() call requests answer keys from this origin, nothing else', () => {
  const KEY_FETCHES = [
    "fetch('/keys')",
    'fetch(`/keys/${courseId}`)',
    'fetch(summary.href)', // hrefs come from the platform's own /keys listing
  ];
  for (const { file, text } of sources()) {
    const calls = text.match(/fetch\s*\([^)]*\)/g) ?? [];
    for (const call of calls) {
      assert.ok(KEY_FETCHES.includes(call),
        `${file}: unexpected network call ${call}`);
    }
    if (file !== 'js/app.js') {
      assert.equal(calls.length, 0, `${file} must not fetch at all`);
    }
  }
});

test('the page pulls no external resources', () => {
  const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.ok(url.startsWith('/') || url.startsWith('#'),
      `external or relative-scheme resource in index.html: ${url}`);
    assert.ok(!/^\/\//.test(url), `protocol-relative URL in index.html: ${url}`);
  }
  assert.ok(!/https?:\/\//.test(html.replace(/<!--[\s\S]*?-->/g, '')),
    'no absolute URLs anywhere in the page');
});
