# Brightspace Valence seam (Phase B — January 2027)

Contract only; both exports throw in Phase A. Grades currently travel
as the marker's Brightspace-format CSV, imported through Grades →
Import — a deliberate Phase A choice: it needs no LMS credentials, no
service account, and no data agreement, and it keeps the pilot
deployable by one person.

## What Valence adds over the CSV (and over LTI)

- **Direct grade writes** (`uploadGrades`): the marker's batch lands in
  the grade item without a download/upload round trip.
- **Classlist pre-flight** (`classlist`): student numbers that don't
  resolve to an enrolment are reported *before* anything is written —
  today those surface as `skipped` rows the instructor checks by hand.

LTI 1.3 with Assignment & Grade Services (`../lti`) covers the same
grade-passback loop in a standards-track way and is the preferred
seam; use Valence only for operations LTI cannot express (bulk
administrative writes, classlist reads outside a launch context).

## Implementation notes for January 2027

- Requires an ID-key application registration from McMaster's LMS
  team, and a service account scoped to the pilot courses — start that
  conversation early; it is the long pole.
- Valence request signing (the `x_a`…`x_d` query parameters) is small
  enough to implement without a dependency, matching the platform's
  dependency ethos.
- Keep the marker's CSV path forever: it is the fallback when the API
  or its credentials are unavailable, and the audit copy instructors
  keep.
