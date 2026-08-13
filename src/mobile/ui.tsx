import { ReactNode, useEffect, useState } from 'react';

/**
 * Phone-layout detection, shared by every page.
 *
 * Watched rather than read once so rotating the device or resizing switches
 * layout immediately instead of leaving a desktop table on a 390px screen.
 */
export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 900,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 899px)');
    const onChange = () => setPhone(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return phone;
}

// ── Design tokens ──────────────────────────────────────────────────────────
// Sized for thumbs and for reading at arm's length in a shop, not for a mouse.
export const M = {
  pad: 12,
  gap: 10,
  radius: 14,
  tap: 46,                 // minimum comfortable touch target
  text: {
    title: 15.5,
    body: 14,
    meta: 12,
    micro: 11,
  },
  color: {
    bg: '#f5f7fa',
    surface: '#ffffff',
    line: '#e6e9ef',
    ink: '#0f172a',
    muted: '#64748b',
    faint: '#94a3b8',
    brand: '#2563eb',
    good: '#16a34a',
    warn: '#b45309',
    bad: '#dc2626',
    goodBg: '#f0fdf4',
    warnBg: '#fffbeb',
    badBg: '#fef2f2',
    brandBg: '#eff6ff',
  },
} as const;

// ── Card ───────────────────────────────────────────────────────────────────
export function MCard({
  children, tone = 'plain', onClick, style,
}: {
  children: ReactNode;
  tone?: 'plain' | 'good' | 'warn' | 'bad' | 'brand';
  onClick?: () => void;
  style?: React.CSSProperties;
}) {
  const edge = {
    plain: M.color.line,
    good: '#bbf7d0',
    warn: '#fde68a',
    bad: '#fecaca',
    brand: '#bfdbfe',
  }[tone];
  const fill = {
    plain: M.color.surface,
    good: M.color.goodBg,
    warn: M.color.warnBg,
    bad: M.color.badBg,
    brand: M.color.brandBg,
  }[tone];

  return (
    <div
      onClick={onClick}
      style={{
        background: fill,
        border: `1px solid ${edge}`,
        borderRadius: M.radius,
        padding: M.pad,
        boxShadow: '0 1px 2px rgba(16,24,40,.04)',
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Stat tile ──────────────────────────────────────────────────────────────
export function MStat({ label, value, tone = 'ink' }: { label: string; value: ReactNode; tone?: 'ink' | 'good' | 'bad' | 'brand' }) {
  const c = { ink: M.color.ink, good: M.color.good, bad: M.color.bad, brand: M.color.brand }[tone];
  return (
    <div style={{
      background: M.color.surface, border: `1px solid ${M.color.line}`,
      borderRadius: 12, padding: '11px 12px', minWidth: 0,
    }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: c, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
      <div style={{ fontSize: M.text.micro, color: M.color.faint, textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
    </div>
  );
}

// ── Labelled field, stacked for narrow screens ─────────────────────────────
export function MField({ label, children, accent }: { label: string; children: ReactNode; accent?: string }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{
        display: 'block', fontSize: M.text.micro, fontWeight: 700,
        color: accent ?? M.color.muted, textTransform: 'uppercase',
        letterSpacing: '.05em', marginBottom: 5,
      }}>{label}</span>
      {children}
    </label>
  );
}

export const mInput: React.CSSProperties = {
  width: '100%',
  height: M.tap,
  padding: '0 13px',
  border: `1.5px solid #d0d5dd`,
  borderRadius: 10,
  fontSize: 16,              // 16px stops Android zooming the page on focus
  outline: 'none',
  boxSizing: 'border-box',
  background: '#fff',
};

// ── Buttons ────────────────────────────────────────────────────────────────
export function MButton({
  children, onClick, tone = 'plain', disabled, full, style,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: 'plain' | 'brand' | 'danger' | 'ghost';
  disabled?: boolean;
  full?: boolean;
  style?: React.CSSProperties;
}) {
  const tones: Record<string, React.CSSProperties> = {
    plain:  { background: '#fff', color: M.color.ink, border: `1px solid ${M.color.line}` },
    brand:  { background: M.color.brand, color: '#fff', border: 'none' },
    danger: { background: '#fff', color: M.color.bad, border: '1px solid #fecaca' },
    ghost:  { background: 'transparent', color: M.color.muted, border: 'none' },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        height: M.tap,
        padding: '0 16px',
        borderRadius: 10,
        fontSize: M.text.body,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? .55 : 1,
        width: full ? '100%' : undefined,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        ...tones[tone],
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ── Sticky action bar ──────────────────────────────────────────────────────
/**
 * Anchored above the tab bar so the primary action is always reachable without
 * scrolling to the end of a long scan list.
 */
export function MActionBar({ children }: { children: ReactNode }) {
  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: 62,
      zIndex: 110,
      background: 'rgba(255,255,255,.97)',
      borderTop: `1px solid ${M.color.line}`,
      padding: `10px ${M.pad}px`,
      display: 'flex', alignItems: 'center', gap: M.gap,
      backdropFilter: 'blur(6px)',
    }}>
      {children}
    </div>
  );
}

// ── Section heading ────────────────────────────────────────────────────────
export function MSection({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      margin: '18px 0 8px',
    }}>
      <span style={{
        fontSize: M.text.micro, fontWeight: 800, color: M.color.faint,
        textTransform: 'uppercase', letterSpacing: '.08em',
      }}>{title}</span>
      {action}
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────
export function MEmpty({ icon, title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '44px 20px', color: M.color.faint }}>
      {icon && <div style={{ fontSize: 34, marginBottom: 10 }}>{icon}</div>}
      <div style={{ fontSize: M.text.body, fontWeight: 700, color: M.color.muted }}>{title}</div>
      {hint && <div style={{ fontSize: M.text.meta, marginTop: 5, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );
}

// ── Status pill ────────────────────────────────────────────────────────────
export function MPill({ tone, children }: { tone: 'good' | 'warn' | 'bad' | 'brand' | 'muted'; children: ReactNode }) {
  const map = {
    good:  { bg: '#dcfce7', fg: '#15803d' },
    warn:  { bg: '#fef9c3', fg: '#92400e' },
    bad:   { bg: '#fee2e2', fg: '#dc2626' },
    brand: { bg: '#e0f2fe', fg: '#0369a1' },
    muted: { bg: '#f1f5f9', fg: '#64748b' },
  }[tone];
  return (
    <span style={{
      fontSize: M.text.micro, fontWeight: 700, padding: '3px 9px',
      borderRadius: 999, background: map.bg, color: map.fg, whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}
