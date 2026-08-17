# ADR-001: Content editing — Pages CMS vs. a platform-native editor

- **Status:** accepted
- **Date:** 2026-08-17
- **Decision:** ship a schema-driven editor inside the platform
  (`apps/admin/`), editing the platform's own working copy of the
  content repository. Do not self-host Pages CMS for Phase A.

## Context

Phase A needs faculty to edit lab content without touching raw files,
under the platform's invariants: Git is the single source of truth,
builds are deterministic, everything students see passes the quality
gates, and authentication is the platform's own (magic-link stub now,
McMaster OIDC at the seam in Phase B). The task brief asked us to
attempt self-hosted [Pages CMS](https://pagescms.org) with a
`.pages.yml` before falling back to anything custom.

## What the Pages CMS attempt found

We pulled `pages-cms/pages-cms` (v2.1.8) and evaluated self-hosting
against this repository. Findings, in decreasing order of weight:

1. **Self-hosting still requires a GitHub App and GitHub identities.**
   The 2.x architecture authenticates users with better-auth and
   reaches repositories exclusively through a GitHub App installation
   (`@octokit/app`, `scripts/setup-github-app.mjs`, a GitHub webhook
   route). Every editor would need a GitHub account authorized against
   McMaster's repository, and every edit would round-trip through
   api.github.com. That contradicts the platform's auth model — faculty
   sign in to *our* service (MacID via OIDC in Phase B, never GitHub) —
   and adds an external service on the critical path of every edit.
2. **Infrastructure weight.** Self-hosting needs Next.js, PostgreSQL,
   and Drizzle migrations next to our zero-native-dependency Fastify
   service (SQLite via `node:sqlite`). That roughly doubles the
   deployment surface for one feature.
3. **Edits bypass the gates until after they land.** Pages CMS commits
   directly to the repository; validation is limited to what
   `.pages.yml` field rules can express (zod-level: required, patterns,
   lengths). Our AJV schemas (block unions, conditional marking specs,
   formula-input cross-references) and the renderer's gates cannot run
   *before* a Pages CMS commit — a malformed lab would land in git and
   only fail later, at publish. The platform-native editor validates
   with the real schemas before anything is committed.
4. **The content model fits only partially.** Pages CMS 2.x does
   support discriminated block lists (its `blockKey` mechanism), which
   maps to our `type`-keyed blocks better than expected. But our deeper
   structures — recursive panels, per-cell `marking` specs, formula
   `inputs` that reference sibling field keys — have no `.pages.yml`
   representation and would degrade to raw-JSON editing inside Pages
   CMS anyway, at which point the heavyweight half of the system buys
   nothing over a native editor with the same JSON surface.

A best-effort [`.pages.yml`](../../.pages.yml) is committed at the
repository root as an artifact of the attempt. It genuinely works for
course metadata and media if the hosted app.pagescms.org is ever
pointed at a GitHub mirror of this repository; it does not attempt the
block union.

## Decision

`apps/admin/` is a Fastify plugin mounted by the platform at
`/admin/editor`, styled by the design system's internal-tools layer,
behind the same session, roles, and CSRF as the rest of the console:

- **Schema-driven, honestly.** The block palette, insertion skeletons,
  and all validation derive from `schema/v1/` via the renderer's own
  `SchemaGate` (AJV 2020) — one validator, no drift, no new
  dependencies. Blocks are edited as JSON with schema skeletons and
  AJV errors pinned to the exact block; generated per-field forms were
  deliberately deferred (the union is deep, and course staff editing
  structured labs are better served by exact errors than by a form
  that can only express half the schema).
- **Draft → validate → apply → publish.** Drafts live in the
  platform's data directory, never in git, and may be invalid while in
  progress. *Apply* validates against the full schema set and — only
  when clean — writes pretty-printed JSON into the working copy and
  commits it (author = the signed-in editor), keeping Git the source
  of truth with real history. *Publish* is the existing gated pipeline;
  nothing reaches students without every gate passing.
- **Images upload with mandatory alt text**, matching the schema's
  requirement that figures carry alternative text; the upload endpoint
  refuses files without it.

## Consequences

- Editing capability ships in Phase A with no new services, accounts,
  or dependencies; the deployment stays `docker compose up`.
- Faculty edit under the platform's own auth — the OIDC seam covers
  the editor for free in Phase B.
- The JSON-per-block surface assumes staff comfortable reading JSON;
  the skeletons and pinned errors are the mitigation. If Phase B wants
  richer forms, the palette/skeleton layer is the natural place to
  grow them, and this ADR should be revisited (including re-checking
  Pages CMS, whose block support is moving in the right direction).
