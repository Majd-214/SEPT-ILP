/**
 * Seed the platform: one admin and one instructor, both invited by
 * email (their magic links land in Mailpit). The two demo courses —
 * SMRTTECH 3CC3 and DEMO 101 — live in git under content/courses/,
 * which is the whole point: content ships with the repository, and
 * seeding only creates accounts.
 *
 * Idempotent: users upsert, and invitations for existing users simply
 * send a fresh sign-in link. Safe to run on every container start.
 */
import { buildApp } from '../apps/platform/src/app.js';
import { loadConfig } from '../apps/platform/src/config.js';

const config = loadConfig();
const app = await buildApp(config);
const { auth, db } = app.platform;

const ADMIN = process.env.SEED_ADMIN ?? 'admin@demo';
const INSTRUCTOR = process.env.SEED_INSTRUCTOR ?? 'instructor@demo';
const COURSES = ['smrttech-3cc3', 'demo-101'];

/** Mailpit may still be starting; magic-link emails retry briefly. */
async function inviteWithRetry(email, role, courses) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await auth.invite(email, role, courses);
      return;
    } catch (error) {
      if (attempt >= 10) throw error;
      console.log(`  SMTP not ready (${error.message}); retrying …`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

const existing = db.userByEmail(ADMIN);
await inviteWithRetry(ADMIN, 'admin', []);
await inviteWithRetry(INSTRUCTOR, 'instructor', COURSES);
console.log(existing
  ? `seed: accounts already present — fresh sign-in links sent to ${ADMIN} and ${INSTRUCTOR} (see Mailpit).`
  : `seed: created ${ADMIN} (admin) and ${INSTRUCTOR} (instructor for ${COURSES.join(', ')}); sign-in links are in Mailpit.`);

await app.close();
