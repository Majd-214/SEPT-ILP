import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import {
  batchFlags, evaluateFormula, isAnswerKey, markItem, markSession, matchKey,
  normalizeSubmission, parseNumber, resolveEvidence, verifyExportHash,
  withinTolerance,
} from '../public/js/engine.js';

/* ── Number parsing ────────────────────────────────────────────────── */

test('parseNumber reads what students actually type', () => {
  assert.equal(parseNumber('3.85'), 3.85);
  assert.equal(parseNumber('  3.85 V '), 3.85);   // trailing units
  assert.equal(parseNumber('1,234.5'), 1234.5);   // thousands separator
  assert.equal(parseNumber('-0.5'), -0.5);
  assert.equal(parseNumber('−0.5'), -0.5);        // unicode minus
  assert.equal(parseNumber('.5'), 0.5);
  assert.equal(parseNumber('4.7e-3'), 0.0047);
  assert.equal(parseNumber(42), 42);
  assert.equal(parseNumber('resistance'), null);
  assert.equal(parseNumber(''), null);
  assert.equal(parseNumber(null), null);
  assert.equal(parseNumber(undefined), null);
  assert.equal(parseNumber(Number.NaN), null);
});

/* ── Tolerance edges ───────────────────────────────────────────────── */

test('absolute tolerance includes its exact boundary and excludes just past it', () => {
  const tolerance = { type: 'absolute', value: 0.25 };
  assert.ok(withinTolerance(4.93, 4.68, tolerance), 'exactly +0.25 is in');
  assert.ok(withinTolerance(4.43, 4.68, tolerance), 'exactly -0.25 is in');
  assert.ok(!withinTolerance(4.9301, 4.68, tolerance), '+0.2501 is out');
  assert.ok(!withinTolerance(4.4299, 4.68, tolerance), '-0.2501 is out');
});

test('percent tolerance scales with the expected value', () => {
  const tolerance = { type: 'percent', value: 10 };
  assert.ok(withinTolerance(11, 10, tolerance), '+10% exactly is in');
  assert.ok(withinTolerance(9, 10, tolerance), '-10% exactly is in');
  assert.ok(!withinTolerance(11.01, 10, tolerance));
  // Negative expected values: tolerance is on magnitude.
  assert.ok(withinTolerance(-11, -10, tolerance));
  // Expected 0 under percent admits only 0.
  assert.ok(withinTolerance(0, 0, tolerance));
  assert.ok(!withinTolerance(0.01, 0, tolerance));
});

test('tolerance rejects non-finite readings outright', () => {
  const tolerance = { type: 'absolute', value: 1e9 };
  assert.ok(!withinTolerance(Number.POSITIVE_INFINITY, 5, tolerance));
  assert.ok(!withinTolerance(Number.NaN, 5, tolerance));
  assert.ok(!withinTolerance(5, Number.NaN, tolerance));
});

/* ── Formula evaluation ────────────────────────────────────────────── */

test('formulas evaluate with ordinary precedence, parentheses, and unary minus', () => {
  assert.equal(evaluateFormula('2 + 3 * 4', {}), 14);
  assert.equal(evaluateFormula('(2 + 3) * 4', {}), 20);
  assert.equal(evaluateFormula('10 / 4', {}), 2.5);
  assert.equal(evaluateFormula('-3 * -2', {}), 6);
  assert.equal(evaluateFormula('2 - -3', {}), 5);
  assert.equal(evaluateFormula('vcalc', { vcalc: 1.25 }), 1.25);
});

test('the real lab formulas produce the published values', () => {
  // Lab 1 task 4: V = 5(Rtotal − 4.7)/Rtotal with Rtotal in kΩ.
  const volts = evaluateFormula('5 * (rtotal - 4.7) / rtotal', { rtotal: 5.17 });
  assert.ok(Math.abs(volts - 0.4545) < 0.001);
  // Mini-course fixture: divider voltage from constants + a field input.
  const divider = evaluateFormula('vin * r2 / (r2 + rfixed)', { vin: 5, rfixed: 4.7, r2: 10 });
  assert.ok(Math.abs(divider - 3.4014) < 0.001);
});

