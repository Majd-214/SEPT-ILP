import fs from 'node:fs';
import path from 'node:path';

/**
 * Single-file export: fold one rendered lab page and everything it
 * references — stylesheet, fonts, runtime script, images — into a
 * self-contained HTML document. The result opens from anywhere (an
 * Avenue to Learn file topic, an email attachment, file://) with the
 * complete interactive runtime and no network access at all.
 *
 * This is a post-processing step over the built site, so the exported
 * bytes derive purely from built bytes: determinism is inherited.
 *
 * One caveat travels with the artifact and is documented in
 * docs/deployment.md: browser storage is partitioned by origin, so
 * progress made in a single-file copy does not automatically appear on
 * the hosted site (and vice versa). The progress file download/restore
 * is the bridge — that flow exists on every lab page.
 */
export class SingleFile {
  static MEDIA_TYPES = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
  };

  /**
   * @param {string} siteDir Built site directory.
   * @param {string} pageRelPath Page path inside the site, e.g.
   *   `labs/lab-01/index.html`.
   * @param {object} [options]
   * @param {string | null} [options.linkBase] Public base URL for this
   *   course's hosted site (e.g. `https://labs.example.ca/c/mini`).
   *   Internal links are rewritten onto it so navigation still works
   *   from inside the LMS; without it they are left untouched.
   * @returns {string} The self-contained HTML document.
   */
  static inline(siteDir, pageRelPath, { linkBase = null } = {}) {
    const pageDir = path.posix.dirname(pageRelPath.split(path.sep).join('/'));
    let html = fs.readFileSync(path.join(siteDir, pageRelPath), 'utf8');

    /** Resolve a page-relative URL to a site-relative file path. */
    const resolve = (href) => {
      if (/^(?:[a-z]+:|\/\/|#)/i.test(href)) return null; // absolute or fragment
      const clean = href.split(/[?#]/)[0];
      const resolved = path.posix.normalize(path.posix.join(pageDir, clean));
      return resolved.startsWith('..') ? null : resolved;
    };

    const dataUri = (sitePath) => {
      const file = path.join(siteDir, sitePath);
      const type = SingleFile.MEDIA_TYPES[path.extname(sitePath).toLowerCase()];
      if (!type || !fs.existsSync(file)) return null;
      return `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
    };

    // 1. The stylesheet becomes a <style> element, its font references
    //    becoming data: URIs first.
    html = html.replace(
      /<link rel="stylesheet" href="([^"]+)">/,
      (match, href) => {
        const cssPath = resolve(href);
        if (!cssPath) return match;
        const cssDir = path.posix.dirname(cssPath);
        let css = fs.readFileSync(path.join(siteDir, cssPath), 'utf8');
        css = css.replace(/url\("([^"]+)"\)/g, (urlMatch, target) => {
          const fontPath = path.posix.normalize(path.posix.join(cssDir, target));
          const uri = dataUri(fontPath);
          return uri ? `url("${uri}")` : urlMatch;
        });
        if (css.includes('</style')) throw new Error('stylesheet cannot embed </style>');
        return `<style>\n${css}\n</style>`;
      });

    // 2. The runtime script becomes inline. The runtime waits for
    //    DOMContentLoaded, so losing `defer` does not change behaviour;
    //    `</script` sequences are escaped, which is a no-op inside JS
    //    strings and regular expressions alike.
    html = html.replace(
      /<script src="([^"]+)" defer><\/script>/,
      (match, src) => {
        const scriptPath = resolve(src);
        if (!scriptPath) return match;
        const js = fs.readFileSync(path.join(siteDir, scriptPath), 'utf8')
          .replaceAll('</script', '<\\/script');
        return `<script>\n${js}\n</script>`;
      });

    // 3. Every image (and the favicon) becomes a data: URI.
    html = html.replace(/(<(?:img|link)\b[^>]*?\b(?:src|href)=")([^"]+)(")/g,
      (match, before, url, after) => {
        const sitePath = resolve(url);
        if (!sitePath) return match;
        const uri = dataUri(sitePath);
        return uri ? `${before}${uri}${after}` : match;
      });

    // 4. Internal navigation — anchors and the knowledge panel's
    //    full-page links (data-kb-href) — pointed at the hosted site
    //    when its base URL is known, otherwise left as-is (inert but
    //    harmless in a standalone file). Fragments survive the rewrite.
    if (linkBase) {
      const base = linkBase.replace(/\/$/, '');
      const rewrite = (match, before, url, after) => {
        const sitePath = resolve(url);
        if (sitePath === null) return match;
        const fragment = /#.*$/.exec(url)?.[0] ?? '';
        const pretty = sitePath === 'index.html' ? ''
          : sitePath.endsWith('/index.html') ? `${sitePath.slice(0, -'index.html'.length)}`
            : sitePath;
        return `${before}${base}/${pretty}${fragment}${after}`;
      };
      html = html.replace(/(<a\b[^>]*?\bhref=")([^"]+)(")/g, rewrite);
      html = html.replace(/(\bdata-kb-href=")([^"]+)(")/g, rewrite);
    }

    return html;
  }
}
