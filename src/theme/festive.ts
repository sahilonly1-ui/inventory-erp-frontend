/*
 * Festive look. Purely visual: classes on <html> switch the colours and add
 * decorations; nothing about how the ERP works changes.
 *
 * Mode (each person chooses in the sidebar, saved in this browser):
 *   'auto'  — follows the festival calendar (festivals.ts): Diwali look in Diwali week,
 *             Holi colours on Holi, plain look on ordinary days. The default.
 *   'off'   — always the plain look.
 *   <key>   — one festival's look kept on (e.g. to preview it).
 * A link with ?festive=holi previews a look in that tab only.
 */
import { FESTIVALS, festivalOn, indiaDate, type Active } from './festivals';

export type Mode = 'auto' | 'off' | string;
const KEY = 'erp_festive_mode';

let preview: string | null = null;
try {
  const p = new URLSearchParams(window.location.search).get('festive');
  if (p && (p === 'off' || FESTIVALS[p])) preview = p;
} catch { /* no window */ }

export function getMode(): Mode {
  if (preview) return preview;
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'auto' || v === 'off' || (v && FESTIVALS[v])) return v;
  } catch { /* storage blocked */ }
  return 'auto';
}

/** What is showing right now for this mode. */
export function activeFor(mode: Mode = getMode(), ymd = indiaDate()): Active | null {
  if (mode === 'off') return null;
  if (mode === 'auto') return festivalOn(ymd);
  const f = FESTIVALS[mode];
  return f ? { festival: f, greeting: f.greeting, sub: f.sub } : null;
}

let applied = '';
export function applyTheme(mode: Mode = getMode()) {
  const a = activeFor(mode);
  const root = document.documentElement;
  const key = a?.festival.key ?? '';
  if (applied && applied !== key) root.classList.remove(`fx-${applied}`);
  root.classList.toggle('festive', !!a);
  // The Diwali look keeps its own class too (older styles and the Stock Report use it).
  root.classList.toggle('diwali', key === 'diwali');
  if (a) {
    root.classList.add(`fx-${key}`);
    for (const [k, v] of Object.entries(a.festival.vars)) root.style.setProperty(k, v);
  } else if (applied) {
    for (const k of Object.keys(FESTIVALS[applied]?.vars ?? {})) root.style.removeProperty(k);
  }
  applied = key;
  window.dispatchEvent(new CustomEvent('erp-theme', { detail: { mode, active: a } }));
}

export function setMode(m: Mode) {
  preview = null;
  try { localStorage.setItem(KEY, m); } catch { /* storage blocked */ }
  applyTheme(m);
}

// The ERP stays open for days: re-check the calendar every half hour (and when the tab
// comes back), so the look changes at midnight by itself.
let lastDay = indiaDate();
export function watchCalendar() {
  const check = () => {
    const d = indiaDate();
    if (d !== lastDay) { lastDay = d; applyTheme(); }
  };
  window.setInterval(check, 30 * 60_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
}
