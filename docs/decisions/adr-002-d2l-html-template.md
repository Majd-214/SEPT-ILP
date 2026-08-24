# ADR-002: The Brightspace HTML template — adopt, absorb, or ignore?

- **Status:** accepted
- **Date:** 2026-08-18
- **Decision:** Keep the platform for interactive labs. Do not build a
  D2L-template output target. Deliver into Avenue to Learn as
  single-file exports (or as links to a hosted site). Optionally restyle
  our own tokens toward Brightspace if visual continuity is wanted.

## Context

A fair challenge was raised: D2L ships an HTML template package with
accordions, tabs, callouts, and a documented custom-CSS hook. If the
reason for building a custom system was styling, the template makes the
custom system redundant. This ADR answers that with measurements rather
than opinion.

## What the D2L template actually is

Not a built-in feature. **HTML Templates v5.0** is a downloadable ZIP an
administrator unpacks into **Public Files**, plus an org-unit config
variable (`d2l.Tools.Content.TemplatePath`) that points the Content
tool's "Select a Document Template" dropdown at it. Brightspace ships
the *mechanism*; the *files* are a separate download.

The package carries a D2L-maintained `global.css` / `global.js` you are
told not to edit, and — importantly — an **empty `custom.css` that is the
sanctioned customization hook**.

What it does *not* carry is a component library in the template dropdown.
The shipped page templates are seven: `00_basic`, `01_course_intro`,
`02_module_intro`, `03_video_lecture`, `04_conclusion`, `05_blank_page`,
`06_image_sample_page`. The rich components the CSS supports — callouts,
hero headers, panels, cards, styled lists, responsive tables, accordions,
tabs — are distributed through a **separate importable demo course** and
D2L Academy pages with "Copy Code" buttons. An author wanting an
accordion copies its markup out of a reference course and pastes it in.
That is worth stating plainly, because it is the same finding as the
licensing one below, arriving from a different direction.

Four findings decide the question:

1. **The no-code authoring path is a paid add-on.** Accordions, tabs,
   callouts, flip cards and the rest are inserted without HTML only via
   **Creator+**, which is licensed separately. Without it, the documented
   path is *Insert Stuff → Enter Embed Code → paste the HTML*.
2. **Template pages hardcode `/shared/…` absolute paths.** Uploaded to a
   course rather than Public Files, they render silently unstyled — the
   most common community failure.
3. **No accessibility conformance report exists for the package itself.**
   D2L holds WCAG 2.2 ACRs for Brightspace Core and Creator+ as
   *products*. The honest claim is "accessibility-conscious components on
   a conformant platform", not "WCAG-conformant templates".
4. **Which package is current is genuinely ambiguous in D2L's own KB.**
   Article 26484 carries six downloads. Its "Current Version 5.0" heading
   links `shared.zip` (189,124 bytes, 46 files, contents dated 2024-08-07)
   — but a separate `shared-v5.zip` (1,258,815 bytes, 75 files, contents
   dated 2026-03-20) also exists and adds 29 files including
   `client.min.css` and the full icon set. The setup text says "upload
   course.zip" while the download is named `course-v5.zip`, and the
   install instructions now ship as a **separate PDF**, not inside any
   archive. (The `v3_v5` archive is the bilingual English/French package,
   not a combined version.) Whoever performs the install must resolve
   this first, or will deploy the wrong tree.

## What we measured

**Across all nine documents of the pilot course — 677 content blocks:**

| | Blocks | Share |
| --- | ---: | ---: |
| A D2L template could carry | 494 | **73%** |
| Requires our runtime | 183 | **27%** |

The 27% is 54 recorded fields, 47 evidence uploads, 38 checklist
confirmations, 18 measurement tables, 10 auto-marked quizzes, 8
orderings, 6 written questions, 2 calculators — precisely the proposal's
"predict, measure, decide, and capture evidence at structured
checkpoints". A template can style a lab manual; it cannot make a lab.

