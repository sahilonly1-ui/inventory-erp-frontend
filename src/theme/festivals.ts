/*
 * Festival calendar for the ERP's look. Each festival has its colours, decorations and
 * greeting; the calendar says which days it is on (Indian time, both days included).
 *
 * Fixed-date festivals (New Year, Lohri, Republic Day, Baisakhi, Independence Day,
 * Christmas) repeat every year by themselves. Festivals that follow the lunar calendar
 * move every year, so their dates are listed per year in LUNAR below — add the next
 * year's dates there once a year.
 */

export type Effect = 'spark' | 'snow' | 'confetti' | 'rise' | 'petals' | 'none';
export type TopStyle = 'toran' | 'bunting' | 'tricolour';

export interface Festival {
  key: string;
  name: string;
  greeting: string;
  sub?: string;            // small line after the greeting
  emoji: string;           // either side of the greeting and in the corners
  top: TopStyle;
  effect: Effect;
  colours: string[];       // lights / bunting / confetti
  vars: Record<string, string>;
}

// Shared shape of a palette: sidebar gradient, accent (gold), buttons, page.
const pal = (p: {
  nav: [string, string, string]; accent: string; brand: string; brandH: string; brandL: string; brandM: string;
  btn: [string, string]; page: string; surf2: string; surf3: string; bdr: string; head: string; ink: string; dot1: string; dot2: string; greet: string;
}) => ({
  '--brand': p.brand, '--brand-h': p.brandH, '--brand-l': p.brandL, '--brand-m': p.brandM,
  '--fx-accent': p.accent, '--fx-nav1': p.nav[0], '--fx-nav2': p.nav[1], '--fx-nav3': p.nav[2],
  '--fx-btn1': p.btn[0], '--fx-btn2': p.btn[1], '--fx-page': p.page, '--surf-1': p.page, '--surf-2': p.surf2, '--surf-3': p.surf3,
  '--bdr': p.bdr, '--bdr-s': p.surf2, '--bdr-h': p.bdr, '--fx-head': p.head, '--fx-ink': p.ink, '--fx-dot1': p.dot1, '--fx-dot2': p.dot2,
  '--fx-greet': p.greet, '--nav-ink': '#fffaf0', '--nav-faint': p.accent, '--nav-line': 'rgba(255,255,255,.18)',
});

