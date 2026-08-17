# Architecture

The platform is organized as four layers. Each layer has one owner and a
narrow interface to its neighbours, so any layer can be revised or
replaced without disturbing the others.

```
 Authoring                     Repository                         Delivery
┌────────────────────┐  ┌──────────────────────────────────┐  ┌────────────────────┐
│ Structured content │  │ 1  content/…/*.json              │  │ dist/site/         │
│ (plain-language    │→ │    validated by schema/v1        │→ │ dist/bundles/      │
│ fields)            │  │ 2  design-system/                │  │ uploaded to the    │
└────────────────────┘  │    sept-labs.css + sept-labs.js  │  │ LMS; student work  │
                        │ 3  renderer/                     │  │ stays in the       │
                        │    templates + quality checks    │  │ browser and the    │
                        └──────────────────────────────────┘  │ progress file      │
                                                              └────────────────────┘
```

## Layer 1: content schemas (`schema/v1/`)

`blocks.schema.json` defines the 23-block content vocabulary.
`lab.schema.json`, `course.schema.json`, and `knowledge.schema.json`
define the three document types, and `progress.schema.json` defines the
student progress file. The vocabulary was derived from the SMRTTECH 3CC3
pilot course rather than designed in the abstract.

Three properties of the schemas carry most of their value:

- **Completeness is machine-checked.** Every object rejects unknown
  properties, every figure requires alternative text, and every
  multiple-choice question must have exactly one correct option. Cross-
  references — knowledge links, related topics, checkpoint identifiers,
  image files — are resolved at build time.
- **Content carries no presentation.** Prose fields accept six inline
  forms (bold, italic, code, links, subscript, superscript). Links use
  the `kb:` and `lab:` schemes, so documents never contain file paths,
  class names, or colours. A document written this year renders correctly
  under any future revision of the visual design.
- **Behaviour is declared, not programmed.** Measurement ranges and their
  messages, expected values with tolerance and case rules, calculator
  formulas, correct orderings, and hint conditions are all fields in the
  document. The pilot course expressed these as page scripts; here they
  are data that any future tool can read.

## Layer 2: the design system (`design-system/`)

One stylesheet and one runtime script, assembled from ordered layers:

```
css/00-tokens.css        colour, type, spacing, shape, elevation, motion
css/01-base.css          element defaults, focus treatment, reduced motion
css/02-objects.css       structural layout classes (no visual decisions)
css/03-components/*.css  component appearance (tokens only)
css/04-utilities.css     single-purpose helpers
js/*.js                  runtime modules, concatenated in order
```

The typeface is Google Sans, carried inside the output as font files, so
a rendered page references nothing outside its own bundle.

The runtime reads a JSON configuration element that the renderer embeds
in each page. It maintains student state as a single document per
laboratory under a namespaced browser-storage key, and treats that
storage as a cache: the downloadable progress file is the permanent
record, and the download and restore controls are always available.
Storage availability is tested at load, and students are warned when
their work will not persist. Each accepted write pulses a saved
indicator in the application bar, and the course home page reads the
same storage to offer "continue where you left off" and per-laboratory
progress — all in the student's browser, nothing transmitted.

The page shell places a navigation rail at the left — checkpoints on a
laboratory page, topics on a knowledge page, sections and laboratories on
the course home page — beside a centred content column, with a fixed
application bar above. On narrow screens the rail collapses behind a
toggle in the bar.

Laboratory pages carry a dock of reference drawers at the right edge (a
bottom bar with rising sheets on narrow screens). Two drawers are always
present. **Concepts** holds every knowledge topic the laboratory links
to: the articles are embedded in the page at build time as inert
templates, and every `kb:` link on the page opens its topic in this
panel instead of navigating away, so a student's place in the laboratory
— scroll position, open tabs, half-typed answers — is never disturbed.
Without scripting the same links degrade to ordinary navigation, and
every topic remains a real page in the knowledge base. **Progress**
holds the download, restore, and reset controls with a live map of
checkpoint completion — the always-visible progress-file control the
proposal commits to. Laboratory content may define further reference
drawers.

Progression through a laboratory is strictly sequential, as it was in
the original 3CC3 portal: a checkpoint unlocks only when every earlier
checkpoint has its requirements satisfied and has been explicitly
confirmed. Locked checkpoints can be looked at — greyed out, every
control disabled, marked with a padlock in the rail — but accept no
work. Completion is live: editing an earlier answer until it no longer
passes revokes that checkpoint's confirmation and re-locks everything
after it. The active checkpoint's footer always lists what remains, as
jump links: each one scrolls to, reveals (switching tabs or opening
disclosures as needed), and highlights the control it names, and the
confirm button arms only when the list is empty.

