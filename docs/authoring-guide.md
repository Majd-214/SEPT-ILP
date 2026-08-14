# Authoring guide

A laboratory is one JSON document. Authors complete plain-language
fields; the platform is responsible for markup, styling, behaviour, and
packaging. This guide describes the shapes an author writes. The schemas
in `schema/v1/` are the precise reference, and
`renderer/test/fixtures/mini-course/labs/lab-01.json` is a short,
complete laboratory that uses every block type.

Validate while writing:

```sh
node renderer/src/validate-file.js lab content/courses/<course>/labs/<lab>.json
npm run build        # full pipeline, including cross-references
```

## Structure of a laboratory

```jsonc
{
  "schemaVersion": 1,
  "id": "lab-03",
  "number": 3,
  "title": "Tilt Sensor Detection with LabVIEW and Arduino",
  "summary": ["One or two opening paragraphs."],
  "cardSummary": "One sentence for the course home page.",
  "chips": ["Hardware: tilt switch + buzzer", "Core concept: digital input"],
  "duration": { "prelab": "20-30 min", "lab": "2.5-3 h", "postlab": "30-45 min" },
  "contentVersion": "1",
  "knowledgeTopics": ["digital-input", "pullup-pulldown"],
  "sidebars": [ { "side": "right", "title": "Reference", "blocks": [ … ] } ],
  "checkpoints": [ { "id": "prepare", "title": "…", "blocks": [ … ] }, … ],
  "submissionRules": ["Submit the exported progress file to the dropbox."]
}
```

Checkpoints are the stages of the laboratory. A checkpoint is complete
when every interactive element inside it is satisfied: each question
answered correctly, each checklist item confirmed, each required field
filled and within its rules, each ordering solved, and each required
evidence file selected. Completion is derived from the content; there is
nothing separate to configure.

The closing checkpoint carries `"submission": true` and receives the
progress-file controls.

## Prose fields

Every prose field accepts six inline forms and nothing else:

```
**bold**   *italic*   `code`   [label](target)   ~subscript~   ^superscript^
```

There are no headings, line breaks, or raw HTML inside a field;
structure belongs to blocks. Link targets:

| Target | Meaning |
| --- | --- |
| `kb:voltage-divider` | A knowledge-base topic; the build fails if the topic does not exist |
| `lab:lab-02` | Another laboratory in the course |
| `#exercise-4` | A checkpoint on the same page |
| `https://…` | An external site |

File paths never appear in content; the renderer determines site
structure.

## Selecting blocks

Presentation blocks: `text`, `callout` (note, success, warning, danger),
`figure` (alternative text required), `code` (arduino, json,
labview-formula-node, pseudocode, text), `formula`, `steps`, `list`,
`equipment`, `keyValues`, `flow`, `objectives`, `cards`, `table`,
`details`.

Interactive blocks: `quiz`, `checklist` (materials, tasks,
confirmations), `fields`, `measurementTable`, `calculator`, `ordering`,
`evidence`, `tabs`, `questions`.

Conventions that keep laboratories consistent:

- A table students read is a `table`; a table students complete is a
  `measurementTable` with typed cells (`number`, `text`, `check`,
  `static`).
- Units are fields, not part of a label:
  `{ "label": "PR resistance", "unit": "Ω" }`.
- Validation rules are part of the field:

  ```jsonc
  { "key": "t1-r-0", "control": "number", "min": 100, "max": 2000000,
    "rangeMessage": "Photoresistor resistance should be between 100 Ω and 2 MΩ. If you used kΩ, convert to Ω first." }
  ```

  Self-checking answers use `expected`: numbers compare within
  `tolerance`, strings compare without case unless `caseSensitive` is
  set, and `alternatives` lists other accepted answers.
- A quiz has exactly one option marked `"correct": true`, and a `hint`
  shown after a wrong answer. Retries are unlimited. An optional
  `explanation` appears once the question is answered correctly.
- Ordering items are written in the correct order; students see them
  rearranged.
- A hint that should follow a committed prediction is a `details` block
  gated by the prediction field:

  ```jsonc
  { "type": "details", "summary": "Hint, after your prediction",
    "paragraphs": ["…"], "gatedBy": { "field": "prediction" } }
  ```

- A calculator declares its formula as arithmetic over its input keys,
  with the functions `clamp`, `min`, `max`, `abs`, and `round`:

  ```jsonc
  { "type": "calculator",
    "inputs": [ { "key": "vin", "label": "Vin", "unit": "V" }, … ],
    "outputs": [ { "label": "Vout", "expression": "vin * r2 / (r1 + r2)", "precision": 3, "unit": "V" } ] }
  ```

## Keys and versions

Keys are lowercase, with hyphens, and they name stored student work.
Changing a key after publication separates students from their saved
answers, so keys should be treated as permanent. When an edit genuinely
invalidates stored work — a renamed key or a changed answer — increment
the laboratory's `contentVersion`; the runtime then retires saved state
from earlier versions instead of applying it incorrectly.

## Knowledge domains

A domain document groups reference topics reached through `kb:` links.
Each topic has an identifier (unique across the course), a `kind`
(`theory`, `skill`, or `spec`), a name, a one-sentence summary, and its
sections; a figure, a troubleshooting hint, search keywords, and related
topics are optional. A topic is written once and linked from any page
that needs it.
