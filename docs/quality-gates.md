# Quality checks

Publication runs through a fixed sequence of automated checks. A finding
at any check stops the build, and each check reports its complete list of
findings so problems can be corrected in one pass. There is no override.

| # | Check | Verifies | Implementation |
| --- | --- | --- | --- |
| 1 | Schema validation | Every content document conforms to the version-1 schemas; cross-references (knowledge topics, related topics, laboratory links, checkpoint identifiers, image files) resolve | `SchemaGate`, `ContentRepository` |
| 2 | Inline-style lint | The output contains no `style` attribute and no embedded `<style>` element | `InlineStyleGate` |
| 3 | Class check | Every class name in the output exists in the manifest extracted from the design-system stylesheet | `ClassAllowlistGate` |
| 4 | Accessibility scan | Every page passes an axe-core scan against WCAG 2.0 A and AA: contrast, alternative text, form labels, ARIA use, heading order | `AccessibilityGate` |
| 5 | Link check | Every relative reference resolves to a file in the output; every fragment link targets an existing element; no insecure `http://` references | `LinkIntegrityGate` |

Two design decisions sit upstream of the checks and prevent whole classes
of finding rather than detecting them:

- Templates can only produce markup through the `Html` helper, which
  escapes all text and rejects any `style` attribute.
- The class manifest for check 3 is derived from the stylesheet during
  the build, so the manifest cannot drift from the styles it describes.

## Commands

```sh
npm run build         # full pipeline on the sample course
npm run gates         # the same, in strict mode: a skipped check fails
npm run validate      # check 1 only; no rendering
node renderer/src/cli.js build <course-dir> --skip-a11y   # faster local iteration
```

The accessibility scan requires Playwright and a Chromium browser.
`npm install` provides the package; continuous integration installs the
browser. When no browser is available the check reports itself as
skipped, and strict mode treats a skipped check as a failure, so the
published standard cannot erode unnoticed.

## Reproducible output

Identical content, design system, and renderer produce byte-identical
output. Rendering uses no timestamps, no randomness, and no environment
state; archives use fixed timestamps and sorted entries. The test suite
builds the fixture course twice and compares hashes of the two output
trees, so a regression in reproducibility fails the tests.

Reproducibility makes review reliable: a difference in content is the
whole difference between two builds, and republishing unchanged content
verifiably changes nothing.

## Readable output

Published pages are indented, because an instructor has to be able to
open one in Avenue's HTML editor and change it (ADR-004). The renderer's
`Formatter` adds that whitespace only where the layout engine throws it
away, which `renderer/test/format.test.js` holds to three properties:

- no line long enough to defeat an editor, and every page indented;
- formatting is idempotent, so republishing a page is a no-op diff and
  reproducibility above is unaffected;
- every element of the fixture course occupies identical pixels, at 400
  and 1280 pixels wide, with the formatter's whitespace and without it.

The same pixel comparison was run once across all 158 pages of
SMRTTECH 3CC3 before the change was adopted: identical at both widths.
