# SEPT Interactive Laboratory Platform

A publishing platform for interactive laboratory instruction, developed for
the W Booth School of Engineering Practice and Technology at McMaster
University. Laboratory content is stored as structured documents; a build
pipeline renders those documents into interactive HTML manuals in which
students predict, measure, record evidence, and check their understanding
at staged, sequentially gated checkpoints — each one unlocks only when the
one before it is complete. A knowledge base presented as a skill tree backs
every laboratory, readable in place through each lab's reference panel, and
a finished laboratory exports a submission package: an auto-marked
completion record plus the student's evidence files, zipped in the browser
for the course dropbox. Automated checks verify every page before it can
be published.

The repository contains the platform and one complete course:
**SMRTTECH 3CC3, Cloud Computing and the Internet of Things** — eight
laboratories, a design project, and a knowledge base of 147 reference
topics.

## Design summary

The platform separates four concerns that hand-written laboratory pages
combine: what a laboratory says, how it looks, how pages are produced, and
how instructors write.

1. **Content.** Each laboratory is a JSON document conforming to a formal,
   versioned schema (`schema/v1/`). The document records structure and
   wording only; it contains no markup, styling, or code. Validation
   enforces completeness: a question with no correct answer or an image
   with no alternative text is rejected before rendering.
2. **Appearance.** One stylesheet and one script (`design-system/`) define
   how every laboratory looks and behaves. The stylesheet implements
   Material Design 3 conventions with the university's colour palette and
   the Google Sans typeface. Accessibility requirements are implemented in
   these components once, rather than reviewed page by page.
3. **Production.** A renderer (`renderer/`) converts validated content into
   finished pages using a fixed template per block type. The same input
   always produces identical output. Automated checks then verify the
   result; a failure at any check stops publication.
4. **Delivery.** The output is a static site and a set of zip archives that
   an instructor uploads to the learning management system. Pages transmit
   no student data. Work in progress is held by the student's browser and
   in a downloadable progress file, which is the permanent record.

## Repository layout

| Path | Contents |
| --- | --- |
| `schema/v1/` | The content schemas: block vocabulary, laboratory, course, knowledge domain, and progress file |
| `design-system/` | Stylesheet layers (tokens, base, layout, components, utilities) and the page runtime |
| `renderer/` | Block and page templates, quality checks, build pipeline, command-line interface, and tests |
| `content/courses/smrttech-3cc3/` | The sample course: manifest, laboratories, knowledge domains, and images |
| `docs/` | Architecture notes, authoring guide, and quality-check reference |
| `dist/` | Build output (generated; not committed) |

## Building the sample course

Node.js 20 or later is required.

```sh
npm install
npm run build      # validate, render, check, and package the course
npm run preview    # serve dist/site at http://localhost:4173
npm test           # renderer unit tests
```

The build writes the course site to `dist/site/` and the upload archives to
`dist/bundles/`. It produces no output if any check fails.

## Quality checks

Every build runs the following checks in order. Each reports its complete
list of findings, and any finding blocks publication.

1. Schema validation of all content documents, including cross-references
   between laboratories, knowledge topics, and image files.
2. A lint pass confirming the output contains no inline styles.
3. A class check confirming every class name in the output exists in the
   design-system stylesheet.
4. An axe-core accessibility scan of every page against WCAG 2.0 A and AA.
5. A link check confirming every internal reference resolves.

See `docs/quality-gates.md` for details.

## Authoring

Authors work in plain-language fields, never in markup. Content is composed
from a fixed vocabulary of 23 block types: procedures, figures, formulas,
callouts, code listings, multiple-choice questions with hints, measurement
tables with declared validation rules, calculators with declared formulas,
ordering activities, evidence records, and cross-references into the
knowledge base. `docs/authoring-guide.md` describes each; the schemas are
the precise reference.

## Privacy

Rendered pages contain no analytics and make no network requests: every
asset, including the typeface, travels inside the output. Student work
is stored by the student's browser under a course-specific key and in
the downloadable progress file. Submission of work for assessment takes
place through the learning management system only.

## Adding a course

A course is a directory under `content/courses/` containing a manifest,
laboratory documents, knowledge domains, and images. The schemas, design
system, and pipeline are shared; no part of the platform is specific to
the sample course.

## License

MIT. See [LICENSE](LICENSE). The sample course content was written for
SMRTTECH 3CC3 at McMaster University.
