import { createPortal } from 'react-dom';
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
      position: 'fixed', left: 0, right: 0, bottom: 'calc(var(--tabbar-h) + var(--safe-b))',
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

// ── Bottom sheet ───────────────────────────────────────────────────────────
// Dropdowns anchored under a chip get clipped by sideways-scrolling rows and
// run off short screens. On a phone, pickers open from the bottom instead:
// thumb-reachable, full width, with their own scroll.

export function MSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title} data-sheet-open style={{ position: 'fixed', inset: 0, zIndex: 600 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.42)', animation: 'mFade .18s ease' }} />
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '78dvh',
        background: '#fff', borderRadius: '18px 18px 0 0', display: 'flex', flexDirection: 'column',
        paddingBottom: 'env(safe-area-inset-bottom)', boxShadow: '0 -8px 32px rgba(15,23,42,.18)',
        animation: 'mSheetUp .22s cubic-bezier(.2,.8,.2,1)',
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: '#d0d5dd', margin: '8px auto 4px' }} />
        <div data-keep-row style={{ display: 'flex', alignItems: 'center', padding: '6px 8px 8px 18px', borderBottom: `1px solid ${M.color.line}` }}>
          <div style={{ flex: 1, fontSize: 16, fontWeight: 700, color: M.color.ink }}>{title}</div>
          <button onClick={onClose} aria-label="Close" className="m-icon-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
          </button>
        </div>
        <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', padding: '6px 8px 12px' }}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** A single choice row inside an MSheet. */
export function MSheetOption({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 48, padding: '0 12px',
      border: 'none', borderRadius: 10, textAlign: 'left', cursor: 'pointer',
      background: selected ? M.color.brandBg : 'transparent',
      color: selected ? '#1d4ed8' : M.color.ink, fontSize: 15, fontWeight: selected ? 700 : 500,
    }}>
      <span style={{ flex: 1 }}>{label}</span>
      {selected && (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      )}
    </button>
  );
}
