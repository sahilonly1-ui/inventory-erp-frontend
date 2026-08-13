import { useState } from 'react';
import { isNative, scanOnce, buzz } from './scanner';

interface Props {
  /** Called with each scanned code. Return false to stop a continuous run. */
  onScan: (code: string) => void | Promise<void>;
  /** Keep the camera open for repeated scans (stock-in of a full carton). */
  continuous?: boolean;
  label?: string;
}

/**
 * Camera scan trigger for the Android app.
 *
 * Renders nothing on the web build: a desktop browser has no camera worth
 * scanning with, and the showroom uses a hardware gun there anyway. This keeps
 * the same page component working in both places without branching.
 */
export default function ScanButton({ onScan, continuous = true, label }: Props) {
  const [active, setActive] = useState(false);
  const [count, setCount] = useState(0);

  if (!isNative()) return null;

  const run = async () => {
    setActive(true);
    setCount(0);
    try {
      if (!continuous) {
        const hit = await scanOnce();
        if (hit?.value) { await onScan(hit.value); setCount(1); }
        return;
      }
      // Loop until the operator backs out of the camera.
      let n = 0;
      for (;;) {
        const hit = await scanOnce();
        if (!hit?.value) break;
        await onScan(hit.value);
        n += 1;
        setCount(n);
      }
    } catch (e: any) {
      await buzz('error');
      alert(e?.message ?? 'Could not open the camera.');
    } finally {
      setActive(false);
    }
  };

  return (
    <button
      onClick={run}
      disabled={active}
      style={{
        position: 'fixed',
        right: 16,
        // Clears both the bottom tab bar and the sticky save bar above it,
        // which the button previously covered.
        bottom: 138,
        zIndex: 400,
        height: 54,
        paddingLeft: 18,
        paddingRight: 20,
        borderRadius: 999,
        border: 'none',
        background: active ? '#475569' : '#2563eb',
        color: '#fff',
        fontSize: 15,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        boxShadow: '0 8px 24px rgba(37,99,235,.4)',
        cursor: active ? 'wait' : 'pointer',
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M3 7V5a2 2 0 0 1 2-2h2" />
        <path d="M17 3h2a2 2 0 0 1 2 2v2" />
        <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
        <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
        <path d="M7 12h10" />
      </svg>
      {label ?? (active ? (count ? `Scanned ${count}` : 'Scanning…') : 'Scan')}
    </button>
  );
}
