import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

/** A fresh app on a throwaway data directory, with captured email. */
async function testApp() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sept-platform-'));
  const app = await buildApp(loadConfig({ DATA_DIR: dataDir, BASE_URL: 'http://test.local' }));
  /** @type {{ to: string, subject: string, text: string }[]} */
  const outbox = [];
  app.platform.auth.mailer.send = async (to, subject, text) => {
    outbox.push({ to, subject, text });
  };
  const cleanup = async () => {
    await app.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  };
  return { app, outbox, cleanup };
}

/** Extract the magic-link token from a captured email. */
function tokenFrom(mail) {
  return /\/auth\/([A-Za-z0-9_-]+)/.exec(mail.text)[1];
}

/** Sign in a user created directly in the database; returns cookie jar. */
async function signIn(app, outbox, email, role, courses = []) {
  await app.platform.auth.invite(email, role, courses);
  const token = tokenFrom(outbox.at(-1));
  const response = await app.inject({ url: `/auth/${token}` });
  assert.equal(response.statusCode, 302);
  const cookie = response.headers['set-cookie'].split(';')[0];
  return cookie;
}

test('magic-link flow: invite → emailed link → session; links are one-time', async () => {
  const { app, outbox, cleanup } = await testApp();
  try {
    await app.platform.auth.invite('prof@demo', 'instructor', ['smrttech-3cc3']);
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0].to, 'prof@demo');
    const token = tokenFrom(outbox[0]);

    const first = await app.inject({ url: `/auth/${token}` });
    assert.equal(first.statusCode, 302);
    assert.equal(first.headers.location, '/admin');
    assert.match(first.headers['set-cookie'], /sept_session=/);

    // Replay is refused.
    const replay = await app.inject({ url: `/auth/${token}` });
    assert.equal(replay.headers.location, '/login?invalid=1');

    // Unknown emails produce no mail and no enumeration signal.
    const anonymous = await app.inject({
      method: 'POST', url: '/login', payload: { email: 'stranger@nowhere' },
    });
    assert.equal(anonymous.statusCode, 302);
    assert.equal(outbox.length, 1);
  } finally {
    await cleanup();
  }
});

test('sessions gate the console; roles gate the keys', async () => {
  const { app, outbox, cleanup } = await testApp();
  try {
    // Anonymous: console redirects to login; keys endpoints refuse.
    const anonymous = await app.inject({ url: '/admin' });
    assert.equal(anonymous.statusCode, 302);
    assert.equal((await app.inject({ url: '/keys/smrttech-3cc3/lab-01.key.json' })).statusCode, 401);

    // Instructor for course A cannot read course B's keys.
    const cookie = await signIn(app, outbox, 'prof@demo', 'instructor', ['course-a']);
    const forbidden = await app.inject({
      url: '/keys/course-b/lab-01.key.json', headers: { cookie },
    });
    assert.equal(forbidden.statusCode, 403);

    // Their own course: allowed through the role check (404 only because
    // nothing is published in this test environment).
    const allowed = await app.inject({
      url: '/keys/course-a/lab-01.key.json', headers: { cookie },
    });
    assert.equal(allowed.statusCode, 404);

    // Admin passes everywhere; instructors cannot reach admin pages.
    const admin = await signIn(app, outbox, 'admin@demo', 'admin');
    assert.equal((await app.inject({ url: '/admin/invites', headers: { cookie: admin } })).statusCode, 200);
    assert.equal((await app.inject({ url: '/admin/invites', headers: { cookie } })).statusCode, 403);
  } finally {
    await cleanup();
  }
});

test('authenticated posts require the CSRF token', async () => {
  const { app, outbox, cleanup } = await testApp();
  try {
    const cookie = await signIn(app, outbox, 'admin@demo', 'admin');

    const without = await app.inject({
      method: 'POST', url: '/admin/invites', headers: { cookie },
      payload: { email: 'x@y', role: 'instructor' },
    });
    assert.equal(without.statusCode, 403);

    const page = await app.inject({ url: '/admin/invites', headers: { cookie } });
    const token = /name="_csrf" value="([^"]+)"/.exec(page.body)[1];
    const withToken = await app.inject({
      method: 'POST', url: '/admin/invites', headers: { cookie },
      payload: { email: 'new@demo', role: 'instructor', courses: 'course-a', _csrf: token },
    });
    assert.equal(withToken.statusCode, 302);
  } finally {
    await cleanup();
  }
});

test('the platform accepts no student data: no student routes exist', async () => {
  const { app, cleanup } = await testApp();
  try {
    // Every POST surface is faculty auth or session-bound; a student-ish
    // submission attempt has nowhere to land.
    for (const url of ['/submit', '/api/progress', '/c/smrttech-3cc3/lab-01/submit']) {
      const response = await app.inject({ method: 'POST', url, payload: { data: 'x' } });
      assert.ok([404, 405].includes(response.statusCode), `${url} → ${response.statusCode}`);
    }
    // The public site path serves files only (GET), and only from releases.
    const get = await app.inject({ url: '/c/smrttech-3cc3/lab-01/' });
    assert.equal(get.statusCode, 404); // nothing published in this environment
  } finally {
    await cleanup();
  }
});

