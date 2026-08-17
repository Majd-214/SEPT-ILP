/**
 * The marking engine — pure functions, no DOM, no network. The browser
 * app and the node test suite import this same module, so everything
 * asserted in tests is exactly what runs on an instructor's machine.
 *
 * Inputs: instructor answer keys (dist/keys/<course>/<labId>.key.json,
 * validated against schema/v1/answer-key.schema.json) and student
 * artifacts — either the submission ZIP's completion.json
 * (sept-ilp-completion-v1) or a raw progress file (progressVersion 1).
 *
 * Every mark is re-derived here from the student's recorded responses
 * against the key's plaintext; the page's own auto-score claims are
 * used only as a last resort for old exports, and doing so raises an
 * advisory flag. Flags are always "review suggested", never verdicts.
 */

/* ── Numbers and tolerance ─────────────────────────────────────────── */

/**
 * Extract a number from a student-typed value: tolerates whitespace,
 * thousands separators, units after the number ("3.85 V"), and unicode
 * minus. Returns null when no numeric token exists.
 * @param {unknown} raw
 * @returns {number | null}
 */
export function parseNumber(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/,(?=\d{3}\b)/g, '').replace(/−/g, '-').trim();
  const match = /-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i.exec(cleaned);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

/**
 * Is `got` within tolerance of `expected`? A tiny relative epsilon keeps
 * values sitting exactly on the boundary inside it, so "±0.25" honestly
 * means "up to and including 0.25 away".
 * @param {number} got
 * @param {number} expected
 * @param {{ type: 'absolute' | 'percent', value: number }} tolerance
 */
export function withinTolerance(got, expected, tolerance) {
  if (!Number.isFinite(got) || !Number.isFinite(expected)) return false;
  const span = tolerance.type === 'percent'
    ? Math.abs(expected) * (tolerance.value / 100)
    : tolerance.value;
  const epsilon = 1e-9 * Math.max(1, Math.abs(expected), Math.abs(got));
  return Math.abs(got - expected) <= span + epsilon;
}

/* ── Formula evaluation (never eval) ───────────────────────────────── */

/** The whole function library formulas may call. */
const FUNCTIONS = {
  abs: (args) => Math.abs(one('abs', args)),
  round: (args) => Math.round(one('round', args)),
  min: (args) => Math.min(...some('min', args)),
  max: (args) => Math.max(...some('max', args)),
  clamp: (args) => {
    if (args.length !== 3) throw new Error('clamp takes exactly 3 arguments');
    return Math.min(Math.max(args[0], args[1]), args[2]);
  },
};
const one = (name, args) => {
  if (args.length !== 1) throw new Error(`${name} takes exactly 1 argument`);
  return args[0];
};
const some = (name, args) => {
  if (args.length === 0) throw new Error(`${name} needs at least 1 argument`);
  return args;
};

/**
 * Evaluate an arithmetic expression over named variables with a small
 * recursive-descent parser. Grammar: + - * / ( ) unary minus, numeric
 * literals, identifiers resolved from `scope`, and the fixed function
 * library min/max/abs/round/clamp. Anything else — including anything
 * that would reach eval() — is a thrown error.
 * @param {string} expression
 * @param {Record<string, number>} scope
 * @returns {number}
 */
