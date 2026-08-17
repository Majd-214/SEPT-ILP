/**
 * Run the platform's tests on whatever Node the developer has.
 *
 * `node:sqlite` needs --experimental-sqlite on Node 22, ships unflagged
 * from 23.4, and a future major will reject the flag outright. Rather
 * than pinning a flag that rots, detect support once and spawn the test
 * runner accordingly — so `npm test` simply works, in a terminal or
 * from WebStorm's npm tool window.
 */
import { spawn } from 'node:child_process';

const needsFlag = await import('node:sqlite').then(() => false, () => true);
const args = needsFlag ? ['--experimental-sqlite', '--test'] : ['--test'];

const child = spawn(process.execPath, args, {
  stdio: 'inherit',
  cwd: new URL('..', import.meta.url).pathname,
});
child.on('close', (code) => process.exit(code ?? 1));
