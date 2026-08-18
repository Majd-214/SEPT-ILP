# Deployment and system structure

This document describes where each part of the platform runs, how content
reaches students, and how the structure grows from the current build to
the proposal's later phases. The governing constraints come from the
proposal: students receive static files inside Avenue to Learn behind
McMaster sign-on and enrollment; student data never flows to SEPT
servers; and every future integration that would change that posture is a
deliberate, reviewed step, not a default.

## The three environments

| Environment | Holds | Faces |
| --- | --- | --- |
| The repository and its build (this repo, later plus the authoring CMS on SEPT servers) | Content documents, schemas, design system, renderer; produces the site and the upload archives | Faculty and staff only |
| Avenue to Learn | The published static files, uploaded per course | Students, behind institutional sign-on and enrollment |
| The student's browser | All interaction state, and the downloaded progress file | The student only |

Nothing student-facing executes on SEPT infrastructure. The authoring
side (today this repository and its continuous-integration build; later
the CMS of the proposal's Phase 2) is the only part the School hosts,
and it never receives student data.

## Publication flow

1. Content is edited (today as JSON documents; later through the CMS)
   and validated.
2. The build renders the course site and packages the archives under
   `dist/bundles/`: one archive per laboratory and one for the whole
   course site. Every archive carries its own copies of the stylesheet,
   runtime, fonts, and images; nothing references a network resource.
3. An instructor uploads the archive to the course's Manage Files area
   in Avenue to Learn and extracts it in place — a standard Brightspace
   operation. The laboratory's `index.html` is added as a content topic.
4. Updates are a rebuild, re-upload, and overwrite. Because builds are
   reproducible, re-publishing unchanged content changes no bytes.

The per-laboratory archives share one directory layout, so archives
extracted into the same folder merge into the complete course site, and
each laboratory still works if it is the only one uploaded: every
archive carries the knowledge pages and assets it references.

## The knowledge base across courses

Knowledge topics are course-agnostic by design — a voltage-divider
explainer is not specific to SMRTTECH 3CC3 — and the platform shares
them at build time rather than at run time:

- Domain documents live with the course today
  (`content/courses/<course>/knowledge/`). A shared collection
  (`content/shared/knowledge/`) is the natural next step: a course
  manifest lists the shared domains it includes, and the build copies
  those topics into that course's site and archives.
- Sharing at build time keeps every delivered bundle self-contained and
  keeps the privacy posture unchanged: there is no cross-course service,
  no shared runtime state, and no way for one course's students to
  depend on another course's availability.
- Because topic identifiers are stable, a laboratory written in one
  course links to a shared topic the same way it links to a local one
  (`kb:voltage-divider`), and the build fails if a manifest omits a
  domain a laboratory depends on.

A single, separately hosted knowledge site (one canonical URL used by
several courses) remains possible later — the proposal names a SEPT
static host as a fallback delivery route — but it adds a second
student-facing origin and gains little over build-time sharing while
enrollment-gated delivery inside Avenue to Learn is working.

## What stays out, and when it would come in

- **A standalone portal with institutional sign-on (MacID).** Not in
  scope for the pilot phases. It would create a new student-facing
  service and a new authentication integration, which is exactly the
  review burden the static posture avoids. The trigger for revisiting it
  is a requirement the static posture cannot meet — verified identity
  inside laboratories or automatic grade return.
- **LTI 1.3 integration.** The sanctioned mechanism for those two
  requirements, sequenced as the proposal's Phase 4, with the full
  privacy review that step properly triggers. Nothing in the current
  structure depends on it, and the content model would not change: the
  same rendered laboratories would be delivered through an LTI launch
  instead of a content topic.
- **Analytics.** None ship, in any phase, unless the School decides
  otherwise as a deliberate, reviewed addition on campus-controlled
  tooling.

## Continuous integration

Every push builds the sample course through the full pipeline in strict
mode — schema validation, rendering, and all quality checks, including
the accessibility scan — and the `main` branch publishes the rendered
site to GitHub Pages as a faculty-facing preview. The Pages deployment
is a convenience for review, not the delivery route; students receive
the archives through Avenue to Learn.

## Hosting strategies beyond the A2L content frame

The proposal's baseline — static bundles unzipped into Avenue to Learn's
Manage Files area — inherits SSO and enrollment gating for free, but it
also puts every lab inside Brightspace's content iframe, which is where
the storage-partitioning risk lives (§5.1 of the proposal) and where
sandbox behaviour is at the LMS vendor's discretion. Because the output
is a self-contained static site, the delivery mechanism is swappable
without touching content, design, or renderer. The realistic options:

| Option | Access control | Storage behaviour | Operations |
| --- | --- | --- | --- |
| **1 · Zip inside A2L (baseline)** | McMaster SSO + enrollment, free | Partitioned/ephemeral inside the iframe; progress file is the safety net | Republish = re-upload zip; nothing to run |
| **2 · A2L link → new tab (recommended next step)** | Link lives behind SSO; the site itself must be link-unlisted or gated | **First-party storage** — the partitioning risk disappears | Same static files, hosted anywhere |
| **3 · SEPT server (static vhost on the approved VM)** | Can sit behind campus SSO/VPN if UTS provisions it; otherwise link-hidden | First-party | One nginx/Apache vhost; deploy = rsync from CI |
| **4 · Cloudflare Pages + GitHub** | Public by default; Cloudflare Access can gate by email domain (@mcmaster.ca) | First-party | Push-to-deploy from the repo; global CDN; zero servers |
| **5 · GitHub Pages (as the prototype does today)** | Public (unlisted URL only) | First-party | Push-to-deploy; simplest possible |
| **6 · LTI 1.3 tool launch (future)** | Verified identity + gradebook, the sanctioned deep integration | First-party (tool origin) | Requires the full privacy review; a later-phase decision |

Recommendation. Keep publishing the zip bundles (option 1 costs nothing
to maintain and is the fallback that always works), but deliver labs to
students as **A2L links that open the hosted site in a new tab**
(option 2), with the hosting itself on either the approved SEPT server
(option 3) or Cloudflare Pages (option 4) — whichever the School would
rather operate. Opening in a first-party tab is the single biggest
reliability win available: browser storage stops being partitioned, the
progress file becomes a belt-and-braces measure instead of a daily
necessity, and print, bookmarks, and multi-tab reference all behave
normally. Access control is honest either way: the links live behind
Avenue to Learn, the content itself contains no student data and no way
to submit anything, and real submissions still flow through the A2L
dropbox. If leadership wants the content itself gated, Cloudflare
Access (email-domain rule) or a UTS-provisioned SSO vhost adds that
without any change to the platform. LTI 1.3 (option 6) remains the
deliberate future step it was in the proposal, not a dependency.

A CMS does not change this picture: Payload (or any authoring tool)
feeds the pipeline on the faculty side; students only ever receive the
static output, wherever it is hosted.
