/**
 * Server-rendered HTML for the faculty console. Styling comes from the
 * governed design system (including the 05-admin internal-tools layer);
 * there are no inline styles anywhere, the same rule student pages live
 * under.
 */
export function esc(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * @param {object} options
 * @param {string} options.title
 * @param {object | null} options.user
 * @param {string} [options.active] Active nav key.
 * @param {string} [options.csrf] Session CSRF token for forms.
 * @param {string} options.body Main content HTML.
 * @returns {string}
 */
export function layout({ title, user, active = '', body }) {
  const nav = (href, key, label) => `<a class="c-appbar__navlink${active === key ? ' is-active' : ''}"${active === key ? ' aria-current="page"' : ''} href="${href}">${esc(label)}</a>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>${esc(title)} | SEPT-ILP Platform</title>
<link rel="stylesheet" href="/admin/assets/sept-labs.css">
</head>
<body class="c-admin-shell">
<a class="c-skip-link" href="#main">Skip to content</a>
<header class="c-appbar">
  <a class="c-appbar__brand" href="/admin"><span class="c-appbar__course">SEPT-ILP Platform</span></a>
  <nav class="c-appbar__nav c-admin-nav" aria-label="Platform sections">
    ${user ? [
    nav('/admin', 'dashboard', 'Dashboard'),
    user.role === 'admin' ? nav('/admin/invites', 'invites', 'Invites') : '',
    nav('/admin/links', 'links', 'Link sheet'),
    nav('/admin/exports', 'exports', 'Exports'),
    nav('/admin/editor', 'editor', 'Editor'),
    nav('/marker/', 'marker', 'Marker'),
  ].join('\n    ') : ''}
  </nav>
  <span class="c-appbar__spacer"></span>
  ${user ? `<span class="c-chip">${esc(user.email)} · ${esc(user.role)}</span>
  <form method="post" action="/logout">${csrfField(user._csrf)}<button class="c-btn c-btn--text" type="submit">Sign out</button></form>` : ''}
</header>
<main id="main" class="c-admin-main o-stack">
${body}
</main>
<footer class="c-footer">SEPT Interactive Laboratory Platform · faculty console · no student data lives here</footer>
</body>
</html>
`;
}

/** @param {string | undefined} token */
export function csrfField(token) {
  return token ? `<input type="hidden" name="_csrf" value="${esc(token)}">` : '';
}

/** A titled card section. */
export function card(title, inner) {
  return `<section class="c-card o-stack o-stack--tight" aria-label="${esc(title)}">
<h2 class="c-card__title">${esc(title)}</h2>
${inner}
</section>`;
}

/** @param {"ok" | "failed" | "running" | string} status */
export function statusPill(status) {
  const variant = { ok: 'ok', failed: 'fail', running: 'running' }[status] ?? 'pending';
  return `<span class="c-admin-status c-admin-status--${variant}">${esc(status)}</span>`;
}
