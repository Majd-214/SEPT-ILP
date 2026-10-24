# ADR-007: Nothing may require a developer to keep working

- **Status:** accepted
- **Date:** 2026-10-24
- **Constraint, in the owner's words:** *"And we don't have web
  developers, so I cannot depend on a custom application that was
  vibe-coded by AI."*
- **Decision:** Everything SEPT depends on must be a **static file in
  Avenue with no dependencies and no server**. The build tooling may stay
  in the repository as convenience, but nothing institutional may require
  it to run. The platform service and the content editor — both written in
  earlier rounds of this project — should be retired rather than deployed.

## The constraint is correct and this ADR does not argue with it

It is not a worry about code quality. It is a correct reading of
institutional risk: a system nobody on staff can debug, review or extend
is a system that fails the first time it breaks and the first time its
author leaves. Dependencies need patching, Node majors move, a server
needs TLS and uptime and someone's pager. None of that has an owner here.

So the question this ADR answers is not "is the code good" but "what is
left when no one maintains it."

## The inventory, measured

| | Lines | Needs | If nobody maintains it |
| --- | --- | --- | --- |
| `design-system/css` | 4,209 | nothing | A stylesheet does not rot. Pages keep their appearance indefinitely. |
| `design-system/js` (runtime) | 3,290 | nothing | Static, vanilla, no build. Browsers stay backward compatible for decades. If it does break, see the safety net below. |
| `apps/marker/public` | 1,161 | nothing | Static page, opens from a file. Same. |
| `renderer/src` | 5,057 | npm, Node, `ajv`, `playwright` | **Rots** — but it is a build tool, not a runtime. Pages already in Avenue are unaffected. |
| `apps/platform/src` | 1,337 | npm, **Fastify, a server, TLS, uptime, auth** | **The real liability.** An unpatched public service with magic-link authentication and nobody watching it. |
| `apps/admin/src` | 573 | npm, Fastify | Dies with the platform. |

The split is clean. **8,660 lines carry zero dependencies and need no
server.** 6,967 lines need a toolchain, and 1,910 of those need a running
service.

## The safety net, measured

The runtime is a few thousand lines of JavaScript nobody on staff can
debug. What makes that survivable is that **it only ever adds**. It gates,
marks, saves, navigates. It does not render.

Lab 1, in Chromium, scripting on versus off:

| | Scripting on | Scripting off |
| --- | --- | --- |
| Words of readable text | 1,095 | **1,781** |
| Headings visible | 15 | **31** |
| Checkpoints visible | 1 of 6 | **6 of 6** |
| Answer boxes visible | 15 | **44** |
| Page height | 3,324 px | **10,402 px** |

With the runtime off the page shows *more*, not less: every step open,
every table ready to fill in or print, every figure in place. It becomes
a complete laboratory document. There is no `<noscript>` notice anywhere
in the output and no stylesheet rule that makes visibility depend on the
runtime having booted — both now asserted by
`renderer/test/no-script.test.js`, because this property is the floor
under every other decision in this directory and must not erode quietly.

**So the worst case for the AI-written runtime is that labs become
documents.** Not broken, not blank — documents. That is an acceptable
worst case, and it is the reason the rest of this ADR is possible.

## What retires

Recommended for deletion, not deprecation — a service nobody runs is
worse than no service, because it looks available:

- **`apps/platform/`** (1,337 lines). Its jobs were hosting the site,
  magic-link sign-in, serving answer keys to instructors, the Avenue link
  sheet, and atomic releases by symlink. **Avenue already does hosting,
  authentication and distribution**, for every professor, with an
  administrator who is paid to patch it. Everything this service added
  over "put the files in Avenue" was infrastructure we cannot staff.
- **`apps/admin/`** (573 lines). The schema-driven content editor. The
  Avenue template and pattern library (ADR-006) replace it with the
  editor professors already have.
- **`docs/deployment.md` and the deploy half of `docs/runbook.md`** — they
  document a thing that should not exist.

Answer keys do not need a service: they are files, and Avenue has a
place for files only instructors can see.

## How the renderer leaves the critical path

Two jobs still require Node, and both can run in a browser instead.

**Marking configuration.** The hashes are the only part of a lab nobody
can hand-write. But the hashing is already client-side: `Sha256` and the
exact `sha256-v1` normalization ship in `design-system/js/02-hash.js`,
because the runtime has to check answers without a server. The same code
can *produce* the configuration island and the instructor answer key. A
static page — open it, type the answers, copy the island — removes the
renderer from marking entirely.

**The gates.** Four of the five are string and regex work over HTML, which
a browser does as well as Node. The fifth is the accessibility scan, and
`axe-core` 4.13.0 ships `axe.min.js`, a 580 KB standalone browser bundle
under MPL-2.0. The gate does not need Playwright; it needs a browser, and
the professor is sitting in one. Vendored and pinned, it works unchanged
for as long as the file exists.

So the target is **one static HTML file, hosted in Avenue, that checks a
page and builds its marking configuration.** No server, no npm, no Node,
no install. The repository's renderer stays as bulk convenience for
whoever has a laptop and wants to generate nine labs at once — useful,
and load-bearing for nobody.

## What this ADR cannot fix

The stylesheet and the runtime are still 7,499 lines written by an AI, and
no amount of architecture makes them reviewed code. Four things make that
tolerable, in descending order of how much they help:

1. **Nothing to operate.** They are files. There is no process to restart,
   no certificate to renew, no database to migrate.
2. **Nothing to patch.** Zero dependencies means zero advisories. The
   whole supply chain is two files we wrote.
3. **A measured floor.** The table above. The failure mode is "becomes a
   document".
4. **The markup contract, written down.** This is the one piece of real
   work the constraint creates and it is not optional. The runtime's
   behaviour is currently legible only by reading it — the `data-*`
   attributes each component expects are described in comments at the top
   of each module and nowhere a non-programmer will look. Written as a
   specification, the runtime becomes *reconstructible*: a future person,
   or a future AI, can rebuild it from the contract, or delete it and keep
   working lab documents. Code that can be regenerated from a spec is not
   a dependency on its author.

## The rule this sets for everything after it

**No new component may require a server or a toolchain to keep working.**

A proposal that fails this rule is not a proposal, whatever it does. That
disqualifies: anything with a database, anything needing a build step at
delivery time, anything with npm dependencies at runtime, anything that
must be deployed rather than uploaded.

It permits: static HTML, CSS and dependency-free JavaScript hosted in
Avenue; files generated once and handed over; and tools a professor opens
in a browser.

## Consequences

- ADR-006's direction is reinforced rather than changed: the template,
  the pattern library and the instructions are all static artifacts, and
  the "check my page" service it asked for becomes a static page rather
  than a feature of a server that is now being retired.
- ADR-002's hosting comparison is settled by this constraint, not by the
  measurements in it. Self-hosting is off the table because it needs an
  operator.
- ADR-004's bundle-over-single-file choice pays off a third time: the
  stylesheet and runtime are linked, not inlined, so the one way to fix
  every page at once survives.
- Marking survives the constraint only once the static configuration
  builder exists. Until then, Tier B labs depend on someone being able to
  run `npm ci`, and that dependency should be written on the tin.
