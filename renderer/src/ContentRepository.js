import fs from 'node:fs';
import path from 'node:path';

const SCHEMA_BASE = 'https://majd-214.github.io/SEPT-ILP/schema/v1';

/**
 * Loads and validates one course's content directory:
 *
 *   course.json          course manifest
 *   labs/*.json          lab and project documents
 *   knowledge/*.json     knowledge domains
 *   assets/              images referenced by content
 *
 * Loading is strict: schema violations and broken cross-references (a
 * dangling related-topic id, two labs with one number) abort with the
 * complete list of problems. Invalid content never reaches the renderer.
 */
export class ContentRepository {
  /**
   * @param {string} courseDir
   * @param {import('./gates/SchemaGate.js').SchemaGate} schemaGate
   */
  constructor(courseDir, schemaGate) {
    this.courseDir = courseDir;
    this.sharedDir = path.resolve(courseDir, '..', '..', 'shared');
    /**
     * Asset directories in merge order: shared first, then the course,
     * so a course may override a shared file of the same name.
     * @type {string[]}
     */
    this.assetsDirs = [
      path.join(this.sharedDir, 'assets'),
      path.join(courseDir, 'assets'),
    ].filter((dir) => fs.existsSync(dir));

    /** @type {string[]} */
    const violations = [];
    const readJson = (filePath) => {
      try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch (error) {
        violations.push(`${path.relative(courseDir, filePath)}: ${error.message}`);
        return null;
      }
    };

    const coursePath = path.join(courseDir, 'course.json');
    this.course = readJson(coursePath);
    if (this.course) {
      violations.push(...schemaGate.validate(`${SCHEMA_BASE}/course.schema.json`, this.course, 'course.json'));
    }

    /** @type {object[]} */
    this.allLabs = [];
    const labsDir = path.join(courseDir, 'labs');
    for (const entry of fs.readdirSync(labsDir).sort()) {
      if (!entry.endsWith('.json')) continue;
      const lab = readJson(path.join(labsDir, entry));
      if (!lab) continue;
      violations.push(...schemaGate.validate(`${SCHEMA_BASE}/lab.schema.json`, lab, `labs/${entry}`));
      this.allLabs.push(lab);
    }

    /** @type {object[]} */
    this.knowledgeDomains = [];
    const knowledgeDir = path.join(courseDir, 'knowledge');
    if (fs.existsSync(knowledgeDir)) {
      for (const entry of fs.readdirSync(knowledgeDir).sort()) {
        if (!entry.endsWith('.json')) continue;
        const domain = readJson(path.join(knowledgeDir, entry));
        if (!domain) continue;
        violations.push(...schemaGate.validate(`${SCHEMA_BASE}/knowledge.schema.json`, domain, `knowledge/${entry}`));
        this.knowledgeDomains.push(domain);
      }
    }

    // Shared domains the course manifest includes, from content/shared/.
    for (const domainId of this.course?.knowledge?.include ?? []) {
      const sharedPath = path.join(this.sharedDir, 'knowledge', `${domainId}.json`);
      if (!fs.existsSync(sharedPath)) {
        violations.push(`course.json: included shared knowledge domain "${domainId}" does not exist`);
        continue;
      }
      const domain = readJson(sharedPath);
      if (!domain) continue;
      violations.push(...schemaGate.validate(`${SCHEMA_BASE}/knowledge.schema.json`, domain, `shared/knowledge/${domainId}.json`));
      this.knowledgeDomains.push(domain);
    }

    if (violations.length > 0) {
      throw new ContentRepository.ValidationError(violations);
    }

    this.knowledgeDomains.sort((a, b) => a.order - b.order);
    this.labs = this.allLabs
      .filter((lab) => (lab.kind ?? 'lab') === 'lab')
      .sort((a, b) => a.number - b.number);
    this.project = this.allLabs.find((lab) => lab.kind === 'project') ?? null;

    /** @type {Map<string, object>} */
    this.topicById = new Map();
    /** @type {Map<string, object>} */
    this.domainOfTopic = new Map();
    for (const domain of this.knowledgeDomains) {
      for (const topic of domain.topics) {
        if (this.topicById.has(topic.id)) {
          violations.push(`knowledge: topic id "${topic.id}" is defined in more than one domain`);
        }
        this.topicById.set(topic.id, topic);
        this.domainOfTopic.set(topic.id, domain);
      }
    }

    this.knownTopics = new Set(this.topicById.keys());
    this.knownLabs = new Set(this.allLabs.map((lab) => lab.id));

    violations.push(...this.#crossReferenceViolations());
    if (violations.length > 0) {
      throw new ContentRepository.ValidationError(violations);
    }
  }

  /** @returns {string[]} */
  #crossReferenceViolations() {
    const violations = [];

    const labIds = new Set();
    const labNumbers = new Set();
    for (const lab of this.allLabs) {
      if (labIds.has(lab.id)) violations.push(`labs: duplicate lab id "${lab.id}"`);
      labIds.add(lab.id);
      if ((lab.kind ?? 'lab') === 'lab') {
        if (labNumbers.has(lab.number)) violations.push(`labs: duplicate lab number ${lab.number}`);
        labNumbers.add(lab.number);
      }
      for (const topicId of lab.knowledgeTopics ?? []) {
        if (!this.knownTopics.has(topicId)) {
          violations.push(`labs/${lab.id}: unknown knowledge topic "${topicId}"`);
        }
      }
      const checkpointIds = new Set();
      for (const checkpoint of lab.checkpoints) {
        if (checkpointIds.has(checkpoint.id)) {
          violations.push(`labs/${lab.id}: duplicate checkpoint id "${checkpoint.id}"`);
        }
        checkpointIds.add(checkpoint.id);
      }
    }

    for (const domain of this.knowledgeDomains) {
      for (const topic of domain.topics) {
        for (const relatedId of topic.related ?? []) {
          if (!this.knownTopics.has(relatedId)) {
            violations.push(`knowledge/${domain.id}: topic "${topic.id}" relates to unknown topic "${relatedId}"`);
          }
        }
        if (topic.asset && !this.assetsDirs.some((dir) => fs.existsSync(path.join(dir, topic.asset)))) {
          violations.push(`knowledge/${domain.id}: topic "${topic.id}" references missing asset "${topic.asset}"`);
        }
      }
    }

    return violations;
  }
}

/** Carries every content problem found, so authors fix one complete list. */
ContentRepository.ValidationError = class ValidationError extends Error {
  /** @param {string[]} violations */
  constructor(violations) {
    super(`Content validation failed with ${violations.length} problem${violations.length === 1 ? '' : 's'}`);
    this.violations = violations;
  }
};
