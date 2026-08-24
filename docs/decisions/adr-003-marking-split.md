# ADR-003: Where marks come from

- **Status:** **REJECTED 2026-08-24, same day.** Superseded by ADR-004.
- **Date:** 2026-08-24
- **Original decision (not adopted):** Avenue's gradebook carries the
  marks that count; retire the instructor marker and answer keys.

## Why this was rejected

It was measured against the wrong objective. Splitting marks into native
Avenue quizzes optimises for gradebook convenience and pays for it with
both of the platform's founding principles:

1. **Students would leave the learning environment.** A native quiz is a
   separate Avenue activity. The whole point of an interactive lab is
   that the question sits beside the measurement that motivates it —
   predict, measure, decide, in one place, without a context switch.
2. **It reintroduces a black box.** Graded content would live in an
   Avenue quiz object, separate from the lab a professor can read and
   change. Two artifacts to keep in step, one of them invisible from the
   other.

The gradebook integration is real and worth having eventually. It is not
worth those two prices. Marking stays in the page; the submission package
remains how marks reach an instructor.

**The analysis below is kept for the record. Its findings about
Brightspace's capabilities are accurate; its recommendation is not.**

## The question this settles

Six of Lab 1's marked items work like this: the student measures **their
own** total resistance, calculates a voltage from it, and the page checks
that calculation against a formula applied to **their** measurement — so
a sloppy measurement with correct arithmetic still earns the arithmetic
marks. That chain is the most distinctive thing in these labs.

Whether Avenue can do it decided whether we keep ~2,400 lines of marking
machinery.

## What we found

**Avenue's native marking is better than we assumed.** Arithmetic
questions support tolerance in units or percent, significant figures with
partial deduction, and unit checking — and marks land in the gradebook
automatically, which our CSV export never will.

**But it cannot chain answers.** Confirmed in the sandbox by an
instructor: *"No, D2L Brightspace does not have a native feature that lets
you pipe or reuse a student's answer or values from a previous quiz
question into a future question."* Variables come from ranges the author
writes, or are fixed; there is no reference to another response.

## Decision

Split the job along the line each side is actually good at.

| | Carried by | Why |
| --- | --- | --- |
| Immediate teaching feedback, including the measurement-chained check | **The lab page** | Already built, needs no gradebook, and is the pedagogy |
| The marks that count | **Avenue quizzes** | Auto-graded into the gradebook, no export step, no second system to trust |
| Sequential progression | Release conditions, and the page's own gating | Native between topics; in-page within a lab |
| Evidence | Assignments | Native, already collected there |

Students still meet the measurement-chained question — they practise it
on their own data, with instant feedback, in the page. The graded version
asks the same physics with a system-generated resistance. The pedagogy
survives; only the mark's provenance changes.

`tools/quiz-to-d2l-csv.mjs` generates the concept questions from the same
lab JSON the page is built from, so the two never drift.

## What retires

- `apps/marker/` — the instructor auto-marker (~1,870 lines). Its job is
  now the gradebook's.
- Answer-key generation (`dist/keys/`) and the `answer-key` schema.
- The summative half of `MarkingModel` — key items, points, totals.

## What stays, and why

- **The answer-leak gate.** Its value never depended on the marker: it
  stops an expected answer appearing in a student-facing page, which
  matters more now that some answers also live in Avenue quizzes.
- **Formative checking in the page** — hashed comparison, tolerance,
  the measurement-chained formula evaluator. This is the teaching, and
  it is the reason the page exists.
- **The `marking` specs in content**, as the source for generating quiz
  questions rather than keys.

## Consequences

- One fewer system for instructors to learn, and marks appear where they
  already look for them.
- The honest accounting from ADR-002 improves: the machinery that could
  only mark one lab in nine is gone rather than owed eight labs of specs.
- Anything Avenue's question types cannot express becomes a content
  constraint rather than a platform feature. That is a real limit, and
  the right one to accept for a pilot.
