import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import fastifyStatic from '@fastify/static';

import { Auth, RateLimiter } from './auth.js';
import { Db } from './db.js';
import { Publisher } from './publish.js';
import { Smtp } from './smtp.js';
import { layout, esc, card, csrfField, statusPill } from './ui.js';

const HERE = path.dirname(new URL(import.meta.url).pathname);

/**
 * Build the platform app. Everything the service does is faculty-facing:
 * students receive static files (served by the reverse proxy from the
 * `current` release) and never authenticate, never POST. The one student
 * touchpoint here — the `/c/…` fallback used in development — serves
 * files only.
 *
 * @param {ReturnType<import('./config.js').loadConfig>} config
 */
export async function buildApp(config) {
  const app = Fastify({ logger: false, trustProxy: true });
  const db = new Db(config.dbPath);
  const smtp = new Smtp({ host: config.smtpHost, port: config.smtpPort, from: config.mailFrom });
  const auth = new Auth({ db, smtp, config });
  const publisher = new Publisher({ config, db });
  const authLimiter = new RateLimiter(10, 60_000);

  await app.register(cookie, { secret: config.cookieSecret });
  await app.register(formbody);
  auth.register(app);

  // The design system styles the console too — one governed stylesheet,
  // built from the same source as student pages, no inline styles.
  const { DesignSystem } = await import(
    pathToFileURL(path.join(config.repoDir, 'renderer', 'src', 'DesignSystem.js')));
  const designSystem = new DesignSystem(path.join(config.repoDir, 'design-system'));
  const stylesheet = designSystem.buildStylesheet();
  app.get('/admin/assets/sept-labs.css', async (request, reply) => {
    reply.type('text/css').send(stylesheet);
  });
  const fontsDir = path.join(config.repoDir, 'design-system', 'fonts');
  await app.register(fastifyStatic, { root: fontsDir, prefix: '/admin/assets/fonts/' });

  // Small console behaviours (copy buttons); a static file, never inline.
  await app.register(fastifyStatic, {
    root: path.join(HERE, '..', 'static'),
    prefix: '/admin/static/',
    decorateReply: false,
  });

  // The marker: a fully client-side app behind the instructor session.
  // Its CSP forbids every network destination except same-origin GETs,
  // so submission data cannot leave the browser.
  await app.register(fastifyStatic, {
    root: path.join(HERE, '..', '..', 'marker', 'public'),
    prefix: '/marker/',
    decorateReply: false,
    setHeaders(reply) {
      reply.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "img-src 'self' data:",
        "script-src 'self'",
        "style-src 'self'",
        "connect-src 'self'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join('; '));
    },
  });
  app.addHook('preHandler', async (request, reply) => {
    if (request.url.startsWith('/marker') && !request.user) reply.redirect('/login');
  });

  /** Course metadata straight from the content repository (source of truth). */
  function courseInfo(courseId) {
    const dir = path.join(config.contentDir, 'courses', courseId);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'course.json'), 'utf8'));
    const labs = fs.readdirSync(path.join(dir, 'labs'))
      .filter((entry) => entry.endsWith('.json'))
      .map((entry) => {
        const lab = JSON.parse(fs.readFileSync(path.join(dir, 'labs', entry), 'utf8'));
        return {
          id: lab.id,
          file: entry,
          number: lab.number ?? null,
          kind: lab.kind ?? 'lab',
          title: lab.title,
          contentVersion: lab.contentVersion,
        };
      })
      .sort((a, b) => (a.kind === 'project') - (b.kind === 'project') || (a.number ?? 99) - (b.number ?? 99));
    return { id: courseId, code: manifest.code, title: manifest.title, labs };
  }

  const visibleCourses = (user) => publisher.courses()
    .filter((courseId) => auth.canAccessCourse(user, courseId));

  /* ── Health ─────────────────────────────────────────────────────── */
  app.get('/healthz', async () => ({ ok: true, release: publisher.currentRelease() }));

  /* ── Login and magic links ──────────────────────────────────────── */
  app.get('/login', async (request, reply) => {
    reply.type('text/html').send(layout({
      title: 'Sign in', user: null,
      body: card('Sign in', `
<p>Enter your invited email address and a one-time sign-in link will be sent to it.</p>
<form method="post" action="/login" class="o-stack o-stack--tight">
  <label class="c-field"><span class="c-field__label">Email</span>
    <span class="c-field__row"><input class="c-field__control" type="email" name="email" required autocomplete="email"></span>
  </label>
  <div class="o-cluster"><button class="c-btn c-btn--filled" type="submit">Email me a sign-in link</button></div>
</form>
${request.query.sent ? '<p class="c-callout c-callout--success c-callout__body">If that address is invited, a link is on its way. During development it lands in Mailpit.</p>' : ''}
${request.query.invalid ? '<p class="c-callout c-callout--danger c-callout__body">That sign-in link is invalid or expired. Request a fresh one.</p>' : ''}`),
    }));
  });

  app.post('/login', async (request, reply) => {
    if (!authLimiter.allow(`login:${request.ip}`)) {
      return reply.code(429).send('Too many attempts; wait a minute.');
    }
    const email = String(request.body?.email ?? '').trim();
    if (email) await auth.requestLogin(email);
    return reply.redirect('/login?sent=1');
  });

  app.get('/auth/:token', async (request, reply) => {
    if (!authLimiter.allow(`auth:${request.ip}`)) {
      return reply.code(429).send('Too many attempts; wait a minute.');
    }
    const session = auth.consumeMagicLink(request.params.token);
    if (!session) return reply.redirect('/login?invalid=1');
    auth.setSessionCookie(reply, session.sessionId);
    return reply.redirect('/admin');
  });

  app.post('/logout', async (request, reply) => {
    auth.clearSession(reply, request.sessionId);
    reply.redirect('/login');
  });

  /* ── Console pages ──────────────────────────────────────────────── */
  const enrich = (request) => request.user
    ? { ...request.user, _csrf: auth.csrfToken(request.sessionId) }
    : null;

  app.get('/', async (request, reply) => reply.redirect(request.user ? '/admin' : '/login'));

  app.get('/admin', { preHandler: auth.requireUser() }, async (request, reply) => {
    const user = enrich(request);
    const courses = visibleCourses(request.user).map((courseId) => {
      const info = courseInfo(courseId);
      return `<tr><td><strong>${esc(info.code)}</strong></td><td>${esc(info.title)}</td>
<td class="u-numeric">${info.labs.length}</td>
<td><a href="/admin/links#${esc(courseId)}">links</a> · <a href="/admin/exports#${esc(courseId)}">exports</a> · <a href="/admin/editor/${esc(courseId)}">edit</a></td></tr>`;
    }).join('');

    const publishes = db.listPublishes(10).map((run) => `<tr>
<td class="u-numeric">#${run.id}</td><td>${esc(run.actor)}</td>
<td>${esc(run.started_at.replace('T', ' ').slice(0, 19))}</td>
<td>${statusPill(run.status)}</td>
<td><a href="/admin/publish/${run.id}">report</a></td></tr>`).join('');

    const release = publisher.currentRelease();
    reply.type('text/html').send(layout({
      title: 'Dashboard', user, active: 'dashboard',
      body: [
        card('Courses', `
<div class="o-scroll-x"><table class="c-admin-table">
<thead><tr><th scope="col">Code</th><th scope="col">Title</th><th scope="col">Labs</th><th scope="col">Tools</th></tr></thead>
<tbody>${courses}</tbody></table></div>`),
        card('Publish', `
<p>Publishing pulls the content repository, runs every quality gate, and — only when all of them pass —
atomically flips the live site to the new release. Failures never reach students.</p>
<dl class="c-admin-kv"><dt>Live release</dt><dd class="c-admin-link">${esc(release ?? 'none yet — publish to go live')}</dd></dl>
${request.user.role === 'admin' ? `
<form method="post" action="/admin/publish">${csrfField(user._csrf)}
<div class="o-cluster"><button class="c-btn c-btn--filled" type="submit">Publish all courses</button></div>
</form>` : '<p>Publishing is limited to administrators.</p>'}
<div class="o-scroll-x"><table class="c-admin-table">
<thead><tr><th scope="col">Run</th><th scope="col">By</th><th scope="col">Started</th><th scope="col">Status</th><th scope="col">Report</th></tr></thead>
<tbody>${publishes || '<tr><td colspan="5">No publishes yet.</td></tr>'}</tbody></table></div>`),
      ].join('\n'),
    }));
  });

  app.post('/admin/publish', { preHandler: auth.requireAdmin() }, async (request, reply) => {
    publisher.enqueue(request.user.email);
    reply.redirect('/admin');
  });

  app.get('/admin/publish/:id', { preHandler: auth.requireUser() }, async (request, reply) => {
    const run = db.publishById(Number(request.params.id));
    if (!run) return reply.code(404).send('No such publish.');
    return reply.type('text/html').send(layout({
      title: `Publish #${run.id}`, user: enrich(request), active: 'dashboard',
      body: card(`Publish #${run.id} — ${run.status}`, `
<dl class="c-admin-kv">
<dt>Started</dt><dd>${esc(run.started_at)}</dd>
<dt>Finished</dt><dd>${esc(run.finished_at ?? 'still running — refresh')}</dd>
<dt>Status</dt><dd>${statusPill(run.status)}</dd>
<dt>Release</dt><dd class="c-admin-link">${esc(run.release_path ?? '—')}</dd>
</dl>
<h3 class="c-sidebar__heading">Gate report</h3>
<pre class="c-admin-log">${esc(run.report || '(no output yet)')}</pre>`),
    }));
  });

  /* ── Invites (admin only) ───────────────────────────────────────── */
  app.get('/admin/invites', { preHandler: auth.requireAdmin() }, async (request, reply) => {
    const user = enrich(request);
    const rows = db.listUsers().map((account) => `<tr>
<td>${esc(account.email)}</td><td>${esc(account.role)}</td>
<td>${esc(account.role === 'admin' ? 'all courses' : db.coursesFor(account.id).join(', ') || '—')}</td></tr>`).join('');
    const courseOptions = publisher.courses()
      .map((courseId) => `<label class="c-checklist__item"><input type="checkbox" name="courses" value="${esc(courseId)}"><span>${esc(courseId)}</span></label>`)
      .join('');
    reply.type('text/html').send(layout({
      title: 'Invites', user, active: 'invites',
      body: [
        card('Invite someone', `
<p>The invitee receives a one-time sign-in link by email. Instructors see only the courses ticked here;
administrators see everything.</p>
<form method="post" action="/admin/invites" class="o-stack o-stack--tight">${csrfField(user._csrf)}
<div class="c-field-grid">
  <label class="c-field"><span class="c-field__label">Email</span>
    <span class="c-field__row"><input class="c-field__control" type="email" name="email" required></span></label>
  <label class="c-field"><span class="c-field__label">Role</span>
    <span class="c-field__row"><select class="c-field__control" name="role">
      <option value="instructor">instructor</option><option value="admin">admin</option>
    </select></span></label>
</div>
<div class="c-checklist">${courseOptions}</div>
<div class="o-cluster"><button class="c-btn c-btn--filled" type="submit">Send invite</button></div>
</form>
${request.query.sent ? '<p class="c-callout c-callout--success c-callout__body">Invite sent — during development it lands in Mailpit.</p>' : ''}`),
        card('Accounts', `<div class="o-scroll-x"><table class="c-admin-table">
<thead><tr><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Courses</th></tr></thead>
<tbody>${rows}</tbody></table></div>`),
      ].join('\n'),
    }));
  });

  app.post('/admin/invites', { preHandler: auth.requireAdmin() }, async (request, reply) => {
    const { email, role } = request.body;
    const courses = [request.body.courses ?? []].flat();
    await auth.invite(String(email), role === 'admin' ? 'admin' : 'instructor', courses);
    reply.redirect('/admin/invites?sent=1');
  });

  /* ── Link sheet ─────────────────────────────────────────────────── */
  app.get('/admin/links', { preHandler: auth.requireUser() }, async (request, reply) => {
    const user = enrich(request);
    const sections = visibleCourses(request.user).map((courseId) => {
      const info = courseInfo(courseId);
      const rows = info.labs.map((lab) => {
        const url = `${config.baseUrl}/c/${courseId}/${lab.id}/`;
        const topic = lab.kind === 'project'
          ? `${info.code} — ${lab.title} (interactive)`
          : `${info.code} — Lab ${lab.number}: ${lab.title} (interactive)`;
        return `<tr>
<td>${lab.kind === 'project' ? esc(lab.title) : `Lab ${lab.number}`}</td>
<td><span class="c-admin-link">${esc(url)}</span></td>
<td>${esc(topic)}</td>
<td><button class="c-btn c-btn--text" type="button" data-copy="${esc(url)}">Copy URL</button>
<button class="c-btn c-btn--text" type="button" data-copy="${esc(topic)}">Copy title</button></td></tr>`;
      }).join('');
      return card(`${info.code} — Avenue to Learn links`, `
<p>Paste each URL into an Avenue to Learn module as a link topic (set it to open in a new window,
so student work is stored first-party) with the suggested topic title.</p>
<div class="o-scroll-x"><table class="c-admin-table" id="${esc(courseId)}">
<thead><tr><th scope="col">Lab</th><th scope="col">Canonical URL</th><th scope="col">Suggested A2L topic title</th><th scope="col">Copy</th></tr></thead>
<tbody>${rows}</tbody></table></div>`);
    }).join('\n');
    reply.type('text/html').send(layout({
      title: 'Link sheet', user, active: 'links',
      body: `${sections}\n<script src="/admin/static/console.js" defer></script>`,
    }));
  });

  /* ── Exports: single-file labs and course-site bundles ──────────── */
  const releaseBundles = (courseId) => {
    const release = publisher.currentRelease();
    if (!release) return null;
    const dir = path.join(release, courseId, 'bundles');
    return fs.existsSync(dir)
      ? { dir, files: fs.readdirSync(dir).sort() }
      : { dir, files: [] };
  };

  app.get('/admin/exports', { preHandler: auth.requireUser() }, async (request, reply) => {
    const sections = visibleCourses(request.user).map((courseId) => {
      const bundles = releaseBundles(courseId);
      const rows = (bundles?.files ?? []).map((file) => {
        const kind = file.endsWith('-single.html')
          ? 'Single-file lab page — upload directly into an Avenue to Learn file topic'
          : file.endsWith('-course-site.zip')
            ? 'Complete course site as one ZIP'
            : 'Lab bundle (page + knowledge base) for LMS folders';
        return `<tr><td class="c-admin-link">${esc(file)}</td><td>${esc(kind)}</td>
<td><a href="/admin/exports/${esc(courseId)}/${esc(file)}" download>Download</a></td></tr>`;
      }).join('');
      return card(`${esc(courseId)} — exports`, bundles === null
        ? '<p>Nothing published yet — exports are built by the publish pipeline after every gate passes.</p>'
        : `
<p>Single-file pages carry the complete interactive lab — styles, scripts, fonts, and images
inlined — and work opened from anywhere, with no server. Note that browser storage is
partitioned by origin: progress made in a single-file copy stays with that copy; the progress
file download/restore on every lab page is the bridge between copies.</p>
<div class="o-scroll-x"><table class="c-admin-table">
<thead><tr><th scope="col">File</th><th scope="col">What it is</th><th scope="col">Get</th></tr></thead>
<tbody>${rows || '<tr><td colspan="3">The current release has no bundles — republish to generate them.</td></tr>'}</tbody></table></div>`);
    }).join('\n');
    reply.type('text/html').send(layout({
      title: 'Exports', user: enrich(request), active: 'exports', body: sections,
    }));
  });

  app.get('/admin/exports/:courseId/:file', { preHandler: auth.requireUser() }, async (request, reply) => {
    const { courseId, file } = request.params;
    if (!auth.canAccessCourse(request.user, courseId)) {
      return reply.code(403).send('Not an instructor for this course.');
    }
    const bundles = releaseBundles(courseId);
    if (!bundles || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(file) || !bundles.files.includes(file)) {
      return reply.code(404).send('No such export in the current release.');
    }
    const types = { '.html': 'text/html', '.zip': 'application/zip' };
    return reply
      .type(types[path.extname(file)] ?? 'application/octet-stream')
      .header('content-disposition', `attachment; filename="${file}"`)
      .send(fs.createReadStream(path.join(bundles.dir, file)));
  });

  // The content editor (apps/admin): drafts, schema validation, git
  // commits, image uploads. Mounted in this scope so it shares the
  // session, role, and CSRF machinery.
  const { editorRoutes } = await import('../../admin/src/routes.js');
  await app.register(editorRoutes, { auth, publisher, config, courseInfo });

  /* ── Answer keys (role-gated) ───────────────────────────────────── */
  app.get('/keys/:courseId/:labId.key.json', async (request, reply) => {
    const { courseId, labId } = request.params;
    if (!request.user) return reply.code(401).send({ error: 'sign in first' });
    if (!auth.canAccessCourse(request.user, courseId)) {
      return reply.code(403).send({ error: 'not an instructor for this course' });
    }
    const release = publisher.currentRelease();
    if (!release) return reply.code(404).send({ error: 'nothing published yet' });
    const keyPath = path.join(release, courseId, 'keys', courseId, `${labId}.key.json`);
    if (!fs.existsSync(keyPath)) return reply.code(404).send({ error: 'no key for this lab' });
    return reply.type('application/json').send(fs.readFileSync(keyPath, 'utf8'));
  });

  app.get('/keys/:courseId', async (request, reply) => {
    const { courseId } = request.params;
    if (!request.user) return reply.code(401).send({ error: 'sign in first' });
    if (!auth.canAccessCourse(request.user, courseId)) {
      return reply.code(403).send({ error: 'not an instructor for this course' });
    }
    const release = publisher.currentRelease();
    if (!release) return reply.send({ courseId, keys: [] });
    const keysDir = path.join(release, courseId, 'keys', courseId);
    const keys = fs.existsSync(keysDir)
      ? fs.readdirSync(keysDir).filter((entry) => entry.endsWith('.key.json'))
        .map((entry) => ({
          labId: entry.replace(/\.key\.json$/, ''),
          href: `/keys/${courseId}/${entry}`,
          ...JSON.parse(fs.readFileSync(path.join(keysDir, entry), 'utf8')),
        }))
        .map(({ labId, href, labTitle, contentVersion, totals }) => ({
          labId, href, labTitle, contentVersion, totals,
        }))
      : [];
    return reply.send({ courseId, keys });
  });

  app.get('/keys', async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'sign in first' });
    return reply.send({ courses: visibleCourses(request.user) });
  });

  /* ── Development fallback for the student site (Caddy in compose) ─ */
  app.get('/c/:courseId/*', async (request, reply) => {
    const { courseId } = request.params;
    const rest = request.params['*'] || '';
    const release = publisher.currentRelease();
    if (!release) return reply.code(404).send('Nothing published yet.');
    const siteRoot = path.join(release, courseId, 'site');
    // Canonical short URL /c/<course>/<lab>/ → the lab page.
    const labMatch = /^([a-z][a-z0-9-]*)\/?$/.exec(rest);
    if (labMatch && fs.existsSync(path.join(siteRoot, 'labs', labMatch[1], 'index.html'))) {
      return reply.redirect(`/c/${courseId}/labs/${labMatch[1]}/`, 301);
    }
    const relative = rest === '' || rest.endsWith('/') ? `${rest}index.html` : rest;
    const filePath = path.normalize(path.join(siteRoot, relative));
    if (!filePath.startsWith(siteRoot) || !fs.existsSync(filePath)) {
      return reply.code(404).send('Not found.');
    }
    const types = {
      '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
      '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
      '.zip': 'application/zip',
    };
    return reply
      .type(types[path.extname(filePath)] ?? 'application/octet-stream')
      .send(fs.createReadStream(filePath));
  });

  app.decorate('platform', { db, auth, publisher, config, courseInfo });
  return app;
}
