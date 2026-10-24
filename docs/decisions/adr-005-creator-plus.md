# ADR-005: Creator+ and H5P Enterprise arrive — what changes

- **Status:** accepted
- **Date:** 2026-10-24
- **Trigger:** McMaster's [November update](https://avenuehelp.mcmaster.ca/exec/avenue-to-learn-november-update/)
  (page created 2026-08-12): on **2026-11-02** the D2L contract renews for
  five years and Avenue gains the **Creator+** package including **H5P
  Enterprise**. "All courses in Avenue to Learn will have access to
  Creator+ functions through the HTML Editor."
- **Decision:** **Keep the platform and reshape it.** Creator+ makes our
  architecture a documented, supported shape and gives professors a
  no-code way to add questions to our pages. It does not carry marks, it
  does not chain a student's own measurement, and H5P is a stricter black
  box than the HTML it would replace. One Creator+ side effect is an
  active threat to our stylesheet and must be raised with Avenue **before**
  November 2.

## What this answers, and how well

Eight questions were researched against primary sources (D2L Brightspace
Community, h5p.org/h5p.com, peer-institution documentation). Adversarial
verification completed for one of the eight before the research run hit a
limit, so **seven of the eight critical claims below are single-sourced
research**, carrying the confidence the researcher assigned. Claims marked
*documented* have a citable source stating them plainly; claims marked
*inferred* are reasoning over cited facts. The distinction is load-bearing
and is preserved throughout.

## 1. What Creator+ genuinely gives us

**Our architecture is documented as supported.** *(documented)* D2L's
"About Brightspace Editor" states the editor removes `<!DOCTYPE>`,
`<html>`, `<head>`, `<body>`, external CSS references and `<style>` blocks
on save — and then carves out an exception: "This behavior applies to all
editor contexts except **Content HTML topics and Custom Widgets, which
support complete HTML documents**." An uploaded file linked as a Content
topic is a Content HTML topic. D2L corroborates it by shipping its own
HTML Templates V5 as complete documents with three `<script src>` tags and
four `<link rel=stylesheet>` tags, "designed to be edited using the HTML
Editor." ADR-004's bet on readable, hand-editable pages is the shape D2L
documents.

**Professors can add questions to our labs without code.** *(documented)*
The Creator+ FAQ answers the exact question: "Can Creator+ Practices be
inserted into customized, in-house created HTML templates for Brightspace?
**Creator+ Practices can be inserted into all HTML content topics.**"
Six types: Fill in the blanks (dropdown or typed), Multi-Select, Multiple
Choice, Sequencing, Sorting, True or False. This is principle A delivered
by D2L rather than by us.

**An institution-hosted stylesheet is an explicitly supported input.**
*(documented)* `d2l.Tools.ContentStyler.CssOverride` accepts a Content
Styler location, a `/shared/folderpaths/cssfile.css` path, or a full
external URL, and cascades per org unit. Our design system can be the
course stylesheet by configuration rather than by being linked from each
page.

**H5P covers what we will never build.** 57 content types including
Interactive Video, Branching Scenario, Virtual Tour (360), Crossword.
Worth using for exactly those.

## 2. What it does not give us

**Creator+ Practices cannot carry a mark.** *(documented)* D2L's
instructor article, last updated 2026-06-04: "**Practice scores are not
saved or tracked**; they are only intended to provide the learner with
immediate feedback." The FAQ answers "Are the Practice scores captured
and/or graded?" with "Not right now… Their answers and results data will
drop once the user unloads the topic in the browser or navigates to
another page." Students cannot see their own prior responses on return.
The only durable per-learner record is the org-admin-only *Creator+
Practices Engagement* Brightspace Data Set, whose complete field list is
`PracticeEngagementId, UserId, OrgUnitId, CompletionStatus,
ActivityInstanceId, CompletionDate, Version` — **no score, no response, no
correctness column**. It can prove a student touched a Practice; it can
never say whether they were right. No release condition can read a
Practice answer.

**H5P marks require leaving our architecture.** *(documented)* H5P.com:
"If you're using the normal iframe embed code… you're not using LTI, and
we can't send the score to the LMS." Grade passback needs an LTI launch
with Assignment and Grade Services enabled in both registration and
deployment, plus the **Content Experience** — D2L: "Simply embedding an
H5P interactive in a page using Create New File or Page will not make it
gradable." Every grading route is a deep-link placement performed inside
the Brightspace Editor; the only way into a pre-built uploaded HTML file
is the embed code, which cannot grade *(inferred)*.

