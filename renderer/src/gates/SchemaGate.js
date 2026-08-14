import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Gate } from './Gate.js';

const require = createRequire(import.meta.url);

/**
 * Gate 1 — schema validation.
 *
 * Every content document must conform to the platform's versioned JSON
 * Schemas before anything is rendered. Malformed or incomplete content —
 * a quiz with no correct option, an image without alternative text, a
 * checkpoint with no completion criterion — never reaches the renderer.
 *
 * Unlike the other gates, this one runs against the *content*, not the
 * rendered output, so the pipeline invokes it first and refuses to
 * continue when it fails.
 */
export class SchemaGate {
  /** @param {string} schemaDir Directory containing `*.schema.json`. */
  constructor(schemaDir) {
    this.name = 'schema';
    this.description = 'All content documents conform to the versioned Lab JSON schemas';

    const { default: Ajv } = require('ajv/dist/2020');
    const { default: addFormats } = require('ajv-formats');
    this.ajv = new Ajv({
      allErrors: true,
      allowUnionTypes: true,
      discriminator: true,
      strict: true,
      // Schemas use `anyOf: [{ required: … }]` for either/or content rules
      // (e.g. a callout needs paragraphs or items); that pattern is
      // deliberate, so only this strict check is relaxed.
      strictRequired: false,
    });
    addFormats(this.ajv);

    for (const entry of fs.readdirSync(schemaDir).sort()) {
      if (entry.endsWith('.schema.json')) {
        this.ajv.addSchema(JSON.parse(fs.readFileSync(path.join(schemaDir, entry), 'utf8')));
      }
    }
  }

  /**
   * Validate one document against a named schema.
   * @param {string} schemaId The schema `$id` to validate against.
   * @param {unknown} document Parsed content document.
   * @param {string} label Path shown in violation messages.
   * @returns {string[]} Violations; empty when valid.
   */
  validate(schemaId, document, label) {
    const validator = this.ajv.getSchema(schemaId);
    if (!validator) {
      return [`${label}: unknown schema ${schemaId}`];
    }
    if (validator(document)) return [];
    return (validator.errors ?? []).map((error) => {
      const where = error.instancePath || '(document root)';
      const detail = error.keyword === 'additionalProperties'
        ? `${error.message}: "${error.params.additionalProperty}"`
        : error.message;
      return `${label}: ${where} ${detail}`;
    });
  }

  /**
   * The `Gate.SkippedError` type is part of the gate contract; SchemaGate
   * never skips, but exposing the same interface keeps reporting uniform.
   */
  static get SkippedError() {
    return Gate.SkippedError;
  }
}