test('the function library covers min, max, abs, round, and clamp — and nothing else', () => {
  assert.equal(evaluateFormula('abs(3 - 5)', {}), 2);
  assert.equal(evaluateFormula('round(2.5)', {}), 3);
  assert.equal(evaluateFormula('min(3, 1, 2)', {}), 1);
  assert.equal(evaluateFormula('max(vin, 5)', { vin: 12 }), 12);
  assert.equal(evaluateFormula('clamp(15, 0, 10)', {}), 10);
  assert.equal(evaluateFormula('abs(vmeas - vcalc) / vcalc * 100', { vmeas: 4.4, vcalc: 4 }), 10.000000000000009);
  assert.throws(() => evaluateFormula('pow(2, 3)', {}), /unknown function/);
  assert.throws(() => evaluateFormula('abs(1, 2)', {}), /exactly 1 argument/);
  assert.throws(() => evaluateFormula('clamp(1)', {}), /exactly 3 arguments/);
  assert.throws(() => evaluateFormula('abs(1', {}), /missing closing parenthesis/);
});

test('formulas never reach eval: unknown syntax and variables throw', () => {
  assert.throws(() => evaluateFormula('2 ** 3', {}), /unexpected/);
  assert.throws(() => evaluateFormula('alert(1)', { alert: 1 }), /unknown function/,
    'a scope entry can never shadow its way into being callable');
  assert.throws(() => evaluateFormula('constructor', {}), /unknown variable/);
  assert.throws(() => evaluateFormula('a + b', { a: 1 }), /unknown variable "b"/);
  assert.throws(() => evaluateFormula('(1 + 2', {}), /parenthesis/);
  assert.throws(() => evaluateFormula('1 2', {}), /trailing/);
  assert.throws(() => evaluateFormula('', {}), /ended unexpectedly/);
  assert.throws(() => evaluateFormula('a', { a: Number.NaN }), /not a finite/);
});

/* ── Item marking ──────────────────────────────────────────────────── */

const SESSION = {
  source: 'team-a.zip',
  kind: 'completion',
  courseId: 'smrttech-3cc3',
  labId: 'lab-01',
  contentVersion: '2026-01',
  completionStatus: 'complete',
  student: { name_or_team: 'Ada, Grace', student_numbers: '400123456, 400654321' },
  fields: {},
  checks: {},
  ordering: {},
  quizzes: {},
  evidenceNames: {},
  evidenceFiles: {},
  confirmed: {},
  checkpointRecords: [],
  quizClaims: {},
  integrityHash: 'abc',
  raw: {},
};
const session = (overrides) => ({ ...SESSION, ...overrides });

test('choice items re-derive from the recorded selection, not the page claim', () => {
  const item = { id: 'choice:q1', type: 'choice', ref: { quiz: 'q1' }, points: 2, correct: ['b'] };
  assert.equal(markItem(item, session({ quizzes: { q1: { selection: 'b', correct: false, attempts: 3 } } })).earned, 2,
    'selection wins even when the page recorded the claim wrong');
  assert.equal(markItem(item, session({ quizzes: { q1: { selection: 'a', correct: true, attempts: 1 } } })).earned, 0);
  const multi = { ...item, correct: ['a', 'c'] };
  assert.equal(markItem(multi, session({ quizzes: { q1: { selection: 'c' } } })).earned, 2);
});

test('choice items fall back to the page claim only with an advisory flag', () => {
  const item = { id: 'choice:q1', type: 'choice', ref: { quiz: 'q1' }, points: 2, correct: ['b'] };
  const claimed = markItem(item, session({ quizClaims: { q1: { correct: true, attempts: 2 } } }));
  assert.equal(claimed.earned, 2);
  assert.match(claimed.flags[0], /review suggested/);
  const untouched = markItem(item, session({}));
  assert.equal(untouched.earned, 0);
  assert.equal(untouched.detail, 'not attempted');
  assert.equal(untouched.flags.length, 0);
});

test('numeric value items honour tolerance and partial credit', () => {
  const item = {
    id: 'value:r2', type: 'value', ref: { field: 'r2' }, points: 3,
    expected: 4.68, tolerance: { type: 'absolute', value: 0.25 },
    partial: { points: 1, tolerance: { type: 'absolute', value: 0.75 } },
  };
  assert.equal(markItem(item, session({ fields: { r2: '4.93' } })).earned, 3, 'boundary of full credit');
  assert.equal(markItem(item, session({ fields: { r2: '5.1' } })).earned, 1, 'partial band');
  assert.equal(markItem(item, session({ fields: { r2: '9' } })).earned, 0, 'outside both');
  assert.equal(markItem(item, session({ fields: {} })).earned, 0);
  const garbled = markItem(item, session({ fields: { r2: 'about five' } }));
  assert.equal(garbled.earned, 0);
  assert.match(garbled.flags[0], /not numeric/);
});

