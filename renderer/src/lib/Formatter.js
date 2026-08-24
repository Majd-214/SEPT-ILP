/**
 * Readable output.
 *
 * The renderer builds markup by string concatenation, which produced
 * exactly one line per document region — a lab page arrived as 29 lines,
 * the longest of them 258,000 characters. That is valid HTML and
 * completely unusable to a human: an instructor who opens a published
 * lab in Avenue's HTML editor cannot read it, let alone change it. The
 * platform's first principle is that there are no black boxes — the
 * pages professors teach from must be pages professors can edit — so the
 * renderer indents what it emits.
 *
 * The hard constraint is that indentation must not change rendering. A
 * line break is a text node, and a text node between two inline boxes is
 * a real space: break in the wrong place and a gap opens between two
 * chips, or a period drifts off the end of a link. Between block boxes
 * the same text node is discarded, and so is one that is only ever
 * adjacent to a block box — leading and trailing whitespace is trimmed
 * out of the anonymous block that would otherwise hold it.
 *
 * So the formatter reads each element's children as a sequence of runs.
 * Consecutive inline-level children form one run, copied byte-for-byte
 * onto a single line; block-level children get a line each and are
 * indented in turn. Two exemptions do most of the work:
 *
 *   - Elements that generate no box (`script`, `style`, and the head's
 *     metadata) are neutral. They neither open a run nor close one:
 *     whitespace beside them shows only if it is also beside something
 *     that renders.
 *   - A flex or grid container discards whitespace-only children
 *     outright — they never become items — so inside one, every break is
 *     free whatever the children are.
 *
 * Which elements are inline-level and which are flex containers is a
 * question about the stylesheet, not about tag names: the design system
 * makes `<a class="c-nav__item">` a flex container and `<div
 * class="c-chip">` an inline box. The formatter therefore reads the
 * stylesheet it is given and derives both sets, so a CSS change cannot
 * silently invalidate a list kept somewhere else.
 *
 * `pre` and `textarea` render their whitespace literally, so their bytes
 * are reproduced exactly.
 *
 * Two properties are covered by renderer/test/format.test.js: formatting
 * is idempotent (re-publishing a page is a no-op diff), and every
 * element of a real course occupies the same pixels, at two viewport
 * widths, before and after formatting.
 */
