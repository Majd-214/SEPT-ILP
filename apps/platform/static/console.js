/* Console behaviours: copy buttons on the link sheet. Static file —
 * the console carries no inline scripts or styles. */
(() => {
  'use strict';

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-copy]');
    if (!button) return;
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      const original = button.textContent;
      button.textContent = 'Copied ✓';
      setTimeout(() => { button.textContent = original; }, 1500);
    } catch {
      window.prompt('Copy this value:', button.dataset.copy);
    }
  });
})();
