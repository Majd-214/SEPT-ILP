# LTI 1.3 integration seam (Phase B — January 2027)

This directory holds the **contract only**. Phase A ships no LTI: labs
reach students as ordinary Avenue to Learn link topics (see the link
sheet at `/admin/links`), and grades travel as Brightspace CSV imports
from the marker. Nothing imports from this module in Phase A, and both
exported functions throw.

## What Phase B swaps in

| Seam | Where it attaches today | Phase B behaviour |
| --- | --- | --- |
| **Launch** | Students open a plain canonical URL (`/c/<course>/<lab>/`) | A2L performs an LTI 1.3 launch; `validateLaunch()` verifies the `id_token` against A2L's JWKS and redirects to the same canonical URL. Lab pages themselves do not change. |
| **Identity** | No student identity exists anywhere | The launch's opaque `userId` (never a MacID) can key *optional* server-side progress sync, if Phase B chooses to add it. The zero-student-data invariant is a Phase A guarantee, not an accident — revisiting it is an explicit Phase B decision with its own privacy review. |
| **Grade passback** | Instructor imports the marker's Brightspace CSV by hand | `postScore()` pushes the same totals through Assignment & Grade Services to the A2L line item. The marker's `totals` object maps 1:1 onto `LtiScore`. |

## Why LTI and not only Valence

LTI 1.3 is the standards-track path (launch + AGS covers the whole
loop) and survives an eventual LMS change. The Valence seam
(`../valence`) exists because some Brightspace administrative
operations are not expressible in LTI; prefer LTI wherever both could
work.

## Implementation notes for January 2027

- Register the tool in A2L (McMaster LMS team): OIDC login initiation
  URL and redirect URL both live under the platform's `/lti/` prefix —
  reserve that prefix; nothing occupies it today.
- `validateLaunch` needs a JWKS fetch with caching and the usual JWT
  checks (`iss`, `aud`, `nonce`, `azp`, expiry). Keep dependencies to
  the platform's ethos: `jose` is the one justified addition.
- The auth seam in `apps/platform/src/auth.js` (marked `── OIDC SEAM ──`)
  is for *faculty* MacID sign-in and is independent of LTI. Do not
  conflate them: LTI authenticates a launch, not a person's session.
