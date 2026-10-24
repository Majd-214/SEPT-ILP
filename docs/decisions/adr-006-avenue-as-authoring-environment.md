# ADR-006: Avenue is the authoring environment

- **Status:** accepted
- **Date:** 2026-10-24
- **Supersedes nothing; extends:** ADR-004 (a delivered lab belongs to the
  instructor) and ADR-005 (what Creator+ does and does not do)
- **Decision:** Treat Avenue to Learn as the place labs are authored, not
  only the place they are delivered. Ship a **styled template**, a
  **pattern library** of copy-and-paste components, and **instructions**,
  so a course needs no web developer. Keep the renderer for the labs that
  must carry marks — and use it to generate the template and the pattern
  library, so the quality gates still guard every component a professor
  copies.

## The request, in the owner's words

> I want to embrace the D2L environment so that all profs already have
> access to it, that way all we have to do is come up with a perfectly
> styled template… And give them instructions, and they don't need to hire
> web developers for every single course that way.

This is the right call, and it follows from ADR-004 rather than breaking
with it. ADR-004 settled that a lab uploaded into a course offering
belongs to the instructor. ADR-006 extends the same logic one step
earlier: if the instructor owns the page afterwards, the platform's job is
to give them a page worth owning and the means to change it — not to be
the only thing that can produce one.

## What makes it possible now

Three findings from ADR-005, in order of how much they matter here:

1. **Content HTML topics keep complete documents.** D2L: the editor
   removes `<!DOCTYPE>`, `<html>`, `<head>`, `<body>`, external CSS
   references and `<style>` blocks on save — "except Content HTML topics
   and Custom Widgets, which support complete HTML documents." A template
   page can therefore be a real document with our stylesheet and our
   runtime linked.
2. **`d2l.Tools.Content.TemplatePath` is still live.** Still documented as
   a current, non-deprecated OrgUnit variable: "Directory containing HTML
   templates." Templates placed in Public Files and pointed at by that
   variable appear in the Content tool's "Select a Document Template"
   dropdown for every course. That is the distribution mechanism, already
   built, already institution-wide.
3. **Creator+ Practices work in our pages.** "Creator+ Practices can be
   inserted into all HTML content topics." A professor who wants a quick
   knowledge check has a native, supported, no-code route that does not
   go through us at all.

And one change made for this ADR: the runtime no longer requires a
generated configuration island. **Author mode**
(`design-system/js/01-author.js`) derives what it can from the markup, so
a hand-written page from the template gets sequential checkpoints,
self-checking answer boxes, marked-from-markup quizzes, saved progress and
resume. Before this change, a page without an island did nothing — the
bootstrap returned on its first line, and the whole template idea was
dead on arrival.

## Two tiers, stated plainly

| | **Tier A — authored in Avenue** | **Tier B — built by the pipeline** |
| --- | --- | --- |
| Who makes it | A professor, from the template | The content repository, through six gates |
| Styling, layout, prose, figures, code, tables, callouts | Yes | Yes |
| Tabs, accordions, disclosure, knowledge links | Yes | Yes |
| Checkpoints and sequential gating | Yes | Yes |
| Saved progress, resume, progress file | Yes | Yes |
| Quizzes with immediate feedback | Yes — answer in `data-quiz-answer` | Yes — salted hashes |
| Self-checking answer boxes with tolerance | Yes — `data-field-expected` | Yes |
| Calculators, ordering, evidence upload | **No** | Yes |
| Measurement-chained marking | **No** | Yes |
| Marks, answer keys, submission package | **No** | Yes |
| Schema validation and the six gates | **No** | Yes |

The line is not arbitrary and it is not a limitation we chose for
convenience: everything in Tier B needs something generated — a hashed
answer, a parsed formula, a salt — that no one can write by hand. Tier A
gives teaching; Tier B gives marks. A professor who only teaches never
needs us again. A professor who needs marks sends us content.

**Author mode withholds the submission package rather than showing a
button that produces an unmarked one.** That is deliberate: a download
that looked like a marked package but was not would be worse than no
download.

## What is installed once, and what is copied

This distinction decides whether a fix reaches existing pages, so it
drives the whole design.

- **Installed once, linked by every page:** `sept-labs.css` and
  `sept-labs.js`, in Public Files (or at an org-level path). A fix to a
  component, a colour, or the runtime reaches every page that links them,
  including pages professors wrote a year ago. This is why ADR-004 chose
  the multi-file bundle over the self-contained single file, and the
  reasoning now pays for itself a second time.