test('encoded path traversal cannot reach another course’s answer keys', async () => {
  const { app, outbox, cleanup } = await testApp();
  try {
    const cookie = await signIn(app, outbox, 'prof@demo', 'instructor', ['course-a']);
    // find-my-way decodes %2f to a literal "/" INSIDE a route param
    // after segment splitting, so a single-looking segment can smuggle
    // a traversal. Every one of these must be refused before it can
    // reach path.join — this is how a one-course instructor would
    // otherwise read every other course's keys.
    const traversals = [
      '/keys/course-a/..%2f..%2f..%2fcourse-b%2fkeys%2fcourse-b%2flab-01.key.json',
      '/keys/course-a/%2e%2e%2f%2e%2e%2fcourse-b%2fkeys%2fcourse-b%2flab-01.key.json',
      '/keys/..%2fcourse-b/lab-01.key.json',
    ];
    for (const url of traversals) {
      const response = await app.inject({ url, headers: { cookie } });
      assert.ok([400, 403, 404].includes(response.statusCode),
        `${url} → ${response.statusCode} (must not be 200)`);
      assert.ok(!String(response.body).includes('"items"'),
        `${url} leaked key content`);
    }
    // The legitimate shape still works (404 only because nothing is
    // published in this environment).
    assert.equal((await app.inject({
      url: '/keys/course-a/lab-01.key.json', headers: { cookie },
    })).statusCode, 404);
  } finally {
    await cleanup();
  }
});

test('publish reports are admin-only; they name filesystem paths', async () => {
  const { app, outbox, cleanup } = await testApp();
  try {
    const instructor = await signIn(app, outbox, 'prof@demo', 'instructor', ['course-a']);
    assert.equal((await app.inject({ url: '/admin/publish/1', headers: { cookie: instructor } })).statusCode, 403);
    const admin = await signIn(app, outbox, 'admin@demo', 'admin');
    // 404 (no such run) rather than 403 — the admin passes the gate.
    assert.equal((await app.inject({ url: '/admin/publish/1', headers: { cookie: admin } })).statusCode, 404);
  } finally {
    await cleanup();
  }
});

test('a real deployment cannot start on development defaults', () => {
  const real = { BASE_URL: 'https://labs.mcmaster.ca', DATA_DIR: '/tmp/x' };

  // Mail: the file transport prints sign-in links to the server's
  // terminal, which is a development convenience and a disclosure risk
  // anywhere else — so a non-localhost origin must name a relay.
  assert.throws(() => loadConfig(real), /SMTP_HOST/);

  // Cookies: the shipped default secret would let anyone forge a session.
  assert.throws(
    () => loadConfig({ ...real, SMTP_HOST: 'relay.mcmaster.ca' }),
    /COOKIE_SECRET/);

  // Both supplied: a real deployment loads, and relays its mail.
  const production = loadConfig({
    ...real, SMTP_HOST: 'relay.mcmaster.ca', COOKIE_SECRET: 'a'.repeat(32),
  });
  assert.equal(production.mailTransport, 'smtp');

  // Local development needs neither, and writes mail to disk instead.
  const local = loadConfig({ DATA_DIR: '/tmp/x' });
  assert.equal(local.mailTransport, 'file');
  assert.equal(local.baseUrl, 'http://localhost:3000');
  assert.ok(local.cookieSecret);

  // Opting into the file sink for a real origin stays possible, but only
  // by saying so explicitly.
  assert.equal(loadConfig({
    ...real, MAIL_TRANSPORT: 'file', COOKIE_SECRET: 'a'.repeat(32),
  }).mailTransport, 'file');
});

test('with no mail server, sign-in links land on disk and in the terminal', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sept-mail-'));
  const printed = [];
  const realLog = console.log;
  console.log = (...args) => printed.push(args.join(' '));
  try {
    // No SMTP_HOST, no MAIL_QUIET: exactly what a developer gets by
    // running `npm start` on a machine with nothing else installed.
    const app = await buildApp(loadConfig({ DATA_DIR: dataDir }));
    await app.platform.auth.invite('prof@demo', 'instructor', ['smrttech-3cc3']);
    await app.close();

    const mailDir = path.join(dataDir, 'mail');
    const files = fs.readdirSync(mailDir);
    assert.equal(files.length, 1, 'one message written');
    assert.match(files[0], /prof-demo\.eml$/);

    const message = fs.readFileSync(path.join(mailDir, files[0]), 'utf8');
    assert.match(message, /^To: <prof@demo>$/m);
    assert.match(message, /Content-Type: text\/plain/);
    const link = /http:\/\/localhost:3000\/auth\/[A-Za-z0-9_-]+/.exec(message);
    assert.ok(link, 'the message carries a usable sign-in link');

    // And the same link is printed, because a file nobody looks at is
    // no better than no mail at all.
    assert.ok(printed.join('\n').includes(link[0]), 'link printed to the terminal');
  } finally {
    console.log = realLog;
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('the marker is session-gated and carries the no-egress CSP', async () => {
  const { app, outbox, cleanup } = await testApp();
  try {
    const anonymous = await app.inject({ url: '/marker/' });
    assert.equal(anonymous.statusCode, 302);
    assert.equal(anonymous.headers.location, '/login');

    const cookie = await signIn(app, outbox, 'prof@demo', 'instructor', ['smrttech-3cc3']);
    const page = await app.inject({ url: '/marker/', headers: { cookie } });
    assert.equal(page.statusCode, 200);
    const csp = page.headers['content-security-policy'];
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /connect-src 'self'/, 'submissions cannot be sent anywhere else');
    assert.match(csp, /form-action 'none'/, 'no form can post the data out');
  } finally {
    await cleanup();
  }
});

test('rate limiting slows brute force on the magic-link endpoints', async () => {
  const { app, cleanup } = await testApp();
  try {
    let limited = false;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await app.inject({ url: '/auth/not-a-real-token' });
      if (response.statusCode === 429) limited = true;
    }
    assert.ok(limited, 'expected a 429 within 12 attempts');
  } finally {
    await cleanup();
  }
});
