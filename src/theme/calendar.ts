/*
 * Day-by-day festive look from Drik Panchang's festival list (read by the backend for this
 * month and the next 13). Every event of a day is scored by how widely it is celebrated;
 * the most popular one sets the look and the greeting, the next ones are named under it.
 * Days with only minor or solemn observances keep the plain look.
 */
import { FESTIVALS, type Active, type Festival } from './festivals';

export interface DayEvent { day: string; name: string; kind?: string; detail?: string }

type Tpl = 'happy' | 'shubh' | 'vadhai' | 'name' | ((n: string) => string);
// [pattern, family, popularity 0–100, greeting]. First match wins; 0 = never themed
// (solemn days, ritual markers, eclipses).
const RULES: [RegExp, string, number, Tpl][] = [
  // Solemn / technical — never a celebration
  [/shraddha|pitru ?paksha|sarva pitru|panchaka|grahan|punyatithi|shaheed|martyrdom|manvadi|yuga diwas|^ishti$|^anvadhan$|begins \*north|ashtahnika|chaumasi|navapada oli|equinox|longest day|shortest day|bank'?s holiday|agni nakshatram|bhishma panchak|balidan|good friday|muharram|ashura|aids day|cancer day|no tobacco/i, '', 0, 'name'],
  // Diwali week
  [/^diwali$|deepavali|deepamalika|^lakshmi puja$|bandi chhor/i, 'diwali', 100, () => 'Shubh Deepavali'],
  [/dhanteras|dhanvantari/i, 'diwali', 90, 'shubh'],
  [/bhai(ya)? dooj|bhratri dwitiya|yama dwitiya|bhau beej/i, 'diwali', 88, () => 'Happy Bhai Dooj'],
  [/narak chaturdashi|choti diwali|chhoti diwali|kali chaudas/i, 'diwali', 85, () => 'Happy Choti Diwali'],
  [/govardhan|annakut|bali pratipada/i, 'diwali', 85, () => 'Shubh Govardhan Puja'],
  [/dev diwali/i, 'diwali', 75, 'happy'],
  [/karthigai deepam|tamil deepavali/i, 'diwali', 60, 'happy'],
  [/gujarati new year|nutan varsh/i, 'lakshmi', 65, () => 'Saal Mubarak — Happy Gujarati New Year'],
  [/chopda puja|sharda puja|labh panchami|labh chaturthi|yama deepam|kamala jayanti|lakshmi jayanti|lakshmi panchami|kojagara|varalakshmi|mahalakshmi vrat|siddhilakshmi|akshaya tritiya|dhan trayodashi/i, 'lakshmi', 45, 'shubh'],
  // Sikh & Punjab
  [/guru nanak (dev )?jayanti|guru nanak gurpurab|prakash (utsav|purab).*nanak/i, 'gurpurab', 98, () => 'Guru Nanak Dev Ji de Prakash Purab diyan lakh lakh vadhaiyan'],
  [/guru gobind singh/i, 'gurpurab', 95, () => 'Guru Gobind Singh Ji de Prakash Purab diyan lakh lakh vadhaiyan'],
  [/guru ravidas|guru har rai|guru har krishan|guru angad|guru amar das|guru ram das|hola mohalla|gurpurab|prakash purab/i, 'gurpurab', 75, 'vadhai'],
  [/baisakhi|vaisakhi/i, 'baisakhi', 95, () => 'Baisakhi diyan lakh lakh vadhaiyan'],
  [/lohri/i, 'lohri', 95, () => 'Lohri diyan lakh lakh vadhaiyan'],
  // Holi
  [/^holi$|dhulandi|dhuleti|rangwali holi|dol purnima|dol jatra/i, 'holi', 100, () => 'Happy Holi'],
  [/holika dahan|chhoti holi/i, 'holi', 85, () => 'Holika Dahan ki shubhkaamnayein'],
  [/ranga panchami|phulera dooj|holashtak/i, 'holi', 45, 'happy'],
  // Nation
  [/republic day/i, 'republic', 96, 'happy'],
  [/independence day/i, 'independence', 96, 'happy'],
  [/gandhi jayanti/i, 'republic', 80, 'name'],
  [/children'?s day/i, 'kids', 55, 'happy'],
  [/subhas chandra bose|ambedkar jayanti|shivaji maharaj|maharana pratap|vivekananda|national youth day|hindi diwas|sanskrit diwas|teachers'? day|engineer'?s day|visvesvaraya|tagore jayanti|rabindranath|nehru jayanti|sardar patel|rashtriya ekta/i, 'republic', 40, 'name'],
  // Navratri, Durga, Dussehra
  [/ganga (dussehra|saptami)|narmada jayanti/i, 'parv', 45, 'shubh'],
  [/vijayadashami|dussehra|dasara/i, 'navratri', 94, () => 'Happy Dussehra'],
  [/navratri begins|ghatasthapana|^chaitra navratri$|^sharad navratri$|^navratri/i, 'navratri', 85, () => 'Happy Navratri — Jai Mata Di'],
  [/durga ashtami|maha ?navami|sandhi puja|navpatrika|durga puja|akal bodhon|bilva nimantran|maha saptami|kanya pujan/i, 'navratri', 80, n => `Shubh ${n} — Jai Mata Di`],
  [/^kali puja$|shyama puja/i, 'navratri', 80, 'shubh'],
  [/masik durgashtami/i, 'navratri', 30, 'shubh'],
  [/jagaddhatri|chandika|kali jayanti|tara jayanti|bhairavi|chhinnamasta|bagalamukhi|matangi|dhumavati|bhuvaneshvari|kubjika|vindhyavasini|aparajita|lalita|shakambhari|annapurna|durga visarjan/i, 'navratri', 35, 'shubh'],
  [/ayudha puja|saraswati puja|vidyarambham|saraswati avahan|vasant panchami|basant panchami|saraswati jayanti/i, 'saraswati', 75, n => /vasant|basant/i.test(n) ? 'Happy Basant Panchami' : `Shubh ${n}`],
  [/saraswati/i, 'saraswati', 40, 'shubh'],
  // Ganesh
  [/^ganesh chaturthi$/i, 'ganesh', 92, () => 'Ganpati Bappa Morya'],
  [/gowri habba|gauriganesha/i, 'teej', 50, 'shubh'],
  [/ganesh visarjan|anant chaturdashi/i, 'ganesh', 75, () => 'Ganpati Bappa Morya, agle baras tu jaldi aa'],
  [/ganesha jayanti/i, 'ganesh', 60, 'shubh'],
  [/sankashti|sakat chauth|vighneshvara|sankata hara|chathurti|ganapati chaturthi|vinayaka chaturthi/i, 'ganesh', 35, 'shubh'],
  // Shiva
  [/maha shivaratri/i, 'shiva', 90, () => 'Har Har Mahadev — Happy Maha Shivaratri'],
  [/sawan shivaratri|shravan shivaratri/i, 'shiva', 65, () => 'Har Har Mahadev'],
  [/shravan somwar|masik shivaratri|pradosh|kalabhairav|arudra darshan|vishweshwara/i, 'shiva', 30, 'shubh'],
  [/kalashtami/i, 'shiva', 18, 'shubh'],
  // Krishna
  [/^krishna janmashtami$|^janmashtami$|dahi handi|ashtami rohini/i, 'janmashtami', 92, () => 'Happy Janmashtami — Jai Shri Krishna'],
  [/jagannath rath ?yatra/i, 'janmashtami', 70, 'happy'],
  [/radha ashtami|gita jayanti|gopashtami|govatsa|balarama|kansa vadh|radha kunda|chaitanya|meerabai|surdas/i, 'janmashtami', 42, 'shubh'],
  [/masik krishna janmashtami/i, 'janmashtami', 28, 'shubh'],
  // Ram & Hanuman
  [/^rama? navami$/i, 'ram', 85, () => 'Happy Ram Navami — Jai Shri Ram'],
  [/ramalala pratishtha/i, 'ram', 70, () => 'Jai Shri Ram'],
  [/sita navami|janaki jayanti|valmiki jayanti|tulsidas|shabari|kashi bharat milap|vivah panchami/i, 'ram', 45, 'shubh'],
  [/^hanuman (jayanti|janmotsava)$/i, 'hanuman', 80, () => 'Jai Bajrangbali — Happy Hanuman Jayanti'],
  [/hanuman/i, 'hanuman', 38, 'shubh'],
  // Vishnu, Ekadashi, Tulasi
  [/vaikuntha ekadashi|tulasi vivah|devutthana|dev uthani|prabodhini/i, 'vishnu', 60, 'shubh'],
  [/devshayani|nirjala|mokshada/i, 'vishnu', 50, 'shubh'],
  [/ekadashi/i, 'vishnu', 40, 'shubh'],
  [/vaikuntha chaturdashi|narasimha|vamana|varaha|matsya|kurma|parashurama|kalki|hayagriva|dattatreya|dwadashi|satyanarayan|ramanuja|madhvacharya|vallabhacharya|swaminarayan/i, 'vishnu', 32, 'shubh'],
  // Purnima & moon
  [/guru purnima|vyasa puja/i, 'purnima', 70, 'happy'],
  [/sharad purnima|kartika purnima|vat purnima|narali purnima|magha purnima|chitra pournami/i, 'purnima', 58, 'shubh'],
  [/purnima|pournami/i, 'purnima', 40, 'shubh'],
  [/chandra darshana?/i, 'purnima', 14, 'shubh'],
  // Rakhi, Teej, Karwa
  [/raksha bandhan|^rakhi$/i, 'rakhi', 92, () => 'Happy Raksha Bandhan'],
  [/karwa chauth|karva chauth/i, 'karwa', 85, 'happy'],
  [/ahoi ashtami/i, 'karwa', 55, 'shubh'],
  [/hariyali teej|hartalika teej|kajari teej|teej/i, 'teej', 70, 'happy'],
  [/vat savitri|gangaur|mangala gauri|jayaparvati|gauri vrat|parvati jayanti|gauri puja|jyeshtha gauri/i, 'teej', 40, 'shubh'],
  // Sun & harvest
  [/makara? sankranti|uttarayan/i, 'sankranti', 88, () => 'Happy Makar Sankranti'],
  [/pongal|bhogi|magh bihu|bihu/i, 'sankranti', 65, 'happy'],
  [/^chhath puja$/i, 'surya', 80, () => 'Chhath Puja ki shubhkaamnayein'],
  [/chhath/i, 'surya', 30, 'shubh'],
  [/ratha saptami|surya jayanti/i, 'surya', 50, 'shubh'],
  [/sankranti/i, 'surya', 28, 'shubh'],
  [/bhanu saptami/i, 'surya', 18, 'shubh'],
  [/solar new year|puthandu|vishu|pohela boishakha|ugadi|yugadi|gudi padwa|cheti chand|jhulelal|navreh|malayalam new year/i, 'parv', 65, 'happy'],
  [/onam/i, 'onam', 70, 'happy'],
  [/thrissur pooram|makaravilakku|mandala pooja|attukal pongal/i, 'onam', 30, 'shubh'],
  // Jain & Buddhist
  [/mahavir (swami )?jayanti/i, 'jain', 75, () => 'Happy Mahavir Jayanti'],
  [/paryushana|samvatsari|varshitapa|kevalagyan|rohini vrat/i, 'jain', 25, 'shubh'],
  [/buddha (jayanti|purnima)/i, 'buddha', 72, () => 'Happy Buddha Purnima'],
  // Others
  [/vishwakarma puja/i, 'parv', 60, 'shubh'],
  [/sheetala|shitala|basoda/i, 'parv', 35, 'shubh'],
  [/akshaya navami|amla navami/i, 'vishnu', 35, 'shubh'],
  [/nag(a|ula)? panch(a|ami)|nagula chavithi/i, 'parv', 45, 'shubh'],
  [/raksha|bhaiya/i, 'rakhi', 50, 'happy'],
  [/somavati amavasya|mauni amavas|hariyali amavasya|thai amavasai|aadi amavasai/i, 'amavasya', 25, 'shubh'],
  [/amavasya|amavas|amavasai/i, 'amavasya', 14, 'shubh'],
  [/valentine/i, 'modern', 55, 'happy'],
  [/mother'?s day|father'?s day|friendship day|women'?s day|yoga day/i, 'modern', 40, 'happy'],
  [/workers'? day|environment day|earth day|laughter day/i, 'modern', 28, 'happy'],
  [/jayanti|jayanthi/i, 'parv', 30, 'shubh'],
  [/skanda|soora samharam|thai pusam|panguni|vaikasi|subrahmanya|masik karthigai|aadi perukku/i, 'parv', 22, 'shubh'],
  [/shani (jayanti|trayodashi)/i, 'parv', 25, 'shubh'],
];

// Days Drik Panchang's Hindu calendar doesn't list (other faiths, the Gregorian year).
// Eid dates follow the moon — add each year's here.
const EXTRA: { day: string; name: string }[] = [
  ...[2026, 2027, 2028, 2029, 2030].flatMap(y => [
    { day: `${y}-12-24`, name: 'Christmas Eve' }, { day: `${y}-12-25`, name: 'Christmas' },
    { day: `${y}-12-31`, name: "New Year's Eve" }, { day: `${y}-01-01`, name: "New Year's Day" },
    { day: `${y}-01-26`, name: 'Republic Day' }, { day: `${y}-08-15`, name: 'Independence Day' }, { day: `${y}-10-02`, name: 'Gandhi Jayanti' },
    { day: `${y}-01-13`, name: 'Lohri' },
  ]),
  { day: '2027-03-10', name: 'Eid al-Fitr' }, { day: '2027-05-17', name: 'Eid al-Adha' }, { day: '2027-03-28', name: 'Easter' },
  { day: '2028-02-27', name: 'Eid al-Fitr' }, { day: '2028-05-05', name: 'Eid al-Adha' },
];
const EXTRA_RULES: [RegExp, string, number, Tpl][] = [
  [/^christmas$/i, 'christmas', 95, () => 'Merry Christmas'],
  [/christmas eve/i, 'christmas', 70, () => 'Merry Christmas'],
  [/new year'?s day/i, 'newyear', 95, () => 'Happy New Year'],
  [/new year'?s eve/i, 'newyear', 80, () => 'Happy New Year'],
  [/eid al-fitr|eid ul-fitr|ramzan id/i, 'eid', 90, () => 'Eid Mubarak'],
  [/eid al-adha|bakrid/i, 'eid', 85, () => 'Eid Mubarak'],
  [/milad|mawlid/i, 'eid', 55, () => 'Eid Milad-un-Nabi Mubarak'],
  [/easter/i, 'modern', 60, () => 'Happy Easter'],
];

// "Gauna / Vaishnava Devutthana Ekadashi" are the same day kept by other traditions.
const clean = (n: string) => n.replace(/\s*\*\S+/g, '').replace(/^(gauna|vaishnava)\s+/i, '').replace(/\s+/g, ' ').trim();

export interface Scored { name: string; family: string; score: number; greeting: string }
export function scoreEvent(raw: string): Scored {
  const name = clean(raw);
  // "Hanuman Jayanti *Telugu": the same festival on a regional date — a smaller look.
  const regional = /\*\s*(tamil|telugu|kannada|bengal|malayalam|samvat|south)/i.test(raw);
  for (const [re, family, score0, tpl] of [...EXTRA_RULES, ...RULES]) {
    if (!re.test(name)) continue;
    const score = regional ? Math.round(score0 / 2) : score0;
    const region = raw.match(/\*\s*([A-Za-z]+)/)?.[1];
    const greeting = regional ? `Shubh ${name}${region ? ` (${region})` : ''}` : typeof tpl === 'function' ? tpl(name)
      : tpl === 'happy' ? `Happy ${name}` : tpl === 'vadhai' ? `${name} diyan lakh lakh vadhaiyan` : tpl === 'shubh' ? `Shubh ${name}` : name;
    return { name, family, score, greeting };
  }
  return { name, family: 'parv', score: 12, greeting: `Shubh ${name}` };   // anything new on the list
}

const MIN_SCORE = 14;

function rank(events: DayEvent[]): Scored[] {
  const seen = new Set<string>();
  return events.map(e => scoreEvent(e.name))
    .filter(s => s.family && FESTIVALS[s.family] && s.score >= MIN_SCORE && !seen.has(s.name) && seen.add(s.name))
    .sort((a, b) => b.score - a.score || a.name.length - b.name.length);
}

/** Events for each day, Drik Panchang's plus the extra list. */
export function byDay(events: DayEvent[]): Map<string, DayEvent[]> {
  const m = new Map<string, DayEvent[]>();
  for (const e of [...events, ...EXTRA]) {
    if (!m.has(e.day)) m.set(e.day, []);
    m.get(e.day)!.push(e);
  }
  return m;
}

const shift = (ymd: string, d: number) => {
  const t = new Date(`${ymd}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
};

/**
 * The look for one day. The most popular event wins; a quiet day between two days of the
 * same big festival (Diwali week, Navratri) keeps that festival's look.
 */
const NAV_START = /navratri begins|ghatasthapana|^chaitra navratri$|^sharad navratri$/i;

export function lookFor(days: Map<string, DayEvent[]>, ymd: string): Active | null {
  const r = rank(days.get(ymd) ?? []);
  const top = r[0];
  // Navratri: nine days from Ghatasthapana; quieter days in between keep the Navratri look.
  if (!top || top.score < 60) {
    for (let back = 1; back <= 8; back++) {
      if ((days.get(shift(ymd, -back)) ?? []).some(e => NAV_START.test(clean(e.name)))) {
        const f = FESTIVALS.navratri;
        return { festival: f, greeting: `Happy Navratri — Day ${back + 1} · Jai Mata Di`, sub: top ? `Also today: ${top.name}` : 'from iTechArena', eventName: `Navratri Day ${back + 1}` };
      }
    }
  }
  if (!top || top.score < 30) {
    const prev = rank(days.get(shift(ymd, -1)) ?? [])[0], next = rank(days.get(shift(ymd, 1)) ?? [])[0];
    if (prev && next && prev.family === next.family && prev.score >= 80 && next.score >= 80) {
      const f = FESTIVALS[prev.family];
      return { festival: f, greeting: f.greeting, sub: top ? `Also today: ${top.name}` : f.sub };
    }
  }
  if (!top) return null;
  // Bhai Dooj after Holi is the same sibling day, but not in Diwali colours.
  const month = Number(ymd.slice(5, 7));
  const family = top.family === 'diwali' && (month < 10 || month > 11) ? 'rakhi' : top.family;
  const f: Festival = FESTIVALS[family];
  // Other events of the day worth naming — not more names for the same festival.
  const also = r.slice(1).filter(s => s.score >= 25 && s.family !== top.family).slice(0, 2).map(s => s.name);
  return { festival: f, greeting: top.greeting, sub: also.length ? `Also today: ${also.join(' · ')}` : 'from iTechArena', eventName: top.name };
}

/** The next themed day after `ymd` (for the sidebar). */
export function nextLook(days: Map<string, DayEvent[]>, ymd: string, within = 60): { day: string; active: Active } | null {
  for (let i = 1; i <= within; i++) {
    const d = shift(ymd, i);
    const a = lookFor(days, d);
    if (a && (rank(days.get(d) ?? [])[0]?.score ?? 0) >= 40) return { day: d, active: a };
  }
  return null;
}