test('string value items normalize case and accept alternatives', () => {
  const item = {
    id: 'value:state', type: 'value', ref: { field: 'state' }, points: 1,
    expected: 'HIGH', alternatives: ['on'], tolerance: { type: 'absolute', value: 0.01 },
  };
  assert.equal(markItem(item, session({ fields: { state: ' high ' } })).earned, 1);
  assert.equal(markItem(item, session({ fields: { state: 'On' } })).earned, 1);
  assert.equal(markItem(item, session({ fields: { state: 'low' } })).earned, 0);
  const sensitive = { ...item, caseSensitive: true };
  assert.equal(markItem(sensitive, session({ fields: { state: 'high' } })).earned, 0);
  assert.equal(markItem(sensitive, session({ fields: { state: 'HIGH' } })).earned, 1);
});

test('formula items mark against the student’s own inputs', () => {
  const item = {
    id: 'formula:vcalc-red', type: 'formula', ref: { field: 'vcalc-red' }, points: 2,
    formula: { expression: '5 * (rtotal - 4.7) / rtotal', inputs: { rtotal: 'r-red' } },
    tolerance: { type: 'percent', value: 10 },
  };
  // Their resistance reading was 5.17 kΩ → expected ≈ 0.4545 V.
  assert.equal(markItem(item, session({ fields: { 'r-red': '5.17', 'vcalc-red': '0.45' } })).earned, 2);
  assert.equal(markItem(item, session({ fields: { 'r-red': '5.17', 'vcalc-red': '0.60' } })).earned, 0);
  // A DIFFERENT correct chain: different reading, matching calculation.
  assert.equal(markItem(item, session({ fields: { 'r-red': '6.2', 'vcalc-red': '1.21' } })).earned, 2);

  const missing = markItem(item, session({ fields: { 'vcalc-red': '0.45' } }));
  assert.equal(missing.earned, 0);
  assert.match(missing.flags[0], /inputs missing/);

  const infinite = markItem({
    ...item, formula: { expression: '1 / r', inputs: { r: 'r-red' } },
  }, session({ fields: { 'r-red': '0', 'vcalc-red': '5' } }));
  assert.equal(infinite.earned, 0);
  assert.match(infinite.flags[0], /non-finite/);
});

test('the measured-vs-calculated pattern compares two of the student’s fields', () => {
  const item = {
    id: 'formula:vmeas-red', type: 'formula', ref: { field: 'vmeas-red' }, points: 1,
    formula: { expression: 'vcalc', inputs: { vcalc: 'vcalc-red' } },
    tolerance: { type: 'percent', value: 15 },
  };
  assert.equal(markItem(item, session({ fields: { 'vcalc-red': '0.45', 'vmeas-red': '0.42' } })).earned, 1);
  assert.equal(markItem(item, session({ fields: { 'vcalc-red': '0.45', 'vmeas-red': '0.30' } })).earned, 0);
});

test('evidence items need the file, not just its recorded name', () => {
  const item = { id: 'evidence:vi', type: 'evidence', ref: { evidence: 'vi' }, points: 2 };
  assert.equal(markItem(item, session({
    evidenceFiles: { vi: { name: 'vi-trace.png', size: 1024 } },
  })).earned, 2);
  const nameOnly = markItem(item, session({ evidenceNames: { vi: 'vi-trace.png' } }));
  assert.equal(nameOnly.earned, 0);
  assert.match(nameOnly.flags[0], /no file in this upload/);
  assert.equal(markItem(item, session({})).earned, 0);
});

test('checkpoint items pay on confirmation and flag inconsistent records', () => {
  const item = { id: 'checkpoint:cp-4', type: 'checkpoint', ref: { checkpoint: 'cp-4' }, points: 2 };
  assert.equal(markItem(item, session({})).earned, 0);
  const clean = markItem(item, session({ confirmed: { 'cp-4': '2026-08-17T12:00:00Z' } }));
  assert.equal(clean.earned, 2);
  assert.equal(clean.flags.length, 0);
  const fishy = markItem(item, session({
    confirmed: { 'cp-4': '2026-08-17T12:00:00Z' },
    checkpointRecords: [{ id: 'cp-4', requirements_total: 6, requirements_satisfied: 3 }],
  }));
  assert.equal(fishy.earned, 2, 'still pays — the flag is advisory, not a verdict');
  assert.match(fishy.flags[0], /3\/6 requirements/);
});

