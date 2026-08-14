# Authoring guide

A lab is one JSON document. You write plain-language fields; the platform
does everything else. This guide covers the shapes you will actually type —
the schemas in `schema/v1/` are the precise contract, and
`renderer/test/fixtures/mini-course/labs/lab-01.json` is a complete small
lab using every block type.

Validate as you go:

```sh
node renderer/src/validate-file.js lab content/courses/<course>/labs/<lab>.json
npm run build        # full pipeline, including cross-references and gates
```

## The shape of a lab

```jsonc
{
  "schemaVersion": 1,
  "id": "lab-03",
  "number": 3,
  "title": "Tilt Sensor Detection with LabVIEW and Arduino",
  "summary": ["One or two hero paragraphs framing the scenario."],
  "cardSummary": "One sentence for the course-portal card.",
  "chips": ["Hardware: tilt switch + buzzer", "Core concept: digital input"],
  "duration": { "prelab": "20-30 min", "lab": "2.5-3 h", "postlab": "30-45 min" },
  "contentVersion": "1",
  "knowledgeTopics": ["digital-input", "pullup-pulldown"],
  "sidebars": [ { "side": "right", "title": "Reference", "blocks": [ … ] } ],
  "checkpoints": [ { "id": "prepare", "title": "…", "blocks": [ … ] }, … ],
  "submissionRules": ["Submit the exported progress file to the dropbox."]
}
```

Checkpoints are the stages of the scenario. A checkpoint is **complete**
when everything interactive inside it is satisfied: every quiz correct,
every checklist item ticked, every non-optional field filled and within its
rules, every ordering solved, every required evidence file chosen. There is
nothing to configure — completion is derived from content.

Mark the closing checkpoint `"submission": true`; it receives the
progress-file controls automatically.

## Rich text

Every prose field accepts exactly six inline forms:

```
**bold**   *italic*   `code`   [label](target)   ~subscript~   ^superscript^
```

Nothing else is markup — no headings, no raw HTML, no line breaks inside a
field. Structure belongs to blocks. Link targets:

| Target | Meaning |
| --- | --- |
| `kb:voltage-divider` | A knowledge-base topic (build fails if unknown) |
| `lab:lab-02` | Another lab in the course |
| `#exercise-4` | A checkpoint on the same page |
| `https://…` | External site (https only) |

Never write file paths in content; the renderer owns site structure.

## Choosing blocks

Content: `text`, `callout` (note / success / warning / danger), `figure`
(alt text required), `code` (arduino, json, labview-formula-node,
pseudocode, text), `formula`, `steps`, `list`, `equipment`, `keyValues`,
`flow`, `objectives`, `cards`, `table` (static reference), `details`
(disclosure).

Interactive: `quiz`, `checklist` (materials / tasks / confirmations),
`fields`, `measurementTable`, `calculator`, `ordering`, `evidence`,
`tabs`, `questions`.

A few conventions that keep labs consistent:

- **Static vs. filled tables.** A truth table students read is a `table`;
  anything students type into is a `measurementTable` with typed cells
  (`number`, `text`, `check`, `static`).
- **Units are fields**, never buried in label strings:
  `{ "label": "PR resistance", "unit": "Ω" }`.
- **Validation is data.** A plausibility bound with its message lives on
  the field, not in anyone's code:

  ```jsonc
  { "key": "t1-r-0", "control": "number", "min": 100, "max": 2000000,
    "rangeMessage": "Photoresistor resistance should be between 100 Ω and 2 MΩ. If you used kΩ, convert to Ω first." }
  ```

  Self-checking answers use `expected` — numbers compare within
  `tolerance`, strings case-insensitively unless `caseSensitive` is set,
  and `alternatives` lists other accepted answers.
- **Quizzes** need exactly one `"correct": true` option and a `hint` (shown
  on a wrong answer; retries are unlimited and unpenalized). Add an
  `explanation` to reinforce the idea once solved.
- **Ordering items are authored in the correct order.** Students see them
  shuffled; you never encode positions.
- **Gated hints** tie a `details` block to a prediction field, so students
  commit before reading:

  ```jsonc
  { "type": "details", "summary": "Hint after your prediction",
    "paragraphs": ["…"], "gatedBy": { "field": "prediction" } }
  ```

- **Calculators** carry their formula as data — arithmetic over input
  keys, plus `clamp`, `min`, `max`, `abs`, `round`:

  ```jsonc
  { "type": "calculator",
    "inputs": [ { "key": "vin", "label": "Vin", "unit": "V" }, … ],
    "outputs": [ { "label": "Vout", "expression": "vin * r2 / (r1 + r2)", "precision": 3, "unit": "V" } ] }
  ```

## Keys and versions

Keys (`key`, `id` fields) are lowercase-kebab-case and they **name stored
student work** — changing one orphans saved answers, so treat keys as
permanent once a lab is in use. When an edit genuinely invalidates stored
state (a renamed key, a changed answer), bump the lab's `contentVersion`;
the runtime then retires stale saved state instead of misapplying it.

## Knowledge domains

A domain file groups reusable topics students reach through `kb:` links —
each topic gets `id` (globally unique), `kind` (`theory` / `skill` /
`spec`), `name`, a one-sentence `summary`, `sections`, and optionally a
figure, a troubleshooting `hint`, search `keywords`, and `related` topic
ids. Write topics once; every course page that needs the concept links to
it at the moment of need.
