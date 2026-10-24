/* ==========================================================================
 * Author mode — run a page nobody generated
 * --------------------------------------------------------------------------
 * The pipeline emits a JSON configuration island for every page it
 * renders, and the rest of the runtime reads the lab's structure from
 * it. That is right for a generated lab, and it is the wrong contract
 * for the thing this platform is becoming: a styled template an
 * instructor copies in Avenue to Learn and fills in by hand, with no
 * build and no developer. Nobody hand-writes a salted answer hash.
 *
 * So when a page has no configuration island, the runtime derives one
 * from the markup instead. The page declares itself on the body:
 *
 *   <body data-sept-course="smrttech-3cc3" data-sept-lab="lab-01"
 *         data-sept-version="1" data-sept-code="SMRTTECH 3CC3">
 *
 * Checkpoints come from the `[data-checkpoint]` sections in document
 * order and answer boxes from the `[data-field]` controls, so
 * sequential gating, confirmation, live checking, saved progress and
 * the progress file all work on a page an instructor wrote by hand.
 *
 * What author mode deliberately does NOT do is mark. A generated lab
 * marks against salted hashes an instructor never sees; a hand-written
 * page has no such thing, and scoring plaintext answers that sit in the
 * markup would hand out marks nothing verified. Author mode therefore
 * gives immediate teaching feedback and withholds the submission
 * package — the same bargain Avenue's own Creator+ Practices strike,
 * on a page that looks like the rest of the course and, unlike a
 * Practice, keeps the student's work.
 *
 * A lab that must carry marks goes through the pipeline. That is the
 * whole distinction, and the page says which it is: author mode adds
 * `js-authored` to the document element.
 * ========================================================================== */