- **Copied, and never updated again:** template pages. D2L: "Applying a
  template in D2L is more like making a copy of the original template
  file." A professor's page is theirs from the moment they create it; a
  later improvement to the template does not reach it. Instructions must
  say so, because the alternative — a professor believing their page will
  improve on its own — is a broken promise.

Practical consequence: **put as little as possible in the template and as
much as possible in the stylesheet and the runtime.** A template page
should be structure and placeholders, not cleverness.

## The cost, named

**The gates stop guarding the content.** Schema validation, the class
allowlist, the answer-leak scan, link integrity and — most seriously — the
axe-core WCAG 2.0 AA scan all run over generated output. A page a
professor writes in Avenue passes through none of them. McMaster is bound
by the AODA and Ontario's Integrated Accessibility Standards Regulation,
so "the professor's page is the professor's problem" is not an acceptable
institutional answer.

Four mitigations, in order of how much they actually help:

1. **Make every component accessible by construction.** The pattern
   library is generated by the real renderer from real content, so every
   snippet a professor copies is markup that already passed the axe scan.
   Correct by copying is the only accessibility strategy that survives
   contact with a busy instructor.
2. **Expose the gates as a service.** The gates take HTML, not content —
   `InlineStyleGate`, `ClassAllowlistGate`, `LinkIntegrityGate` and
   `AccessibilityGate` can all run against a page a professor pastes in.
   A "check my page" tool in the platform console would keep the quality
   floor without requiring the build. This is new work and it is the
   single highest-value follow-up this ADR identifies.
3. **Point instructors at Brightspace's own Accessibility Checker**,
   which is core Brightspace and free of Creator+ — available "within the
   Brightspace Editor in Content, Widgets, Quizzes…". Weaker than axe, and
   it is already in front of them.
4. **Keep the gates running over the template and the pattern library
   themselves**, every build. If the starting point regresses, the build
   fails.

**Second cost: no version control.** A practitioner who ships interactive
HTML for Brightspace states it plainly — "D2L does not have version
control" — and keeps her code in Git. A professor who breaks their page
has no undo. The instructions must tell them to keep a copy, and the
template should carry that advice in a comment at the top where they will
actually see it.

## What we are not doing

- **Not emitting Creator+ Element markup.** ADR-005: Elements do not work
  in custom HTML, cannot be restyled ("Creator+ elements and practices
  cannot be modified by scripts and stylesheets"), and their class names
  are undocumented with no stability guarantee. We have equivalents that
  we control and can style. Professors who prefer the Creator+ versions
  can use them on Creator+ template pages; that is their call, not ours.
- **Not moving marking into H5P.** ADR-005: cross-origin, no custom
  content types, no host-page channel, and H5P's own warning that it
  "should not be used for exams."
- **Not retiring the renderer.** It is what makes the template
  trustworthy. Deleting it would mean hand-maintaining the pattern library
  and losing the gates over it.

## Honest scope of the claim

"No web developer per course" holds for the presentational and formative
nine tenths of a lab page. It does not hold for marking, and writing
`data-checkpoint-requires="field:r-total"` is still, in a small way,
writing code. The instructions should promise what is true: an instructor
can build, restyle and restructure a complete, accessible, interactive lab
without a developer, and will need us when the lab has to produce marks.

## Admin dependencies

Everything here needs Avenue administrators, and the configuration window
is the November 2 renewal. The questions from ADR-005 stand, with three
more that are specific to this decision:

- Install the template package in **Public Files** and point
  `d2l.Tools.Content.TemplatePath` at it, so "Select a Document Template"
  offers it in every course.
- Host `sept-labs.css` and `sept-labs.js` at a stable org-level path, and
  consider pointing `d2l.Tools.ContentStyler.CssOverride` at our
  stylesheet — which would also resolve ADR-005's injection problem by
  making ours the sheet that gets injected.
- Confirm `d2l.Tools.ContentStyler.AddStylesOnContentCreate`, since a D2L
  stylesheet injected below ours overrides it.

## Work this decision creates

1. A template package: lab page, knowledge article, course home — generated,
   gated, with placeholders and an orientation comment at the top.
2. A pattern library: every component rendered from a real worked example,
   each with the exact HTML to copy, what it is for, when to use it, and
   the mistake authors make with it.
3. Professor instructions, written for someone who has never opened an
   HTML editor.
4. An administrator install sheet.
5. The "check my page" gate service (item 2 under mitigations).
