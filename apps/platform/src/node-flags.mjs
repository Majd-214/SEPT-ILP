/**
 * `node:sqlite` needs --experimental-sqlite on Node 22, ships unflagged
 * from 23.4, and a future major will reject the flag outright. Detect
 * support once, here, so every entry point that spawns Node agrees.
 *
 * @returns {Promise<string[]>} Flags to pass before the script path.
 */
export async function sqliteFlags() {
  return import('node:sqlite').then(() => [], () => ['--experimental-sqlite']);
}
