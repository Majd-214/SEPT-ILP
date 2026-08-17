/**
 * LTI 1.3 seam — Phase B (January 2027).
 *
 * INTERFACE ONLY. Nothing here executes in Phase A; the shapes exist
 * so Phase B implements against a contract the platform already
 * understands, instead of retrofitting one. See README.md for the
 * swap plan and where each seam attaches.
 *
 * @typedef {object} LtiPlatformConfig
 * @property {string} issuer          e.g. https://avenue.mcmaster.ca
 * @property {string} clientId       From the A2L LTI registration.
 * @property {string} deploymentId
 * @property {string} authorizeUrl   OIDC authorization endpoint.
 * @property {string} tokenUrl       OAuth2 token endpoint.
 * @property {string} jwksUrl        Platform public keyset.
 *
 * @typedef {object} LtiLaunch
 * @property {string} messageType    'LtiResourceLinkRequest' | 'LtiDeepLinkingRequest'
 * @property {string} userId         Opaque platform user id (NOT a MacID).
 * @property {string[]} roles        IMS role URIs.
 * @property {string} resourceLinkId Which A2L topic launched.
 * @property {{ id: string, title: string } | null} context Course context.
 * @property {{ lineItemUrl?: string, scopes: string[] } | null} ags
 *   Assignment & Grade Services claim, when grade passback is allowed.
 *
 * @typedef {object} LtiScore
 * @property {string} userId
 * @property {number} scoreGiven
 * @property {number} scoreMaximum
 * @property {'FullyGraded' | 'PendingManual'} gradingProgress
 * @property {string} timestamp      ISO 8601.
 */

/**
 * Validate an incoming LTI 1.3 launch (OIDC id_token) and return the
 * normalized launch. Phase B implements JWKS fetch + JWT verification.
 * @param {LtiPlatformConfig} config
 * @param {string} idToken Raw JWT from the launch POST.
 * @returns {Promise<LtiLaunch>}
 */
export async function validateLaunch(config, idToken) {
  void config; void idToken;
  throw new Error('LTI launch validation is a Phase B feature (January 2027). See integrations/lti/README.md.');
}

/**
 * Push one score to the platform's AGS line item (grade passback).
 * The marker's per-submission totals map directly onto LtiScore.
 * @param {LtiPlatformConfig} config
 * @param {string} lineItemUrl
 * @param {LtiScore} score
 * @returns {Promise<void>}
 */
export async function postScore(config, lineItemUrl, score) {
  void config; void lineItemUrl; void score;
  throw new Error('AGS grade passback is a Phase B feature (January 2027). See integrations/lti/README.md.');
}
