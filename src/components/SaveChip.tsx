import { useEffect, useState } from 'react';
import { bgSaveState } from '../lib/bgSave';

/** Floating "Saving… / Saved" chip for background saves. */
export function SaveChip() {
  const [s, setS] = useState(bgSaveState());
  const [, tick] = useState(0);
  useEffect(() => {
    const on = (e: Event) => setS((e as CustomEvent).detail);
    window.addEventListener('erp-bgsave', on);
    const t = window.setInterval(() => tick(n => n + 1), 1000);
    return () => { window.removeEventListener('erp-bgsave', on); window.clearInterval(t); };
  }, []);
  const showLast = s.last && Date.now() - s.last.at < (s.last.ok ? 4000 : 8000);
  if (!s.pending && !showLast) return null;
  const saving = s.pending > 0;
  const bg = saving ? '#1e293b' : s.last?.ok ? '#15803d' : '#b91c1c';
  return (
    <div role="status" aria-live="polite" style={{
      position: 'fixed', bottom: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
      background: bg, color: '#fff', padding: '8px 16px', borderRadius: 999, fontSize: 13, fontWeight: 700,
      boxShadow: '0 6px 20px rgba(0,0,0,.25)', display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'none',
    }}>
      {saving && <span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin .8s linear infinite' }} />}
      {saving ? `Saving ${s.pending} entr${s.pending === 1 ? 'y' : 'ies'}… you can keep working` : s.last?.text}
      <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
    </div>
  );
}
