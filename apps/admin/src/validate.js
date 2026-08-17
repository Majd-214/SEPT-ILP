import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SchemaGate } from '../../../renderer/src/gates/SchemaGate.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * The editor validates with the renderer's own SchemaGate — the same
 * AJV instance, options, and schema set the build uses, so the editor
 * and the pipeline can never disagree about what is valid. Schemas are
 * code, not content: they load from this repository (the version the
 * platform ships with), never from the configured content checkout.
 */
export class LabValidator {
  constructor() {
    this.schemaGate = new SchemaGate(path.join(HERE, '..', '..', '..', 'schema', 'v1'));
    this.labSchemaId = 'https://majd-214.github.io/SEPT-ILP/schema/v1/lab.schema.json';
  }

  /**
   * Validate a lab document; errors keep their AJV instance paths so
   * the client can pin each one to the block it belongs to.
   * @param {unknown} document
   * @returns {{ path: string, message: string }[]} Empty when valid.
   */
  labErrors(document) {
    const validator = this.schemaGate.ajv.getSchema(this.labSchemaId);
    if (validator(document)) return [];
    return (validator.errors ?? []).map((error) => ({
      path: error.instancePath || '/',
      message: error.keyword === 'additionalProperties'
        ? `${error.message}: "${error.params.additionalProperty}"`
        : (error.message ?? error.keyword),
    }));
  }
}
