# Quality gates

Publishing has no manual path: every page that reaches a student has
passed, in order, the gates below. A failure at any gate stops publication
outright and prints the complete violation list — the build is repaired,
never overridden. The styling risk this machinery kills — inline styles
creeping in, invented class names, drift from the design system — stops
being a policy and becomes a defect class that cannot occur.

| # | Gate | Verifies | Implementation |
| --- | --- | --- | --- |
| 1 | Schema validation | Every content document conforms to Lab JSON Schema v1; cross-references (knowledge topics, related topics, lab links, checkpoint ids, asset files) resolve | `SchemaGate` (ajv, strict mode) + `ContentRepository` |
| 2 | Inline-style lint | No `style` attribute, no embedded `<style>` element anywhere in the output | `InlineStyleGate` |
| 3 | Class allowlist | Every class in the generated HTML exists in the manifest extracted from the design-system stylesheet itself — a typo'd class fails loudly instead of rendering unstyled | `ClassAllowlistGate` + `DesignSystem.classManifest()` |
| 4 | Accessibility | axe-core WCAG 2.0 A/AA scan of every rendered page in headless Chromium: contrast, alternative text, form labels, ARIA use, heading order | `AccessibilityGate` |
| 5 | Link and asset integrity | Every relative `href`/`src` resolves to a file in the output; every fragment link targets a real element id; no insecure `http://` references | `LinkIntegrityGate` |

Two structural guarantees sit upstream of the gates and make several
violation classes impossible rather than detectable:

- The `Html` helper — the only way templates produce markup — escapes all
  text and **throws** on any attempt to emit a `style` attribute.
- The class-allowlist manifest is derived from the stylesheet at build
  time, so the allowlist can never drift from the CSS it protects.

## Running the gates

```sh
npm run build         # full pipeline on the sample course
npm run gates         # same, in strict mode: a skipped gate fails the build
npm run validate      # gate 1 only (content, no rendering)
node renderer/src/cli.js build <course-dir> --skip-a11y   # local iteration
```

The accessibility gate needs Playwright and a Chromium (`npm install`
provides the package; CI installs the browser). When the browser is
unavailable the gate reports itself **skipped, visibly** — and strict mode
(`npm run gates`, used by CI and any real publish) treats a skipped gate
as a failure, so the baseline cannot erode silently.

## Determinism

The same content, design system, and renderer produce byte-identical
output — pages and bundles. Rendering has no timestamps, no randomness,
and no environment dependence; bundle zips use fixed timestamps, sorted
entries, and stored compression. `renderer/test/pipeline.test.js` builds
the fixture course twice and asserts equal tree hashes on every test run,
so a determinism regression fails CI the moment it is introduced.

Determinism is what makes review meaningful: a content diff is the whole
diff, and republishing an unchanged lab is provably a no-op.
