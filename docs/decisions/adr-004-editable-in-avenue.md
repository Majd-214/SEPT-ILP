# ADR-004: Marking stays in the page, and the page stays editable

- **Status:** accepted
- **Date:** 2026-08-24
- **Supersedes:** ADR-003 (rejected the same day it was written)
- **Decision:** Every graded interaction stays inside the lab page. The
  artifact delivered to Avenue is the **course-site bundle** — readable
  HTML beside one shared stylesheet and runtime — not the self-contained
  single file. The renderer indents what it emits so that HTML is
  editable by hand. A lab uploaded into a course offering belongs to the
  instructor from that moment on.

## The two principles this ADR is measured against

Stated by the platform's owner, and quoted here because every later
trade-off is decided by them:

> **A.** No black boxes. Professors can always, through Avenue, learn,
> modify and edit their labs directly — add and remove features at will,
> fully customized.
>
> **B.** Students never leave the learning environment. Their quizzes are
> built into the HTML pages.

ADR-003 proposed moving the marks that count into native Avenue quizzes.
It violated both: a native quiz is a separate activity a student is sent
to (B), and it puts graded content in an Avenue quiz object that cannot
be read from the lab it belongs to (A). It is rejected. The gradebook
integration it wanted is still worth having one day; it is not worth
those two prices.

## What the principles turn out to require

Rejecting ADR-003 was the easy half. Auditing our own output against
principle A found the same violation at a lower level.

A generated lab page was **29 lines long, the longest of them 257,954
characters.** No one can edit that — not in Avenue's HTML editor, not in
an IDE. It is the output of a build, not a document. Principle A was
being broken by the renderer itself, independently of where marks live.

That reframed three decisions.

### 1. The bundle is the artifact, not the single file

Three forms come out of a build, and it matters which one an instructor
is handed.

| Form | Size | What it is for |
| --- | --- | --- |
| `smrttech-3cc3-course-site.zip` | 26 MB, 272 files | **The artifact.** Unzip once into Course Files; every lab and every knowledge article shares one stylesheet, one runtime, one font set. |
| `lab-01.zip` … `project.zip` | ~18 MB each | One lab in isolation. Self-sufficient, and therefore carrying its own copy of the knowledge base — fine for a single lab, wasteful for nine. |
| `…-lab-01-single.html` | 24 MB, one file | The fallback for a course with Content Sandboxing on, where ADR-002 measured the multi-file site losing its fonts to CORS. |

Inside the course-site bundle, `labs/lab-01/index.html` is 402 KB of
readable HTML that links `../../assets/sept-labs.css` and
`../../assets/sept-labs.js`. That indirection is the whole point: the
components are already loaded on the page, so an instructor who writes
`<div class="c-callout">` in Avenue's editor gets a callout. "Add and
remove features at will" is true because the design system is a shared
file, not something inlined into each document.

The single file is the better *fallback* and the worse *product*. Nobody
edits a 24 MB document, and every lab would carry a private copy of the
design system, so fixing one component would mean re-exporting nine
files instead of replacing one.

### 2. The renderer indents its output

`renderer/src/lib/Formatter.js` runs over every page before it is
written. A lab page goes from 29 lines to roughly 6,200, with no line
longer than about 750 characters outside the configuration island.

Indentation cannot be applied naively, because a line break in HTML is a
text node and a text node between two inline boxes is a visible space.
The formatter therefore derives, from the same stylesheet the pages
load, which elements are inline-level and which lay their children out
with flex or grid, and only breaks where the layout engine discards the
whitespace. Two properties are tested: formatting is idempotent, and
every element of a real course occupies identical pixels, at two
viewport widths, before and after.

The `<script type="application/json">` configuration island is indented
too. That island is where an instructor adds a question, so it cannot be
a 47 KB line either.

### 3. A published lab belongs to the instructor

This is the fork principle A forces, and it should be settled in writing
rather than discovered later:

- **Git is the source of truth for generating a lab.** Schema
  validation, the six quality gates and reproducible builds all depend
  on it, and they are what make the starting artifact trustworthy.
- **Avenue is the source of truth for a lab that has been delivered.**
  Once the HTML is in a course offering, edits made there are the
  instructor's. The platform does not reach into a course and overwrite
  them.
- **Re-publishing is therefore a deliberate act that produces a new
  upload**, never a silent sync. An instructor who wants the newer
  generated version chooses it and re-applies their changes, exactly as
  they would with any document.

This is not a compromise forced by tooling — it is what Avenue's Content
tool does anyway, and pretending otherwise would be the black box.
What the platform owes in exchange is that the generated starting point
is correct, accessible, and legible enough to take over.

## Consequences

- `apps/marker/` stays. Answer keys, the `answer-key` schema and the
  summative half of `MarkingModel` stay. Nothing retires.
- Marks still reach an instructor through the submission package rather
  than the gradebook. That remains the honest cost of principle B, and
  the item most worth revisiting when Creator+/H5P arrives next year.
- `tools/quiz-to-d2l-csv.mjs` keeps its narrower job: generating concept
  questions for instructors who *also* want a native quiz. It is an
  option, not the marking path.
- Lab 1's page grows from 310,816 to 401,823 bytes — 29% — almost all
  of it the indented configuration island. Over the wire, where Avenue
  serves content gzipped and repeated indentation compresses to nearly
  nothing, the same change is 39,113 to 42,740 bytes: **9%**.
- The design system's class names are now part of the instructor-facing
  contract, not just an internal convention. `docs/authoring-guide.md`
  is where that contract has to be written down.

## The open question this ADR cannot close

Whether Avenue's HTML editor preserves what the runtime needs —
`data-*` attributes on interactive elements, and the
`<script type="application/json">` configuration island — is decisive
for principle A and is not answerable from documentation. If the editor
strips either, an instructor's first save silently disables every
interaction on the page.

It is testable in the instructor sandbox in about ten minutes: upload a
lab bundle, open the page in the HTML editor, save without changing
anything, and check that a checkpoint still marks. Until that is run,
principle A is supported by design but not yet demonstrated.
