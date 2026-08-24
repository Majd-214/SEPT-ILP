/**
 * Turn a lab's multiple-choice questions into a CSV that Brightspace's
 * Question Library can import.
 *
 *   node tools/quiz-to-d2l-csv.mjs content/courses/smrttech-3cc3/labs/lab-01.json out.csv
 *
 * Why this exists: if Avenue's own Quizzes tool carries the graded half
 * of a lab, the questions still have to get in there. Retyping them is
 * both tedious and a second copy that drifts from the content. This
 * derives them from the same JSON the lab page is built from.
 *
 * Arithmetic (numeric, tolerance-based) questions are NOT included:
 * Brightspace's CSV import supports WR, SA, M, MC, TF, MS and O only, so
 * numeric questions must be created in the interface. The script lists
 * the ones it could not carry so nothing is silently dropped.
 *
 * The output contains correct answers. It is an instructor artifact,
 * like the answer keys — it belongs in the Question Library, never in
 * anything students receive.
 */
import fs from 'node:fs';
import path from 'node:path';

import { RichText } from '../renderer/src/lib/RichText.js';

const [source, target] = process.argv.slice(2);
if (!source) {
  console.error('usage: node tools/quiz-to-d2l-csv.mjs <lab.json> [out.csv]');
  process.exit(2);
}

const lab = JSON.parse(fs.readFileSync(source, 'utf8'));

/** Every block of a given type, in document order. */
function collect(node, type, found = []) {
  if (Array.isArray(node)) node.forEach((item) => collect(item, type, found));
  else if (node && typeof node === 'object') {
    if (node.type === type) found.push(node);
    Object.values(node).forEach((value) => collect(value, type, found));
  }
  return found;
}

/** One CSV cell: quote when the content would otherwise break the row. */
const cell = (value) => {
  const text = RichText.plain(String(value ?? '')).trim();
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const row = (...cells) => cells.map(cell).join(',');

const prefix = (lab.id ?? 'lab').toUpperCase().replace(/[^A-Z0-9]+/g, '');
const lines = [];
const quizzes = collect(lab.checkpoints, 'quiz');

for (const quiz of quizzes) {
  lines.push(row('NewQuestion', 'MC'));
  lines.push(row('ID', `${prefix}-${quiz.id}`));
  lines.push(row('Title', quiz.prompt));
  lines.push(row('QuestionText', quiz.prompt));
  lines.push(row('Points', quiz.points ?? 1));
  lines.push(row('Difficulty', 1));
  for (const option of quiz.options) {
    // Brightspace scores options as a percentage of the question's
    // points: 100 for the correct one, 0 otherwise.
    lines.push(row('Option', option.correct === true ? 100 : 0, option.text, '', ''));
  }
  if (quiz.hint) lines.push(row('Hint', quiz.hint));
  if (quiz.explanation) lines.push(row('Feedback', quiz.explanation));
  lines.push('');
}

const csv = `${lines.join('\r\n')}\r\n`;
const out = target ?? path.join('dist', `${lab.id}-questions.csv`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, csv, 'utf8');

/* What could not be carried, named rather than dropped in silence. */
const numeric = [];
for (const type of ['fields', 'measurementTable']) {
  for (const block of collect(lab.checkpoints, type)) {
    const defs = type === 'fields' ? block.fields
      : (block.rows ?? []).flatMap((r) => r.cells ?? []);
    for (const def of defs) {
      if (def?.expected !== undefined || def?.marking) {
        numeric.push(`${def.key}${def.expected?.value !== undefined ? ` (expects ${def.expected.value})` : ''}`);
      }
    }
  }
}

console.log(`Wrote ${quizzes.length} multiple-choice question(s) to ${out}`);
if (numeric.length) {
  console.log(`\n${numeric.length} numeric answer(s) could NOT be carried by CSV import.`);
  console.log('Brightspace needs these built as Arithmetic questions in the interface:');
  for (const item of numeric.slice(0, 12)) console.log(`  · ${item}`);
  if (numeric.length > 12) console.log(`  … and ${numeric.length - 12} more`);
}
console.log('\nThis file contains correct answers — Question Library only, never student-facing.');
