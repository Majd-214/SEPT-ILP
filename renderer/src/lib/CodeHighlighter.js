import { Html } from './Html.js';

/**
 * Deterministic, build-time syntax highlighting.
 *
 * Published bundles load no highlighting library: the renderer tokenizes
 * code once, at build time, and emits plain `<span>` elements carrying
 * design-system classes. The same input always yields the same output.
 *
 * Languages are data, not code: each is a {@link LanguageDefinition} of
 * comment markers, string delimiters, and keyword sets. An unknown
 * language renders as escaped plain text — never an error.
 */

/**
 * @typedef {object} LanguageDefinition
 * @property {string[]} lineComments    Markers that start a comment running to end of line.
 * @property {[string, string][]} blockComments  Open/close marker pairs.
 * @property {string[]} stringDelimiters Quote characters (backslash-escapable).
 * @property {Set<string>} keywords     Flow/declaration keywords.
 * @property {Set<string>} types        Type names and well-known constants.
 * @property {boolean} [hashPreprocessor] Lines starting with `#` are preprocessor directives.
 */

/** @type {Record<string, LanguageDefinition>} */
const LANGUAGES = {
  arduino: {
    lineComments: ['//'],
    blockComments: [['/*', '*/']],
    stringDelimiters: ['"', "'"],
    hashPreprocessor: true,
    keywords: new Set([
      'break', 'case', 'const', 'continue', 'default', 'do', 'else', 'for',
      'if', 'return', 'sizeof', 'static', 'struct', 'switch', 'typedef',
      'volatile', 'while',
    ]),
    types: new Set([
      'bool', 'boolean', 'byte', 'char', 'double', 'float', 'int', 'long',
      'short', 'signed', 'size_t', 'String', 'uint8_t', 'uint16_t',
      'uint32_t', 'unsigned', 'void', 'word',
      'true', 'false', 'HIGH', 'LOW', 'INPUT', 'INPUT_PULLUP', 'OUTPUT',
      'LED_BUILTIN',
    ]),
  },
  json: {
    lineComments: [],
    blockComments: [],
    stringDelimiters: ['"'],
    keywords: new Set(),
    types: new Set(['true', 'false', 'null']),
  },
};

export class CodeHighlighter {
  /**
   * Highlight source code into design-system markup.
   * @param {string} source
   * @param {string} [language]
   * @returns {string} HTML safe for inclusion inside `<pre><code>`.
   */
  static highlight(source, language) {
    const definition = LANGUAGES[language ?? ''];
    if (!definition) return Html.escape(source);

    let html = '';
    let index = 0;
    const length = source.length;

    const emit = (text, tokenClass) => {
      html += tokenClass
        ? `<span class="c-code__${tokenClass}">${Html.escape(text)}</span>`
        : Html.escape(text);
    };

    while (index < length) {
      const rest = source.slice(index);

      const lineComment = definition.lineComments.find((marker) => rest.startsWith(marker));
      if (lineComment) {
        const end = source.indexOf('\n', index);
        const stop = end === -1 ? length : end;
        emit(source.slice(index, stop), 'comment');
        index = stop;
        continue;
      }

      const blockComment = definition.blockComments.find(([open]) => rest.startsWith(open));
      if (blockComment) {
        const [open, close] = blockComment;
        const end = source.indexOf(close, index + open.length);
        const stop = end === -1 ? length : end + close.length;
        emit(source.slice(index, stop), 'comment');
        index = stop;
        continue;
      }

      const char = source[index];

      if (definition.stringDelimiters.includes(char)) {
        let cursor = index + 1;
        while (cursor < length && source[cursor] !== char) {
          cursor += source[cursor] === '\\' ? 2 : 1;
        }
        const stop = Math.min(cursor + 1, length);
        emit(source.slice(index, stop), 'string');
        index = stop;
        continue;
      }

      if (definition.hashPreprocessor && char === '#' && CodeHighlighter.#atLineStart(source, index)) {
        const end = source.indexOf('\n', index);
        const stop = end === -1 ? length : end;
        emit(source.slice(index, stop), 'preproc');
        index = stop;
        continue;
      }

      if (/[0-9]/.test(char)) {
        const match = /^\d[\d._xXa-fA-F]*/.exec(rest);
        emit(match[0], 'number');
        index += match[0].length;
        continue;
      }

      if (/[A-Za-z_]/.test(char)) {
        const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
        const word = match[0];
        if (definition.keywords.has(word)) emit(word, 'keyword');
        else if (definition.types.has(word)) emit(word, 'type');
        else emit(word, null);
        index += word.length;
        continue;
      }

      emit(char, null);
      index += 1;
    }

    return html;
  }

  /** Class names this highlighter can emit, for the class-allowlist gate. */
  static tokenClasses() {
    return ['c-code__comment', 'c-code__string', 'c-code__preproc', 'c-code__number', 'c-code__keyword', 'c-code__type'];
  }

  /**
   * @param {string} source
   * @param {number} index
   * @returns {boolean}
   */
  static #atLineStart(source, index) {
    let cursor = index - 1;
    while (cursor >= 0 && (source[cursor] === ' ' || source[cursor] === '\t')) cursor -= 1;
    return cursor < 0 || source[cursor] === '\n';
  }
}