export function evaluateFormula(expression, scope) {
  const tokens = [];
  const pattern = /\s*(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+|[A-Za-z_][A-Za-z0-9_]*|[-+*/(),])/y;
  let cursor = 0;
  while (cursor < expression.length) {
    pattern.lastIndex = cursor;
    const match = pattern.exec(expression);
    if (!match) {
      if (/^\s*$/.test(expression.slice(cursor))) break;
      throw new Error(`unexpected character at position ${cursor}: ${expression.slice(cursor, cursor + 8)}`);
    }
    tokens.push(match[1]);
    cursor = pattern.lastIndex;
  }

  let index = 0;
  const peek = () => tokens[index];
  const next = () => tokens[index++];

  const primary = () => {
    const token = next();
    if (token === undefined) throw new Error('expression ended unexpectedly');
    if (token === '(') {
      const inner = expr();
      if (next() !== ')') throw new Error('missing closing parenthesis');
      return inner;
    }
    if (/^(?:\d|\.)/.test(token)) return Number(token);
    if (/^[A-Za-z_]/.test(token)) {
      if (peek() === '(') {
        // Own properties only: FUNCTIONS[token] would otherwise resolve
        // inherited names like "constructor" or "toString" to real
        // functions off Object.prototype.
        if (!Object.hasOwn(FUNCTIONS, token)) throw new Error(`unknown function "${token}"`);
        const fn = FUNCTIONS[token];
        next(); // consume '('
        const args = [expr()];
        while (peek() === ',') { next(); args.push(expr()); }
        if (next() !== ')') throw new Error(`missing closing parenthesis after ${token}(…`);
        return fn(args);
      }
      // Own properties only: `in` would walk the prototype chain and
      // resolve names like "constructor" to functions.
      if (!Object.hasOwn(scope, token)) throw new Error(`unknown variable "${token}"`);
      const value = scope[token];
      if (!Number.isFinite(value)) throw new Error(`variable "${token}" is not a finite number`);
      return value;
    }
    throw new Error(`unexpected token "${token}"`);
  };
  const unary = () => (peek() === '-' ? (next(), -unary()) : primary());
  const term = () => {
    let value = unary();
    while (peek() === '*' || peek() === '/') {
      value = next() === '*' ? value * unary() : value / unary();
    }
    return value;
  };
  const expr = () => {
    let value = term();
    while (peek() === '+' || peek() === '-') {
      value = next() === '+' ? value + term() : value - term();
    }
    return value;
  };

  const result = expr();
  if (index < tokens.length) throw new Error(`unexpected trailing token "${tokens[index]}"`);
  return result;
}

/* ── Normalizing student artifacts ─────────────────────────────────── */

/**
 * Turn a parsed student document (completion.json or progress file)
 * into the one canonical shape the marker works with.
 * @param {string} filename Where the document came from, for reporting.
 * @param {object} doc Parsed JSON.
 * @returns {{ ok: true, session: object } | { ok: false, error: string }}
 */
export function normalizeSubmission(filename, doc) {
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, error: 'not a JSON object' };
  }

  if (doc.schema_version === 'sept-ilp-completion-v1') {
    const responses = doc.responses ?? {};
    return {
      ok: true,
      session: {
        source: filename,
        kind: 'completion',
        courseId: doc.course?.id ?? '',
        labId: doc.lab?.id ?? '',
        labTitle: doc.lab?.title ?? '',
        contentVersion: doc.lab?.content_version ?? '',
        completionStatus: doc.lab?.completion_status ?? 'unknown',
        exportedAt: doc.lab?.export_generated_at ?? null,
        student: doc.student ?? {},
        fields: responses.fields ?? {},
        checks: responses.checks ?? {},
        ordering: responses.ordering ?? {},
        quizzes: responses.quizzes ?? {},
        evidenceNames: responses.evidence_files ?? {},
        evidenceFiles: {},
        confirmed: Object.fromEntries((doc.checkpoints ?? [])
          .filter((checkpoint) => checkpoint.confirmed_at)
          .map((checkpoint) => [checkpoint.id, checkpoint.confirmed_at])),
        checkpointRecords: doc.checkpoints ?? [],
        quizClaims: Object.fromEntries((doc.grading_summary?.quizzes ?? [])
          .map((quiz) => [quiz.id, quiz])),
        integrityHash: doc.export_hash ?? null,
        raw: doc,
      },
    };
  }

  if (doc.platform === 'sept-ilp' && doc.progressVersion === 1) {
    const state = doc.state ?? {};
    return {
      ok: true,
      session: {
        source: filename,
        kind: 'progress',
        courseId: doc.course ?? '',
        labId: doc.lab ?? '',
        labTitle: doc.labTitle ?? '',
        contentVersion: doc.contentVersion ?? '',
        completionStatus: 'unknown',
        exportedAt: doc.exportedAt ?? null,
        student: state.student ?? {},
        fields: state.fields ?? {},
        checks: state.checks ?? {},
        ordering: state.ordering ?? {},
        quizzes: state.quizzes ?? {},
        evidenceNames: state.evidence ?? {},
        evidenceFiles: {},
        confirmed: state.confirmed ?? {},
        checkpointRecords: [],
        quizClaims: {},
        integrityHash: null,
        raw: doc,
      },
    };
  }

  return { ok: false, error: 'not a SEPT-ILP submission or progress file' };
}

/** Is this parsed JSON an instructor answer key? @param {object} doc */
export function isAnswerKey(doc) {
  return Boolean(doc && doc.platform === 'sept-ilp' && doc.keyVersion === 1
    && Array.isArray(doc.items));
}