/* ── Whole-session marking ─────────────────────────────────────────── */

const KEY = {
  platform: 'sept-ilp',
  keyVersion: 1,
  courseId: 'smrttech-3cc3',
  labId: 'lab-01',
  labTitle: 'Lab 1: Signals',
  contentVersion: '2026-01',
  salt: '00'.repeat(16),
  items: [
    { id: 'choice:q1', type: 'choice', ref: { quiz: 'q1' }, label: 'Q1', checkpointId: 'cp-1', points: 1, correct: ['b'] },
    {
      id: 'value:r2', type: 'value', ref: { field: 'r2' }, label: 'R2', checkpointId: 'cp-2', points: 3,
      expected: 4.68, tolerance: { type: 'absolute', value: 0.25 },
      partial: { points: 1, tolerance: { type: 'absolute', value: 0.75 } },
    },
    { id: 'checkpoint:cp-2', type: 'checkpoint', ref: { checkpoint: 'cp-2' }, label: 'Finish', checkpointId: 'cp-2', points: 1 },
  ],
  totals: { items: 3, points: 5, override: 10 },
};

test('markSession totals, scales to the lab override, and flags version drift', () => {
  const good = session({
    quizzes: { q1: { selection: 'b', attempts: 1 } },
    fields: { r2: '4.7' },
    confirmed: { 'cp-2': '2026-08-17T12:00:00Z' },
  });
  const marked = markSession(good, KEY, { exact: true });
  assert.equal(marked.totals.earned, 5);
  assert.equal(marked.totals.scaled, 10, 'earned 5/5 → 10/10 after the lab override');
  assert.equal(marked.flags.length, 0);

  const drifted = markSession(session({ contentVersion: '2025-09' }), KEY, { exact: false });
  assert.match(drifted.flags[0], /content version 2025-09/);

  const partial = markSession(session({ fields: { r2: '5.2' } }), KEY, { exact: true });
  assert.equal(partial.totals.earned, 1);
  assert.equal(partial.totals.scaled, 2, '1/5 → 2/10');
});

test('malformed submissions are refused with a reason, never a crash', () => {
  assert.equal(normalizeSubmission('x.json', null).ok, false);
  assert.equal(normalizeSubmission('x.json', [1, 2]).ok, false);
  assert.equal(normalizeSubmission('x.json', { hello: 'world' }).ok, false);
  assert.equal(normalizeSubmission('x.json', { schema_version: 'unknown-v9' }).ok, false);

  // A completion record with everything missing still normalizes to a
  // markable (all-zero) session rather than crashing the batch.
  const bare = normalizeSubmission('bare.json', { schema_version: 'sept-ilp-completion-v1' });
  assert.equal(bare.ok, true);
  const marked = markSession(bare.session, KEY, { exact: false });
  assert.equal(marked.totals.earned, 0);
  assert.equal(marked.items.length, 3);
});

test('progress files mark identically to completion records with the same state', () => {
  const state = {
    fields: { r2: '4.7' },
    checks: {},
    ordering: {},
    quizzes: { q1: { selection: 'b', correct: true, attempts: 1 } },
    confirmed: { 'cp-2': '2026-08-17T12:00:00Z' },
    evidence: {},
    student: { name_or_team: 'Ada' },
  };
  const progress = normalizeSubmission('ada-progress.json', {
    platform: 'sept-ilp', progressVersion: 1,
    course: 'smrttech-3cc3', lab: 'lab-01', labTitle: 'Lab 1', contentVersion: '2026-01',
    exportedAt: '2026-08-17T12:00:00Z', state,
  });
  assert.equal(progress.ok, true);
  const marked = markSession(progress.session, KEY, { exact: true });
  assert.equal(marked.totals.earned, 5);
});

/* ── Key matching and detection ────────────────────────────────────── */