**The measurement chain is still ours alone.** *(documented, with one
inferred step)* Asked afresh across Brightspace Core, Creator+ and H5P:
nothing validates an answer against a formula applied to the same
learner's earlier answer. Arithmetic and Significant Figures variables are
randomized by the system from Min/Max/Step, scoped to one question with
one formula and one response; an instructor's observation that "D2L
defines variables that are local to the question only" drew no
contradiction. D2L staff, 2025-04-18, on even multiple formulas in one
Arithmetic question: "At this time, the functionality you're looking for
is not currently available." Our exact request was made on 2024-11-08 —
"the ability to use a student's previous answer to calculate follow-up
answers" — and D2L replied the same day pointing at the Product Idea
Exchange and conceding "these planned changes won't address all of the
challenge areas you're describing here." Two years on, nothing. On the
H5P side, numeric tolerance in Fill in the Blanks has had working code
since 2016 that the core team never reviewed; its author closed the pull
request. A 2021 request citing "the field of science and engineering,
numerical quizzes with tolerance are needed" went unimplemented.

**Creator+ Elements do not work in our pages.** *(documented, undated
source)* The FAQ: "Elements can be added to blank pages and Creator+
template pages for the time being", and for a pre-existing community
template, "This will not work and you will need to develop your Creator+
content using the new Creator+ template." So the nine presentational
elements — accordion, tabs, click-and-reveal, callout, timeline, stylized
quote, flip cards, carousel, hotspot — cannot be dropped into a lab, and
we cannot retire our equivalents. The FAQ is undated with a 2024 footer
and hedges with "for the time being", so this is the claim most worth
re-testing in the sandbox.

**Creator+ elements cannot be styled into our design system.**
*(documented)* D2L's accepted answer to a customer asking to restyle
accordions and tabs: "Creator+ elements and practices **cannot be modified
by scripts and stylesheets**… You should consider making a submission into
the Product Idea Exchange." The entire theming surface is four CSS custom
properties — `--d2l-cplus-color-primary`, `--d2l-cplus-color-primary-dark`,
`--d2l-cplus-color-neutral-one-head`, `--d2l-cplus-font-family-one` —
published only in a forum post relaying an internal expert, with no
versioning or deprecation policy. Element class names and DOM structure
are nowhere documented. Emitting Creator+-compatible markup from our
renderer is therefore not an option worth pursuing.

**H5P is a stricter black box than our HTML.** *(documented)* An H5P
moderator, answering a developer who had built a custom content type
specifically for Brightspace: "you cannot upload any custom contents in
H5P.com. **The servers will not allow any user to install new/custom
libraries in H5P.com.**" Iframe Embedder — the one official type that
loads foreign HTML/JS — "isn't installed on H5P.com at all". Author HTML
is tag-allow-listed server-side (`div`, `span`, `p`, `br` plus whatever
the content type declares); `<script>` is not allowable in any official
type. Content runs cross-origin on `<org>.h5p.com`, and the only
host↔iframe protocol is the resizer, whose complete action set is `ready,
hello, prepareResize, resizePrepared, resize` — geometry only. H5P's own
developer guide: "You can't embed H5P from an external site and use
JavaScript on your own site." And H5P's own warning: "it is possible for
computer-savvy learners to cheat in H5P and always get full scores. **H5P
should not be used for exams.**" Measured against principle A, H5P is
further from no-black-boxes than the HTML it would replace, not closer.

## 3. The thing that could break the labs on November 2

