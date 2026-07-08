import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api/client';

interface Warehouse { id: string; name: string; }
interface Session { id: string; docNumber: string; lines: SessionLine[]; status: string; }
interface SessionLine { productId: string; ean: string; model: string; imeis: string[]; qty: number; }
interface ScanResult { found?: boolean; duplicate?: boolean; imei?: string; product?: { id: string; ean: string; model: string; imeiRequired: boolean }; session?: Session; lastVendor?: string; lastDate?: string; status?: string; ean?: string; }

const inpS: React.CSSProperties = { height: 38, padding: '0 12px', border: '1.5px solid var(--bdr)', borderRadius: 'var(--r-md)', fontSize: 14, background: 'var(--surf-0)', color: 'var(--txt)', outline: 'none', width: '100%' };

const PARTIES = ['Retail Customer','Amazon','Flipkart','JioMart','Prime','Meesho','Service Center','Return'];

export function StockOut() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [warehouseId, setWarehouseId] = useState('');
  const [issuedTo, setIssuedTo] = useState('');
  const [customParty, setCustomParty] = useState('');
  const [scanBuf, setScanBuf] = useState('');
  const [scanMode, setScanMode] = useState<'ean' | 'imei'>('ean');
  const [currentProduct, setCurrentProduct] = useState<{ id: string; ean: string; model: string; imeiRequired: boolean } | null>(null);
  const [manualQty, setManualQty] = useState('1');
  const [dupPopup, setDupPopup] = useState<ScanResult | null>(null);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [committed, setCommitted] = useState<{ docNumber: string; lines: any[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { api<Warehouse[]>('/warehouses').then(setWarehouses).catch(() => {}); }, []);
  const focusScan = useCallback(() => { setTimeout(() => scanInputRef.current?.focus(), 50); }, []);

  const startSession = async () => {
    const party = issuedTo === '__custom__' ? customParty.trim() : issuedTo;
    if (!warehouseId || !party) return alert('Select warehouse and party');
    setBusy(true);
    try {
      const s = await api<Session>('/inventory/sessions', { method: 'POST', body: JSON.stringify({ type: 'STOCK_OUT', warehouseId, remarks: `Issued to: ${party}` }) });
      setSession(s); setScanMode('ean'); focusScan();
    } catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  };

  const processScan = async (val: string) => {
    if (!session || !val.trim()) return;
    setScanBuf(''); setBusy(true);
    try {
      const body: any = {};
      if (scanMode === 'imei' && currentProduct) { body.productId = currentProduct.id; body.imei = val.trim(); }
      else { body.ean = val.trim(); if (!currentProduct?.imeiRequired) body.qty = Number(manualQty) || 1; }

      const r = await api<ScanResult>(`/inventory/sessions/${session.id}/lines`, { method: 'POST', body: JSON.stringify(body) });

      if (r.duplicate) { setDupPopup({ ...r, imei: val.trim() }); focusScan(); return; }
      if (r.found === false) { alert(`EAN ${val.trim()} not found in system`); focusScan(); return; }

      if (r.product && r.session) {
        setSession(r.session); setLastScan(r);
        if (r.product.imeiRequired && scanMode === 'ean') { setCurrentProduct(r.product); setScanMode('imei'); }
      }
    } catch (e: any) { alert(e.message); }
    finally { setBusy(false); focusScan(); }
  };

  const commit = async () => {
    if (!session?.lines.length) return;
    if (!confirm(`Commit stock-out ${session.docNumber}?`)) return;
    setBusy(true);
    try {
      const r = await api<{ docNumber: string; lines: any[] }>(`/inventory/sessions/${session.id}/commit`, { method: 'POST' });
      setCommitted(r); setSession(null);
    } catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  };

  const cancel = async () => {
    if (!session || !confirm('Cancel session?')) return;
    await api(`/inventory/sessions/${session.id}`, { method: 'DELETE' }).catch(() => {});
    setSession(null); setScanMode('ean'); setCurrentProduct(null);
  };

  const totalQty = session?.lines?.reduce((s, l) => s + l.qty, 0) ?? 0;

  if (committed) return (
    <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center', padding: '48px 0' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>📤</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--brand)', marginBottom: 4 }}>Stock Out Complete</div>
      <div style={{ fontSize: 15, color: 'var(--txt-2)', marginBottom: 24 }}>Document: <strong>{committed.docNumber}</strong></div>
      <div className="grid-wrap" style={{ marginBottom: 20 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={{ background: 'var(--surf-1)' }}>
            {['EAN', 'Product', 'Qty', 'IMEIs'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--bdr)', fontWeight: 600, color: 'var(--txt-3)', fontSize: 10, textTransform: 'uppercase' }}>{h}</th>)}
          </tr></thead>
          <tbody>{committed.lines.map((l, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--bdr-s)' }}>
              <td style={{ padding: '7px 12px', fontFamily: 'var(--mono)', fontSize: 11 }}>{l.ean}</td>
              <td style={{ padding: '7px 12px', fontWeight: 500 }}>{l.model}</td>
              <td style={{ padding: '7px 12px', fontWeight: 700, color: '#dc2626' }}>-{l.qty}</td>
              <td style={{ padding: '7px 12px', fontSize: 10, color: 'var(--txt-3)' }}>{l.imeis?.join(', ') || '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <button className="btn btn-primary" onClick={() => { setCommitted(null); setWarehouseId(''); setIssuedTo(''); }}>Start New Session</button>
    </div>
  );

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Stock Out</div>
          <div className="page-subtitle">{session ? `Document: ${session.docNumber}` : 'Create a new stock-out session'}</div>
        </div>
        {session && (
          <div className="page-actions">
            <button className="btn btn-secondary" onClick={cancel} style={{ color: 'var(--err)', borderColor: 'var(--err-bdr)' }}>✕ Cancel</button>
            <button className="btn btn-primary" onClick={commit} disabled={busy || !session.lines.length}
              style={{ background: '#dc2626', borderColor: '#dc2626' }}>📤 Dispatch ({totalQty} units)</button>
          </div>
        )}
      </div>

      {!session ? (
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          <div className="grid-wrap" style={{ padding: '24px 28px' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 18 }}>New Stock Out Session</div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-2)', display: 'block', marginBottom: 4 }}>Warehouse *</label>
              <select style={inpS} value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
                <option value="">Select warehouse…</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-2)', display: 'block', marginBottom: 4 }}>Issued To *</label>
              <select style={inpS} value={issuedTo} onChange={e => setIssuedTo(e.target.value)}>
                <option value="">Select party…</option>
                {PARTIES.map(p => <option key={p} value={p}>{p}</option>)}
                <option value="__custom__">Other (type below)</option>
              </select>
            </div>
            {issuedTo === '__custom__' && (
              <div style={{ marginBottom: 14 }}>
                <input style={inpS} value={customParty} onChange={e => setCustomParty(e.target.value)} placeholder="Enter party name…" autoFocus />
              </div>
            )}
            <button className="btn btn-primary" onClick={startSession} disabled={!warehouseId || !issuedTo || busy}
              style={{ width: '100%', height: 42, fontSize: 14, background: '#dc2626', borderColor: '#dc2626' }}>
              {busy ? 'Creating…' : '▶ Start Scanning'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 14, alignItems: 'start' }}>
          <div>
            <div style={{ background: scanMode === 'imei' ? '#fef3c7' : '#fef2f2', border: `1px solid ${scanMode === 'imei' ? '#fde68a' : '#fecaca'}`, borderRadius: 'var(--r-lg)', padding: '14px 18px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: scanMode === 'imei' ? '#92400e' : '#991b1b' }}>
                  {scanMode === 'ean' ? '📷 Scan EAN' : '🔢 Scan IMEI to dispatch'}
                </div>
                {currentProduct && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{currentProduct.model}</div>}
              </div>
              {scanMode === 'imei' && <button className="btn btn-secondary" style={{ fontSize: 11, height: 28 }} onClick={() => { setScanMode('ean'); setCurrentProduct(null); focusScan(); }}>← Back to EAN</button>}
            </div>

            <div style={{ marginBottom: 12, position: 'relative' }}>
              <input ref={scanInputRef} value={scanBuf} onChange={e => setScanBuf(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') processScan(scanBuf); }} autoFocus
                placeholder={scanMode === 'ean' ? 'Scan EAN…' : 'Scan IMEI to dispatch…'}
                style={{ ...inpS, height: 48, fontSize: 16, paddingLeft: 44, borderColor: scanMode === 'imei' ? '#f59e0b' : '#fca5a5' }} />
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 18, opacity: .5 }}>{scanMode === 'ean' ? '⬛' : '#'}</span>
              <button onClick={() => processScan(scanBuf)} disabled={!scanBuf || busy}
                style={{ position: 'absolute', right: 6, top: 6, height: 36, padding: '0 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 'var(--r-md)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {busy ? '…' : 'Add'}
              </button>
            </div>

            {scanMode === 'ean' && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--txt-3)', textTransform: 'uppercase' }}>Quantity (non-IMEI)</label>
                <input type="number" min="1" style={{ ...inpS, marginTop: 4, width: 100 }} value={manualQty} onChange={e => setManualQty(e.target.value)} />
              </div>
            )}

            {lastScan?.product && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--r-md)', padding: '12px 14px', marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>↑ Dispatched</div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{lastScan.product.model}</div>
              </div>
            )}

            {session.lines.length > 0 && (
              <div className="grid-wrap">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr style={{ background: 'var(--surf-1)' }}>
                    {['EAN', 'Product', 'Qty', 'IMEIs'].map(h => <th key={h} style={{ padding: '7px 12px', textAlign: 'left', borderBottom: '1px solid var(--bdr)', fontWeight: 600, color: 'var(--txt-3)', fontSize: 10, textTransform: 'uppercase' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>{session.lines.map((l, i) => (
                    <tr key={l.productId} style={{ borderBottom: '1px solid var(--bdr-s)', background: i === session.lines.length - 1 ? '#fef2f2' : '' }}>
                      <td style={{ padding: '7px 12px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--txt-3)' }}>{l.ean}</td>
                      <td style={{ padding: '7px 12px', fontWeight: 500 }}>{l.model}</td>
                      <td style={{ padding: '7px 12px', fontWeight: 700, color: '#dc2626', fontSize: 14 }}>-{l.qty}</td>
                      <td style={{ padding: '7px 12px', fontSize: 10, color: 'var(--txt-3)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.imeis.length ? l.imeis.slice(-2).join(', ') + (l.imeis.length > 2 ? ` +${l.imeis.length - 2}` : '') : '—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid-wrap" style={{ padding: '16px 18px', alignSelf: 'start' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt-2)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12 }}>Dispatch Summary</div>
            <div style={{ fontSize: 11, color: 'var(--txt-3)', marginBottom: 8 }}>{session.docNumber}</div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              <div><div style={{ fontSize: 24, fontWeight: 700, color: '#dc2626' }}>{session.lines.length}</div><div style={{ fontSize: 10, color: 'var(--txt-3)' }}>Products</div></div>
              <div><div style={{ fontSize: 24, fontWeight: 700, color: '#dc2626' }}>{totalQty}</div><div style={{ fontSize: 10, color: 'var(--txt-3)' }}>Total Units</div></div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[...session.lines].reverse().map(l => (
                <div key={l.productId} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', background: 'var(--surf-1)', borderRadius: 'var(--r-sm)', fontSize: 11 }}>
                  <span style={{ color: 'var(--txt-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 190 }}>{l.model}</span>
                  <span style={{ fontWeight: 700, color: '#dc2626', flexShrink: 0, marginLeft: 8 }}>-{l.qty}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {dupPopup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--surf-0)', borderRadius: 'var(--r-xl)', boxShadow: 'var(--sh-xl)', padding: 28, width: 420 }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>🚫</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--err)', marginBottom: 8 }}>IMEI Already Sold!</div>
            <div style={{ fontSize: 13, color: 'var(--txt-2)', marginBottom: 12 }}>IMEI <strong style={{ fontFamily: 'var(--mono)' }}>{dupPopup.imei}</strong></div>
            <div style={{ background: 'var(--err-bg)', border: '1px solid var(--err-bdr)', borderRadius: 'var(--r-md)', padding: '10px 14px', marginBottom: 20, fontSize: 12 }}>
              <div>Status: <strong>{dupPopup.status}</strong></div>
              {dupPopup.lastVendor && <div>Last seen: {dupPopup.lastVendor}</div>}
              {dupPopup.lastDate && <div>Date: {new Date(dupPopup.lastDate).toLocaleDateString('en-IN')}</div>}
            </div>
            <button className="btn btn-primary" onClick={() => { setDupPopup(null); focusScan(); }}>OK — Reject This Scan</button>
          </div>
        </div>
      )}
    </>
  );
}
