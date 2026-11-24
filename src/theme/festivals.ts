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

// Families used by the day-by-day calendar (Drik Panchang events): one look per kind of
// observance — the greeting names the day's own event.
const fam = (key: string, name: string, emoji: string, top: TopStyle, effect: Effect, colours: string[], p: Parameters<typeof pal>[0], greeting = name, sub = 'from iTechArena'): Festival =>
  ({ key, name, greeting, sub, emoji, top, effect, colours, vars: pal(p) });
Object.assign(FESTIVALS, {
  shiva: fam('shiva', 'Shiva', '🔱', 'bunting', 'spark', ['#93c5fd', '#e0f2fe', '#a5b4fc', '#ffffff'],
    { nav: ['#1e3a5f', '#172a46', '#0b1626'], accent: '#93c5fd', brand: '#2563eb', brandH: '#1d4ed8', brandL: '#eff6ff', brandM: '#93c5fd', btn: ['#3b82f6', '#1e40af'], page: '#f8fafd', surf2: '#eef4fb', surf3: '#dde9f7', bdr: '#d3e0ef', head: '#edf3fa', ink: '#0b1626', dot1: 'rgba(37,99,235,.06)', dot2: 'rgba(148,163,184,.08)', greet: '#1e3a5f' }, 'Har Har Mahadev'),
  vishnu: fam('vishnu', 'Vishnu', '🪷', 'toran', 'petals', ['#facc15', '#22c55e', '#f59e0b', '#fde68a'],
    { nav: ['#a16207', '#854d0e', '#422006'], accent: '#fde047', brand: '#ca8a04', brandH: '#a16207', brandL: '#fefce8', brandM: '#fde68a', btn: ['#eab308', '#ca8a04'], page: '#fffef5', surf2: '#fefbe6', surf3: '#fdf3c4', bdr: '#efe4b4', head: '#fdf8de', ink: '#422006', dot1: 'rgba(202,138,4,.08)', dot2: 'rgba(34,197,94,.06)', greet: '#854d0e' }),
  purnima: fam('purnima', 'Purnima', '🌕', 'bunting', 'spark', ['#f8fafc', '#e2e8f0', '#fde68a', '#c7d2fe'],
    { nav: ['#312e81', '#1e1b4b', '#0f0c29'], accent: '#fde68a', brand: '#6366f1', brandH: '#4f46e5', brandL: '#eef2ff', brandM: '#c7d2fe', btn: ['#818cf8', '#4f46e5'], page: '#fafaff', surf2: '#f1f2fe', surf3: '#e2e5fd', bdr: '#dcdff5', head: '#f0f1fd', ink: '#1e1b4b', dot1: 'rgba(99,102,241,.06)', dot2: 'rgba(253,230,138,.12)', greet: '#312e81' }),
  amavasya: fam('amavasya', 'Amavasya', '✨', 'bunting', 'spark', ['#e0e7ff', '#a5b4fc', '#fef3c7', '#c4b5fd'],
    { nav: ['#1e1b3a', '#14122b', '#08071a'], accent: '#c4b5fd', brand: '#6d28d9', brandH: '#5b21b6', brandL: '#f5f3ff', brandM: '#c4b5fd', btn: ['#7c3aed', '#4c1d95'], page: '#fbfaff', surf2: '#f3f1fd', surf3: '#e6e2fb', bdr: '#dedaf2', head: '#f1effc', ink: '#14122b', dot1: 'rgba(109,40,217,.05)', dot2: 'rgba(196,181,253,.1)', greet: '#2e1065' }),
  surya: fam('surya', 'Surya', '☀️', 'bunting', 'rise', ['#fbbf24', '#f97316', '#fde047', '#fb923c'],
    { nav: ['#c2410c', '#9a3412', '#431407'], accent: '#fde047', brand: '#ea580c', brandH: '#c2410c', brandL: '#fff7ed', brandM: '#fdba74', btn: ['#f59e0b', '#ea580c'], page: '#fffbf3', surf2: '#fff4e3', surf3: '#fee6c2', bdr: '#f5dcb7', head: '#fff1dd', ink: '#431407', dot1: 'rgba(245,158,11,.09)', dot2: 'rgba(234,88,12,.06)', greet: '#9a3412' }),
  sankranti: fam('sankranti', 'Makar Sankranti', '🪁', 'bunting', 'confetti', ['#f43f5e', '#0ea5e9', '#facc15', '#22c55e', '#a855f7'],
    { nav: ['#0369a1', '#075985', '#082f49'], accent: '#facc15', brand: '#0284c7', brandH: '#0369a1', brandL: '#f0f9ff', brandM: '#7dd3fc', btn: ['#f59e0b', '#0284c7'], page: '#f7fcff', surf2: '#ecf7fe', surf3: '#d7eefc', bdr: '#cde4f3', head: '#eaf6fd', ink: '#082f49', dot1: 'rgba(2,132,199,.07)', dot2: 'rgba(250,204,21,.09)', greet: '#075985' }, 'Happy Makar Sankranti'),
  hanuman: fam('hanuman', 'Hanuman', '🚩', 'toran', 'petals', ['#f97316', '#dc2626', '#fbbf24', '#fb923c'],
    { nav: ['#c2410c', '#9a3412', '#4a1406'], accent: '#fbbf24', brand: '#ea580c', brandH: '#c2410c', brandL: '#fff4ec', brandM: '#fdba74', btn: ['#f97316', '#c2410c'], page: '#fffaf5', surf2: '#fff1e6', surf3: '#fee0c8', bdr: '#f4d4bb', head: '#ffeedf', ink: '#4a1406', dot1: 'rgba(234,88,12,.08)', dot2: 'rgba(220,38,38,.05)', greet: '#9a3412' }, 'Jai Bajrangbali'),
  ram: fam('ram', 'Shri Ram', '🏹', 'toran', 'petals', ['#f59e0b', '#f97316', '#fde047', '#16a34a'],
    { nav: ['#b45309', '#92400e', '#451a03'], accent: '#fde047', brand: '#d97706', brandH: '#b45309', brandL: '#fffbeb', brandM: '#fcd34d', btn: ['#f59e0b', '#d97706'], page: '#fffcf4', surf2: '#fef7e4', surf3: '#fdecc0', bdr: '#f2e0b3', head: '#fef4da', ink: '#451a03', dot1: 'rgba(217,119,6,.08)', dot2: 'rgba(22,163,74,.05)', greet: '#92400e' }, 'Jai Shri Ram'),
  saraswati: fam('saraswati', 'Saraswati', '🌼', 'bunting', 'petals', ['#facc15', '#fde047', '#ffffff', '#fbbf24'],
    { nav: ['#a16207', '#854d0e', '#3f2405'], accent: '#fef08a', brand: '#ca8a04', brandH: '#a16207', brandL: '#fefce8', brandM: '#fef08a', btn: ['#facc15', '#ca8a04'], page: '#fffef2', surf2: '#fefbdf', surf3: '#fdf4b8', bdr: '#efe6a9', head: '#fdf9d6', ink: '#3f2405', dot1: 'rgba(250,204,21,.12)', dot2: 'rgba(202,138,4,.06)', greet: '#854d0e' }),
  jain: fam('jain', 'Jain', '🙏', 'bunting', 'petals', ['#f59e0b', '#ffffff', '#16a34a', '#dc2626'],
    { nav: ['#7c2d12', '#57260c', '#2a1206'], accent: '#fbbf24', brand: '#d97706', brandH: '#b45309', brandL: '#fffbeb', brandM: '#fcd34d', btn: ['#f59e0b', '#b45309'], page: '#fffdf8', surf2: '#fdf8ee', surf3: '#f8ecd5', bdr: '#eee0c6', head: '#fbf5e8', ink: '#2a1206', dot1: 'rgba(217,119,6,.06)', dot2: 'rgba(22,163,74,.05)', greet: '#7c2d12' }),
  buddha: fam('buddha', 'Buddha', '☸️', 'bunting', 'petals', ['#f59e0b', '#dc2626', '#fde047', '#ffffff'],
    { nav: ['#7f1d1d', '#5f1414', '#2b0808'], accent: '#fbbf24', brand: '#d97706', brandH: '#b45309', brandL: '#fffbeb', brandM: '#fcd34d', btn: ['#f59e0b', '#b91c1c'], page: '#fffcf6', surf2: '#fdf5ea', surf3: '#f9e6cf', bdr: '#efdcc4', head: '#fcf2e4', ink: '#2b0808', dot1: 'rgba(217,119,6,.07)', dot2: 'rgba(185,28,28,.04)', greet: '#7f1d1d' }),
  lakshmi: fam('lakshmi', 'Lakshmi', '🪙', 'toran', 'spark', ['#fbbf24', '#f472b6', '#fde68a', '#f59e0b'],
    { nav: ['#9d174d', '#6b0f35', '#33061a'], accent: '#fbbf24', brand: '#db2777', brandH: '#be185d', brandL: '#fdf2f8', brandM: '#f9a8d4', btn: ['#f59e0b', '#db2777'], page: '#fffafb', surf2: '#fdf1f5', surf3: '#fbe1eb', bdr: '#f2d4df', head: '#fdeef3', ink: '#33061a', dot1: 'rgba(219,39,119,.06)', dot2: 'rgba(251,191,36,.09)', greet: '#9d174d' }),
  teej: fam('teej', 'Teej', '🌿', 'bunting', 'petals', ['#22c55e', '#dc2626', '#facc15', '#16a34a'],
    { nav: ['#15803d', '#166534', '#052e16'], accent: '#fca5a5', brand: '#16a34a', brandH: '#15803d', brandL: '#f0fdf4', brandM: '#86efac', btn: ['#22c55e', '#dc2626'], page: '#f8fdf9', surf2: '#eefaf1', surf3: '#d8f2df', bdr: '#cfe7d6', head: '#ecf8ef', ink: '#052e16', dot1: 'rgba(22,163,74,.07)', dot2: 'rgba(220,38,38,.05)', greet: '#166534' }),
  karwa: fam('karwa', 'Karwa Chauth', '🌙', 'bunting', 'spark', ['#dc2626', '#fbbf24', '#f472b6', '#ffffff'],
    { nav: ['#991b1b', '#7f1d1d', '#3b0a0a'], accent: '#fbbf24', brand: '#dc2626', brandH: '#b91c1c', brandL: '#fef2f2', brandM: '#fca5a5', btn: ['#ef4444', '#b91c1c'], page: '#fffafa', surf2: '#fef1f1', surf3: '#fde0e0', bdr: '#f4d2d2', head: '#feeeee', ink: '#3b0a0a', dot1: 'rgba(220,38,38,.06)', dot2: 'rgba(251,191,36,.08)', greet: '#991b1b' }),
  onam: fam('onam', 'Onam', '🌸', 'bunting', 'petals', ['#f59e0b', '#16a34a', '#fde047', '#f97316'],
    { nav: ['#3f6212', '#365314', '#1a2e05'], accent: '#fde047', brand: '#65a30d', brandH: '#4d7c0f', brandL: '#f7fee7', brandM: '#bef264', btn: ['#f59e0b', '#65a30d'], page: '#fffef6', surf2: '#f9fbe9', surf3: '#eef5cc', bdr: '#e4ebc0', head: '#f6f9e0', ink: '#1a2e05', dot1: 'rgba(101,163,13,.07)', dot2: 'rgba(245,158,11,.08)', greet: '#365314' }),
  kids: fam('kids', "Children's Day", '🎈', 'bunting', 'confetti', ['#f43f5e', '#3b82f6', '#facc15', '#22c55e', '#a855f7'],
    { nav: ['#2563eb', '#1d4ed8', '#1e3a8a'], accent: '#facc15', brand: '#2563eb', brandH: '#1d4ed8', brandL: '#eff6ff', brandM: '#93c5fd', btn: ['#f43f5e', '#f59e0b'], page: '#fbfdff', surf2: '#f0f6ff', surf3: '#dfeafe', bdr: '#d6e2f5', head: '#eef4fe', ink: '#172554', dot1: 'rgba(244,63,94,.06)', dot2: 'rgba(59,130,246,.06)', greet: '#1d4ed8' }),
  modern: fam('modern', 'Special Day', '💐', 'bunting', 'confetti', ['#f472b6', '#fb7185', '#c084fc', '#fda4af'],
    { nav: ['#be185d', '#9d174d', '#500724'], accent: '#fbcfe8', brand: '#db2777', brandH: '#be185d', brandL: '#fdf2f8', brandM: '#f9a8d4', btn: ['#f472b6', '#db2777'], page: '#fffafc', surf2: '#fdf1f6', surf3: '#fbe1ec', bdr: '#f2d3e0', head: '#fdeef4', ink: '#500724', dot1: 'rgba(219,39,119,.06)', dot2: 'rgba(192,132,252,.07)', greet: '#9d174d' }),
  parv: fam('parv', 'Parv', '🌼', 'toran', 'petals', ['#f59e0b', '#f97316', '#fde047', '#dc2626'],
    { nav: ['#9a3412', '#7c2d12', '#3b1206'], accent: '#fbbf24', brand: '#ea580c', brandH: '#c2410c', brandL: '#fff7ed', brandM: '#fdba74', btn: ['#f59e0b', '#ea580c'], page: '#fffbf5', surf2: '#fff3e6', surf3: '#fde4c9', bdr: '#f3d8bd', head: '#fff0e0', ink: '#3b1206', dot1: 'rgba(234,88,12,.07)', dot2: 'rgba(245,158,11,.07)', greet: '#7c2d12' }),
});


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

export interface Active { festival: Festival; greeting: string; sub?: string; eventName?: string }

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
