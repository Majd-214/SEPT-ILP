/**
 * Start the platform on whatever Node is installed.
 *
 *   npm start
 *
 * The platform is a plain Node process: no container, no database
 * server, no mail server. It serves the faculty console, the editor,
 * the marker, and — from the live release — the student site.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sqliteFlags } from '../apps/platform/src/node-flags.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const server = path.join(here, '..', 'apps', 'platform', 'src', 'server.js');

const child = spawn(process.execPath, [...await sqliteFlags(), server], { stdio: 'inherit' });
child.on('close', (code) => process.exit(code ?? 0));
