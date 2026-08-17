import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Environment-driven configuration. Every path has a development
 * default inside the repository; docker-compose overrides them onto
 * mounted volumes. No student-facing behaviour lives here — the
 * platform serves faculty only.
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
  const baseUrl = env.BASE_URL ?? 'http://localhost:8080';
  const isLocalDev = /^https?:\/\/(localhost|127\.0\.0\.1|test\.local)(:|\/|$)/.test(baseUrl);
  if (!isLocalDev) {
    throw new Error(
      'COOKIE_SECRET must be set to a strong value (≥16 chars) for any non-localhost BASE_URL. '
      + 'Generate one with: openssl rand -hex 32');
  }
  return secret || DEV_COOKIE_SECRET;
}

export function loadConfig(env = process.env) {
  const repoDir = path.resolve(env.REPO_DIR ?? path.join(HERE, '..', '..', '..'));
  const dataDir = path.resolve(env.DATA_DIR ?? path.join(repoDir, 'data'));
  return {
    host: env.HOST ?? '0.0.0.0',
    port: Number(env.PORT ?? 3000),
    /** Public origin used in magic links and the link sheet. */
    baseUrl: (env.BASE_URL ?? 'http://localhost:8080').replace(/\/$/, ''),
    repoDir,
    contentDir: path.resolve(env.CONTENT_DIR ?? path.join(repoDir, 'content')),
    dataDir,
    dbPath: env.DB_PATH ?? path.join(dataDir, 'platform.db'),
    releasesDir: path.join(dataDir, 'releases'),
    currentLink: path.join(dataDir, 'current'),
    smtpHost: env.SMTP_HOST ?? 'localhost',
    smtpPort: Number(env.SMTP_PORT ?? 1025),
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
