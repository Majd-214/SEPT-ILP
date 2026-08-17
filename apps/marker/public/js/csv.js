/**
 * Export builders: Brightspace grade-import CSV, a generic breakdown
 * CSV, and per-submission feedback files. Pure string functions over
 * marked results — tested in node, executed in the browser.
 */

/** Quote a CSV cell only when it needs it. @param {unknown} value */
export function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** One CSV line. @param {unknown[]} cells */
const line = (cells) => cells.map(csvCell).join(',');

/**
 * Student numbers as Brightspace OrgDefinedIds: the identity fields are
 * free text, so split on every common separator and keep digit runs.
 * @param {object} student
 * @returns {string[]}
 */
export function studentIds(student) {
  return String(student?.student_numbers ?? '')
    .split(/[^0-9]+/)
    .filter((id) => id.length >= 5);
}

/**
 * Brightspace-compatible grade import: one file per lab, one row per
 * student number, the format D2L's import wizard accepts directly
 * (OrgDefinedId prefixed with #, grade column named
 * "<item> Points Grade", literal # end-of-line column).
 * @param {object[]} results Marked results for ONE lab.
 * @param {string} itemName Grade item name as it exists in Brightspace.
 * @returns {{ csv: string, skipped: object[] }} skipped: results with
 *   no parseable student numbers (they need manual entry).
 */
export function brightspaceCsv(results, itemName) {
  const rows = [line(['OrgDefinedId', `${itemName} Points Grade`, 'End-of-Line Indicator'])];
  const skipped = [];
  for (const result of results) {
    const ids = studentIds(result.session.student);
    if (ids.length === 0) { skipped.push(result); continue; }
    for (const id of ids) {
      rows.push(line([`#${id}`, result.totals.grade, '#']));
    }
  }
  return { csv: `${rows.join('\r\n')}\r\n`, skipped };
}

/**
 * The generic CSV: one row per submission with identity, totals, flags,
 * and one column per key item (the union across the batch, so a mixed
 * batch still lines up).
 * @param {object[]} results
 * @returns {string}
 */
export function genericCsv(results) {
  const itemIds = [];
  for (const result of results) {
    for (const item of result.items) {
      if (!itemIds.includes(item.id)) itemIds.push(item.id);
    }
  }
  const rows = [line([
    'file', 'students', 'student_numbers', 'lab_section', 'lab', 'lab_title',
    'content_version', 'completion_status', 'earned', 'out_of', 'grade',
    'flags', ...itemIds,
  ])];
  for (const result of results) {
    const { session, totals } = result;
    const byId = Object.fromEntries(result.items.map((item) => [item.id, item]));
    rows.push(line([
      session.source,
      session.student?.name_or_team ?? '',
      session.student?.student_numbers ?? '',
      session.student?.lab_section ?? '',
      session.labId,
      result.key.labTitle,
      session.contentVersion,
      session.completionStatus,
      totals.earned,
      totals.out_of,
      totals.grade,
      allFlags(result).join(' | '),
      ...itemIds.map((id) => (byId[id] ? `${byId[id].earned}/${byId[id].points}` : '')),
    ]));
  }
  return `${rows.join('\r\n')}\r\n`;
}

/** Every advisory flag on a result, session-level then per-item. */
export function allFlags(result) {
  return [
    ...result.flags,
    ...result.items.flatMap((item) => item.flags.map((flag) => `${item.id}: ${flag}`)),
  ];
}

/**
 * A per-submission feedback file (markdown) an instructor can return
 * through the LMS alongside the grade.
 * @param {object} result
 * @returns {{ name: string, text: string }}
 */
export function feedbackFile(result) {
  const { session, key, totals } = result;
  const safe = String(session.student?.name_or_team ?? session.source)
    .replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'submission';
  const lines = [
    `# ${key.labTitle} — feedback`,
    '',
    `**Submitted by:** ${session.student?.name_or_team ?? 'unknown'}`
      + (session.student?.student_numbers ? ` (${session.student.student_numbers})` : ''),
    `**Auto-marked total:** ${totals.earned}/${totals.points}`
      + (totals.override !== null ? ` → ${totals.scaled}/${totals.override} after scaling` : ''),
    '',
    '| Item | Result | Points |',
    '| --- | --- | ---: |',
    ...result.items.map((item) =>
      `| ${item.label.replaceAll('|', '\\|')} | ${item.detail.replaceAll('|', '\\|')} | ${item.earned}/${item.points} |`),
  ];
  const flags = allFlags(result);
  if (flags.length > 0) {
    lines.push('', '## Review notes', '',
      ...flags.map((flag) => `- ${flag}`),
      '', '_These notes are advisory: they suggest a second look, they are not verdicts._');
  }
  lines.push('', '_Auto-marked by the SEPT-ILP instructor marker; marks are re-derived from recorded responses and may be adjusted by your instructor._');
  return { name: `feedback-${safe}.md`, text: `${lines.join('\n')}\n` };
}