export const FESTIVALS: Record<string, Festival> = {
  diwali: {
    key: 'diwali', name: 'Diwali', greeting: 'Shubh Deepavali', sub: 'from iTechArena', emoji: '🪔', top: 'toran', effect: 'spark',
    colours: ['#ffd23f', '#ff6b35', '#f72585', '#4cc9f0'],
    vars: pal({ nav: ['#7a1235', '#4c0c3c', '#2a0838'], accent: '#f5b301', brand: '#e8590c', brandH: '#c2410c', brandL: '#fff1e0', brandM: '#fdba74',
      btn: ['#f59e0b', '#e8590c'], page: '#fffaf2', surf2: '#fff3e3', surf3: '#fde7c8', bdr: '#f3dcc0', head: '#fff3e3', ink: '#3b0a1f', dot1: 'rgba(232,89,12,.07)', dot2: 'rgba(183,121,31,.07)', greet: '#7a1235' }),
  },
  gurpurab: {
    key: 'gurpurab', name: 'Gurpurab', greeting: 'Prakash Purab diyan lakh lakh vadhaiyan', sub: 'from iTechArena', emoji: '☬', top: 'bunting', effect: 'petals',
    colours: ['#ff8f00', '#1e3a8a', '#f5b301', '#ffffff'],
    vars: pal({ nav: ['#1e3a8a', '#172554', '#0b1437'], accent: '#ff9f1c', brand: '#ef7d00', brandH: '#c2410c', brandL: '#fff3e0', brandM: '#fdba74',
      btn: ['#ff9f1c', '#ef7d00'], page: '#fffbf3', surf2: '#fff4e2', surf3: '#fde8c6', bdr: '#f1dcbc', head: '#fff1dc', ink: '#1e1b4b', dot1: 'rgba(239,125,0,.07)', dot2: 'rgba(30,58,138,.06)', greet: '#1e3a8a' }),
  },
  holi: {
    key: 'holi', name: 'Holi', greeting: 'Happy Holi', sub: 'rangon bhari shubhkaamnayein', emoji: '🎨', top: 'bunting', effect: 'confetti',
    colours: ['#ec4899', '#a855f7', '#22c55e', '#facc15', '#3b82f6', '#f97316'],
    vars: pal({ nav: ['#be185d', '#7e22ce', '#4c1d95'], accent: '#facc15', brand: '#db2777', brandH: '#be185d', brandL: '#fdf2f8', brandM: '#f9a8d4',
      btn: ['#ec4899', '#a855f7'], page: '#fffbfe', surf2: '#fdf2f8', surf3: '#fce7f3', bdr: '#f5d0e6', head: '#fdf0f7', ink: '#3b0764', dot1: 'rgba(236,72,153,.08)', dot2: 'rgba(34,197,94,.08)', greet: '#7e22ce' }),
  },
  lohri: {
    key: 'lohri', name: 'Lohri', greeting: 'Lohri diyan lakh lakh vadhaiyan', sub: 'from iTechArena', emoji: '🔥', top: 'bunting', effect: 'rise',
    colours: ['#f59e0b', '#ef4444', '#fbbf24', '#fb923c'],
    vars: pal({ nav: ['#7c2d12', '#5a1a0b', '#2f0d05'], accent: '#fbbf24', brand: '#ea580c', brandH: '#c2410c', brandL: '#fff4e6', brandM: '#fdba74',
      btn: ['#f59e0b', '#dc2626'], page: '#fffaf4', surf2: '#fff2e2', surf3: '#fde4c4', bdr: '#f2d8b8', head: '#fff0dc', ink: '#431407', dot1: 'rgba(234,88,12,.07)', dot2: 'rgba(220,38,38,.05)', greet: '#7c2d12' }),
  },
  republic: {
    key: 'republic', name: 'Republic Day', greeting: 'Happy Republic Day', sub: 'Jai Hind', emoji: '🇮🇳', top: 'tricolour', effect: 'confetti',
    colours: ['#ff9933', '#ffffff', '#138808', '#000080'],
    vars: pal({ nav: ['#0b2a6f', '#081f52', '#05153a'], accent: '#ff9933', brand: '#f47c20', brandH: '#c2410c', brandL: '#fff4e8', brandM: '#fdba74',
      btn: ['#ff9933', '#f47c20'], page: '#fbfdfb', surf2: '#f2f8f1', surf3: '#e4f1e2', bdr: '#dbe8d8', head: '#f1f7ef', ink: '#0b2a6f', dot1: 'rgba(255,153,51,.08)', dot2: 'rgba(19,136,8,.07)', greet: '#0b2a6f' }),
  },
  baisakhi: {
    key: 'baisakhi', name: 'Baisakhi', greeting: 'Baisakhi diyan lakh lakh vadhaiyan', sub: 'from iTechArena', emoji: '🌾', top: 'bunting', effect: 'petals',
    colours: ['#eab308', '#16a34a', '#f97316', '#facc15'],
    vars: pal({ nav: ['#166534', '#14532d', '#0a2e18'], accent: '#facc15', brand: '#d97706', brandH: '#b45309', brandL: '#fffbeb', brandM: '#fcd34d',
      btn: ['#eab308', '#d97706'], page: '#fffdf3', surf2: '#fef9e3', surf3: '#fdf0c2', bdr: '#efe2b4', head: '#fdf6dc', ink: '#14532d', dot1: 'rgba(234,179,8,.09)', dot2: 'rgba(22,163,74,.06)', greet: '#166534' }),
  },
  eid: {
    key: 'eid', name: 'Eid', greeting: 'Eid Mubarak', sub: 'from iTechArena', emoji: '🌙', top: 'bunting', effect: 'spark',
    colours: ['#fbbf24', '#10b981', '#ffffff', '#fde68a'],
    vars: pal({ nav: ['#065f46', '#064e3b', '#022c22'], accent: '#fbbf24', brand: '#059669', brandH: '#047857', brandL: '#ecfdf5', brandM: '#6ee7b7',
      btn: ['#10b981', '#047857'], page: '#f8fdfa', surf2: '#effaf4', surf3: '#d9f3e6', bdr: '#cfe9dc', head: '#ecf8f1', ink: '#022c22', dot1: 'rgba(5,150,105,.07)', dot2: 'rgba(251,191,36,.08)', greet: '#065f46' }),
  },
  rakhi: {
    key: 'rakhi', name: 'Raksha Bandhan', greeting: 'Happy Raksha Bandhan', sub: 'from iTechArena', emoji: '🎀', top: 'bunting', effect: 'petals',
    colours: ['#f472b6', '#f59e0b', '#fb7185', '#fde047'],
    vars: pal({ nav: ['#9d174d', '#701a40', '#3f0a24'], accent: '#fbbf24', brand: '#e11d74', brandH: '#be185d', brandL: '#fff0f6', brandM: '#f9a8d4',
      btn: ['#f472b6', '#e11d74'], page: '#fffafc', surf2: '#fff0f6', surf3: '#fde1ee', bdr: '#f5d3e3', head: '#fdeef5', ink: '#500724', dot1: 'rgba(225,29,116,.07)', dot2: 'rgba(245,158,11,.07)', greet: '#9d174d' }),
  },
  janmashtami: {
    key: 'janmashtami', name: 'Janmashtami', greeting: 'Happy Janmashtami', sub: 'Jai Shri Krishna', emoji: '🦚', top: 'bunting', effect: 'petals',
    colours: ['#0ea5e9', '#14b8a6', '#facc15', '#6366f1'],
    vars: pal({ nav: ['#0e7490', '#1e40af', '#172554'], accent: '#facc15', brand: '#0891b2', brandH: '#0e7490', brandL: '#ecfeff', brandM: '#67e8f9',
      btn: ['#06b6d4', '#2563eb'], page: '#f8fdff', surf2: '#eefaff', surf3: '#d8f2fb', bdr: '#cde8f2', head: '#ecf8fd', ink: '#082f49', dot1: 'rgba(8,145,178,.07)', dot2: 'rgba(250,204,21,.08)', greet: '#0e7490' }),
  },
  ganesh: {
    key: 'ganesh', name: 'Ganesh Chaturthi', greeting: 'Ganpati Bappa Morya', sub: 'from iTechArena', emoji: '🌺', top: 'toran', effect: 'petals',
    colours: ['#f97316', '#dc2626', '#facc15', '#fb923c'],
    vars: pal({ nav: ['#991b1b', '#7c2d12', '#3f0f07'], accent: '#fbbf24', brand: '#ea580c', brandH: '#c2410c', brandL: '#fff4e6', brandM: '#fdba74',
      btn: ['#f97316', '#dc2626'], page: '#fffaf4', surf2: '#fff2e4', surf3: '#fde3c6', bdr: '#f2d6b8', head: '#fff0de', ink: '#450a0a', dot1: 'rgba(234,88,12,.07)', dot2: 'rgba(220,38,38,.05)', greet: '#991b1b' }),
  },
  navratri: {
    key: 'navratri', name: 'Navratri', greeting: 'Happy Navratri', sub: 'Jai Mata Di', emoji: '🪔', top: 'toran', effect: 'petals',
    colours: ['#dc2626', '#f97316', '#facc15', '#db2777'],
    vars: pal({ nav: ['#b91c1c', '#831843', '#4a0a26'], accent: '#facc15', brand: '#dc2626', brandH: '#b91c1c', brandL: '#fff1f1', brandM: '#fca5a5',
      btn: ['#f97316', '#dc2626'], page: '#fffaf8', surf2: '#fff1ee', surf3: '#fde0da', bdr: '#f3d2cb', head: '#ffeeea', ink: '#450a0a', dot1: 'rgba(220,38,38,.06)', dot2: 'rgba(250,204,21,.08)', greet: '#b91c1c' }),
  },
  independence: {
    key: 'independence', name: 'Independence Day', greeting: 'Happy Independence Day', sub: 'Jai Hind', emoji: '🇮🇳', top: 'tricolour', effect: 'confetti',
    colours: ['#ff9933', '#ffffff', '#138808', '#000080'],
    vars: {} as Record<string, string>,   // same as Republic Day (filled below)
  },
  christmas: {
    key: 'christmas', name: 'Christmas', greeting: 'Merry Christmas', sub: 'from iTechArena', emoji: '🎄', top: 'bunting', effect: 'snow',
    colours: ['#dc2626', '#16a34a', '#facc15', '#ffffff'],
    vars: pal({ nav: ['#14532d', '#0f3d22', '#062014'], accent: '#facc15', brand: '#dc2626', brandH: '#b91c1c', brandL: '#fef2f2', brandM: '#fca5a5',
      btn: ['#ef4444', '#b91c1c'], page: '#fbfdfb', surf2: '#f1f8f3', surf3: '#dff0e4', bdr: '#d6e9dc', head: '#eef7f1', ink: '#062014', dot1: 'rgba(220,38,38,.06)', dot2: 'rgba(22,163,74,.06)', greet: '#14532d' }),
  },
  newyear: {
    key: 'newyear', name: 'New Year', greeting: 'Happy New Year', sub: 'from iTechArena', emoji: '🎆', top: 'bunting', effect: 'confetti',
    colours: ['#facc15', '#a855f7', '#ec4899', '#38bdf8'],
    vars: pal({ nav: ['#312e81', '#1e1b4b', '#0b0a24'], accent: '#facc15', brand: '#7c3aed', brandH: '#6d28d9', brandL: '#f5f3ff', brandM: '#c4b5fd',
      btn: ['#8b5cf6', '#db2777'], page: '#fbfaff', surf2: '#f4f2ff', surf3: '#e7e3fe', bdr: '#e0dbf6', head: '#f2efff', ink: '#1e1b4b', dot1: 'rgba(124,58,237,.06)', dot2: 'rgba(250,204,21,.08)', greet: '#312e81' }),
  },
};
FESTIVALS.independence.vars = FESTIVALS.republic.vars;

