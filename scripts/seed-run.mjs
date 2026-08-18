/**
 * Seed wrapper: selects the right Node flags, then runs scripts/seed.mjs.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sqliteFlags } from '../apps/platform/src/node-flags.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const child = spawn(process.execPath,
  [...await sqliteFlags(), path.join(here, 'seed.mjs')], { stdio: 'inherit' });
child.on('close', (code) => process.exit(code ?? 0));