/* ── Key matching ──────────────────────────────────────────────────── */

/**
 * Pick the answer key for a session: exact means labId AND
 * contentVersion agree; a labId-only match still marks, with an
 * advisory flag raised by markSession.
 * @param {object} session
 * @param {object[]} keys
 * @returns {{ key: object, exact: boolean } | null}
 */
export function matchKey(session, keys) {
  const exact = keys.find((key) => key.labId === session.labId
    && key.contentVersion === session.contentVersion
    && (!session.courseId || key.courseId === session.courseId));
  if (exact) return { key: exact, exact: true };
  const labOnly = keys.find((key) => key.labId === session.labId);
  return labOnly ? { key: labOnly, exact: false } : null;
}

/* ── Marking ───────────────────────────────────────────────────────── */

const round2 = (value) => Math.round(value * 100) / 100;

/**
 * Mark one key item against a session. Returns earned points, a
 * human-readable detail line, and any advisory flags.
 * @param {object} item Answer-key item.
 * @param {object} session Canonical session.
 * @returns {{ earned: number, detail: string, flags: string[] }}
 */
export function markItem(item, session) {
  const flags = [];

  if (item.type === 'choice') {
    const record = session.quizzes[item.ref.quiz];
    if (record && typeof record.selection === 'string' && record.selection !== '') {
      const correct = item.correct.includes(record.selection);
      return {
        earned: correct ? item.points : 0,
        detail: `selected "${record.selection}" — ${correct ? 'correct' : `expected ${item.correct.join(' or ')}`}`
          + (record.attempts > 1 ? ` (${record.attempts} attempts)` : ''),
        flags,
      };
    }
    const claim = session.quizClaims[item.ref.quiz];
    if (claim) {
      flags.push('no recorded selection — marked from the page’s own auto-score; review suggested');
      return {
        earned: claim.correct === true ? item.points : 0,
        detail: `page recorded ${claim.correct === true ? 'correct' : 'incorrect'} in ${claim.attempts ?? '?'} attempts`,
        flags,
      };
    }
    return { earned: 0, detail: 'not attempted', flags };
  }

  if (item.type === 'value') {
    const raw = session.fields[item.ref.field];
    if (raw === undefined || String(raw).trim() === '') {
      return { earned: 0, detail: 'no answer recorded', flags };
    }
    if (typeof item.expected === 'number') {
      const got = parseNumber(raw);
      if (got === null) {
        flags.push(`answer "${raw}" is not numeric — review suggested`);
        return { earned: 0, detail: `answered "${raw}" — could not read a number`, flags };
      }
      return gradeNumeric(item, got, `answered ${got}, expected ${item.expected}`);
    }
    const accepted = [item.expected, ...(item.alternatives ?? [])]
      .map((value) => normalizeText(value, item.caseSensitive));
    const correct = accepted.includes(normalizeText(raw, item.caseSensitive));
    return {
      earned: correct ? item.points : 0,
      detail: `answered "${String(raw).trim()}" — ${correct ? 'accepted' : `expected "${item.expected}"`}`,
      flags,
    };
  }

  if (item.type === 'formula') {
    const raw = session.fields[item.ref.field];
    if (raw === undefined || String(raw).trim() === '') {
      return { earned: 0, detail: 'no answer recorded', flags };
    }
    const got = parseNumber(raw);
    if (got === null) {
      flags.push(`answer "${raw}" is not numeric — review suggested`);
      return { earned: 0, detail: `answered "${raw}" — could not read a number`, flags };
    }
    const scope = { ...(item.formula.constants ?? {}) };
    const missing = [];
    for (const [name, fieldKey] of Object.entries(item.formula.inputs ?? {})) {
      const input = parseNumber(session.fields[fieldKey]);
      if (input === null) missing.push(fieldKey);
      else scope[name] = input;
    }
    if (missing.length > 0) {
      flags.push(`formula inputs missing or not numeric (${missing.join(', ')}) — review suggested`);
      return { earned: 0, detail: `cannot evaluate: needs ${missing.join(', ')}`, flags };
    }
    let expected;
    try {
      expected = evaluateFormula(item.formula.expression, scope);
    } catch (error) {
      flags.push(`formula did not evaluate (${error.message}) — review suggested`);
      return { earned: 0, detail: 'formula error', flags };
    }
    if (!Number.isFinite(expected)) {
      flags.push('formula evaluated to a non-finite value — review suggested');
      return { earned: 0, detail: `answered ${got}; expected value is undefined for these inputs`, flags };
    }
    return gradeNumeric(item, got, `answered ${got}, expected ${round2(expected)} from their own inputs`, expected);
  }

  if (item.type === 'evidence') {
    const file = session.evidenceFiles[item.ref.evidence];
    if (file) {
      return { earned: item.points, detail: `file present: ${file.name} (${file.size} bytes)`, flags };
    }
    const recorded = session.evidenceNames[item.ref.evidence];
    if (recorded) {
      flags.push(`evidence "${recorded}" recorded but no file in this upload — review suggested`);
      return { earned: 0, detail: `recorded "${recorded}" but the file is not attached`, flags };
    }
    return { earned: 0, detail: 'no evidence recorded', flags };
  }

  if (item.type === 'checkpoint') {
    const confirmedAt = session.confirmed[item.ref.checkpoint];
    if (!confirmedAt) return { earned: 0, detail: 'not confirmed', flags };
    const record = session.checkpointRecords
      .find((checkpoint) => checkpoint.id === item.ref.checkpoint);
    if (record && record.requirements_satisfied < record.requirements_total) {
      flags.push(`confirmed with ${record.requirements_satisfied}/${record.requirements_total} requirements satisfied — review suggested`);
    }
    // Submissions are student-supplied JSON and are never schema-checked
    // (only the answer key is), so confirmed_at may be any type. Coerce
    // before slicing — a hand-edited number here must not crash the run.
    const when = String(confirmedAt);
    return { earned: item.points, detail: `confirmed ${when.slice(0, 16).replace('T', ' ')}`, flags };
  }

  return { earned: 0, detail: `unknown item type "${item.type}"`, flags: [`unknown item type "${item.type}" — review suggested`] };

  /** Numeric grading shared by value and formula items. */
  function gradeNumeric(gradedItem, got, baseDetail, expectedOverride) {
    const tolerance = gradedItem.tolerance;
    const candidates = expectedOverride !== undefined
      ? [expectedOverride]
      : [gradedItem.expected, ...(gradedItem.alternatives ?? [])].filter((v) => typeof v === 'number');
    if (candidates.some((candidate) => withinTolerance(got, candidate, tolerance))) {
      return { earned: gradedItem.points, detail: `${baseDetail} — within tolerance`, flags };
    }
    if (gradedItem.partial
      && candidates.some((candidate) => withinTolerance(got, candidate, gradedItem.partial.tolerance))) {
      return {
        earned: gradedItem.partial.points,
        detail: `${baseDetail} — outside full tolerance, inside partial (${gradedItem.partial.points}/${gradedItem.points})`,
        flags,
      };
    }
    return { earned: 0, detail: `${baseDetail} — outside tolerance`, flags };
  }
}

