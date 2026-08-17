import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Platform storage: users, course memberships, one-time login tokens,
 * sessions, and the publish log. Deliberately boring SQLite via
 * node:sqlite (no native dependency).
 *
 * There is no student table and no way to create one — students never
 * authenticate against the platform and no student data is stored.
 */
export class Db {
  /** @param {string} dbPath */
  constructor(dbPath) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL CHECK (role IN ('admin', 'instructor')),
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS memberships (
        user_id INTEGER NOT NULL REFERENCES users(id),
        course_id TEXT NOT NULL,
        PRIMARY KEY (user_id, course_id)
      );
      CREATE TABLE IF NOT EXISTS tokens (
        id INTEGER PRIMARY KEY,
        email TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        used_at TEXT
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS publishes (
        id INTEGER PRIMARY KEY,
        actor TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        status TEXT NOT NULL CHECK (status IN ('running', 'ok', 'failed')),
        report TEXT NOT NULL DEFAULT '',
        release_path TEXT
      );
    `);
  }

  static now() {
    return new Date().toISOString();
  }

  static hashToken(token) {
    return createHash('sha256').update(token).digest('hex');
  }

  /** @param {string} email @param {"admin" | "instructor"} role */
  upsertUser(email, role) {
    const normalized = email.trim().toLowerCase();
    this.db.prepare(`
      INSERT INTO users (email, role, created_at) VALUES (?, ?, ?)
      ON CONFLICT (email) DO UPDATE SET role = excluded.role
    `).run(normalized, role, Db.now());
    return this.userByEmail(normalized);
  }

  userByEmail(email) {
    return this.db.prepare('SELECT * FROM users WHERE email = ?')
      .get(email.trim().toLowerCase()) ?? null;
  }

  userById(id) {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) ?? null;
  }

  listUsers() {
    return this.db.prepare('SELECT * FROM users ORDER BY email').all();
  }

  addMembership(userId, courseId) {
    this.db.prepare('INSERT OR IGNORE INTO memberships (user_id, course_id) VALUES (?, ?)')
      .run(userId, courseId);
  }

  /** @returns {string[]} */
  coursesFor(userId) {
    return this.db.prepare('SELECT course_id FROM memberships WHERE user_id = ?')
      .all(userId).map((row) => row.course_id);
  }

  /**
   * Create a one-time magic-link token for an email.
   * @returns {string} The raw token (only ever sent by email).
   */
  createToken(email, ttlMinutes) {
    const token = randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
    this.db.prepare('INSERT INTO tokens (email, token_hash, expires_at) VALUES (?, ?, ?)')
      .run(email.trim().toLowerCase(), Db.hashToken(token), expires);
    return token;
  }

  /**
   * Consume a magic-link token: valid, unexpired, unused — one time.
   * @returns {string | null} The email the token was issued to.
   */
  consumeToken(token) {
    const row = this.db.prepare('SELECT * FROM tokens WHERE token_hash = ?')
      .get(Db.hashToken(token));
    if (!row || row.used_at || row.expires_at < Db.now()) return null;
    this.db.prepare('UPDATE tokens SET used_at = ? WHERE id = ?').run(Db.now(), row.id);
    return row.email;
  }

  createSession(userId, ttlHours) {
    const id = randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + ttlHours * 3_600_000).toISOString();
    this.db.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(id, userId, Db.now(), expires);
    return id;
  }

  sessionUser(sessionId) {
    const row = this.db.prepare(`
      SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.id = ? AND sessions.expires_at > ?
    `).get(sessionId, Db.now());
    return row ?? null;
  }

  deleteSession(sessionId) {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  }

  startPublish(actor) {
    const result = this.db.prepare(
      "INSERT INTO publishes (actor, started_at, status) VALUES (?, ?, 'running')",
    ).run(actor, Db.now());
    return Number(result.lastInsertRowid);
  }

  finishPublish(id, status, report, releasePath = null) {
    this.db.prepare(
      'UPDATE publishes SET finished_at = ?, status = ?, report = ?, release_path = ? WHERE id = ?',
    ).run(Db.now(), status, report, releasePath, id);
  }

  publishById(id) {
    return this.db.prepare('SELECT * FROM publishes WHERE id = ?').get(id) ?? null;
  }

  listPublishes(limit = 20) {
    return this.db.prepare('SELECT * FROM publishes ORDER BY id DESC LIMIT ?').all(limit);
  }
}
