import net from 'node:net';

/**
 * A minimal SMTP submitter for the development mailbox (Mailpit): plain
 * SMTP, no auth, no TLS — exactly what the local sink speaks. Kept
 * dependency-free on purpose; production mail (if the platform ever
 * sends any beyond invites) would ride the university's relay through
 * the same three commands.
 */
export class Smtp {
  /** @param {{ host: string, port: number, from: string }} options */
  constructor({ host, port, from }) {
    this.host = host;
    this.port = port;
    this.from = from;
  }

  /**
   * @param {string} to
   * @param {string} subject
   * @param {string} text Plain-text body.
   */
  send(to, subject, text) {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(this.port, this.host);
      socket.setTimeout(10_000, () => {
        socket.destroy();
        reject(new Error('SMTP timeout'));
      });

      const message = [
        `From: SEPT-ILP Platform <${this.from}>`,
        `To: <${to}>`,
        `Subject: ${subject.replaceAll(/[\r\n]/g, ' ')}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        '',
        text,
      ].join('\r\n');

      const steps = [
        { expect: 220, send: `HELO sept-ilp\r\n` },
        { expect: 250, send: `MAIL FROM:<${this.from}>\r\n` },
        { expect: 250, send: `RCPT TO:<${to.trim()}>\r\n` },
        { expect: 250, send: 'DATA\r\n' },
        { expect: 354, send: `${message}\r\n.\r\n` },
        { expect: 250, send: 'QUIT\r\n' },
        { expect: 221, send: null },
      ];
      let index = 0;
      let buffer = '';

      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        // Multi-line responses end with "NNN " (space after the code).
        const lines = buffer.split('\r\n').filter(Boolean);
        const last = lines.at(-1);
        if (!last || /^\d{3}-/.test(last)) return;
        buffer = '';
        const code = Number(last.slice(0, 3));
        const step = steps[index];
        if (!step || code !== step.expect) {
          socket.destroy();
          reject(new Error(`SMTP step ${index}: expected ${step?.expect}, got "${last}"`));
          return;
        }
        index += 1;
        if (step.send === null || index >= steps.length) {
          socket.end();
          resolve();
          return;
        }
        socket.write(step.send);
      });
      socket.on('error', reject);
    });
  }
}
