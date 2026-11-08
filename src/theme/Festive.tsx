import { useEffect, useState } from 'react';
import { getTheme, setTheme, type Theme } from './festive';

/** Current theme, kept in sync when it is switched anywhere. */
export function useTheme(): Theme {
  const [t, setT] = useState<Theme>(getTheme());
  useEffect(() => {
    const on = (e: Event) => setT((e as CustomEvent).detail as Theme);
    window.addEventListener('erp-theme', on);
    return () => window.removeEventListener('erp-theme', on);
  }, []);
  return t;
}

/** Marigold toran, twinkling lights and a greeting across the top of every page. */
export function FestiveTop() {
  const t = useTheme();
  if (t !== 'diwali') return null;
  return (
    <div className="dw-top" aria-hidden="true">
      <div className="dw-toran" />
      <div className="dw-lights">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ animationDelay: `${(i % 7) * 0.35}s` }} />)}</div>
      <div className="dw-greet"><span>🪔</span> Shubh Deepavali <span className="dw-sub">from iTechArena</span> <span>🪔</span></div>
    </div>
  );
}

/** Diyas in the corners and a few gentle sparkles — never in the way of clicks. */
export function FestiveAmbient() {
  const t = useTheme();
  if (t !== 'diwali') return null;
  return (
    <div className="dw-ambient" aria-hidden="true">
      <span className="dw-diya l">🪔</span>
      <span className="dw-diya r">🪔</span>
      {Array.from({ length: 10 }, (_, i) => (
        <b key={i} className="dw-spark" style={{ left: `${8 + i * 9}%`, animationDelay: `${i * 1.3}s`, animationDuration: `${6 + (i % 4)}s` }} />
      ))}
    </div>
  );
}

export function ThemeSwitch() {
  const t = useTheme();
  return (
    <button className="nav-signout dw-switch" onClick={() => setTheme(t === 'diwali' ? 'classic' : 'diwali')}>
      {t === 'diwali' ? '🪔 Diwali look: on · Switch off' : '🪔 Turn on Diwali look'}
    </button>
  );
}
