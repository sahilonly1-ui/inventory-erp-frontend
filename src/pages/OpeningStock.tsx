import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api/client';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Warehouse { id: string; name: string; }
type RS = 'empty'|'loading'|'found'|'saved'|'not_found'|'err';
type FC = 'ean'|'imei'|'qty'|'cost';
interface Row {
  id: string; ean: string; productId: string; model: string; brand: string;
  imeiRequired: boolean; srnoRequired: boolean;
  qty: number; cost: string; imei: string;
  status: RS; errMsg: string; errField: FC|'';
}

const uid = () => Math.random().toString(36).slice(2, 9);
const mk  = (): Row => ({ id: uid(), ean:'', productId:'', model:'', brand:'',
  imeiRequired: false, srnoRequired: false, qty: 1, cost: '', imei: '',
  status: 'empty', errMsg: '', errField: '' });

const DK = 'opening_draft_v1';

// ── Component ─────────────────────────────────────────────────────────────────
export function OpeningStock() {
  const [whs,    setWhs]    = useState<Warehouse[]>([]);
  const [whId,   setWhId]   = useState('');
  const [rows,   setRows]   = useState<Row[]>([mk()]);
  const [busy,   setBusy]   = useState(false);
  const [date,   setDate]   = useState(new Date().toISOString().slice(0, 10));
  const [ar,     setAr]     = useState(0);
  const refs = useRef<Record<string, HTMLInputElement|null>>({});
  const R = (i: number, c: FC) => (el: HTMLInputElement|null) => { refs.current[`${i}-${c}`] = el; };
  const ERef = useRef<(i: number, ean: string) => void>(() => {});
  const eCache = useRef(new Map<string, {productId:string;model:string;brand:string;imeiRequired:boolean;srnoRequired:boolean}|null>());

  // Load warehouses + draft
  useEffect(() => {
    api<Warehouse[]>('/warehouses').then(ws => {
      setWhs(ws);
      const m = ws.find(w => w.name.toLowerCase().includes('main'));
      setWhId(m?.id || ws[0]?.id || '');
    }).catch(() => {});
    const d = localStorage.getItem(DK);
    if (d) { try { const { r, dt } = JSON.parse(d); if (r?.some((x: Row) => x.status !== 'empty')) { setRows(r); if (dt) setDate(dt); } } catch {} }
  }, []);

  // Auto-save draft
  useEffect(() => {
    if (rows.some(r => r.status !== 'empty'))
      localStorage.setItem(DK, JSON.stringify({ r: rows, dt: date }));
  }, [rows, date]);

  const upd = useCallback((i: number, patch: Partial<Row>) =>
    setRows(rs => rs.map((r, x) => x === i ? { ...r, ...patch } : r)), []);

  const moveTo = useCallback((i: number, c: FC) => {
    setAr(i); setTimeout(() => refs.current[`${i}-${c}`]?.focus(), 30);
  }, []);

  const ins = useCallback((i: number) => {
    setRows(rs => {
      const next = [...rs];
      const nr = mk();
      if (i >= rs.length - 1) next.push(nr); else next.splice(i + 1, 0, nr);
      return next;
    });
    return i + 1;
  }, []);

  // EAN scan → lookup product
  const handleEan = useCallback(async (i: number, ean: string) => {
    const v = ean.trim(); if (!v) return;
    upd(i, { ean: v, status: 'loading', errMsg: '', errField: '' });
    let p = eCache.current.get(v);
    if (p === undefined) {
      try {
        const r = await api<{ product: { id:string; model:string; brand:string; imeiRequired:boolean; srnoRequired:boolean } }>(
          `/inventory/lookup?ean=${encodeURIComponent(v)}`);
        p = { productId: r.product.id, model: r.product.model, brand: r.product.brand,
              imeiRequired: r.product.imeiRequired, srnoRequired: r.product.srnoRequired || false };
        eCache.current.set(v, p);
      } catch { eCache.current.set(v, null); p = null; }
    }
    setRows(rs => {
      if (rs[i]?.ean !== v) return rs;
      if (!p) {
        setTimeout(() => moveTo(i, 'ean'), 0);
        return rs.map((r, x) => x === i ? { ...r, status: 'not_found' as const, errMsg: 'EAN not found in Product Master' } : r);
      }
      const needsImei = p.imeiRequired;
      return rs.map((r, x) => x === i ? {
        ...r, ...p!, status: needsImei ? 'found' : 'saved', qty: needsImei ? 1 : r.qty,
      } : r);
    });
    if (p) {
      if (p.imeiRequired) { setTimeout(() => moveTo(i, 'imei'), 60); }
      else {
        // Focus cost field for non-IMEI products
        setTimeout(() => moveTo(i, 'cost'), 60);
      }
    }
  }, [upd, moveTo]);

  useEffect(() => { ERef.current = handleEan; }, [handleEan]);

  // IMEI scan for phones
  const handleImei = useCallback(async (i: number, v: string) => {
    const imei = v.trim();
    if (!imei) { moveTo(i, 'imei'); return; }
    if (!/^\d{15}$/.test(imei)) {
      upd(i, { errMsg: 'IMEI must be exactly 15 digits', status: 'err', errField: 'imei' });
      moveTo(i, 'imei'); return;
    }
    // Within-session duplicate
    const dup = rows.findIndex((r, ri) => ri !== i && r.imei === imei);
    if (dup !== -1) {
      upd(i, { errMsg: `Duplicate! IMEI already in row ${dup + 1}`, status: 'err', errField: 'imei' });
      moveTo(i, 'imei'); return;
    }
    // Check DB — but allow re-entry for opening stock (it may not be in DB yet)
    upd(i, { imei, status: 'saved', errMsg: '', errField: '' });
    const ni = ins(i); moveTo(ni, 'ean');
  }, [rows, upd, ins, moveTo]);

  // Submit all rows
  const commit = useCallback(async () => {
    // Check for any rows still needing IMEI
    const pending = rows.filter(r => r.productId && r.status === 'found');
    if (pending.length) {
      alert(`⚠ ${pending.length} row(s) need IMEI:\n${pending.map(r => `  • ${r.model}`).join('\n')}`);
      const fi = rows.findIndex(r => r.status === 'found');
      if (fi >= 0) moveTo(fi, 'imei'); return;
    }
    const sv = rows.filter(r => r.status === 'saved' && r.productId);
    if (!sv.length || !whId) { alert('No items to save or no warehouse selected.'); return; }

    setBusy(true);
    const rmk = `Opening Stock — ${date}`;
    try {
      // IMEI phones: use /imei/receive
      const imeiRows = sv.filter(r => r.imei && r.imeiRequired);
      const imeiByProduct = imeiRows.reduce((a: Record<string, any>, r) => {
        if (!a[r.productId]) a[r.productId] = { productId: r.productId, imeis: [], cost: r.cost };
        a[r.productId].imeis.push({ imei1: r.imei, imeiType: 'NIL' });
        return a;
      }, {});
      for (const [, data] of Object.entries(imeiByProduct) as any[]) {
        await api('/imei/receive', { method: 'POST', body: JSON.stringify({
          productId: data.productId, warehouseId: whId,
          imeis: data.imeis, force: true,
          unitCost: data.cost ? parseFloat(data.cost) : undefined,
          remarks: rmk,
        }) });
      }

      // Non-IMEI / accessories: use /inventory/opening-stock
      const nonImeiByProduct = sv.filter(r => !r.imei || !r.imeiRequired).reduce((a: Record<string, any>, r) => {
        if (!a[r.productId]) a[r.productId] = { productId: r.productId, qty: 0, cost: r.cost };
        a[r.productId].qty += (r.qty || 1);
        return a;
      }, {});
      for (const [, data] of Object.entries(nonImeiByProduct) as any[]) {
        await api('/inventory/opening-stock', { method: 'POST', body: JSON.stringify({
          productId: data.productId, warehouseId: whId,
          quantity: data.qty,
          unitCost: data.cost ? parseFloat(data.cost) : undefined,
          remarks: rmk,
        }) });
      }

      eCache.current.clear();
      setRows([mk()]);
      localStorage.removeItem(DK);
      alert(`✓ ${sv.length} item(s) added as Opening Stock`);
    } catch (e: any) {
      alert(`Failed: ${e.message || 'Unknown error'}`);
    } finally { setBusy(false); }
  }, [rows, whId, date, moveTo]);

  const clear = () => {
    if (!confirm('Clear all rows and draft?')) return;
    eCache.current.clear(); setRows([mk()]); localStorage.removeItem(DK);
  };

  const sv   = rows.filter(r => r.status === 'saved' && r.productId);
  const thS: React.CSSProperties = { padding: '10px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', background: '#fff' };
  const CI   = (ex: React.CSSProperties = {}): React.CSSProperties => ({ width: '100%', height: '100%', border: 'none', padding: '0 10px', background: 'transparent', fontSize: 13, color: '#101828', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', ...ex });

  // Summary by product
  const summary = rows.filter(r => r.status === 'saved' && r.productId).reduce((a: Record<string, number>, r) => {
    const k = r.model; a[k] = (a[k] || 0) + (r.imei ? 1 : r.qty); return a;
  }, {});

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f8fafc', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{ padding: '10px 16px', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, background: '#fffbeb', color: '#92400e', border: '1px solid #fcd34d', padding: '2px 10px', borderRadius: 20, fontWeight: 700 }}>OPENING STOCK</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Opening Stock Entry</span>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#64748b' }}>{sv.length} items · {sv.reduce((s, r) => s + (r.imei ? 1 : r.qty), 0)} units</span>

        {/* Warehouse */}
        <select value={whId} onChange={e => setWhId(e.target.value)}
          style={{ height: 32, padding: '0 10px', border: '1px solid #d0d5dd', borderRadius: 7, fontSize: 12, background: '#fff', outline: 'none', minWidth: 140 }}>
          {whs.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>

        {/* Date */}
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ height: 32, padding: '0 10px', border: '1px solid #d0d5dd', borderRadius: 7, fontSize: 12, outline: 'none' }} />

        <button onClick={clear} style={{ height: 30, padding: '0 12px', border: '1px solid #fecdd3', borderRadius: 6, background: '#fff5f5', color: '#dc2626', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Clear All</button>
        <button onClick={commit} disabled={!sv.length || busy}
          style={{ height: 30, padding: '0 18px', border: 'none', borderRadius: 7, background: (!sv.length || busy) ? '#94a3b8' : '#d97706', color: '#fff', fontSize: 12, fontWeight: 700, cursor: (!sv.length || busy) ? 'not-allowed' : 'pointer' }}>
          {busy ? 'Saving…' : `✓ Save Opening Stock (${sv.length})`}
        </button>
      </div>

      {/* ── Info banner ── */}
      <div style={{ background: '#fffbeb', borderBottom: '1px solid #fcd34d', padding: '8px 16px', fontSize: 12, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>📦</span>
        <span><strong>Opening Stock</strong> — Use this to enter your existing showroom inventory. No supplier needed. Scan EAN → enter Cost Price → for phones also scan IMEI.</span>
      </div>

      {/* ── Main grid ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Table */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed', minWidth: 860 }}>
            <colgroup>
              <col style={{ width: 36 }} /><col style={{ width: 140 }} /><col />
              <col style={{ width: 60 }} /><col style={{ width: 100 }} /><col style={{ width: 170 }} /><col style={{ width: 82 }} /><col style={{ width: 42 }} />
            </colgroup>
            <thead>
              <tr>
                <th style={thS}>#</th>
                <th style={thS}>EAN / BARCODE</th>
                <th style={thS}>PRODUCT NAME</th>
                <th style={{ ...thS, textAlign: 'center' }}>QTY</th>
                <th style={thS}>COST (₹)</th>
                <th style={{ ...thS, color: '#dc2626' }}>IMEI (15 DIGITS)</th>
                <th style={thS}>STATUS</th>
                <th style={thS}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const isA = ar === i;
                const needsImei = row.status === 'found' && row.imeiRequired;
                const bg = row.errMsg ? '#fff5f5' : needsImei ? '#fffbeb' : row.status === 'saved' ? '#f0fdf4' : isA ? '#f0f9ff' : i % 2 === 0 ? '#fff' : '#fafafa';
                const eOL = (f: FC) => isA && f === 'ean' ? '2px solid #2563eb' : '1px solid transparent';
                const iOL = (f: FC) => isA && f === 'imei' ? `2px solid ${row.errField === 'imei' ? '#dc2626' : '#dc2626'}` : row.errField === 'imei' ? '1px solid #fca5a5' : '1px solid transparent';
                return (
                  <tr key={row.id} style={{ background: bg, height: 40 }} onClick={() => setAr(i)}>
                    {/* # */}
                    <td style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'center', fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{i + 1}</td>

                    {/* EAN */}
                    <td style={{ borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', outline: eOL('ean'), padding: 0 }}>
                      <input ref={R(i, 'ean')} value={row.ean} inputMode="numeric"
                        onChange={e => {
                          const v = e.target.value;
                          upd(i, { ean: v, status: 'empty', errMsg: '', errField: '' });
                          if (v.length === 8 || v.length === 12 || v.length === 13) setTimeout(() => handleEan(i, v.trim()), 80);
                        }}
                        onBlur={e => { const v = e.target.value.trim(); if (v && row.status === 'empty') handleEan(i, v); }}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); handleEan(i, (e.target as HTMLInputElement).value); } }}
                        onPaste={e => {
                          e.preventDefault();
                          const raw = e.clipboardData.getData('text');
                          const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                          if (lines.length > 1) {
                            setRows(rs => { const needed = i + lines.length; const cur = [...rs]; while (cur.length < needed) cur.push(mk()); return cur; });
                            lines.forEach((line, offset) => { setTimeout(() => { const ri = i + offset; setRows(rs => rs.map((r, x) => x === ri ? { ...r, ean: line, status: 'loading', errMsg: '', errField: '' } : r)); ERef.current(ri, line); }, 20 * offset); });
                          } else if (lines[0]) { upd(i, { ean: lines[0] }); setTimeout(() => handleEan(i, lines[0]), 30); }
                        }}
                        onFocus={() => { setAr(i); }}
                        placeholder="Scan barcode…"
                        style={CI({ fontFamily: 'monospace', fontSize: 12 })} />
                    </td>

                    {/* Product Name */}
                    <td style={{ borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', padding: '0 10px', overflow: 'hidden' }}>
                      {row.status === 'loading' && <span style={{ fontSize: 11, color: '#2563eb' }}>Looking up…</span>}
                      {row.status === 'not_found' && <span style={{ fontSize: 11, color: '#dc2626' }}>✕ Not found</span>}
                      {row.model && <span style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>{row.model}</span>}
                      {!row.model && row.status === 'empty' && <span style={{ fontSize: 11, color: '#cbd5e1' }}>Auto-filled after EAN scan</span>}
                    </td>

                    {/* QTY */}
                    <td style={{ borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', padding: 0, textAlign: 'center' }}>
                      {row.productId && !row.imeiRequired ? (
                        <input ref={R(i, 'qty')} type="number" min={1} value={row.qty}
                          onChange={e => upd(i, { qty: Math.max(1, parseInt(e.target.value) || 1) })}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); moveTo(i, 'cost'); } }}
                          onFocus={() => setAr(i)}
                          style={CI({ textAlign: 'center', fontWeight: 700, color: '#16a34a', fontSize: 14 })} />
                      ) : (
                        <span style={{ fontSize: 13, fontWeight: 700, color: row.imei ? '#16a34a' : '#94a3b8' }}>
                          {row.productId ? (row.imei ? 1 : '—') : '—'}
                        </span>
                      )}
                    </td>

                    {/* Cost Price */}
                    <td style={{ borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', padding: 0 }}>
                      {row.productId ? (
                        <input ref={R(i, 'cost')} type="number" min={0} value={row.cost}
                          placeholder="₹0"
                          onChange={e => upd(i, { cost: e.target.value })}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === 'Tab') {
                              e.preventDefault();
                              if (row.imeiRequired) moveTo(i, 'imei');
                              else { if (row.status !== 'saved') upd(i, { status: 'saved' }); const ni = ins(i); moveTo(ni, 'ean'); }
                            }
                          }}
                          onFocus={() => setAr(i)}
                          style={CI({ fontSize: 12, color: '#374151' })} />
                      ) : <span style={{ fontSize: 11, color: '#e2e8f0', padding: '0 10px' }}>—</span>}
                    </td>

                    {/* IMEI */}
                    <td style={{ borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', outline: iOL('imei'), padding: 0 }}>
                      {row.imeiRequired ? (
                        <input ref={R(i, 'imei')} value={row.imei} inputMode="numeric"
                          onChange={e => {
                            const v = e.target.value; upd(i, { imei: v, errMsg: '', errField: '' });
                            if (/^\d{15}$/.test(v.trim())) setTimeout(() => handleImei(i, v.trim()), 60);
                          }}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); handleImei(i, (e.target as HTMLInputElement).value); } }}
                          onFocus={() => { setAr(i); }}
                          placeholder="Scan IMEI (15 digits)…"
                          style={CI({ fontFamily: 'monospace', fontSize: 12, color: row.errField === 'imei' ? '#dc2626' : '#0f172a' })} />
                      ) : (
                        <span style={{ fontSize: 11, color: '#e2e8f0', padding: '0 10px' }}>—</span>
                      )}
                    </td>

                    {/* Status */}
                    <td style={{ borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', padding: '0 8px', textAlign: 'center' }}>
                      {row.errMsg && <span style={{ fontSize: 10, background: '#fee2e2', color: '#dc2626', padding: '2px 7px', borderRadius: 10, fontWeight: 700 }}>✕ Error</span>}
                      {!row.errMsg && row.status === 'saved' && <span style={{ fontSize: 10, background: '#dcfce7', color: '#15803d', padding: '2px 7px', borderRadius: 10, fontWeight: 700 }}>✓</span>}
                      {!row.errMsg && needsImei && <span style={{ fontSize: 10, background: '#fef9c3', color: '#92400e', padding: '2px 7px', borderRadius: 10, fontWeight: 700 }}>⚠ IMEI</span>}
                      {row.status === 'loading' && <div className="spinner" style={{ width: 14, height: 14, margin: '0 auto' }} />}
                    </td>

                    {/* Delete */}
                    <td style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'center', padding: 0 }}>
                      <button onClick={() => setRows(rs => { const n = [...rs]; n.splice(i, 1); return n.length ? n : [mk()]; })}
                        style={{ width: 28, height: 28, border: 'none', background: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 14 }}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Summary Panel ── */}
        <div style={{ width: 220, borderLeft: '1px solid #e2e8f0', background: '#fff', display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #e2e8f0', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Opening Stock — {date.split('-').reverse().join('-')}
          </div>
          <div style={{ flex: 1, padding: '8px 14px' }}>
            {Object.entries(summary).length === 0 && (
              <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 12, textAlign: 'center' }}>Scan products to see summary</div>
            )}
            {Object.entries(summary).map(([model, qty]) => (
              <div key={model} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #f1f5f9', fontSize: 11 }}>
                <span style={{ color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }} title={model}>{model}</span>
                <span style={{ fontWeight: 700, color: '#d97706', flexShrink: 0, marginLeft: 6 }}>{qty}</span>
              </div>
            ))}
          </div>
          <div style={{ padding: '12px 14px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700 }}>
            <span style={{ color: '#64748b' }}>Grand Total</span>
            <span style={{ color: '#d97706' }}>{sv.reduce((s, r) => s + (r.imei ? 1 : r.qty), 0)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
export default OpeningStock;