/** One stretch of days for a festival; `greeting` replaces the festival's on those days. */
interface Span { key: string; from: string; to: string; greeting?: string; sub?: string }

// Lunar-calendar festivals (dates move every year). Add next year's here.
const LUNAR: Span[] = [
  // 2026
  { key: 'holi', from: '2026-03-03', to: '2026-03-05' },
  { key: 'eid', from: '2026-03-20', to: '2026-03-22' },
  { key: 'rakhi', from: '2026-08-27', to: '2026-08-28' },
  { key: 'janmashtami', from: '2026-09-03', to: '2026-09-04' },
  { key: 'ganesh', from: '2026-09-13', to: '2026-09-15' },
  { key: 'navratri', from: '2026-10-11', to: '2026-10-19' },
  { key: 'navratri', from: '2026-10-20', to: '2026-10-20', greeting: 'Happy Dussehra', sub: 'from iTechArena' },
  { key: 'diwali', from: '2026-11-05', to: '2026-11-11' },
  { key: 'gurpurab', from: '2026-11-23', to: '2026-11-25', greeting: 'Guru Nanak Dev Ji de Prakash Purab diyan lakh lakh vadhaiyan' },
  // 2027
  { key: 'gurpurab', from: '2027-01-15', to: '2027-01-15', greeting: 'Guru Gobind Singh Ji de Prakash Purab diyan lakh lakh vadhaiyan' },
  { key: 'eid', from: '2027-03-09', to: '2027-03-11' },
  { key: 'holi', from: '2027-03-20', to: '2027-03-23' },
  { key: 'rakhi', from: '2027-08-16', to: '2027-08-17' },
  { key: 'janmashtami', from: '2027-08-24', to: '2027-08-25' },
  { key: 'ganesh', from: '2027-09-03', to: '2027-09-05' },
  { key: 'navratri', from: '2027-09-30', to: '2027-10-08' },
  { key: 'navratri', from: '2027-10-09', to: '2027-10-09', greeting: 'Happy Dussehra', sub: 'from iTechArena' },
  { key: 'diwali', from: '2027-10-26', to: '2027-11-01' },
  { key: 'gurpurab', from: '2027-11-13', to: '2027-11-14', greeting: 'Guru Nanak Dev Ji de Prakash Purab diyan lakh lakh vadhaiyan' },
];

