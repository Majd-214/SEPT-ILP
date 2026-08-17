/**
 * Insertion skeletons: the smallest schema-valid instance of every
 * block type, used by the editor's "add block" palette. A test inserts
 * each one into a real lab document and validates the result, so a
 * schema change that breaks a skeleton breaks the build, not an
 * author's afternoon.
 *
 * Keys (quiz ids, field keys…) are placeholders the author must make
 * unique; the palette appends a numeric suffix on insert.
 */
export const BLOCK_SKELETONS = {
  text: {
    type: 'text',
    paragraphs: ['New paragraph.'],
  },
  callout: {
    type: 'callout',
    variant: 'note',
    title: 'Note',
    paragraphs: ['Callout body.'],
  },
  figure: {
    type: 'figure',
    src: 'placeholder.png',
    alt: 'Describe the image for screen readers.',
    caption: 'Figure caption.',
  },
  code: {
    type: 'code',
    language: 'text',
    code: '// code here',
  },
  formula: {
    type: 'formula',
    expression: 'V = I R',
  },
  steps: {
    type: 'steps',
    items: ['First step.'],
  },
  list: {
    type: 'list',
    items: ['First item.'],
  },
  equipment: {
    type: 'equipment',
    items: [{ item: 'Equipment item', quantity: 1 }],
  },
  keyValues: {
    type: 'keyValues',
    items: [{ term: 'Term', description: 'Description.' }],
  },
  flow: {
    type: 'flow',
    steps: [{ label: 'Start' }, { label: 'Finish' }],
  },
  objectives: {
    type: 'objectives',
    items: ['State one learning objective.'],
  },
  cards: {
    type: 'cards',
    items: [{ title: 'Card title', body: 'Card body.' }],
  },
  table: {
    type: 'table',
    columns: ['Column A', 'Column B'],
    rows: [['Cell A1', 'Cell B1']],
  },
  details: {
    type: 'details',
    summary: 'Expand for more',
    paragraphs: ['Hidden detail.'],
  },
  quiz: {
    type: 'quiz',
    id: 'new-quiz',
    prompt: 'Ask the checkpoint question here?',
    points: 1,
    options: [
      { text: 'Correct option', correct: true },
      { text: 'Distractor' },
    ],
    hint: 'Shown after a wrong attempt.',
  },
  checklist: {
    type: 'checklist',
    role: 'tasks',
    items: [{ key: 'new-check', label: 'Something to tick off.' }],
  },
  fields: {
    type: 'fields',
    fields: [{ key: 'new-field', label: 'Recorded value', control: 'text' }],
  },
  measurementTable: {
    type: 'measurementTable',
    columns: ['Condition', 'Reading'],
    rows: [{ label: 'Condition 1', cells: [{ key: 'new-cell', control: 'number' }] }],
  },
  calculator: {
    type: 'calculator',
    inputs: [{ key: 'new-input', label: 'Input' }],
    outputs: [{ label: 'Output', expression: 'new_input * 2' }],
  },
  ordering: {
    type: 'ordering',
    key: 'new-ordering',
    prompt: 'Put these in order.',
    items: [
      { key: 'first', label: 'First thing' },
      { key: 'second', label: 'Second thing' },
      { key: 'third', label: 'Third thing' },
    ],
  },
  evidence: {
    type: 'evidence',
    key: 'new-evidence',
    label: 'Upload your evidence file',
    accept: ['.png', '.jpg', '.pdf'],
  },
  tabs: {
    type: 'tabs',
    key: 'new-tabs',
    tabs: [
      { key: 'tab-one', label: 'Tab one', blocks: [{ type: 'text', paragraphs: ['First tab.'] }] },
      { key: 'tab-two', label: 'Tab two', blocks: [{ type: 'text', paragraphs: ['Second tab.'] }] },
    ],
  },
  questions: {
    type: 'questions',
    items: [{ key: 'new-question', prompt: 'Answer in your own words.' }],
  },
};

/** A minimal valid checkpoint, for "add checkpoint". */
export const CHECKPOINT_SKELETON = {
  id: 'new-checkpoint',
  title: 'New checkpoint',
  blocks: [{ type: 'text', paragraphs: ['Introduce this stage of the lab.'] }],
};

/**
 * A copy of `skeleton` with placeholder keys made unique by suffix.
 * @param {string} type Block type.
 * @param {number} suffix Uniquifying number.
 */
export function freshBlock(type, suffix) {
  const block = structuredClone(BLOCK_SKELETONS[type]);
  if (!block) return null;
  const rename = (value) => value.replace(/^new-/, `new-${suffix}-`);
  if (block.id) block.id = rename(block.id);
  if (typeof block.key === 'string') block.key = rename(block.key);
  for (const list of [block.fields, block.items, block.inputs]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (item && typeof item.key === 'string' && item.key.startsWith('new-')) {
        item.key = rename(item.key);
      }
    }
  }
  for (const row of block.rows ?? []) {
    for (const cell of row.cells ?? []) {
      if (cell.key?.startsWith('new-')) cell.key = rename(cell.key);
    }
  }
  return block;
}