**Empirically, in a browser** (Chromium; Safari and Firefox untested and
still owed):

| Scenario | Result |
| --- | --- |
| Lab as its own page | storage works |
| Lab in a cross-origin iframe | storage works, **persists** across reloads, even with third-party cookies blocked |
| Lab in a D2L-style *sandboxed* frame (opaque origin) | storage API throws; page still renders, checkpoints wire, quizzes still mark, our warning surfaces correctly; **web fonts fail (CORS)** |
| **Single-file export** in the same sandboxed frame | everything above **plus fonts load** (`data:` URIs are not CORS-restricted), zero console errors |

## Decision and reasoning

**Keep the platform.** Its justification was never the CSS. The proposal
names three commitments, and styling is one of them; the other two —
staged interactive scenarios with automated feedback, and "faculty never
touch markup" — are exactly what the free template cannot provide. Its
authoring model *is* markup authoring unless Creator+ is licensed.

**Do not build a D2L-template output target.** It would sit upstream of
the quality gates: the class-allowlist gate could only accept foreign
markup by vendoring a third-party manifest or adding exceptions, and the
accessibility gate would be blocking builds on DOM we cannot edit. A
gate you must weaken to ship is worse than no gate. Estimated 3–6 weeks
to end up with our stylesheet and runtime riding inside their shell
anyway — a veneer, at the cost of the guarantees.

**Deliver into A2L as single-file exports.** The measurement above makes
this concrete rather than aesthetic: the single-file build is the only
artifact that survives Content Sandboxing intact, because its fonts and
images are `data:` URIs. It also inherits SSO and enrollment gating for
free. Links to a hosted site remain preferable where the School can host
(see `docs/deployment.md`); the two are not exclusive.

**Optional: restyle toward Brightspace.** If labs should look native to
the LMS, the cheap move is redefining system tokens in
`design-system/css/00-tokens.css` — roughly 1–3 days, one file, fully
revertible, no renderer or gate changes. This is a cosmetic decision, not
an architectural one.

## Consequences, including the uncomfortable ones

- We keep ~5,900 lines that earn their keep — schemas, five gates, the
  derived checkpoint-requirement graph, the deterministic renderer, the
  single-file export — because they are what keeps 158 pages accessible,
  cross-linked, and answer-free through every edit.
- We should stop citing the design system as the platform's
  justification. 73% of authored blocks are presentational, and a good
  template gives you that. The design system is worth keeping; it is not
  the argument.
- **Three things are genuinely over-built and should be cut or defended
  explicitly**, and this ADR does not resolve them:
  1. `integrations/` — 103 lines of interfaces that throw. Write them
     when LTI is being built.
  2. The summative marking pipeline — the marker is ~1,870 lines that can
     currently mark **one of nine labs**, because `marking` specs exist
     only in lab-01. Either add specs to labs 02–08 this term, or shrink
     the pipeline to the answer-leak gate (worth keeping regardless) and
     the single lab-01 key.
  3. `apps/platform` — the faculty console needs a concrete user story.
     If faculty will not use the editor and content is edited directly in
     the repository, it is machinery serving nobody.

## The prerequisite this ADR cannot substitute for

Phase 0 of the proposal already schedules an **A2L sandbox spike with
the LMS administrators**: "zip upload and unzip, content-sandbox
behaviour for script-driven pages, and storage persistence measured
empirically." The measurements above are a laboratory approximation in
one browser engine. They narrow the risk; they do not close it. Two
questions only the administrators can answer:

- Is **Content Sandboxing** enabled for our course offerings? (Off by
  default per course; the org-level switch ships on.)
- Is **Creator+** licensed at McMaster? It decides whether the template's
  authoring story is "no code" or "paste this HTML".
- Which `shared*.zip` is authoritative for our instance (finding 4)?

That spike is cheap, already planned, and worth more than any further
building.