test('keys match exactly by lab and content version, then degrade to lab only', () => {
  const otherVersion = { ...KEY, contentVersion: '2025-09' };
  assert.equal(matchKey(session({}), [otherVersion, KEY]).key, KEY);
  assert.equal(matchKey(session({}), [otherVersion, KEY]).exact, true);
  const degraded = matchKey(session({ contentVersion: '2024-01' }), [otherVersion]);
  assert.equal(degraded.exact, false);
  assert.equal(matchKey(session({ labId: 'lab-99' }), [KEY]), null);
});

test('isAnswerKey recognizes key documents and rejects near-misses', () => {
  assert.ok(isAnswerKey(KEY));
  assert.ok(!isAnswerKey({ platform: 'sept-ilp', progressVersion: 1 }));
  assert.ok(!isAnswerKey({ schema_version: 'sept-ilp-completion-v1' }));
  assert.ok(!isAnswerKey(null));
});

/* ── Batch flags ───────────────────────────────────────────────────── */

test('identical responses under different identities flag both submissions — once', () => {
  const shared = {
    fields: { r2: '4.7' },
    quizzes: { q1: { selection: 'b' } },
  };
  const first = markSession(session({ ...shared, source: 'ada.zip' }), KEY, { exact: true });
  const second = markSession(session({
    ...shared, source: 'eve.zip',
    student: { name_or_team: 'Eve', student_numbers: '400999999' },
  }), KEY, { exact: true });
  const results = [first, second];
  batchFlags(results);
  batchFlags(results); // the UI re-runs this every render — must stay idempotent
  assert.equal(first.flags.filter((flag) => flag.includes('identical')).length, 1);
  assert.equal(second.flags.filter((flag) => flag.includes('identical')).length, 1);

  // The same file twice is a duplicate, not collusion.
  const again = markSession(session({ ...shared, source: 'ada-copy.zip' }), KEY, { exact: true });
  batchFlags([first, again]);
  assert.match(again.flags.at(-1), /duplicate of ada\.zip/);

  // Two empty submissions are NOT flagged as identical.
  const emptyA = markSession(session({ source: 'a.zip' }), KEY, { exact: true });
  const emptyB = markSession(session({ source: 'b.zip' }), KEY, { exact: true });
  batchFlags([emptyA, emptyB]);
  assert.ok(!emptyA.flags.some((flag) => flag.includes('identical')));
});

/* ── Integrity hash ────────────────────────────────────────────────── */

test('verifyExportHash reproduces the page’s hash and catches edits', async () => {
  // Build the record exactly the way the lab page does: hash the
  // compact JSON, then append the hash fields.
  const record = {
    schema_version: 'sept-ilp-completion-v1',
    course: { id: 'smrttech-3cc3' },
    student: { name_or_team: 'Ada' },
    grading_summary: { auto_score: { total: 4, earned: 3 } },
  };
  const hash = createHash('sha256').update(JSON.stringify(record)).digest('hex');
  record.export_hash = hash;
  record.export_hash_algorithm = 'SHA-256';
  record.export_hash_scope = 'JSON content excluding the export_hash fields.';

  // Round-trip through pretty-printed JSON, as the file on disk is.
  const reloaded = JSON.parse(JSON.stringify(record, null, 2));
  assert.equal(await verifyExportHash(reloaded), true);

  const tampered = JSON.parse(JSON.stringify(record, null, 2));
  tampered.grading_summary.auto_score.earned = 4;
  assert.equal(await verifyExportHash(tampered), false);

  assert.equal(await verifyExportHash({ course: {} }), null, 'no hash → unknown, not failure');
});

/* ── Evidence resolution from ZIP listings ─────────────────────────── */

test('resolveEvidence maps sanitized archive names back to key items', () => {
  const key = {
    ...KEY,
    items: [{ id: 'evidence:lab1-vi-file', type: 'evidence', ref: { evidence: 'lab1-vi-file' }, points: 2 }],
  };
  const subject = session({});
  // The page archives `lab1-vi-file` + `V-I trace.png` with `-`, space
  // and `*` all sanitized to underscores.
  resolveEvidence(subject, key, [
    { name: 'completion.json', size: 900 },
    { name: 'evidence/lab1_vi_file-V_I_trace.png', size: 4096 },
  ]);
  assert.deepEqual(subject.evidenceFiles['lab1-vi-file'], {
    name: 'lab1_vi_file-V_I_trace.png', size: 4096,
  });
});
