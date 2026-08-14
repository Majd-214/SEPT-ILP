/* ==========================================================================
 * CodeCopy — a copy button on every code listing
 * --------------------------------------------------------------------------
 * Markup contract: .c-code > .c-code__header + .c-code__pre > code
 * The button is added here rather than rendered, so pages remain plain
 * readable documents when scripting is unavailable.
 * ========================================================================== */

class CodeCopy {
  /** @param {HTMLElement} root */
  constructor(root) {
    const header = root.querySelector('.c-code__header');
    const code = root.querySelector('.c-code__pre code');
    if (!header || !code || !navigator.clipboard) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'c-code__copy';
    button.textContent = 'Copy';
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code.textContent);
        button.textContent = 'Copied';
      } catch {
        button.textContent = 'Copy failed';
      }
      setTimeout(() => {
        button.textContent = 'Copy';
      }, 1500);
    });
    header.appendChild(button);
  }
}
