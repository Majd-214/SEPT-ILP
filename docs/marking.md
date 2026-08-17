# Marking

One source, two artifacts. Interactive blocks may carry a `marking`
spec (and self-checking fields an `expected` rule); from that single
source the build derives:

1. **The public site config** — every accepted answer replaced by a
   salted SHA-256 hash. The page checks membership, never equality
   against plaintext, and the answer-leak gate refuses any build whose
   output carries a plaintext expected value.
2. **The instructor answer key** — `dist/keys/<course>/<labId>.key.json`,
   validating against `schema/v1/answer-key.schema.json`. Keys are
   written *outside* `dist/site/` and are served only to a course's
   instructors; they never travel with any student-facing artifact.

## What client-side hashing is — and is not

Hashing answers in the public site is a **deterrent, not security**.
The salt ships with the page (the browser must compute the same hashes
to give formative feedback), so anyone can hash candidate answers and
compare. A four-option multiple-choice question is trivially
brute-forceable — four hashes. What hashing buys:

- answers cannot be read out of the page source or the config island;
- casual "view source" and ctrl-F spoiling stops working;
- a template regression that re-emits plaintext fails the build.

**Summative marking never happens in the browser.** Marks come from the
instructor auto-marker (reading the answer key against submission
packages) and from Avenue to Learn's own assessments. The client's
hash checks exist for formative feedback only — the same "check answer"
experience the labs always had.

## The hash scheme (`sha256-v1`)

```
H = sha256hex( salt | labId | scopeId | normalizedValue )
salt = first 32 hex chars of sha256("sept-ilp-mark-salt-v1|courseId|labId|contentVersion")
```

`scopeId` is the quiz id, field key, or ordering key. Normalization:

- **Choice** (quiz option): the option letter (`a`–`f`), case-sensitive.
- **String**: trimmed; lowercased unless the rule sets `caseSensitive`.
- **Number**: bucketed. `bucket = round(value / step)` where `step` is
  the field's formative tolerance; the normalized form is `"n:" +
  bucket`. The build hashes the expected bucket **and both
  neighbours**, so a value sitting at a bucket edge still passes — the
  accepted band is between 1× and 1.5× the declared tolerance,
  which errs on the side of the student for formative feedback. The
  instructor marker applies the exact tolerance from the key.
- **Ordering**: the correct arrangement's keys joined with commas.

The salt is derived, not random, so identical input builds identical
bytes (the repository's determinism invariant). `generatedAt` in the
key honours `SOURCE_DATE_EPOCH` (set by the publish pipeline at deploy
time); without it a fixed sentinel keeps local builds reproducible.

## The marking spec

On a field or measurement-table cell:

```json
"marking": {
  "points": 2,
  "tolerance": { "type": "percent", "value": 10 },
  "partial": { "points": 1, "tolerance": { "type": "absolute", "value": 0.5 } },
  "formula": {
    "expression": "vin * r2 / (r2 + rfixed)",
    "inputs": { "r2": "r2-measured" },
    "constants": { "vin": 5, "rfixed": 4.7 }
  },
  "unitsNote": "V"
}
```

- With `formula`, the item is marked against an expression evaluated
  over the **student's own submitted fields** plus constants — e.g. the
  expected `Vout` from *their* measured resistance. Expressions run in
  the platform's safe arithmetic evaluator (numbers, `+ - * /`,
  parentheses, `min`/`max`/`abs`/`round`/`clamp`); there is no `eval`
  anywhere.
- Without `formula`, the item marks the field's `expected` rule as a
  `value` item with the given tolerance (`absolute` or `percent`).
- `partial` awards reduced points inside a wider band.
- Quizzes are always key items (`choice`, their authored points).
- Evidence blocks and checkpoints take `marking: { "points": n }` for
  presence/completion credit.
- A lab may override its key total with a top-level `markingTotal`.

Formula inputs referencing unknown field keys fail the build with a
named violation — content errors surface to the author, never to a
student.

## The answer-leak gate

Runs on every build, after rendering:

1. **Structural** — refuses any config island where a quiz carries
   `correct`, a field's expected rule carries `value`/`alternatives`,
   or an ordering carries `order`. This catches template regressions
   regardless of the value.
2. **Literal** — every summatively marked expected value (strings and
   numbers of ≥ 3 characters) must not appear as text in its own lab's
   pages, case-insensitively. Formative-only recall answers are exempt
   — a wiring lab legitimately prints the pin name it later asks the
   student to recall — and their config is still hash-only. Values
   under 3 characters are skipped (a literal "5" appears everywhere);
   the skip is reported in the build log, never silent.
