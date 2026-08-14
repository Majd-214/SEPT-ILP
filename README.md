# SEPT Interactive Laboratory Platform

A schema-first publishing platform for scenario-based laboratory instruction,
built for the W Booth School of Engineering Practice and Technology at
McMaster University. Faculty author structured content; a deterministic
pipeline renders interactive HTML laboratory manuals to one visual standard;
students predict, measure, decide, and capture evidence at staged
checkpoints — with every page passing automated quality gates before it can
be published.

The repository contains the platform and one complete sample course:
**SMRTTECH 3CC3 — Cloud Computing and the Internet of Things** (eight
interactive labs, a design project, and a 147-topic knowledge base),
transcribed from the hand-built portal that piloted this pedagogy.

> Course content should outlive the tools that produce it.

## The architecture in one paragraph

Every lab is stored as a **Lab JSON** document conforming to a formal,
versioned schema — the single source of truth, holding *what the lab says*
and nothing about how it looks. A governed **design system** (one
stylesheet, one behaviour runtime; Material Design 3 under OOCSS
discipline) owns every visual decision. A **deterministic renderer**
converts validated content into finished static pages: the same input
produces byte-identical output, and the only markup it can emit carries
classes from the design system. **Quality gates** make non-compliance
unpublishable rather than discouraged. The output is deliberately humble —
a self-contained static bundle per lab that an instructor uploads to the
LMS, inheriting institutional single sign-on and enrollment gating. Student
work never leaves the student's browser; the downloadable progress file is
the durable record.

## Repository layout

| Path | Contents |
| --- | --- |
| `schema/v1/` | Lab JSON Schema v1: block vocabulary, lab, course, knowledge-domain, and progress-file schemas |
| `design-system/` | The governed stylesheet layers (tokens → base → objects → components → utilities) and the behaviour runtime modules |
| `renderer/` | The deterministic renderer: block templates, page templates, quality gates, build pipeline, CLI, and tests |
| `content/courses/smrttech-3cc3/` | The sample course: `course.json`, `labs/*.json`, `knowledge/*.json`, and `assets/` |
| `docs/` | Architecture, authoring guide, and quality-gate reference |
| `dist/` | Build output (generated; not committed) |

## Quick start

Requires Node.js 20+.

```sh
npm install
npm run build      # validate, render, gate, and package the sample course
npm run preview    # serve dist/site at http://localhost:4173
npm test           # renderer unit tests, including determinism checks
```

`npm run build` refuses to produce output that fails any gate. The build
emits the complete course site under `dist/site/` and reproducible LMS
upload bundles under `dist/bundles/` — one zip per lab plus the whole
course site.

## The publishing pipeline

Publishing is the pipeline; there is no manual side door. Every build runs,
in order:

1. **Schema validation** — malformed or incomplete content never reaches
   the renderer. A quiz with no correct answer, an image without
   alternative text, or a dangling knowledge-topic reference fails here.
2. **Deterministic rendering** — fixed templates, one per block type in the
   schema. No generative step, no improvisation, no code path that emits an
   inline style.
3. **Inline-style lint** — the output may contain no `style` attribute and
   no embedded stylesheet.
4. **Class allowlist** — every class in the generated HTML must exist in
   the manifest extracted from the design-system stylesheet itself.
5. **Accessibility scan** — axe-core checks every page against WCAG 2.0
   A/AA in a headless browser.
6. **Link and asset integrity** — every internal link, anchor, and asset
   reference must resolve.

A failure at any gate blocks publication outright and reports the complete
list of violations. See `docs/quality-gates.md`.

## Authoring

Authors never touch markup. Content is composed from a fixed vocabulary of
23 typed blocks — scenario framing, learning outcomes, staged checkpoints,
auto-marked concept checks with hints and retries, student-editable
measurement tables with declarative validation rules, live formula
calculators, ordering activities, evidence dropboxes, gated hints, callouts,
figures, code listings, and deep links into the shared knowledge base
(`kb:topic-id` — content never hardcodes site structure). The schema is the
authoritative reference; `docs/authoring-guide.md` is the readable one, and
`renderer/test/fixtures/mini-course/` is a complete miniature course
exercising every block type.

## Privacy posture

Zero PII by design. Rendered labs make no network calls of their own, embed
no analytics, and transmit nothing. All interaction state lives in the
student's browser under a namespaced key, and the always-available
**Download my progress / Restore my progress** controls produce a small,
human-readable JSON file — the system of record, portable across machines
and browsers. Actual submission of student work happens exclusively through
the LMS.

## Extending to other courses

The sample course is exactly that — a sample. A new course is a new
directory under `content/courses/` with a `course.json`, its labs, its
knowledge domains, and its assets; the platform, schemas, design system,
and pipeline are shared. Nothing in the renderer knows anything about cloud
computing.

## License

MIT — see [LICENSE](LICENSE). Sample course content was authored for
SMRTTECH 3CC3 at McMaster University and is included here as the
platform's reference course.
