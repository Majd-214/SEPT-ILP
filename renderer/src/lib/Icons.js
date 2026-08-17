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
    /* bookmark ribbon — concepts referenced by this laboratory */
    bookmarks: 'M7 4.5h10a1 1 0 0 1 1 1V20l-6-3.5L6 20V5.5a1 1 0 0 1 1-1z',
    /* arrow into tray — save and download progress */
    save: 'M12 3.5v10 M8 9.5l4 4 4-4 M4.5 15.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3',
    /* arrow out of tray — restore from a progress file */
    upload: 'M12 13.5v-10 M8 7.5l4-4 4 4 M4.5 15.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3',
    /* cross — close a panel */
    close: 'M6 6l12 12 M18 6 6 18',
    /* chevron left — back within a panel */
    arrow_back: 'M14.5 6.5 9 12l5.5 5.5',
    /* magnifier — search */
    search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z M15.3 15.3 20 20',
    /* arrow out of box — open the full page */
    open_in_new: 'M14 4.5h5.5V10 M19.5 4.5 11 13 M9 5.5H6.5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V15',
    /* padlock — a step that has not been unlocked yet */
    lock: 'M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5 M6.5 10.5h11a1 1 0 0 1 1 1V19a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-7.5a1 1 0 0 1 1-1z M12 14.5v2.5',
    /* archive box — the submission package */
    package_zip: 'M4.5 7.5h15v12a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z M3.5 4.5h17a0.5 0.5 0 0 1 .5.5v2.5H3V5a0.5 0.5 0 0 1 .5-.5z M9.5 11h5',
    /* lightbulb — theory and ideas */
    lightbulb: 'M12 3a6 6 0 0 0-3.5 10.9c.9.7 1.5 1.6 1.5 2.6h4c0-1 .6-1.9 1.5-2.6A6 6 0 0 0 12 3z M10 19.5h4 M10.8 21.5h2.4',
    /* chip — boards and components */
    memory: 'M7 7h10v10H7z M10 10h4v4h-4z M9 4v3 M15 4v3 M9 17v3 M15 17v3 M4 9h3 M4 15h3 M17 9h3 M17 15h3',
    /* cloud — connectivity and IoT */
    cloud: 'M7 18.5h10.5a3.5 3.5 0 0 0 .6-6.95A5.5 5.5 0 0 0 7.4 9.6 4 4 0 0 0 7 18.5z',
    /* radio waves — sensors and signals */
    sensors: 'M12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M8.5 15.5a5 5 0 0 1 0-7 M15.5 8.5a5 5 0 0 1 0 7 M6 18a8.5 8.5 0 0 1 0-12 M18 6a8.5 8.5 0 0 1 0 12',
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