The submission checkpoint carries the submission package: identity
fields plus a browser-built ZIP containing `completion.json` — the
auto-marked record of the lab (score, confirmations, responses, SHA-256
integrity hash) — and every evidence file currently selected on the
page. The package downloads only when the whole laboratory is complete,
and reaches the instructor only when the student submits it through the
LMS dropbox, so the platform stays zero-PII.

The knowledge base presents as the skill tree the original portal
established. The hub is a pannable, zoomable cluster: a central course
card surrounded by domain cards, with a global topic search. Each topic
page is a documentation view — breadcrumb, the domain's directory
grouped by kind with filter chips, the article, and previous/next
pagers — and the shell rail carries only the domains, never a dump of
every topic.

## Layer 3: the renderer (`renderer/`)

`Pipeline.build()` performs the whole publication sequence:

1. `ContentRepository` loads and validates a course directory. Any schema
   violation or unresolved cross-reference stops the build with a full
   list of findings.
2. Page templates render through `BlockRegistry`, which pairs each schema
   block type with one template class. All markup passes through the
   `Html` helper, which escapes text and rejects any attempt to emit an
   inline style. Code listings are highlighted during the build by a
   fixed tokenizer, so pages load no highlighting library.
3. The output checks run (see `quality-gates.md`).
4. `ZipWriter` packages the upload archives with fixed timestamps and
   sorted entries, so identical content produces identical archives.

The renderer takes no configuration. A change of appearance belongs in
the design system; a change of wording belongs in content; a change in
what content can express is a schema revision.

## Layer 4: the platform service (`apps/platform/`)

A faculty-only Fastify service — students never touch it beyond
receiving static files. Email magic-link sign-in (Mailpit in
development) with two roles, `admin` and `instructor`; there is no
student role, no student route, and a test asserts a student-ish POST
has nowhere to land. The auth stub carries one clearly marked
`── OIDC SEAM ──` where Phase B swaps in McMaster Entra ID without
touching anything downstream.

Publishing runs the renderer with every quality gate against the
content repository; only when all gates pass does an atomic symlink
flip (`releases/<timestamp>` → `current`) change what students see.
Failures never reach students, and rollback is re-pointing the same
symlink (docs/runbook.md). The console also serves the role-gated
answer keys from the live release, the Avenue to Learn link sheet with
canonical `/c/<course>/<lab>/` URLs, and downloads for the release's
bundles — including the single-file lab exports
(`renderer/src/lib/SingleFile.js`), one self-contained HTML document
per lab with a DOM-parity test against the hosted page.

The console is styled by the design system's internal-tools layer
(`05-admin.css`) under the same no-inline-styles rule as student
pages, and a test drives every console page plus the marker through
the same axe-core WCAG 2.0 A/AA scan the build gate applies to the
site.

## Layer 5: authoring tools (`apps/admin/`)

The content editor is a plugin the platform mounts at `/admin/editor`:
drafts outside git (invalid while in progress is fine), validation
with the renderer's own SchemaGate — one AJV instance, so the editor
and the pipeline can never disagree — and *Apply* committing
pretty-printed JSON into the content checkout under the signed-in
editor's name. Git remains the single source of truth with real
history; the CMS is an editor over the repository, not a database
beside it. The Pages CMS evaluation and the reasoning live in
`docs/decisions/adr-001-cms.md`.

## Layer 6: marking (`renderer/src/marking/`, `apps/marker/`)

One `marking` spec in content yields two artifacts at build time: the
public site config carrying only salted SHA-256 hashes (formative
checking in the browser; the answer-leak gate refuses any plaintext
leak into `dist/site`), and the instructor answer key under
`dist/keys/`, never packaged with student artifacts. The instructor
marker is a fully client-side app behind the instructor session:
submissions are re-marked from recorded responses against the key —
choice, value, formula (evaluated over the student's own inputs, no
eval), evidence, checkpoint — with advisory "review suggested" flags,
never verdicts, and Brightspace-ready exports. Its no-egress posture
is enforced three ways (CSP, no student routes, a source-level test).
`docs/marking.md` is the full statement, including why client-side
hashing is a deterrent and not security.

## Phase B seams (`integrations/`)

`integrations/lti/` and `integrations/valence/` hold typed interfaces
and READMEs only — the January 2027 contract for LTI 1.3 launches with
grade passback, and for Brightspace Valence where LTI cannot reach.
Nothing in Phase A imports them; both throw if called.

## Privacy

Content flows to students; student data does not flow back. Pages contain
no telemetry. The progress file keeps students in possession of their own
record, and submission for assessment takes place through the learning
management system. The platform serves faculty only; the one path a
student's browser touches (`/c/…`) serves bytes from the current
release and accepts nothing.
