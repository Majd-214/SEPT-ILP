import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Environment-driven configuration. Every path has a development
 * default inside the repository. No student-facing behaviour lives
 * here — the platform serves faculty only, and runs as an ordinary
 * Node process with no container, database server, or mail server.
 */
const DEV_COOKIE_SECRET = 'dev-secret-change-me-in-any-real-deployment';

/**
 * The signing secret for session cookies and CSRF tokens. A known
 * default is fine for local development, but shipping it to a real
 * deployment would let anyone forge sessions — so refuse to start with
 * the default unless BASE_URL is an explicit localhost dev origin.
 */
function resolveCookieSecret(env) {
  const secret = env.COOKIE_SECRET;
  if (secret && secret.length >= 16) return secret;
  const baseUrl = env.BASE_URL ?? `http://localhost:${env.PORT ?? 3000}`;
  if (!isLocalOrigin(baseUrl)) {
    throw new Error(
      'COOKIE_SECRET must be set to a strong value (≥16 chars) for any non-localhost BASE_URL. '
      + 'Generate one with: openssl rand -hex 32');
  }
  return secret || DEV_COOKIE_SECRET;
}

/**
 * Which mail transport to use. Explicit MAIL_TRANSPORT wins; otherwise
 * setting SMTP_HOST selects the relay, and the default is the local
 * file sink. A real deployment must relay: the file sink prints
 * sign-in links to the server's terminal, which is a development
 * convenience and a disclosure risk anywhere else.
 */
function resolveMailTransport(env) {
  const explicit = env.MAIL_TRANSPORT;
  if (explicit === 'smtp' || explicit === 'file') return explicit;
  if (env.SMTP_HOST) return 'smtp';
  const baseUrl = env.BASE_URL ?? '';
  if (baseUrl && !isLocalOrigin(baseUrl)) {
    throw new Error(
      'Set SMTP_HOST (or MAIL_TRANSPORT=file, knowingly) for a non-localhost BASE_URL: '
      + 'the default mail transport writes sign-in links to the server terminal.');
  }
  return 'file';
}

/** @param {string} baseUrl */
function isLocalOrigin(baseUrl) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|test\.local)(:|\/|$)/.test(baseUrl);
}

export function loadConfig(env = process.env) {
  const repoDir = path.resolve(env.REPO_DIR ?? path.join(HERE, '..', '..', '..'));
  const dataDir = path.resolve(env.DATA_DIR ?? path.join(repoDir, 'data'));
  return {
    host: env.HOST ?? '0.0.0.0',
    port: Number(env.PORT ?? 3000),
    /** Public origin used in magic links and the link sheet. */
    baseUrl: (env.BASE_URL ?? `http://localhost:${env.PORT ?? 3000}`).replace(/\/$/, ''),
    repoDir,
    contentDir: path.resolve(env.CONTENT_DIR ?? path.join(repoDir, 'content')),
    dataDir,
    dbPath: env.DB_PATH ?? path.join(dataDir, 'platform.db'),
    releasesDir: path.join(dataDir, 'releases'),
    currentLink: path.join(dataDir, 'current'),
    /** 'file' writes messages to disk and prints links; 'smtp' relays. */
    mailTransport: resolveMailTransport(env),
    mailDir: env.MAIL_DIR ?? path.join(dataDir, 'mail'),
    /** Suppress the terminal banner (tests, scripted runs). */
    mailQuiet: env.MAIL_QUIET === '1',
    smtpHost: env.SMTP_HOST ?? 'localhost',
    smtpPort: Number(env.SMTP_PORT ?? 25),
    mailFrom: env.MAIL_FROM ?? 'sept-ilp@localhost',
    cookieSecret: resolveCookieSecret(env),
    /** Run `git pull` in the content repo before each publish. */
    publishGitPull: env.PUBLISH_GIT_PULL === '1',
    /** Pass --skip-a11y to builds (only for environments without a browser). */
    publishSkipA11y: env.PUBLISH_SKIP_A11Y === '1',
    sessionTtlHours: Number(env.SESSION_TTL_HOURS ?? 24 * 7),
    tokenTtlMinutes: Number(env.TOKEN_TTL_MINUTES ?? 30),
  };
}
