# Architecture

The platform separates four concerns that hand-built lab pages tangle
together: what a lab **says**, how a lab **looks**, how a page is
**produced**, and how a professor **writes**. Each is a layer with a single
owner and a narrow interface to its neighbours.

```
          AUTHORING                    SEPT-ILP REPOSITORY                     DELIVERY
┌──────────────────────┐   ┌────────────────────────────────────────┐   ┌──────────────────┐
│  Structured content  │   │  Layer 1   content/…/*.json            │   │  dist/site/      │
│  (fill-in-the-blank, │ → │  validated by schema/v1 (Lab JSON v1)  │   │  dist/bundles/   │
│  never markup)       │   │                                        │   │  → LMS upload    │
└──────────────────────┘   │  Layer 2   design-system/              │   │  → student       │
                           │  sept-labs.css + sept-labs.js          │   │    browser       │
                           │                                        │   │  (state stays    │
                           │  Layer 3   renderer/                   │   │   local; progress│
                           │  deterministic templates + gates       │   │   file is the    │
                           └────────────────────────────────────────┘   │   record)        │
                                                                        └──────────────────┘
```

## Layer 1 — the canonical schema (`schema/v1/`)

`blocks.schema.json` defines the 23-block content vocabulary;
`lab.schema.json`, `course.schema.json`, and `knowledge.schema.json` define
the three document types; `progress.schema.json` fixes the student
progress-file format. The vocabulary was extracted from the working
SMRTTECH 3CC3 prototype, not invented.

Three properties do the heavy lifting:

- **Validation replaces vigilance.** `additionalProperties: false`
  everywhere, required alternative text on every figure, exactly-one
  correct quiz option enforced with `minContains`/`maxContains`, and
  machine-checked cross-references (knowledge links, related topics,
  checkpoint ids).
- **Content carries no presentation.** Rich-text fields accept six inline
  forms (`**bold**`, `*italic*`, `` `code` ``, links, `~sub~`, `^sup^`)
  and links use the `kb:`/`lab:` schemes, so no document ever contains a
  file path, a class name, or a colour.
- **Behaviour is data.** Everything the prototype hardcoded in per-page
  scripts — numeric sanity ranges with their messages, expected values
  with tolerance and case rules, calculator formulas, correct orderings,
  hint gates — is a declarative field the runtime interprets.

## Layer 2 — the design system (`design-system/`)

One governed stylesheet and one behaviour runtime, assembled
deterministically from ordered layers:

```
css/00-tokens.css        Material Design 3 tokens; the only place colours,
                         type, spacing, shape, elevation, and motion exist
css/01-base.css          element defaults, focus treatment, reduced motion
css/02-objects.css       o-* structural layout (no visual decisions)
css/03-components/*.css  c-* component skins (consume tokens only)
css/04-utilities.css     u-* single-purpose helpers
js/*.js                  runtime modules, concatenated into one IIFE
```

The runtime is one program driven by a JSON config island the renderer
embeds in each page (`#sept-lab-config`) — it never scrapes rules out of
rendered text. Student state is a single JSON document per lab under
`sept-ilp:<course>:<lab>` in localStorage, treated as a convenience cache;
the progress file (download/restore, always available) is the durable
record. Storage availability is probed at load and students are warned
when persistence is unavailable.

Accessibility is engineered here once: focus indicators, keyboard
operability for tabs and ordering, ARIA live regions for every status
surface, contrast-checked tokens — then re-verified per publish by the
axe-core gate.

## Layer 3 — the deterministic renderer (`renderer/`)

`Pipeline.build()` is the entire publishing path:

1. `ContentRepository` loads and validates a course directory (schema gate
   plus cross-reference checks), or aborts with the complete problem list.
2. Page templates (`PortalPage`, `LabPage`, `KnowledgeHubPage`,
   `KnowledgeTopicPage`) render through `BlockRegistry` — one template
   class per schema block type. All markup flows through the `Html`
   helpers, which escape everything and **throw on any attempt to emit a
   `style` attribute**. Code listings are syntax-highlighted at build time
   by a deterministic tokenizer; published pages load no highlighting
   library.
3. Output gates run (see `quality-gates.md`).
4. `ZipWriter` packages reproducible bundles: stored entries, fixed
   timestamps, sorted paths — identical content yields byte-identical
   zips. Unit tests assert whole-site build determinism.

The renderer has no configuration and no plugins. Changing how something
looks means changing the design system; changing what something says means
changing content; changing how content is expressed means a schema
revision. The boundaries are the point.

## Layer 4 — authoring

The proposal's authoring interface (Payload CMS on SEPT servers, with
AI-assisted ingestion of legacy PDF manuals producing draft Lab JSON for
faculty review) sits **outside** this repository by design: it is a
replaceable tool that reads and writes the durable asset — Lab JSON. Until
it stands, documents are authored directly (they are legible JSON;
`renderer/src/validate-file.js` gives immediate per-file feedback), and the
sample course demonstrates the full vocabulary.

## Privacy

Lab content flows down to students; student data never flows up. Rendered
pages make no network requests beyond their own bundled files. There is no
telemetry, no analytics, no external font or script service. The progress
file keeps students in possession of their own record.
