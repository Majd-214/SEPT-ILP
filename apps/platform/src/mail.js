import fs from 'node:fs';
import path from 'node:path';

import { Smtp } from './smtp.js';

/**
 * Outgoing mail, with no infrastructure required.
 *
 * The platform sends exactly one kind of message — a sign-in link — so
 * mail delivery must never be the reason a developer cannot run this.
 * Two transports:
 *
 *   file (default) — the message is written to `<data>/mail/` as a
 *     readable .eml, and the sign-in link is printed to the terminal in
 *     a box you cannot miss. Nothing to install, nothing to run.
 *   smtp — a real relay (set SMTP_HOST). The university's relay speaks
 *     the same three commands the dev sink did.
 *
 * The file transport is a development convenience and is deliberately
 * loud: anyone who can read the server's terminal or its data directory
 * can sign in as anybody. That is acceptable on the machine an
 * administrator is already running the platform on, and unacceptable
 * anywhere else — so a non-localhost BASE_URL requires SMTP.
 */

/** @param {ReturnType<import('./config.js').loadConfig>} config */
export function createMailer(config) {
  return config.mailTransport === 'smtp'
    ? new SmtpMailer(config)
    : new FileMailer(config);
}

class SmtpMailer {
  constructor(config) {
    this.smtp = new Smtp({
      host: config.smtpHost, port: config.smtpPort, from: config.mailFrom,
    });
  }

  /** @param {string} to @param {string} subject @param {string} text */
  async send(to, subject, text) {
    await this.smtp.send(to, subject, text);
  }
}

class FileMailer {
  constructor(config) {
    this.dir = config.mailDir;
    this.from = config.mailFrom;
    this.quiet = config.mailQuiet;
  }

  /** @param {string} to @param {string} subject @param {string} text */
  async send(to, subject, text) {
    fs.mkdirSync(this.dir, { recursive: true });
    const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
    const slug = to.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const file = path.join(this.dir, `${stamp}-${slug}.eml`);
    fs.writeFileSync(file, [
      `From: SEPT-ILP Platform <${this.from}>`,
      `To: <${to}>`,
      `Subject: ${subject.replaceAll(/[\r\n]/g, ' ')}`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      text,
      '',
    ].join('\r\n'));

    if (this.quiet) return;
    const link = /https?:\/\/\S*\/auth\/\S+/.exec(text)?.[0];
    const rule = '─'.repeat(72);
    console.log([
      '',
      rule,
      `  Sign-in link for ${to}`,
      link ? `\n  ${link}\n` : `\n  (no link in this message — see ${file})\n`,
      `  Saved as ${file}`,
      rule,
      '',
    ].join('\n'));
  }
}
