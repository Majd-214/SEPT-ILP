import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  allFlags, brightspaceCsv, csvCell, feedbackFile, genericCsv, studentIds,
} from '../public/js/csv.js';

const result = (overrides = {}) => ({
  session: {
    source: 'team-a.zip',
    labId: 'lab-01',
    contentVersion: '2026-01',
    completionStatus: 'complete',
    student: { name_or_team: 'Ada, Grace', student_numbers: '400123456, 400654321', lab_section: 'L01' },
    ...overrides.session,
  },
  key: { labId: 'lab-01', labTitle: 'Lab 1: Signals', courseId: 'smrttech-3cc3', contentVersion: '2026-01' },
  items: [
    { id: 'choice:q1', type: 'choice', label: 'Q1', points: 1, earned: 1, detail: 'correct', flags: [] },
    { id: 'value:r2', type: 'value', label: 'R2 reading', points: 3, earned: 1, detail: 'partial', flags: [] },
  ],
  flags: [],
  totals: { points: 4, earned: 2, override: 10, scaled: 5, out_of: 10, grade: 5 },
  ...overrides.result,
});

test('csvCell quotes only when needed and escapes embedded quotes', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('has,comma'), '"has,comma"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('line\nbreak'), '"line\nbreak"');
  assert.equal(csvCell(undefined), '');
});

test('studentIds finds numbers through every separator students use', () => {
  assert.deepEqual(studentIds({ student_numbers: '400123456, 400654321' }), ['400123456', '400654321']);
  assert.deepEqual(studentIds({ student_numbers: '400123456 / 400654321' }), ['400123456', '400654321']);
  assert.deepEqual(studentIds({ student_numbers: '400123456 and 400654321' }), ['400123456', '400654321']);
  assert.deepEqual(studentIds({ student_numbers: 'Ada (no number)' }), []);
  assert.deepEqual(studentIds({}), []);
});

test('the Brightspace CSV is one row per student number in D2L import format', () => {
  const { csv, skipped } = brightspaceCsv([result()], 'Lab 1');
  const lines = csv.trimEnd().split('\r\n');
  assert.equal(lines[0], 'OrgDefinedId,Lab 1 Points Grade,End-of-Line Indicator');
  assert.equal(lines[1], '#400123456,5,#');
  assert.equal(lines[2], '#400654321,5,#');
  assert.equal(lines.length, 3);
  assert.equal(skipped.length, 0);
});

test('submissions without parseable numbers are skipped and reported', () => {
  const anonymous = result({ session: { student: { name_or_team: 'Mystery Team', student_numbers: 'TBD' } } });
  const { csv, skipped } = brightspaceCsv([anonymous], 'Lab 1');
  assert.equal(csv.trimEnd().split('\r\n').length, 1, 'header only');
  assert.equal(skipped.length, 1);
});

test('the generic CSV unions item columns across a mixed batch', () => {
  const other = result({
    result: {
      items: [{ id: 'evidence:vi', type: 'evidence', label: 'Trace', points: 2, earned: 2, detail: 'file present', flags: [] }],
      totals: { points: 2, earned: 2, override: null, scaled: null, out_of: 2, grade: 2 },
    },
    session: { source: 'team-b.zip', labId: 'lab-02' },
  });
  const csv = genericCsv([result(), other]);
  const [header, rowA, rowB] = csv.trimEnd().split('\r\n');
  assert.match(header, /choice:q1,value:r2,evidence:vi$/);
  assert.match(rowA, /1\/1,1\/3,$/, 'first row leaves the foreign column blank');
  assert.match(rowB, /,,2\/2$/, 'second row leaves the first key’s columns blank');
});

test('feedback files carry the breakdown and the advisory framing', () => {
  const flagged = result({
    result: {
      flags: ['no integrity hash in the export — review suggested'],
      items: [{ id: 'value:r2', type: 'value', label: 'R2 | reading', points: 3, earned: 1, detail: 'partial | band', flags: [] }],
      totals: { points: 3, earned: 1, override: 10, scaled: 3.33, out_of: 10, grade: 3.33 },
    },
  });
  const feedback = feedbackFile(flagged);
  assert.equal(feedback.name, 'feedback-Ada_Grace.md');
  assert.match(feedback.text, /Auto-marked total:\*\* 1\/3 → 3\.33\/10/);
  assert.match(feedback.text, /R2 \\\| reading/, 'pipes escaped inside the markdown table');
  assert.match(feedback.text, /advisory: they suggest a second look, they are not verdicts/);
  assert.equal(allFlags(flagged).length, 1);
});
