import { createHmac, timingSafeEqual } from 'node:crypto';

/* ==========================================================================
 * Authentication — Phase A stub: email invites and magic links
 * --------------------------------------------------------------------------
 * An admin invites an email address; the invitee receives a one-time
 * magic link (printed to the terminal when running locally), which sets a
 * signed session cookie. Roles: `admin` (all courses, invites, keys,
 * publish) and `instructor` (only the courses they are invited to).
 * There is no student role and no student login — students never
 * authenticate against the platform.
 *
 * ────────────────────────────────────────────────────────────────────────
 * OIDC SEAM (Phase B): replace `resolveUser` below with an Entra ID
 * OIDC middleware. The contract to preserve:
 *   - `request.user` becomes `{ id, email, role }` or null;
 *   - role and course membership stay in the local database, keyed by
 *     email (the IdP asserts identity, the platform owns authorization);
 *   - everything downstream (`requireUser`, `requireRole`,
 *     `requireCourse`) is untouched.
 * See integrations/ for the Phase B integration notes.
 * ────────────────────────────────────────────────────────────────────────
 * ========================================================================== */

const SESSION_COOKIE = 'sept_session';

/** Simple fixed-window rate limiter (per key), no dependencies. */
export class RateLimiter {
  /** @param {number} max @param {number} windowMs */
  constructor(max, windowMs) {
    this.max = max;
    this.windowMs = windowMs;
    /** @type {Map<string, { count: number, reset: number }>} */
    this.hits = new Map();
  }

  /** @param {string} key @returns {boolean} Whether the request may pass. */
  allow(key) {
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || entry.reset < now) {
      this.hits.set(key, { count: 1, reset: now + this.windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.max;
  }
}

export class Auth {
  /**
   * @param {object} options
   * @param {import('./db.js').Db} options.db
   * @param {import('./mail.js').createMailer} options.mailer
   * @param {ReturnType<import('./config.js').loadConfig>} options.config
   */
  constructor({ db, mailer, config }) {
    this.db = db;
    this.mailer = mailer;
    this.config = config;
    this.loginLimiter = new RateLimiter(10, 60_000);
  }

  /**
   * Invite (or re-invite) a user and email their magic link.
   * @param {string} email
   * @param {"admin" | "instructor"} role
   * @param {string[]} courses Course ids an instructor may access.
   */
  async invite(email, role, courses = []) {
    const user = this.db.upsertUser(email, role);
    for (const courseId of courses) this.db.addMembership(user.id, courseId);
    await this.#sendMagicLink(user.email, 'You are invited to the SEPT lab platform');
    return user;
  }

  /** Request a fresh magic link for an existing account (silent otherwise). */
  async requestLogin(email) {
    const user = this.db.userByEmail(email);
    if (!user) return; // no account enumeration
    await this.#sendMagicLink(user.email, 'Your SEPT lab platform sign-in link');
  }

  async #sendMagicLink(email, subject) {
    const token = this.db.createToken(email, this.config.tokenTtlMinutes);
    const link = `${this.config.baseUrl}/auth/${token}`;
    await this.mailer.send(email, subject, [
      'Hello,',
      '',
      `Sign in to the SEPT Interactive Laboratory Platform:`,
      '',
      `  ${link}`,
      '',
      `The link works once and expires in ${this.config.tokenTtlMinutes} minutes.`,
      'If you did not expect this email, ignore it.',
    ].join('\n'));
  }

  /**
   * Exchange a magic-link token for a session.
   * @returns {{ sessionId: string, user: object } | null}
   */
  consumeMagicLink(token) {
    const email = this.db.consumeToken(token);
    if (!email) return null;
    const user = this.db.userByEmail(email);
    if (!user) return null;
    const sessionId = this.db.createSession(user.id, this.config.sessionTtlHours);
    return { sessionId, user };
  }

  /** The per-session CSRF token: an HMAC, so nothing extra is stored. */
  csrfToken(sessionId) {
    return createHmac('sha256', this.config.cookieSecret)
      .update(`csrf|${sessionId}`)
      .digest('base64url');
  }

  /** @param {string} sessionId @param {string} presented */
  csrfValid(sessionId, presented) {
    const expected = Buffer.from(this.csrfToken(sessionId));
    const actual = Buffer.from(String(presented ?? ''));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  /**
   * Register auth plumbing on the app: cookie parsing → `request.user`,
   * CSRF verification for authenticated form posts, and the guards.
   * @param {import('fastify').FastifyInstance} app
   */
  register(app) {
    const auth = this;

    app.decorateRequest('user', null);
    app.decorateRequest('sessionId', null);

    app.addHook('preHandler', async (request) => {
      // ── OIDC SEAM: this block is `resolveUser` — swap for Entra ID ──
      const raw = request.cookies[SESSION_COOKIE];
      if (!raw) return;
      const unsigned = request.unsignCookie(raw);
      if (!unsigned.valid) return;
      request.sessionId = unsigned.value;
      request.user = auth.db.sessionUser(unsigned.value);
      // ── end OIDC seam ──
    });

    // Authenticated state-changing requests must present the CSRF token
    // (defence in depth beside SameSite=Strict cookies).
    app.addHook('preHandler', async (request, reply) => {
      if (request.method === 'GET' || request.method === 'HEAD') return;
      if (!request.user) return; // anonymous posts are limited to /login
      const presented = request.body?._csrf ?? request.headers['x-csrf-token'];
      if (!auth.csrfValid(request.sessionId, presented)) {
        reply.code(403).send({ error: 'invalid CSRF token' });
      }
    });
  }

  /** @param {import('fastify').FastifyReply} reply @param {string} sessionId */
  setSessionCookie(reply, sessionId) {
    reply.setCookie(SESSION_COOKIE, sessionId, {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      signed: true,
      maxAge: this.config.sessionTtlHours * 3600,
    });
  }

  /** @param {import('fastify').FastifyReply} reply @param {string | null} sessionId */
  clearSession(reply, sessionId) {
    if (sessionId) this.db.deleteSession(sessionId);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  /** Route guard: any signed-in user. */
  requireUser() {
    return async (request, reply) => {
      if (!request.user) reply.redirect('/login');
    };
  }

  /** Route guard: admins only. */
  requireAdmin() {
    return async (request, reply) => {
      if (!request.user) return reply.redirect('/login');
      if (request.user.role !== 'admin') return reply.code(403).send('Admins only.');
      return undefined;
    };
  }

  /**
   * May this user see this course's instructor material (keys, marker)?
   * @param {object} user @param {string} courseId
   */
  canAccessCourse(user, courseId) {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return this.db.coursesFor(user.id).includes(courseId);
  }
}