const AuthorMode = {
  /**
   * Derive a page configuration from the markup.
   * @returns {object | null} A configuration the runtime can boot from,
   *   or null if the page does not declare itself.
   */
  deriveConfig() {
    const body = document.body;
    const courseId = body.dataset.septCourse;
    if (!courseId) return null;

    const page = body.dataset.septPage
      ?? (document.querySelector('[data-checkpoint]') ? 'lab' : 'knowledge');
    const config = {
      page,
      authored: true,
      course: {
        id: courseId,
        code: body.dataset.septCode
          ?? document.querySelector('.c-appbar__course')?.textContent?.trim()
          ?? courseId,
      },
      // Definitions the pipeline would have generated. Left empty rather
      // than absent, so a component's lookup misses cleanly instead of
      // throwing on a page that simply does not use that component.
      quizzes: {},
      fields: {},
      calculators: {},
      orderings: {},
      checkpoints: [],
      topics: [],
      marking: null,
    };
    if (page !== 'lab') return config;

    config.lab = {
      id: body.dataset.septLab ?? 'lab',
      title: document.querySelector('h1')?.textContent?.trim()
        ?? document.title.split('·')[0].trim(),
      // The version is the author's cache key: changing it is how an
      // instructor says "my edits invalidate the answers students saved".
      contentVersion: body.dataset.septVersion ?? '1',
      kind: body.dataset.septKind ?? 'lab',
    };
    for (const control of Dom.all('[data-field]')) {
      const key = control.dataset.field;
      if (key) config.fields[key] = AuthorMode.fieldRules(control);
    }
    config.checkpoints = AuthorMode.readCheckpoints(config.fields);
    return config;
  },

  /**
   * Read the checkpoint sequence out of the page.
   *
   * Requirements are the one thing that cannot be inferred: a generated
   * lab knows a checkpoint needs quiz `q3` because the content said so.
   * Here the instructor says it in the markup —
   * `data-checkpoint-requires="quiz:q3 field:v-out check:safety"` — and a
   * checkpoint that declares nothing stays confirmable on the student's
   * word, which is how a reading step should behave anyway.
   *
   * @param {Record<string, object>} fields Field rules already read from the page.
   * @returns {object[]}
   */
  readCheckpoints(fields) {
    return Dom.all('[data-checkpoint]').map((panel, index) => {
      const requires = (panel.dataset.checkpointRequires ?? '')
        .split(/\s+/)
        .filter(Boolean)
        .map((token) => {
          const separator = token.indexOf(':');
          return separator === -1
            ? { kind: 'check', id: token }
            : { kind: token.slice(0, separator), id: token.slice(separator + 1) };
        })
        .filter((requirement) => requirement.id !== '');
      const of = (kind) => requires.filter((r) => r.kind === kind).map((r) => r.id);

      return {
        id: panel.dataset.checkpoint,
        number: index + 1,
        title: panel.querySelector('.c-checkpoint__title')?.textContent?.trim()
          ?? panel.getAttribute('aria-label')
          ?? `Step ${index + 1}`,
        quizzes: of('quiz'),
        checks: of('check'),
        // The checkpoint reporter wants whole field definitions, not keys:
        // it quotes the label when something is missing. A requirement
        // naming a field that is not on the page is dropped rather than
        // left to block confirmation forever.
        fields: of('field')
          .filter((key) => fields[key] !== undefined)
          .map((key) => ({ key, ...fields[key] })),
        // Both read definitions the pipeline generates; author mode does
        // not wire them, so nothing can require them.
        evidence: [],
        orderings: [],
      };
    });
  },

  /**
   * A hand-written quiz keeps its answer in the markup, because there is
   * no build to hash it against. That is only acceptable because author
   * mode awards no mark for it: the answer sits in the page for the same
   * reason the hint does.
   * @param {HTMLElement} root The quiz element.
   * @returns {string[]} Accepted option values.
   */
  quizAnswers(root) {
    return (root.dataset.quizAnswer ?? '')
      .split(/[\s,]+/)
      .filter(Boolean);
  },

  /**
   * Field rules from one control's markup, in the same shape the
   * pipeline puts in the configuration island — so the live checker and
   * the checkpoint reporter need no author-mode branch of their own.
   *
   *   <input class="c-field__control" type="number" data-field="v-out"
   *          data-field-label="Measured output voltage"
   *          data-field-expected="3.3" data-field-tolerance="0.1"
   *          data-field-message="Check your divider arithmetic."
   *          data-field-min="0" data-field-max="5">
   *
   * @param {HTMLElement} control
   * @returns {object}
   */
  fieldRules(control) {
    const data = control.dataset;
    const rules = {
      label: data.fieldLabel
        ?? control.closest('.c-field')?.querySelector('.c-field__label')?.textContent?.trim()
        ?? data.field,
      control: AuthorMode.controlKind(control),
      optional: data.fieldOptional === 'true',
    };
    const min = Number(data.fieldMin);
    const max = Number(data.fieldMax);
    if (Number.isFinite(min)) rules.min = min;
    if (Number.isFinite(max)) rules.max = max;
    if (data.fieldRangeMessage) rules.rangeMessage = data.fieldRangeMessage;

    if (data.fieldExpected !== undefined) {
      const tolerance = Number(data.fieldTolerance);
      // `plain` is what tells Fields.matchesExpected this rule carries
      // the answer itself rather than a set of hashes.
      rules.expected = {
        plain: data.fieldExpected,
        tolerance: Number.isFinite(tolerance) ? tolerance : 0,
        alternatives: (data.fieldAlternatives ?? '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        caseSensitive: data.fieldCaseSensitive === 'true',
      };
      if (data.fieldMessage) rules.expected.message = data.fieldMessage;
    }
    return rules;
  },

  /**
   * The control kind the checkpoint reporter checks for. Only `number`
   * changes its behaviour; everything else is treated as text.
   * @param {HTMLElement} control
   * @returns {string}
   */
  controlKind(control) {
    if (control.dataset.fieldControl) return control.dataset.fieldControl;
    const tag = control.tagName.toLowerCase();
    if (tag === 'textarea') return 'textarea';
    if (tag === 'select') return 'select';
    return control.getAttribute('type') === 'number' ? 'number' : 'text';
  },

  /** @returns {boolean} True on a page the runtime derived rather than read. */
  get active() {
    return Boolean(SeptLabs.config?.authored);
  },
};
