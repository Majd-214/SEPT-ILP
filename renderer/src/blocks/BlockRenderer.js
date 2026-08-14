/**
 * Base class for block templates.
 *
 * One subclass exists per entry in the schema's block vocabulary; the
 * registry pairs them by `type`. Templates receive validated content and
 * return finished markup built exclusively through the Html helpers with
 * design-system classes — the only markup a lab page can contain.
 */
export class BlockRenderer {
  /** @param {import('./RenderContext.js').RenderContext} context */
  constructor(context) {
    this.context = context;
  }

  /**
   * @param {object} block Validated block content.
   * @returns {string} HTML.
   */
  // eslint-disable-next-line no-unused-vars
  render(block) {
    throw new Error(`${this.constructor.name} must implement render()`);
  }
}
