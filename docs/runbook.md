# Runbook — operating the Phase A platform

One person can run this. Everything below assumes the repository is
checked out on the host and `docker` with the compose plugin is
installed.

## Start and stop

```bash
cd deploy
docker compose up --build -d     # first start builds the platform image
docker compose logs -f platform  # watch install → seed → listening
docker compose down              # stop; data volume survives
docker compose down -v           # stop AND delete accounts/releases (content in git is untouched)
```

| URL | What |
| --- | --- |
| `http://localhost:8080` | Student site (static, from the current release) |
| `http://localhost:8080/login` | Faculty console |
| `http://localhost:8025` | Mailpit — every magic-link email lands here |

The seed (runs on every start, idempotent) creates `admin@demo` and
`instructor@demo` and emails both a sign-in link — open Mailpit and
click the admin's link. Override the addresses with `SEED_ADMIN` /
`SEED_INSTRUCTOR`; set a real `COOKIE_SECRET` and `BASE_URL` in the
environment for anything beyond a laptop:

```bash
BASE_URL=https://labs.eng.mcmaster.ca COOKIE_SECRET=$(openssl rand -hex 32) docker compose up -d
```

## Invite someone

Console → **Invites** (admin only) → email + role + course tick-boxes
→ Send. The invitee's magic link arrives by email (Mailpit in
development). Instructors see only their ticked courses — keys,
exports, editor, and links included. Links are one-time and expire in
30 minutes; a returning user just enters their email on `/login` for a
fresh one.

## Publish

Console → **Dashboard** → *Publish all courses* (admin only). The
pipeline builds every course under `content/courses/` with all quality
gates — schema, inline-style, class-allowlist, **answer-leak**,
accessibility, link-integrity — and only if every gate passes does the
`current` symlink flip to the new release. A failed gate leaves the
live site exactly as it was; the run's report (dashboard → report)
names every violation.

Each release lands in the data volume as
`releases/<timestamp>/<course>/{site,keys,bundles}`:
`site/` is what students see, `keys/` the instructor answer keys
(served role-gated at `/keys/…`, never inside `site/`), `bundles/` the
downloadable exports (single-file labs, course ZIPs).

## Roll back

A release is never edited in place, so rollback is re-pointing one
symlink:

```bash
docker compose exec platform sh -c '
  ls /data/releases          # pick the release to return to
  ln -sfn /data/releases/<timestamp> /data/current.new
  mv -T /data/current.new /data/current'
```

Students see the previous release immediately. (Republishing after a
content fix is usually the better answer; rollback is for "the new
release is wrong and the fix needs time".)

## Content editing

Console → **Editor**. Drafts save outside git and may be invalid while
in progress; **Apply** validates against the content schemas and
commits to the repository (author = the signed-in editor); **Publish**
runs the gated build. To take faculty edits upstream, push from the
host checkout — commits made by the editor are ordinary git commits:

```bash
git log --oneline content/   # see editor commits
git push
```

## Backups

Two things matter: the **repository** (content — already in git, push
it) and the **data volume** (`platform.db` accounts/memberships +
releases). Releases are reproducible from git (deterministic builds),
so the honest minimum backup is the database:

```bash
docker compose exec platform sh -c 'cp /data/platform.db /data/platform.db.bak'
docker compose cp platform:/data/platform.db.bak ./platform-$(date +%F).db
```

## Troubleshooting

- **"Nothing published yet" on the student site** — publish from the
  dashboard; the site serves only flipped releases.
- **Magic link never arrives** — check Mailpit (`:8025`) first, then
  `docker compose logs platform` for SMTP errors; the seed retries
  while Mailpit boots.
- **Publish fails on the accessibility gate in the container** — the
  image bakes the browsers; if the log says a browser is missing, the
  image tag drifted from the root `package.json` playwright version —
  rebuild with `docker compose build --no-cache platform`.
- **Publish fails on the answer-leak gate** — that is the gate doing
  its job: some template or content change printed a summatively
  marked answer into a student page. The report names the file and the
  literal; fix the content, never the gate.
- **Disk** — old releases accumulate by design (they are the rollback
  history). Prune all but the last few:
  `docker compose exec platform sh -c 'ls -dt /data/releases/* | tail -n +6 | xargs rm -rf'`.
