/**
 * Brightspace Valence API seam — Phase B (January 2027).
 *
 * INTERFACE ONLY. Nothing here executes in Phase A; grades reach
 * Avenue to Learn as Brightspace-format CSV imports produced by the
 * instructor marker. See README.md for what Valence would add over
 * LTI and why it is second choice.
 *
 * @typedef {object} ValenceConfig
 * @property {string} baseUrl   e.g. https://avenue.mcmaster.ca
 * @property {string} appId     ID-key pair issued by the LMS team.
 * @property {string} appKey
 * @property {string} userId    Service account user context.
 * @property {string} userKey
 * @property {string} leVersion Learning Environment API version, e.g. '1.75'.
 *
 * @typedef {object} GradeUpload
 * @property {string} orgUnitId    The A2L course offering.
 * @property {string} gradeItemId  Numeric grade object id.
 * @property {{ orgDefinedId: string, points: number, comment?: string }[]} rows
 */

/**
 * Push marker results directly into an A2L grade item, replacing the
 * manual CSV import. Rows are exactly what the marker's Brightspace
 * CSV contains, one per student number.
 * @param {ValenceConfig} config
 * @param {GradeUpload} upload
 * @returns {Promise<{ written: number, skipped: { orgDefinedId: string, reason: string }[] }>}
 */
export async function uploadGrades(config, upload) {
  void config; void upload;
  throw new Error('Valence grade upload is a Phase B feature (January 2027). See integrations/valence/README.md.');
}

/**
 * Resolve the students enrolled in an org unit, for pre-flight checks
 * before an upload (unknown student numbers become `skipped` rows).
 * @param {ValenceConfig} config
 * @param {string} orgUnitId
 * @returns {Promise<{ orgDefinedId: string, displayName: string }[]>}
 */
export async function classlist(config, orgUnitId) {
  void config; void orgUnitId;
  throw new Error('Valence classlist is a Phase B feature (January 2027). See integrations/valence/README.md.');
}
