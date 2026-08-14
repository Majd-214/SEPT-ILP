import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

/**
 * Zero-dependency static file server for previewing a rendered course
 * locally (`npm run preview`). Serves the build output read-only; it is a
 * development convenience and is never part of a published bundle.
 */
export class PreviewServer {
  static #MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.zip': 'application/zip',
  };

  /**
   * @param {string} rootDir Directory to serve.
   * @param {number} [port]
   */
  constructor(rootDir, port = 4173) {
    this.rootDir = rootDir;
    this.port = port;
  }

  /** Start listening; resolves once the server is ready. */
  start() {
    const server = http.createServer((request, response) => this.#handle(request, response));
    return new Promise((resolve) => {
      server.listen(this.port, () => {
        console.log(`Preview: http://localhost:${this.port}/`);
        resolve(server);
      });
    });
  }

  /**
   * @param {http.IncomingMessage} request
   * @param {http.ServerResponse} response
   */
  #handle(request, response) {
    const urlPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let filePath = path.normalize(path.join(this.rootDir, urlPath));

    if (!filePath.startsWith(this.rootDir)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    if (!fs.existsSync(filePath)) {
      response.writeHead(404, { 'Content-Type': 'text/plain' }).end(`Not found: ${urlPath}`);
      return;
    }

    const mime = PreviewServer.#MIME[path.extname(filePath)] ?? 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(filePath).pipe(response);
  }
}
