#!/usr/bin/env node
/**
 * Validate one content document against a platform schema:
 *
 *   node renderer/src/validate-file.js <lab|course|knowledge|progress> <file.json>
 *
 * Useful while authoring a single document, before the full course exists.
 * The complete build (`cli.js build`) additionally checks cross-references.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { SchemaGate } from './gates/SchemaGate.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const [kind, file] = process.argv.slice(2);

if (!['lab', 'course', 'knowledge', 'progress'].includes(kind) || !file) {
  console.error('Usage: node renderer/src/validate-file.js <lab|course|knowledge|progress> <file.json>');
  process.exit(2);
}

let document;
try {
  document = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (error) {
  console.error(`${file}: ${error.message}`);
  process.exit(1);
}

const gate = new SchemaGate(path.join(REPO_ROOT, 'schema', 'v1'));
const violations = gate.validate(
  `https://majd-214.github.io/SEPT-ILP/schema/v1/${kind}.schema.json`,
  document,
  path.basename(file),
);

if (violations.length === 0) {
  console.log(`${file}: valid ${kind} document`);
} else {
  console.error(`${file}: ${violations.length} violation${violations.length === 1 ? '' : 's'}`);
  for (const violation of violations) console.error(`  - ${violation}`);
  process.exit(1);
}
