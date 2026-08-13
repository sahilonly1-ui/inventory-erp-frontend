import { useEffect, useState } from 'react';
import { isOnline, onNetworkChange, onQueueChange, queueSize, flushQueue } from './offline';

/**
 * A persistent strip showing connection state and anything still unsent.
 *
 * Without it, working offline feels identical to working online right up until
 * the data turns out to be missing. The bar makes the difference visible while
 * it still matters, and confirms when the backlog has cleared.
 */
export default function OfflineBanner() {
  const [online, setOnline] = useState(isOnline());
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState(0);

  useEffect(() => {
    void queueSize().then(setPending);
    const offNet = onNetworkChange(setOnline);
    const offQueue = onQueueChange(setPending);
    return () => { offNet(); offQueue(); };
  }, []);

  const syncNow = async () => {
    setSyncing(true);
    try {
      const r = await flushQueue();
      if (r.sent) {
        setJustSynced(r.sent);
        setTimeout(() => setJustSynced(0), 4000);
      }
    } finally { setSyncing(false); }
  };

  // Nothing to say when connected with an empty queue.
  if (online && !pending && !justSynced) return null;

  const bg = !online ? '#b45309' : pending ? '#1d4ed8' : '#15803d';
  const text = !online
    ? (pending ? `Offline — ${pending} save${pending !== 1 ? 's' : ''} waiting` : 'Offline — scans are saved on this device')
    : pending ? `${pending} save${pending !== 1 ? 's' : ''} waiting to sync` : `✓ Synced ${justSynced} save${justSynced !== 1 ? 's' : ''}`;

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 300,
      background: bg, color: '#fff',
      padding: '7px 14px', fontSize: 12.5, fontWeight: 600,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
        background: '#fff', opacity: online ? 1 : .65,
      }} />
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {text}
      </span>
      {online && pending > 0 && (
        <button onClick={syncNow} disabled={syncing}
          style={{
            border: '1px solid rgba(255,255,255,.5)', background: 'rgba(255,255,255,.15)',
            color: '#fff', borderRadius: 6, padding: '3px 11px',
            fontSize: 12, fontWeight: 700, cursor: syncing ? 'wait' : 'pointer', flexShrink: 0,
          }}>
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
      )}
    </div>
  );
}
