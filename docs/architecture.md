# Architecture

The platform is organized as four layers. Each layer has one owner and a
narrow interface to its neighbours, so any layer can be revised or
replaced without disturbing the others.

```
 Authoring                     Repository                         Delivery
┌────────────────────┐  ┌──────────────────────────────────┐  ┌────────────────────┐
│ Structured content │  │ 1  content/…/*.json              │  │ dist/site/         │
│ (plain-language    │→ │    validated by schema/v1        │→ │ dist/bundles/      │
│ fields)            │  │ 2  design-system/                │  │ uploaded to the    │
└────────────────────┘  │    sept-labs.css + sept-labs.js  │  │ LMS; student work  │
                        │ 3  renderer/                     │  │ stays in the       │
                        │    templates + quality checks    │  │ browser and the    │
                        └──────────────────────────────────┘  │ progress file      │
                                                              └────────────────────┘
```

## Layer 1: content schemas (`schema/v1/`)

`blocks.schema.json` defines the 23-block content vocabulary.
`lab.schema.json`, `course.schema.json`, and `knowledge.schema.json`
define the three document types, and `progress.schema.json` defines the
student progress file. The vocabulary was derived from the SMRTTECH 3CC3
pilot course rather than designed in the abstract.

Three properties of the schemas carry most of their value:

- **Completeness is machine-checked.** Every object rejects unknown
  properties, every figure requires alternative text, and every
  multiple-choice question must have exactly one correct option. Cross-
  references — knowledge links, related topics, checkpoint identifiers,
  image files — are resolved at build time.
- **Content carries no presentation.** Prose fields accept six inline
  forms (bold, italic, code, links, subscript, superscript). Links use
  the `kb:` and `lab:` schemes, so documents never contain file paths,
  class names, or colours. A document written this year renders correctly
  under any future revision of the visual design.
- **Behaviour is declared, not programmed.** Measurement ranges and their
  messages, expected values with tolerance and case rules, calculator
  formulas, correct orderings, and hint conditions are all fields in the
  document. The pilot course expressed these as page scripts; here they
  are data that any future tool can read.

## Layer 2: the design system (`design-system/`)

One stylesheet and one runtime script, assembled from ordered layers:

```
css/00-tokens.css        colour, type, spacing, shape, elevation, motion
css/01-base.css          element defaults, focus treatment, reduced motion
css/02-objects.css       structural layout classes (no visual decisions)
css/03-components/*.css  component appearance (tokens only)
css/04-utilities.css     single-purpose helpers
js/*.js                  runtime modules, concatenated in order
```

The typeface is Google Sans, served by the Google Fonts API with the
platform-native system stack as fallback. This is the one external
resource a rendered page references.

The runtime reads a JSON configuration element that the renderer embeds
in each page. It maintains student state as a single document per
laboratory under a namespaced browser-storage key, and treats that
storage as a cache: the downloadable progress file is the permanent
record, and the download and restore controls are always available.
Storage availability is tested at load, and students are warned when
their work will not persist.

The page shell places a navigation rail at the left — checkpoints on a
laboratory page, topics on a knowledge page, sections and laboratories on
the course home page — beside a centred content column, with a fixed
application bar above. On narrow screens the rail collapses behind a
toggle in the bar. Reference drawers defined by laboratory content dock
at the right edge.

## Layer 3: the renderer (`renderer/`)

`Pipeline.build()` performs the whole publication sequence:

1. `ContentRepository` loads and validates a course directory. Any schema
   violation or unresolved cross-reference stops the build with a full
   list of findings.
2. Page templates render through `BlockRegistry`, which pairs each schema
   block type with one template class. All markup passes through the
   `Html` helper, which escapes text and rejects any attempt to emit an
   inline style. Code listings are highlighted during the build by a
   fixed tokenizer, so pages load no highlighting library.
3. The output checks run (see `quality-gates.md`).
4. `ZipWriter` packages the upload archives with fixed timestamps and
   sorted entries, so identical content produces identical archives.

The renderer takes no configuration. A change of appearance belongs in
the design system; a change of wording belongs in content; a change in
what content can express is a schema revision.

## Layer 4: authoring tools

The proposal's authoring interface — a self-hosted content management
system whose forms produce Lab JSON, with assisted conversion of legacy
PDF manuals — lies outside this repository. It is a replaceable tool that
reads and writes the durable asset. Until it exists, documents are edited
directly; `renderer/src/validate-file.js` checks a single document, and
the miniature course under `renderer/test/fixtures/` shows every block
type in use.

## Privacy

Content flows to students; student data does not flow back. Pages contain
no telemetry. The progress file keeps students in possession of their own
record, and submission for assessment takes place through the learning
management system.
