import {
  CalloutRenderer, CardsRenderer, CodeRenderer, DetailsRenderer,
  EquipmentRenderer, FigureRenderer, FlowRenderer, FormulaRenderer,
  KeyValuesRenderer, ListRenderer, ObjectivesRenderer, StepsRenderer,
  TableRenderer, TextRenderer,
} from './content-blocks.js';
import {
  CalculatorRenderer, ChecklistRenderer, EvidenceRenderer, FieldsRenderer,
  MeasurementTableRenderer, OrderingRenderer, QuestionsRenderer,
  QuizRenderer, TabsRenderer,
} from './interactive-blocks.js';

/**
 * Pairs every schema block type with its template class. This map is the
 * complete set of markup a lab page can contain: a block type outside it
 * fails the build, never renders half-styled.
 */
export class BlockRegistry {
  /** @param {import('./RenderContext.js').RenderContext} context */
  constructor(context) {
    this.context = context;
    const renderBlocks = (blocks) => this.renderAll(blocks);

    /** @type {Record<string, import('./BlockRenderer.js').BlockRenderer>} */
    this.renderers = {
      text: new TextRenderer(context),
      callout: new CalloutRenderer(context),
      figure: new FigureRenderer(context),
      code: new CodeRenderer(context),
      formula: new FormulaRenderer(context),
      steps: new StepsRenderer(context),
      list: new ListRenderer(context),
      equipment: new EquipmentRenderer(context),
      keyValues: new KeyValuesRenderer(context),
      flow: new FlowRenderer(context),
      objectives: new ObjectivesRenderer(context),
      cards: new CardsRenderer(context),
      table: new TableRenderer(context),
      details: new DetailsRenderer(context),
      quiz: new QuizRenderer(context),
      checklist: new ChecklistRenderer(context),
      fields: new FieldsRenderer(context),
      measurementTable: new MeasurementTableRenderer(context),
      calculator: new CalculatorRenderer(context),
      ordering: new OrderingRenderer(context),
      evidence: new EvidenceRenderer(context),
      tabs: new TabsRenderer(context, renderBlocks),
      questions: new QuestionsRenderer(context),
    };
  }

  /**
   * @param {object} block
   * @returns {string}
   */
  render(block) {
    const renderer = this.renderers[block.type];
    if (!renderer) {
      throw new Error(`No template registered for block type "${block.type}"`);
    }
    return renderer.render(block);
  }

  /**
   * @param {object[]} blocks
   * @returns {string}
   */
  renderAll(blocks) {
    return blocks.map((block) => this.render(block)).join('');
  }
}