function normalizeText(value, caseSensitive) {
  const trimmed = String(value).trim();
  return caseSensitive ? trimmed : trimmed.toLowerCase();
}

/**
 * Mark a whole session against its key.
 * @param {object} session Canonical session.
 * @param {object} key Answer-key document.
 * @param {{ exact?: boolean }} [match] From matchKey.
 * @returns {object} Marked result: items, totals, session-level flags.
 */
export function markSession(session, key, match = { exact: true }) {
  const flags = [];
  if (!match.exact) {
    flags.push(`marked with the ${key.contentVersion} key; submission reports content version ${session.contentVersion || 'unknown'} — review suggested`);
  }
  if (session.courseId && key.courseId && session.courseId !== key.courseId) {
    flags.push(`submission is from course ${session.courseId}, key is for ${key.courseId} — review suggested`);
  }
  if (session.kind === 'completion' && session.completionStatus !== 'complete') {
    flags.push(`the page recorded completion status "${session.completionStatus}"`);
  }
  if (session.kind === 'completion' && !session.integrityHash) {
    flags.push('no integrity hash in the export — review suggested');
  }
  if (session.integrityChecked === false) {
    flags.push('integrity hash does not match the record — the file was edited after export; review suggested');
  }

  const items = key.items.map((item) => {
    const marked = markItem(item, session);
    return {
      id: item.id,
      type: item.type,
      label: item.label,
      checkpointId: item.checkpointId,
      points: item.points,
      ...(item.unitsNote ? { unitsNote: item.unitsNote } : {}),
      ...marked,
    };
  });

  const points = key.totals?.points ?? items.reduce((sum, item) => sum + item.points, 0);
  const earned = round2(items.reduce((sum, item) => sum + item.earned, 0));
  const override = key.totals?.override ?? null;
  const scaled = override !== null && points > 0 ? round2((earned / points) * override) : null;

  return {
    session,
    key: {
      labId: key.labId, labTitle: key.labTitle, courseId: key.courseId,
      contentVersion: key.contentVersion,
    },
    items,
    flags,
    totals: { points, earned, override, scaled, out_of: override ?? points, grade: scaled ?? earned },
  };
}

