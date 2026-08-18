/**
 * Run the platform's tests on whatever Node the developer has, so
 * `npm test` simply works — in a terminal or from WebStorm's npm tool
 * window. See ../src/node-flags.mjs for why the flag is conditional.
 */
import { spawn } from 'node:child_process';

import { sqliteFlags } from '../src/node-flags.mjs';

const child = spawn(process.execPath, [...await sqliteFlags(), '--test'], {
  stdio: 'inherit',
  cwd: new URL('..', import.meta.url).pathname,
});
child.on('close', (code) => process.exit(code ?? 1));