// Same dates every year (month-day).
const FIXED: { key: string; from: string; to: string }[] = [
  { key: 'newyear', from: '01-01', to: '01-01' },
  { key: 'lohri', from: '01-12', to: '01-14' },
  { key: 'republic', from: '01-25', to: '01-26' },
  { key: 'baisakhi', from: '04-13', to: '04-14' },
  { key: 'independence', from: '08-14', to: '08-15' },
  { key: 'christmas', from: '12-23', to: '12-26' },
  { key: 'newyear', from: '12-31', to: '12-31' },
];

/** Today's date in India as YYYY-MM-DD. */
export function indiaDate(d = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch {
    return new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
  }
}

export interface Active { festival: Festival; greeting: string; sub?: string }

const withSpan = (f: Festival, s?: Partial<Span>): Active => ({ festival: f, greeting: s?.greeting ?? f.greeting, sub: s?.sub ?? f.sub });

/** The festival on a given day (lunar dates win over fixed ones), or null. */
export function festivalOn(ymd: string = indiaDate()): Active | null {
  const lunar = LUNAR.filter(s => ymd >= s.from && ymd <= s.to && FESTIVALS[s.key]);
  if (lunar.length) {
    const s = lunar.sort((a, b) => (a.from > b.from ? -1 : 1))[0];   // the most specific (latest-starting) stretch
    return withSpan(FESTIVALS[s.key], s);
  }
  const md = ymd.slice(5);
  const f = FIXED.find(s => md >= s.from && md <= s.to);
  return f ? withSpan(FESTIVALS[f.key]) : null;
}

/** The next festival after a day (for the sidebar: "Next: Christmas, 23 Dec"). */
export function nextFestival(ymd: string = indiaDate()): { festival: Festival; from: string } | null {
  const year = Number(ymd.slice(0, 4));
  const all = [
    ...LUNAR.map(s => ({ key: s.key, from: s.from })),
    ...[year, year + 1].flatMap(y => FIXED.map(s => ({ key: s.key, from: `${y}-${s.from}` }))),
  ].filter(s => s.from > ymd && FESTIVALS[s.key]).sort((a, b) => (a.from < b.from ? -1 : 1));
  return all[0] ? { festival: FESTIVALS[all[0].key], from: all[0].from } : null;
}

/** Whether the lunar calendar still has dates this far ahead (to warn when it runs out). */
export const lunarCalendarEnds = () => LUNAR.reduce((m, s) => (s.to > m ? s.to : m), '');