**Enabling Creator+ has been reported to inject D2L's stylesheet into
HTML pages, below the page's own links, where it wins the cascade.**
*(documented — customer reports, not D2L documentation)* Verbatim: "`<link
rel="stylesheet" href="https://templates.lcs.brightspace.com/lib/assets/css/styles.min.css">`
This code keeps appearing underneath our own CSS link tags and right
before the closing head tag, which means it takes precedence and the
styles from this file are being applied to our pages." Another
institution: "we recently did get Creator+ and as a result all HTML
pages/WYSIWYG editors have a new default stylesheet that one can not
delete or get rid of." It is governed by
`d2l.Tools.ContentStyler.AddStylesOnContentCreate`, **default ON**, and the
defence D2L's own expert offers is to prefix every rule with
`body:not(.template-fallback)` — an undocumented internal class that could
change without notice.

Our pages ship a complete design system in one stylesheet and pass a
class-allowlist gate on the assumption that nothing else is loaded. An
injected sheet that outranks ours would change type, colour and spacing
across nine labs and 149 knowledge pages at once.

Two rows were added to `tools/a2l-editor-fidelity.html` to catch this on
arrival rather than after someone reports the labs look wrong: one detects
any `templates.lcs.brightspace.com` or `/d2l/le/contentstyler/` stylesheet
in the document, the other checks that the page's own stylesheet is still
the last one loaded.

**This belongs in the email to Avenue before November 2**, not after:
whether `AddStylesOnContentCreate` will be ON for courses holding
uploaded HTML, and whether it can be scoped off for the pilot's org unit.
It is a cascading OrgUnit variable, so scoping is possible in principle.

## 4. Second risk: the editor writes the DOM back

*(documented — practitioner report)* A practitioner who ships interactive
JS for Brightspace HTML pages instructs: "Make sure to click Save and
Close **BEFORE** testing the buttons. **DO NOT CLICK on the buttons while
still in editing mode or D2L will change the code.**" Her snippets mutate
`this.value` and `this.style` from inline handlers, so interacting in edit
mode bakes the mutated DOM into the saved file. She adds that "the code
that you see in D2L's source editor and the code when inspecting the page
in the browser are often different", and that "D2L does not have version
control" — she keeps her code in Git.

Our runtime mutates the DOM on load rather than on click, so we may be
exposed without anyone clicking anything. Nothing in D2L's documentation
addresses it. The probe is the only way to find out.

## 5. Where this leaves the two principles

| | Our platform | Creator+ Practices | H5P |
| --- | --- | --- | --- |
| **A. No black boxes** | Readable HTML, editable in Avenue (ADR-004) | Inserted into our page; partly hand-editable, internals undocumented | Authored off-platform, no custom types, cross-origin iframe |
| **B. Never leave the page** | Yes | Yes | Yes if embedded — but then ungraded |
| Carries a mark | Yes, via the submission package | **No** | Only as an LTI activity in the Content Experience |
| Measurement-chained check | Yes | No | No |

Creator+ Practices satisfy both principles and carry no marks. Graded H5P
carries marks and satisfies neither. Our platform satisfies both and
carries marks the long way round. Nothing in the November package changes that
trade; it adds a third option that is strictly formative.

## 6. What is now genuinely open

- **Practices inside our labs.** Documented as supported in all HTML
  content topics. If the sandbox confirms it, professors gain a no-code
  way to add formative questions to a published lab — the clearest
  principle-A win available, and it costs us nothing to allow.
- **Our stylesheet as the Content Styler override.** Serving
  `sept-labs.css` through `CssOverride` would make the design system
  org-wide rather than per-page, and would resolve the injection problem
  by making our sheet the one that gets injected. Worth testing.
- **H5P for what we don't build.** Interactive video and branching
  scenarios embedded in a lab, formative, no grade. Additive, low risk.
- **Classic Content has a deadline.** D2L's October 2026 release notes
  announce intent to end support for Learner Experience and Classic
  Content in **June 2029**, with the New Content Experience renamed simply
  "Content". Any plan resting on Classic Content has a horizon, and graded
  H5P requires the Content Experience regardless.

## 7. Sandbox checklist for on or after 2026-11-02

Ordered so that a failure early makes the later items moot.

1. **Run `tools/a2l-editor-fidelity.html`.** Baseline, then Edit HTML,
   save unchanged, reload. Decides whether `data-*`, the JSON island and
   the runtime survive a professor's first save — still undocumented by
   D2L after a full search.
2. **Check for the injected stylesheet** on a real lab page (rows 14–15 of
   the probe), and look at whether the labs still render correctly.
3. **Open a lab page in Edit HTML and look for Creator+ Authoring Tools →
   Insert Practice.** Insert one, save, and confirm it renders for a
   student. Tests the one documented integration point.
4. **Try Insert Element in the same page.** Documented as unsupported, on
   an undated source. If it works, the picture improves considerably.
5. **Establish whether Avenue is on Classic Content or the Content
   Experience**, org-wide or per course. Decides whether graded H5P is
   even reachable.
6. **Insert an H5P interactive into a lab page and watch for the "Add
   Grade Item" prompt.** D2L: "If you do not see the Add Grade Item
   prompt, the interactive will not be gradable."
7. **Check Content Sandboxing posture.** D2L: "Sandboxed courses do not
   render Practices" — and ADR-002 made sandboxing the case for the
   single-file fallback, so the two interact.
8. **Interact with a lab's controls while in edit mode, then save**, and
   diff the file. Tests the DOM write-back report deliberately.

## 8. Questions to put to Avenue in writing

- Will `d2l.Tools.ContentStyler.AddStylesOnContentCreate` be ON, and can
  it be scoped off for the pilot's org unit?
- Can `d2l.Tools.ContentStyler.CssOverride` point at a McMaster-hosted
  `sept-labs.css`?
- **Which H5P tier?** McMaster's announcement says "H5P Enterprise"; D2L's
  own documentation says the package integrates "**H5P Premium**", and
  h5p.com sells Pro / Premium / Enterprise as different products. This
  determines which content types, analytics and admin settings exist.
- Is H5P registered with Assignment and Grade Services in both
  registration and deployment?
- Is the Student role's "Can be graded in Grades" enabled? If not, AGS
  scores are discarded silently with the error returned only to the
  sending tool.

## Corrections to earlier framing

Three things previously treated as Creator+ features are not:
**"Dynamic Strings"** is not a D2L product name — the real feature is core
Brightspace **Replace Strings**, which carries only user/course metadata
and, in Content topics, is "evaluated only once when first entered", so it
cannot show anything learner-specific at all. **Release Conditions** are
core Brightspace, not Creator+. **Accessibility tooling** splits into the
core Accessibility Checker and **D2L Accessibility+**, a separately
purchased human-led service.