export class Formatter {
  /** Elements with no closing tag. */
  static #VOID = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'source', 'track', 'wbr',
  ]);

  /** Elements whose content is character data, not markup. */
  static #RAW_TEXT = new Set(['script', 'style']);

  /** Elements whose whitespace is content. */
  static #PRE = new Set(['pre', 'textarea']);

  /**
   * Elements that render nothing, so whitespace beside them is invisible
   * on its own.
   */
  static #NEUTRAL = new Set(['script', 'style', 'meta', 'link', 'title', 'base', 'template']);

  /**
   * Inline-level by default in HTML. `button`, `input`, `select` and
   * `textarea` are inline-block; `svg`, `img` and `video` are replaced
   * inline elements. A stray line break beside any of them is a space.
   */
  static #INLINE_TAGS = new Set([
    'a', 'abbr', 'audio', 'b', 'bdi', 'bdo', 'br', 'button', 'cite', 'code',
    'data', 'datalist', 'del', 'dfn', 'em', 'i', 'iframe', 'img', 'input',
    'ins', 'kbd', 'label', 'map', 'mark', 'meter', 'noscript', 'object',
    'output', 'picture', 'progress', 'q', 'ruby', 's', 'samp', 'select',
    'slot', 'small', 'span', 'strong', 'sub', 'sup', 'svg', 'textarea',
    'time', 'u', 'var', 'video', 'wbr',
  ]);

  /** `display` values that put an element in its parent's line box. */
  static #INLINE_LEVEL = new Set([
    'inline', 'inline-block', 'inline-flex', 'inline-grid', 'inline-table',
  ]);

  /** `display` values that take an element out of the line box. */
  static #BLOCK_LEVEL = new Set([
    'block', 'flex', 'grid', 'table', 'list-item', 'flow-root',
  ]);

  /** `display` values whose children may be separated freely. */
  static #FREE_BREAK = new Set(['flex', 'grid', 'inline-flex', 'inline-grid']);

  /**
   * @param {string} css The stylesheet the rendered pages will load.
   *   Every `display` declaration in it is read; nothing else is.
   */
  constructor(css) {
    const index = Formatter.#displayIndex(css);
    this.inlineClasses = index.inline;
    this.blockClasses = index.block;
    this.freeBreakClasses = index.freeBreak;
  }

  /**
   * Indent a rendered document without changing what it renders.
   * @param {string} html
   * @returns {string} The same document, indented.
   */
  format(html) {
    const nodes = Formatter.#parse(html);
    const lines = [];
    this.#emitAll(Formatter.#runs(nodes, html, this, false), 0, html, lines);
    return `${lines.join('\n')}\n`;
  }

  /* ─── reading the stylesheet ──────────────────────────────────── */

  /**
   * Map every bare single-class selector to the `display` values the
   * stylesheet gives it.
   *
   * Deliberately narrow: only a selector that is one class and nothing
   * else counts, because those are the only rules that hold wherever the
   * class appears. `.c-nav.is-open { display: flex }` is skipped, and
   * `.c-nav` is then judged on its children, as it should be. A class
   * that gets different values at different breakpoints collects all of
   * them, and inline-level wins — the reading that never adds a space.
   *
   * @param {string} css
   * @returns {{inline: Set<string>, block: Set<string>, freeBreak: Set<string>}}
   */
  static #displayIndex(css) {
    const inline = new Set();
    const block = new Set();
    const freeBreak = new Set();
    // Comments may sit between rules and would otherwise be read as part
    // of the next selector.
    const source = css.replaceAll(/\/\*[\s\S]*?\*\//g, '');

    for (const [, selectors, declarations] of source.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
      const values = [...declarations.matchAll(/(?:^|;)\s*display\s*:\s*([a-z-]+)/g)]
        .map((match) => match[1]);
      if (values.length === 0) continue;
      for (const selector of selectors.split(',')) {
        const name = /^\.([a-zA-Z][\w-]*)$/.exec(selector.trim())?.[1];
        if (!name) continue;
        for (const value of values) {
          if (Formatter.#INLINE_LEVEL.has(value)) inline.add(name);
          else if (Formatter.#BLOCK_LEVEL.has(value)) block.add(name);
          if (Formatter.#FREE_BREAK.has(value)) freeBreak.add(name);
        }
      }
    }
    // Inline-level is the conservative reading, so it wins outright.
    for (const name of inline) block.delete(name);
    return { inline, block, freeBreak };
  }

  /* ─── parsing ─────────────────────────────────────────────────── */

  /**
   * Build a node tree over the source, recording byte offsets rather
   * than copying strings: every tag the formatter prints is a slice of
   * the input, so attributes and entities cannot be altered in passing.
   *
   * The input is machine-generated by {@link Html}, which escapes `<`,
   * `>` and `"` inside every attribute value and every text node, so a
   * `<` always opens a tag and the first `>` always closes one.
   *
   * @param {string} html
   * @returns {object[]} Top-level nodes.
   */
  static #parse(html) {
    const root = { type: 'root', children: [] };
    const stack = [root];
    const lower = html.toLowerCase();
    let index = 0;
    let textStart = 0;

    const flushText = (until) => {
      if (until > textStart) {
        stack.at(-1).children.push({ type: 'text', start: textStart, end: until });
      }
    };

    while (index < html.length) {
      const open = html.indexOf('<', index);
      if (open === -1) break;

      // Comments and the doctype: opaque, copied whole.
      if (html.startsWith('<!--', open) || html.startsWith('<!', open)) {
        const close = html.startsWith('<!--', open)
          ? html.indexOf('-->', open + 4) + 3
          : html.indexOf('>', open) + 1;
        const end = close <= 0 ? html.length : close;
        flushText(open);
        stack.at(-1).children.push({ type: 'opaque', start: open, end });
        index = textStart = end;
        continue;
      }

      const closing = html.startsWith('</', open);
      const nameStart = open + (closing ? 2 : 1);
      const tag = /^[a-zA-Z][^\s/>]*/.exec(lower.slice(nameStart, nameStart + 64))?.[0];
      const gt = html.indexOf('>', open);
      if (!tag || gt === -1) { index = open + 1; continue; } // a literal `<` in text

      if (closing) {
        flushText(open);
        // Our markup is balanced, but one unexpected close tag must not
        // unwind the whole document: ignore a tag that matches nothing.
        const depth = stack.findLastIndex((node) => node.tag === tag);
        if (depth > 0) {
          stack[depth].innerEnd = open;
          stack[depth].end = gt + 1;
          stack.length = depth;
        }
        index = textStart = gt + 1;
        continue;
      }

      flushText(open);
      const node = { type: 'element', tag, start: open, innerStart: gt + 1, children: [] };
      stack.at(-1).children.push(node);

      if (Formatter.#VOID.has(tag) || html[gt - 1] === '/') {
        node.innerEnd = node.innerStart;
        node.end = gt + 1;
        index = textStart = gt + 1;
        continue;
      }

      if (Formatter.#RAW_TEXT.has(tag)) {
        // Only the matching end tag ends character data.
        const close = lower.indexOf(`</${tag}`, node.innerStart);
        node.innerEnd = close === -1 ? html.length : close;
        node.end = close === -1 ? html.length : (html.indexOf('>', close) + 1 || html.length);
        node.children.push({ type: 'text', start: node.innerStart, end: node.innerEnd });
        index = textStart = node.end;
        continue;
      }

      stack.push(node);
      index = textStart = gt + 1;
    }

    flushText(html.length);
    // Anything still open ran to the end of the document.
    for (const node of stack.slice(1)) {
      node.innerEnd ??= html.length;
      node.end ??= html.length;
    }
    return root.children;
  }

  /* ─── printing ────────────────────────────────────────────────── */

  /**
   * @param {Array<object>} items Runs from {@link Formatter.#runs}.
   * @param {number} depth
   * @param {string} html
   * @param {string[]} lines Output accumulator.
   */
  #emitAll(items, depth, html, lines) {
    for (const item of items) {
      if (item.kind === 'inline') {
        lines.push('  '.repeat(depth) + html.slice(item.first.start, item.last.end));
      } else {
        this.#emitBlock(item.node, depth, html, lines);
      }
    }
  }

  /**
   * Emit one block-level node and everything beneath it.
   * @param {object} node
   * @param {number} depth
   * @param {string} html
   * @param {string[]} lines
   */
  #emitBlock(node, depth, html, lines) {
    const pad = '  '.repeat(depth);
    if (node.type === 'text') {
      const text = html.slice(node.start, node.end);
      if (text.trim() !== '') lines.push(pad + text.trim());
      return; // whitespace between block boxes renders as nothing
    }
    if (node.type === 'opaque') {
      lines.push(pad + html.slice(node.start, node.end));
      return;
    }

    const startTag = html.slice(node.start, node.innerStart);
    const endTag = html.slice(node.innerEnd, node.end);
    if (node.innerStart === node.innerEnd && endTag === '') {
      lines.push(pad + startTag); // void element
      return;
    }
    if (Formatter.#PRE.has(node.tag)) {
      // The opening line is indented like any other; everything inside
      // is the author's own whitespace and stays untouched.
      lines.push(pad + html.slice(node.start, node.end));
      return;
    }
    if (node.tag === 'script' || node.tag === 'style') {
      Formatter.#emitData(node, pad, startTag, endTag, html, lines);
      return;
    }
    if (html.slice(node.innerStart, node.innerEnd).trim() === '') {
      lines.push(pad + startTag + endTag);
      return;
    }

    const items = Formatter.#runs(node.children, html, this, this.#breaksFreely(node, html));
    if (items.length === 1 && items[0].kind === 'inline') {
      lines.push(pad + html.slice(node.start, node.end)); // one line will do
      return;
    }
    lines.push(pad + startTag);
    this.#emitAll(items, depth + 1, html, lines);
    lines.push(pad + endTag);
  }

  /**
   * A `script` or `style` element. Its content has no significant
   * whitespace, and the JSON configuration island is the one place an
   * instructor must reach to add a question, so multi-line data is
   * re-indented to sit with the markup around it rather than trailing
   * off the right edge of the editor. Existing indentation is removed
   * first, which is what keeps formatting idempotent.
   * @param {object} node
   * @param {string} pad
   * @param {string} startTag
   * @param {string} endTag
   * @param {string} html
   * @param {string[]} lines
   */
  static #emitData(node, pad, startTag, endTag, html, lines) {
    const inner = html.slice(node.innerStart, node.innerEnd);
    const rows = inner.split('\n').filter((row) => row.trim() !== '');
    if (rows.length <= 1) {
      lines.push(pad + startTag + inner.trim() + endTag);
      return;
    }
    const common = Math.min(...rows.map((row) => /^ */.exec(row)[0].length));
    lines.push(pad + startTag);
    for (const row of rows) lines.push(`${pad}  ${row.slice(common)}`);
    lines.push(pad + endTag);
  }

  /* ─── layout questions ────────────────────────────────────────── */

  /**
   * Split a child list into inline runs and standalone block nodes. A
   * neutral node extends the run it sits inside and is emitted on its
   * own once the run has closed.
   * @param {object[]} nodes
   * @param {string} html
   * @param {Formatter} formatter
   * @param {boolean} freeBreaks True inside a flex or grid container,
   *   where whitespace-only children are discarded and nothing has to
   *   share a line.
   * @returns {Array<{kind: 'inline', first: object, last: object} | {kind: 'block', node: object}>}
   */
  static #runs(nodes, html, formatter, freeBreaks) {
    const out = [];
    let run = null;
    let pending = [];
    const closeRun = () => {
      run = null;
      for (const node of pending) out.push({ kind: 'block', node });
      pending = [];
    };

    for (const node of nodes) {
      if (Formatter.#isNeutral(node, html)) {
        if (run) pending.push(node);
        else out.push({ kind: 'block', node });
      } else if (!freeBreaks && formatter.#isInline(node, html)) {
        if (run) { run.last = node; pending = []; }
        else { run = { kind: 'inline', first: node, last: node }; out.push(run); }
      } else {
        closeRun();
        out.push({ kind: 'block', node });
      }
    }
    closeRun();
    return out;
  }

  /**
   * Is this node laid out inline, so that whitespace beside it counts?
   * @param {object} node
   * @param {string} html
   * @returns {boolean}
   */
  #isInline(node, html) {
    if (node.type === 'text') return html.slice(node.start, node.end).trim() !== '';
    if (node.type !== 'element') return false;
    const classes = Formatter.#classesOf(node, html);
    if (classes.some((name) => this.inlineClasses.has(name))) return true;
    if (classes.some((name) => this.blockClasses.has(name))) return false;
    return Formatter.#INLINE_TAGS.has(node.tag);
  }

  /**
   * Does this element lay its children out with flex or grid, where
   * whitespace-only children never become boxes?
   * @param {object} node
   * @param {string} html
   * @returns {boolean}
   */
  #breaksFreely(node, html) {
    return Formatter.#classesOf(node, html).some((name) => this.freeBreakClasses.has(name));
  }

  /**
   * Does this node render nothing, making whitespace beside it
   * invisible on its own?
   * @param {object} node
   * @param {string} html
   * @returns {boolean}
   */
  static #isNeutral(node, html) {
    if (node.type === 'text') return html.slice(node.start, node.end).trim() === '';
    if (node.type === 'opaque') return true;
    return node.type === 'element' && Formatter.#NEUTRAL.has(node.tag);
  }

  /**
   * @param {object} node
   * @param {string} html
   * @returns {string[]}
   */
  static #classesOf(node, html) {
    if (node.type !== 'element') return [];
    const value = /\sclass="([^"]*)"/.exec(html.slice(node.start, node.innerStart))?.[1];
    return value ? value.split(/\s+/) : [];
  }
}
