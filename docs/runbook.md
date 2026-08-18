# Runbook — operating the Phase A platform

The platform is an ordinary Node process. There is no container, no
database server, and no mail server to install — a deliberate
constraint, because the machines this runs on (School lab computers,
staff laptops) cannot be assumed to have virtualization enabled or
administrator rights.

Everything below needs: this repository, and Node 20 or newer.

## Install once

```bash
npm run setup     # dependencies for all packages, plus a Chromium for the gates
```

The Chromium download is only needed for the accessibility gate and the
export tests. If a locked-down network blocks it, everything else still
works — build with `--skip-a11y` and treat the gate as owed rather than
passed.

## Start and stop

```bash
npm start                       # http://localhost:3000
npm run seed                    # create/refresh the demo accounts
```

`Ctrl+C` stops it. From WebStorm, use the ready-made run configurations
in `.run/` — *1 · Start the platform*, *2 · Seed accounts*, and so on —
which appear in the run-configuration dropdown with no setup.

| URL | What |
| --- | --- |
| `http://localhost:3000/login` | Faculty console |
| `http://localhost:3000/c/<course>/<lab>/` | The student site, from the live release |
| `http://localhost:3000/marker/` | Instructor auto-marker |

## Signing in without a mail server

There are no passwords. `npm run seed` creates `admin@demo` and
`instructor@demo` and issues each a one-time link. With no SMTP host
configured, the platform writes every message to `data/mail/` as a
readable `.eml` **and prints the sign-in link to the terminal it is
running in**:

```
────────────────────────────────────────────────────────────────
  Sign-in link for admin@demo

  http://localhost:3000/auth/SSZgXZPw5uQ36CHxdKuecPiQoOnj0_yWjPA9
────────────────────────────────────────────────────────────────
```

Paste it into a browser. Links are single-use and expire in 30 minutes;
`/login` issues a fresh one at any time.

This transport is a development convenience and a disclosure risk
anywhere else — anyone who can read the terminal or `data/` can sign in
as anybody. The platform therefore **refuses to start** with it on a
non-localhost `BASE_URL` unless you opt in explicitly. For a real
deployment, point it at a relay:

```bash
SMTP_HOST=smtp.mcmaster.ca MAIL_FROM=sept-labs@mcmaster.ca \
BASE_URL=https://labs.example.ca COOKIE_SECRET=$(openssl rand -hex 32) \
npm start
```

## Invite someone

Console → **Invites** (administrators only) → address, role, and the
courses they may touch. Instructors see only their ticked courses —
content, keys, exports, and marker included.

## Publish

Console → **Dashboard** → *Publish all courses* (administrators only).
The pipeline builds every course under `content/courses/` through all
quality gates — schema, inline-style, class-allowlist, **answer-leak**,
accessibility, link-integrity — and only when every gate passes does the
`current` symlink flip to the new release. A failed gate leaves the live
site exactly as it was, and the run's report names every violation.

Each release lands under `data/releases/<timestamp>/<course>/`:

```
site/      what students see
keys/      instructor answer keys — served role-gated, never inside site/
bundles/   single-file lab pages and course ZIPs
```

Publishing takes a few minutes, mostly the accessibility scan.

## Roll back

Releases are never edited in place, so rollback is repointing one link:

```bash
ls data/releases                      # pick the release to return to
ln -sfn "$PWD/data/releases/<timestamp>" data/current.new
mv -T data/current.new data/current   # atomic swap
```

On Windows (PowerShell, Developer Mode or elevated):

```powershell
Remove-Item data\current
New-Item -ItemType SymbolicLink -Path data\current -Target data\releases\<timestamp>
```

Republishing after a content fix is usually the better answer; rollback
is for "the new release is wrong and the fix needs time".

## Deploying the student site

The platform serves the student site itself, which is all a single
machine needs. For students, publish the built site to wherever the
School hosts static files and link to it from Avenue to Learn — the
options and the recommendation are in `docs/deployment.md`.

```bash
npm run build:all        # both courses, all gates, plus single-file exports
# then copy dist/<course>/site/ to the web host, or let CI do it
```

The output is plain static files: no server-side anything, no database,
no runtime. That is what makes the hosting decision reversible.

## Content editing

Console → **Editor**. Drafts live in `data/drafts/` and may be invalid
while in progress; **Apply** validates against the content schemas and
commits to the repository under the signed-in editor's name; **Publish**
runs the gated build. Editor commits are ordinary commits — push them
yourself:

```bash
git log --oneline content/
git push
```

## Backups

Two things matter, and only one of them is precious:

- **The repository** — all content and history. Push it.
- **`data/platform.db`** — accounts and course memberships. Small, and
  rebuildable with `npm run seed` plus a few invitations.

Releases are reproducible from the repository (builds are deterministic,
anchored to the content commit), so they need no backup of their own.

```bash
cp data/platform.db "backups/platform-$(date +%F).db"
```

## Troubleshooting

- **"Nothing published yet"** — accurate. Publish from the dashboard.
- **No sign-in link** — look at the terminal running `npm start`, then
  at `data/mail/`. Unknown addresses are ignored silently on purpose:
  the platform will not confirm who has an account.
- **`ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`** — a bare `node …`
  invocation on Node 22. Use the npm scripts; they select the flag.
- **Publish fails on accessibility, browser missing** — run
  `npx playwright install chromium`, or build with `--skip-a11y` and
  record that the gate did not run.
- **Publish fails on answer-leak** — the gate working. The report names
  the file and the value. Fix the content; never relax the gate.
- **Port 3000 in use** — `PORT=3100 npm start`, and set `BASE_URL` to
  match so sign-in links point at the right place.
- **Disk** — old releases accumulate by design (they are the rollback
  history). Keep the newest few:
  `ls -dt data/releases/* | tail -n +6 | xargs rm -rf`
