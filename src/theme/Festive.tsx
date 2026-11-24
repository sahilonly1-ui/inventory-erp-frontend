import { useEffect, useState, type CSSProperties } from 'react';
import { activeFor, getMode, setMode, upcoming, type Mode } from './festive';
import { FESTIVALS, nextFestival, type Active } from './festivals';

/** Current mode and the festival showing, kept in sync when either changes. */
export function useFestive(): { mode: Mode; active: Active | null } {
  const [s, setS] = useState(() => ({ mode: getMode(), active: activeFor() }));
  useEffect(() => {
    const on = (e: Event) => setS((e as CustomEvent).detail);
    window.addEventListener('erp-theme', on);
    return () => window.removeEventListener('erp-theme', on);
  }, []);
  return s;
}

/** Decoration across the top of every page: toran / bunting / tricolour, lights, greeting. */
export function FestiveTop() {
  const { active } = useFestive();
  if (!active) return null;
  const f = active.festival;
  return (
    <div className={`dw-top fx-top-${f.top}`} aria-hidden="true">
      {f.top === 'toran' && <div className="dw-toran" />}
      {f.top === 'tricolour' && <div className="fx-tricolour"><i /><i /><i /></div>}
      {f.top === 'bunting' && (
        <div className="fx-bunting">
          {Array.from({ length: 40 }, (_, i) => <i key={i} style={{ borderTopColor: f.colours[i % f.colours.length] }} />)}
        </div>
      )}
      {f.top !== 'tricolour' && (
        <div className="dw-lights">
          {Array.from({ length: 28 }, (_, i) => {
            const c = f.colours[i % f.colours.length];
            return <i key={i} style={{ background: c, boxShadow: `0 0 8px ${c}`, animationDelay: `${(i % 7) * 0.35}s` }} />;
          })}
        </div>
      )}
      <div className="dw-greet">
        <span className="fx-emoji">{f.emoji}</span> {active.greeting}
        {active.sub && <span className="dw-sub"> {active.sub}</span>} <span className="fx-emoji">{f.emoji}</span>
      </div>
    </div>
  );
}

/** Corner decorations and a gentle effect — never in the way of clicks. */
export function FestiveAmbient() {
  const { active } = useFestive();
  if (!active) return null;
  const f = active.festival;
  const n = f.effect === 'snow' ? 18 : f.effect === 'none' ? 0 : 12;
  return (
    <div className={`dw-ambient fx-fx-${f.effect}`} aria-hidden="true">
      <span className="dw-diya l">{f.emoji}</span>
      <span className="dw-diya r">{f.emoji}</span>
      {Array.from({ length: n }, (_, i) => {
        const c = f.colours[i % f.colours.length];
        const style: CSSProperties = {
          left: `${4 + ((i * 83) % 92)}%`, animationDelay: `${(i * 1.1) % 9}s`, animationDuration: `${6 + (i % 5)}s`,
          ...(f.effect === 'snow' ? {} : { background: c, boxShadow: `0 0 6px 2px ${c}99` }),
        };
        return <b key={i} className="dw-spark" style={style} />;
      })}
    </div>
  );
}

const fmt = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/** Sidebar control: follow the festival calendar, keep the plain look, or pick one look. */
export function ThemeSwitch() {
  const { mode, active } = useFestive();
  const up = upcoming();
  const nf = up ? null : nextFestival();
  const next = up ? { name: up.name, from: up.day } : nf ? { name: nf.festival.name, from: nf.from } : null;
  const label = mode === 'auto'
    ? (active ? `${active.festival.emoji} ${active.eventName ?? active.festival.name} (auto)` : 'Festive look: auto')
    : mode === 'off' ? 'Festive look: off' : `${FESTIVALS[mode]?.emoji ?? ''} ${FESTIVALS[mode]?.name ?? mode} look (kept on)`;
  return (
    <div className="fx-switch">
      <div className="fx-switch-label">{label}</div>
      <select className="fx-switch-select" value={mode} onChange={e => setMode(e.target.value)} aria-label="Festive look">
        <option value="auto">Auto — daily, by Drik Panchang</option>
        <option value="off">Off — plain look</option>
        <optgroup label="Keep one look on">
          {Object.values(FESTIVALS).map(f => <option key={f.key} value={f.key}>{f.emoji} {f.name}</option>)}
        </optgroup>
      </select>
      {mode === 'auto' && next && <div className="fx-switch-next">Next: {next.name}, {fmt(next.from)}</div>}
    </div>
  );
}
