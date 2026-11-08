/*
 * Festive look (Diwali). Purely visual: a class on <html> switches the colours and
 * adds decorations; nothing about how the ERP works changes.
 *
 * DEFAULT decides the look for everyone who hasn't chosen one. Each person can still
 * switch it on/off from the sidebar (saved in this browser).
 * To bring back the old interface for everyone: set DEFAULT to 'classic'.
 */
export type Theme = 'diwali' | 'classic';
const DEFAULT: Theme = 'diwali';
const KEY = 'erp_theme';

export function getTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'diwali' || v === 'classic') return v;
  } catch { /* storage blocked */ }
  return DEFAULT;
}

export function applyTheme(t: Theme = getTheme()) {
  document.documentElement.classList.toggle('diwali', t === 'diwali');
}

export function setTheme(t: Theme) {
  try { localStorage.setItem(KEY, t); } catch { /* storage blocked */ }
  applyTheme(t);
  window.dispatchEvent(new CustomEvent('erp-theme', { detail: t }));
}
