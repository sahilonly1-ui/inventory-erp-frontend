/*
 * Festive look. Purely visual: classes on <html> switch the colours and add
 * decorations; nothing about how the ERP works changes.
 *
 * Mode (each person chooses in the sidebar, saved in this browser):
 *   'auto'  — day by day from Drik Panchang's festival list (read by the backend):
 *             the most popular event of the day sets the look; plain look on quiet days.
 *             Until that list has loaded, the built-in calendar (festivals.ts) is used.
 *   'off'   — always the plain look.
 *   <key>   — one look kept on (e.g. to preview it).
 * A link with ?festive=holi previews a look in that tab only; ?festive_day=2027-03-22
 * shows the look of another day.
 */
import { FESTIVALS, festivalOn, indiaDate, type Active } from './festivals';
import { byDay, lookFor, nextLook, type DayEvent } from './calendar';

export type Mode = 'auto' | 'off' | string;
const KEY = 'erp_festive_mode';
const CAL_KEY = 'erp_festive_cal_v1';
const API = ((import.meta.env.VITE_API_URL as string | undefined) ?? 'https://inventory-erp-backend-iplr.onrender.com/api/v1').replace(/\/$/, '');

let preview: string | null = null;
let previewDay: string | null = null;
try {
  const sp = new URLSearchParams(window.location.search);
  const p = sp.get('festive');
  if (p && (p === 'off' || p === 'auto' || FESTIVALS[p])) preview = p;
  const d = sp.get('festive_day');
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) previewDay = d;
} catch { /* no window */ }

const today = () => previewDay ?? indiaDate();

// ── Drik Panchang calendar (cached in this browser) ─────────────────────────
interface Cal { fetchedAt: number; from: string; to: string; events: DayEvent[] }
let cal: Cal | null = null;
let days: Map<string, DayEvent[]> | null = null;
try {
  const raw = localStorage.getItem(CAL_KEY);
  if (raw) { cal = JSON.parse(raw); days = byDay(cal!.events); }
} catch { cal = null; }

const shift = (ymd: string, n: number) => { const t = new Date(`${ymd}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const covers = (d: string) => !!cal && d >= cal.from && d <= cal.to && cal.events.length > 0;

/** Loads ~4 months of festival days from the ERP backend (fresh twice a day). */
export async function loadCalendar(force = false) {
  const d = today();
  if (!force && cal && covers(d) && covers(shift(d, 30)) && Date.now() - cal.fetchedAt < 12 * 3600_000) return;
  const from = shift(d, -3), to = shift(d, 120);
  try {
    const res = await fetch(`${API}/festive/events?from=${from}&to=${to}`, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return;
    const body = await res.json();
    const events: DayEvent[] = Array.isArray(body?.data) ? body.data : [];
    if (events.length < 10) return;   // the backend hasn't read Drik Panchang yet — keep what we have
    cal = { fetchedAt: Date.now(), from, to, events };
    days = byDay(events);
    try { localStorage.setItem(CAL_KEY, JSON.stringify(cal)); } catch { /* storage full/blocked */ }
    applyTheme();
  } catch { /* offline or backend asleep: the built-in calendar stays */ }
}

export function getMode(): Mode {
  if (preview) return preview;
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'auto' || v === 'off' || (v && FESTIVALS[v])) return v;
  } catch { /* storage blocked */ }
  return 'auto';
}

/** What is showing right now for this mode. */
export function activeFor(mode: Mode = getMode(), ymd = today()): Active | null {
  if (mode === 'off') return null;
  if (mode === 'auto') return days && covers(ymd) ? lookFor(days, ymd) : festivalOn(ymd);
  const f = FESTIVALS[mode];
  return f ? { festival: f, greeting: f.greeting, sub: f.sub } : null;
}

/** The next themed day (for the sidebar's "Next: …" line). */
export function upcoming(): { day: string; name: string; emoji: string } | null {
  if (!days || !cal) return null;
  const n = nextLook(days, today());
  return n ? { day: n.day, name: n.active.eventName ?? n.active.festival.name, emoji: n.active.festival.emoji } : null;
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

// The ERP stays open for days: re-check every half hour (and when the tab comes back),
// so the look changes at midnight by itself and the list stays fresh.
let lastDay = today();
export function watchCalendar() {
  void loadCalendar();
  const check = () => {
    const d = today();
    if (d !== lastDay) { lastDay = d; applyTheme(); }
    void loadCalendar();
  };
  window.setInterval(check, 30 * 60_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
}
