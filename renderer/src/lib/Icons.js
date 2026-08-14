import { Html } from './Html.js';

/**
 * A small library of inline icons in the Material Symbols style: 24-unit
 * grid, two-unit rounded strokes, no fill. Icons are embedded as SVG at
 * build time, so pages stay self-contained.
 *
 * Content selects an icon by name (for example on a reference drawer);
 * an unknown name falls back to `info`, never to an error, so the icon
 * set can grow without a schema change.
 */
export class Icons {
  static #PATHS = {
    /* wrench — hardware and tools */
    build: 'M14.3 6.8a4.6 4.6 0 0 0-6.1 5.9L3 17.9 6.1 21l5.2-5.2a4.6 4.6 0 0 0 5.9-6.1l-3 3-2.9-2.9z',
    /* angle brackets — code and programming */
    code: 'm8.5 8 -4 4 4 4 M15.5 8l4 4-4 4',
    /* open book — reference material */
    menu_book: 'M12 6.5C10 5 7 4.5 4 4.5v13c3 0 6 .5 8 2 2-1.5 5-2 8-2v-13c-3 0-6 .5-8 2z M12 6.5v13',
    /* sigma — formulas and calculation */
    functions: 'M7 5.5h10l-6.5 6.5L17 18.5H7',
    /* flask — experiments and measurement */
    science: 'M9.5 3.5h5 M10.5 3.5v5.2L5 18a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5.5-9.3V3.5',
    /* circled i — information */
    info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 11v5 M12 7.5h.01',
    /* lightning bolt — power and electricity */
    bolt: 'M13 3 5 13.5h5L11 21l8-10.5h-5z',
    /* pin — location and reference points */
    push_pin: 'M9 4h6v6l2 3H7l2-3z M12 13v7',
  };

  /**
   * @param {string | undefined} name Icon name from content.
   * @param {string} [fallback]
   * @returns {string} Inline SVG markup.
   */
  static render(name, fallback = 'info') {
    const path = Icons.#PATHS[name ?? ''] ?? Icons.#PATHS[fallback];
    return Html.el('svg', {
      viewBox: '0 0 24 24',
      width: '22',
      height: '22',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
    }, Html.el('path', { d: path }));
  }

  /** @returns {string[]} Names available to content authors. */
  static names() {
    return Object.keys(Icons.#PATHS);
  }
}
