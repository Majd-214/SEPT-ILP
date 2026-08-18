/**
 * Seed the platform: one administrator and one instructor, each sent a
 * sign-in link. The two demo courses live in Git under
 * content/courses/, which is the point — content ships with the
 * repository, and seeding only creates accounts.
 *
 *   npm run seed
 *
 * Idempotent: users upsert, and re-seeding simply issues fresh links.
 */
import { buildApp } from '../apps/platform/src/app.js';
import { loadConfig } from '../apps/platform/src/config.js';

const config = loadConfig();
const app = await buildApp(config);
const { auth, db, publisher } = app.platform;

const ADMIN = process.env.SEED_ADMIN ?? 'admin@demo';
const INSTRUCTOR = process.env.SEED_INSTRUCTOR ?? 'instructor@demo';
const courses = publisher.courses();

const existing = Boolean(db.userByEmail(ADMIN));
await auth.invite(ADMIN, 'admin', []);
await auth.invite(INSTRUCTOR, 'instructor', courses);

console.log([
  '',
  existing
    ? 'Accounts already existed — fresh sign-in links issued.'
    : `Created ${ADMIN} (administrator) and ${INSTRUCTOR} (instructor for ${courses.join(', ')}).`,
  config.mailTransport === 'file'
    ? `Sign-in links are printed above and saved as .eml files under ${config.mailDir}.`
    : `Sign-in links were sent through ${config.smtpHost}.`,
  '',
].join('\n'));

await app.close();