/**
 * Cross-batch advisory flags: identical response sets under different
 * names, and the same file uploaded twice. Mutates each result's
 * `flags`; returns the batch for chaining.
 * @param {object[]} results Marked results from markSession.
 */
export function batchFlags(results) {
  const fingerprints = results.map((result) => {
    const { session } = result;
    const substance = JSON.stringify({
      fields: session.fields,
      quizzes: Object.fromEntries(Object.entries(session.quizzes)
        .map(([id, record]) => [id, record?.selection ?? null])),
      ordering: session.ordering,
    });
    const empty = Object.keys(session.fields).length === 0
      && Object.keys(session.quizzes).length === 0;
    return { result, substance, empty, identity: JSON.stringify(session.student) };
  });

  for (let a = 0; a < fingerprints.length; a += 1) {
    for (let b = a + 1; b < fingerprints.length; b += 1) {
      const first = fingerprints[a];
      const second = fingerprints[b];
      if (first.empty || first.substance !== second.substance) continue;
      const same = first.identity === second.identity;
      const message = same
        ? `duplicate of ${first.result.session.source} — review suggested`
        : `responses identical to ${first.result.session.source} under a different identity — review suggested`;
      // Idempotent: the UI re-runs this on every render.
      if (!second.result.flags.includes(message)) second.result.flags.push(message);
      if (!same) {
        const mirrored = `responses identical to ${second.result.session.source} under a different identity — review suggested`;
        if (!first.result.flags.includes(mirrored)) first.result.flags.push(mirrored);
      }
    }
  }
  return results;
}

/**
 * Attach evidence files found in a submission ZIP to their key items.
 * The lab page archives evidence as
 * `evidence/<sanitized key>-<sanitized original name>`, so entries are
 * matched by re-applying the page's sanitizer to each key item's
 * evidence key.
 * @param {object} session Canonical session (mutated).
 * @param {object} key Answer-key document.
 * @param {{ name: string, size: number }[]} entries ZIP entry listing.
 */
export function resolveEvidence(session, key, entries) {
  // The exact sanitizer the lab page's ZIP writer applies to both the
  // evidence key and the original filename (58-submission.js).
  const sanitize = (value) => String(value || 'file')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 160) || 'file';
  const claimed = new Set();
  const evidenceItems = key.items
    .filter((candidate) => candidate.type === 'evidence')
    .map((item) => ({ item, prefix: `evidence/${sanitize(item.ref.evidence)}-` }))
    // Longest prefix first, so a key that prefixes another key (vi vs
    // vi-file) can never claim the wrong entry.
    .sort((a, b) => b.prefix.length - a.prefix.length);
  for (const { item, prefix } of evidenceItems) {
    const entry = entries.find((candidate) =>
      !claimed.has(candidate.name) && candidate.name.startsWith(prefix));
    if (entry) {
      claimed.add(entry.name);
      session.evidenceFiles[item.ref.evidence] = {
        name: entry.name.slice('evidence/'.length),
        size: entry.size,
      };
    }
  }
}

/**
 * Recompute a completion record's integrity hash. The page hashed the
 * compact JSON of the record before the export_hash fields were
 * appended; JSON.parse/stringify round-trips preserve key order, so
 * deleting those fields reproduces the original byte string.
 * @param {object} record Parsed completion.json.
 * @returns {Promise<boolean | null>} true/false, or null when the
 *   record carries no hash or WebCrypto is unavailable.
 */
export async function verifyExportHash(record) {
  if (!record?.export_hash || !globalThis.crypto?.subtle) return null;
  const clone = JSON.parse(JSON.stringify(record));
  delete clone.export_hash;
  delete clone.export_hash_algorithm;
  delete clone.export_hash_scope;
  const bytes = new TextEncoder().encode(JSON.stringify(clone));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return hex === record.export_hash;
}
