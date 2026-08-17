#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { ContentRepository } from './ContentRepository.js';
import { Pipeline } from './Pipeline.js';
import { PreviewServer } from './lib/PreviewServer.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const USAGE = `SEPT Interactive Laboratory Platform — build pipeline

Usage:
  node renderer/src/cli.js validate <course-dir>
  node renderer/src/cli.js build <course-dir> [--out <dir>] [--strict] [--skip-a11y] [--single-file]
  node renderer/src/cli.js preview [--dir <dir>] [--port <n>]

Commands:
  validate   Check content against the schemas and cross-references only.
  build      Validate, render, run every quality gate, and package bundles.
  preview    Serve a built site locally.

Flags:
  --out         Output root for build (default: dist)
  --strict      A skipped gate fails the build (CI/publishing mode)
  --skip-a11y   Skip the axe-core scan for faster local iteration
  --single-file Also export each lab as one self-contained HTML file
                (bundles/<course>-<lab>-single.html; assets inlined)
  --dir       Directory for preview (default: dist/site)
  --port      Preview port (default: 4173)
`;

function parseArguments(argv) {
  const positional = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--strict') flags.strict = true;
    else if (argument === '--skip-a11y') flags.skipA11y = true;
    else if (argument === '--single-file') flags.singleFile = true;
    else if (argument === '--out') flags.out = argv[(index += 1)];
    else if (argument === '--dir') flags.dir = argv[(index += 1)];
    else if (argument === '--port') flags.port = Number(argv[(index += 1)]);
    else positional.push(argument);
  }
  return { positional, flags };
}

function reportContentError(error) {
  if (error instanceof ContentRepository.ValidationError) {
    console.error(`\n${error.message}:`);
    for (const violation of error.violations) console.error(`  - ${violation}`);
    return;
  }
  throw error;
}

const { positional, flags } = parseArguments(process.argv.slice(2));
const [command, target] = positional;

switch (command) {
  case 'validate': {
    if (!target) {
      console.error(USAGE);
      process.exit(2);
    }
    const pipeline = new Pipeline(REPO_ROOT);
    try {
      const repository = pipeline.loadContent(path.resolve(target));
      const topics = repository.knowledgeDomains.reduce((sum, domain) => sum + domain.topics.length, 0);
      console.log(`Content valid: ${repository.labs.length} labs`
        + `${repository.project ? ' + project' : ''}, ${repository.knowledgeDomains.length} knowledge domains, ${topics} topics.`);
    } catch (error) {
      reportContentError(error);
      process.exit(1);
    }
    break;
  }

  case 'build': {
    if (!target) {
      console.error(USAGE);
      process.exit(2);
    }
    const pipeline = new Pipeline(REPO_ROOT);
    console.log(`Building ${target} …`);
    try {
      const { siteDir, failures } = await pipeline.build(path.resolve(target), {
        outDir: flags.out ?? 'dist',
        strict: flags.strict === true,
        skipAccessibility: flags.skipA11y === true,
        singleFile: flags.singleFile === true,
      });
      if (failures.length > 0) {
        console.error(`\nBuild BLOCKED by ${failures.length} gate violation${failures.length === 1 ? '' : 's'}:`);
        for (const failure of failures) console.error(`  - ${failure}`);
        process.exit(1);
      }
      console.log(`\nBuild complete: ${siteDir}`);
    } catch (error) {
      reportContentError(error);
      process.exit(1);
    }
    break;
  }

  case 'preview': {
    const server = new PreviewServer(path.resolve(flags.dir ?? 'dist/site'), flags.port ?? 4173);
    await server.start();
    break;
  }

  default:
    console.error(USAGE);
    process.exit(command ? 2 : 0);
}
