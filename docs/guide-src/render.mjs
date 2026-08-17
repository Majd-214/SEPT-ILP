/**
 * Render the developer guide to docs/SEPT-ILP-Phase-A-Developer-Guide.pdf.
 *
 *   npm run docs:guide
 *
 * Uses the Chromium that `npm run setup` installs — the same browser the
 * accessibility gate drives — so the guide needs no extra dependency.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const source = pathToFileURL(path.join(HERE, 'guide.html')).href;
const output = path.join(HERE, '..', 'SEPT-ILP-Phase-A-Developer-Guide.pdf');

/** The same resolution order the accessibility gate uses. */
async function launch() {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  if (explicit) return chromium.launch({ executablePath: explicit });
  try {
    return await chromium.launch();
  } catch (error) {
    const fallback = '/opt/pw-browsers/chromium';
    if (!fs.existsSync(fallback)) throw error;
    return chromium.launch({ executablePath: fallback });
  }
}

const browser = await launch();
try {
  const page = await browser.newPage();
  const problems = [];
  page.on('pageerror', (error) => problems.push(String(error)));
  page.on('requestfailed', (request) => problems.push(`missing asset: ${request.url()}`));
  await page.goto(source, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  await page.pdf({
    path: output,
    format: 'Letter',
    printBackground: true,
    displayHeaderFooter: true,
    margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' },
    headerTemplate: '<div></div>',
    footerTemplate: `
      <div style="width:100%;font-family:'Segoe UI',system-ui,sans-serif;font-size:7.4pt;color:#7A6C74;
                  padding:0 16mm;display:flex;justify-content:space-between;align-items:center;">
        <span>SEPT Interactive Laboratory Platform · Phase A Developer Guide</span>
        <span style="font-variant-numeric:tabular-nums;">
          <span class="pageNumber"></span> / <span class="totalPages"></span>
        </span>
      </div>`,
  });
  console.log(`Guide written to ${output}`);
} finally {
  await browser.close();
}
