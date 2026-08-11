import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api/client';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Warehouse { id: string; name: string; }
type RS  = 'empty'|'loading'|'found'|'saved'|'not_found'|'err';
type FC  = 'ean'|'imei'|'srno'|'qty';
interface Row {
  id: string; ean: string; productId: string; model: string; brand: string;
  imeiRequired: boolean; srnoRequired: boolean;
  qty: number; imei: string; srno: string;
  status: RS; errMsg: string; errField: FC|'';
}
interface HistoryEntry {
  id: string; type: string; quantity: number;
  productId: string; ean: string; model: string; brand: string; imeiRequired: boolean;
  vendorId: string|null; vendorName: string|null;
  warehouseId: string; warehouseName: string;
  unitCost: number|null; remarks: string|null; createdAt: string;
  imeis: string[];
}

const uid = () => Math.random().toString(36).slice(2, 9);
const mk  = (): Row => ({ id: uid(), ean:'', productId:'', model:'', brand:'',
  imeiRequired: false, srnoRequired: false, qty: 1, imei: '', srno: '',
  status: 'empty', errMsg: '', errField: '' });
const DK  = 'opening_draft_v1';
const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
const fmtTime = (s: string) => new Date(s).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });

// ── Component ──────────────────────────────────────────────────────────────────
export function OpeningStock() {
  const [tab,    setTab]    = useState<'scan'|'history'>('scan');
  const [whs,    setWhs]    = useState<Warehouse[]>([]);
  const [whId,   setWhId]   = useState('');
  const [rows,   setRows]   = useState<Row[]>([mk()]);
  const [busy,   setBusy]   = useState(false);
  const [date,   setDate]   = useState(new Date().toISOString().slice(0, 10));
  const [ar,     setAr]     = useState(0);

  // History tab state
  const [history,  setHistory]  = useState<HistoryEntry[]>([]);
  const [hLoading, setHLoading] = useState(false);
  const [hFilter,  setHFilter]  = useState('');
  const [deleting, setDeleting] = useState<string|null>(null);
  const [expandId, setExpandId] = useState<string|null>(null);

  const refs  = useRef<Record<string, HTMLInputElement|null>>({});
  const R     = (i: number, c: FC) => (el: HTMLInputElement|null) => { refs.current[`${i}-${c}`] = el; };
  const ERef    = useRef<(i: number, ean: string) => void>(() => {});
  const scanning = useRef<Record<number, boolean>>({}); // guard against double-scan
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

  // Load history when tab switches
  const loadHistory = useCallback(async () => {
    setHLoading(true);
    try {
      const r = await api<{ items: HistoryEntry[] }>('/inventory/transactions?type=OPENING&limit=200');
      setHistory(r.items);
    } catch { setHistory([]); }
    finally { setHLoading(false); }
  }, []);

  useEffect(() => { if (tab === 'history') loadHistory(); }, [tab, loadHistory]);

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
      const nextRow = rs[i + 1];
      // If next row is already empty — reuse it
      if (nextRow && !nextRow.ean.trim() && nextRow.status === 'empty') return rs;
      // Next row has content OR doesn't exist → add blank row
      const next = [...rs];
      if (i >= rs.length - 1) next.push(mk()); else next.splice(i + 1, 0, mk());
      return next;
    });
    return i + 1;
  }, []);

  // EAN lookup
  const handleEan = useCallback(async (i: number, ean: string) => {
    const v = ean.trim(); if (!v) return;
    upd(i, { ean: v, status: 'loading', errMsg: '', errField: '' });
    let p = eCache.current.get(v);
    if (p === undefined) {
      try {
        const r = await api<{ product: { id:string;model:string;brand:string;imeiRequired:boolean;srnoRequired:boolean } }>(
          `/inventory/lookup?ean=${encodeURIComponent(v)}`);
        p = { productId: r.product.id, model: r.product.model, brand: r.product.brand,
              imeiRequired: r.product.imeiRequired, srnoRequired: r.product.srnoRequired || false };
        eCache.current.set(v, p);
      } catch {
        // Don't cache failures — next scan should retry
        await new Promise(res => setTimeout(res, 500));
        const cached = eCache.current.get(v);
        if (cached !== undefined) { p = cached; }
        else { p = null; }
      }
    }
    setRows(rs => {
      if (rs[i]?.ean !== v) return rs;
      if (!p) {
        setTimeout(() => moveTo(i, 'ean'), 0);
        return rs.map((r, x) => x === i ? { ...r, status: 'not_found' as const, errMsg: 'EAN not found in Product Master' } : r);
      }
      return rs.map((r, x) => x === i ? { ...r, ...p!, status: (p!.imeiRequired || p!.srnoRequired) ? 'found' : 'saved', qty: (p!.imeiRequired || p!.srnoRequired) ? 1 : r.qty } : r);
    });
    if (p) {
      // Insert blank row for next scan (same as StockIn)
      setRows(rs => {
        const nextRow = rs[i + 1];
        if (nextRow && !nextRow.ean.trim() && nextRow.status === 'empty') return rs;
        const next = [...rs];
        if (i >= rs.length - 1) next.push(mk()); else next.splice(i + 1, 0, mk());
        return next;
      });
      // EAN→EAN→EAN flow (not EAN→IMEI)
      // After all EANs scanned, user clicks IMEI field to scan IMEIs in sequence
      setTimeout(() => moveTo(i + 1, 'ean'), 60);
    }
  }, [upd, moveTo]);

  useEffect(() => { ERef.current = handleEan; }, [handleEan]);

  // IMEI scan
  const handleImei = useCallback(async (i: number, v: string) => {
    const imei = v.trim();
    if (!imei) { moveTo(i, 'imei'); return; }
    if (!/^\d{15}$/.test(imei)) { upd(i, { errMsg: 'IMEI must be exactly 15 digits', status: 'err', errField: 'imei' }); moveTo(i, 'imei'); return; }
    const dup = rows.findIndex((r, ri) => ri !== i && r.imei === imei);
    if (dup !== -1) { upd(i, { errMsg: `Duplicate! IMEI already in row ${dup + 1}`, status: 'err', errField: 'imei' }); moveTo(i, 'imei'); return; }
    upd(i, { imei, status: 'saved', errMsg: '', errField: '' });
    // IMEI→IMEI flow: go to next row's IMEI field (not EAN)
    const nextIdx = i + 1;
    if (nextIdx < rows.length && rows[nextIdx].productId) {
      moveTo(nextIdx, rows[nextIdx].imeiRequired ? 'imei' : rows[nextIdx].srnoRequired ? 'srno' : 'ean');
    } else if (nextIdx < rows.length) {
      moveTo(nextIdx, 'ean');
    }
  }, [rows, upd, ins, moveTo]);

  // Sr. No. entry (tablets/accessories)
  const handleSrno = useCallback((i: number, v: string) => {
    const srno = v.trim();
    if (!srno) { moveTo(i, 'srno'); return; }
    const dup = rows.findIndex((r, ri) => ri !== i && r.srno === srno);
    if (dup !== -1) { upd(i, { errMsg: `Duplicate! Sr. No. already in row ${dup + 1}`, status: 'err', errField: 'srno' }); moveTo(i, 'srno'); return; }
    upd(i, { srno, status: 'saved', errMsg: '', errField: '' });
    const nextIdx = i + 1;
    if (nextIdx < rows.length && rows[nextIdx].productId) {
      moveTo(nextIdx, rows[nextIdx].imeiRequired ? 'imei' : rows[nextIdx].srnoRequired ? 'srno' : 'ean');
    } else if (nextIdx < rows.length) {
      moveTo(nextIdx, 'ean');
    }
  }, [rows, upd, moveTo]);

  // Save all
  const commit = useCallback(async () => {
    const pending = rows.filter(r => r.productId && r.status === 'found');
    if (pending.length) {
      const fi = rows.findIndex(r => r.status === 'found');
      const needsWhat = rows[fi]?.srnoRequired ? 'Sr. No.' : 'IMEI';
      alert(`⚠ ${pending.length} row(s) need ${needsWhat}.`);
      if (fi >= 0) moveTo(fi, rows[fi].srnoRequired ? 'srno' : 'imei');
      return;
    }
    const sv = rows.filter(r => r.status === 'saved' && r.productId);

    // Catch duplicate IMEIs before hitting the server — the DB would reject the
    // whole batch, and a client-side check can point straight at the bad row.
    const seen = new Map<string, number>();
    for (let i = 0; i < rows.length; i++) {
      const im = rows[i].imei?.trim();
      if (!im) continue;
      if (seen.has(im)) {
        const first = seen.get(im)! + 1;
        alert(`⚠ Duplicate IMEI found\n\n${im}\n\nScanned in both row ${first} and row ${i + 1}. Remove one before saving.`);
        upd(i, { errMsg: `Duplicate — same as row ${first}`, status: 'err', errField: 'imei' });
        moveTo(i, 'imei');
        return;
      }
      seen.set(im, i);
    }
    if (!sv.length || !whId) { alert('No items to save.'); return; }
    setBusy(true);
    const rmk = `Opening Stock — ${date}`;
    try {
      // IMEI phones
      const imeiByProd = sv.filter(r => r.imei && r.imeiRequired).reduce((a: Record<string,any>, r) => {
        if (!a[r.productId]) a[r.productId] = { productId: r.productId, imeis: [] };
        a[r.productId].imeis.push({ imei1: r.imei, imeiType: 'NIL' }); return a;
      }, {});
      for (const [, d] of Object.entries(imeiByProd) as any[]) {
        await api('/imei/receive', { method: 'POST', body: JSON.stringify({ productId: d.productId, warehouseId: whId, imeis: d.imeis, force: true, type: 'OPENING', remarks: rmk }) });
      }
      // Sr. No. items (tablets etc) — save via opening-stock with srno in remarks
      const srnoRows = sv.filter(r => r.srno && r.srnoRequired);
      for (const r of srnoRows) {
        await api('/inventory/opening-stock', { method: 'POST', body: JSON.stringify({ productId: r.productId, warehouseId: whId, quantity: 1, remarks: `${rmk} | S/N: ${r.srno}` }) });
      }
      // Non-IMEI, Non-SrNo accessories
      const nonImeiByProd = sv.filter(r => (!r.imei || !r.imeiRequired) && (!r.srno || !r.srnoRequired)).reduce((a: Record<string,any>, r) => {
        if (!a[r.productId]) a[r.productId] = { productId: r.productId, qty: 0 };
        a[r.productId].qty += (r.qty || 1); return a;
      }, {});
      for (const [, d] of Object.entries(nonImeiByProd) as any[]) {
        await api('/inventory/opening-stock', { method: 'POST', body: JSON.stringify({ productId: d.productId, warehouseId: whId, quantity: d.qty, remarks: rmk }) });
      }
      eCache.current.clear(); setRows([mk()]); localStorage.removeItem(DK);
      alert(`✓ ${sv.length} item(s) added as Opening Stock`);
      setTab('history');
    } catch (e: any) { alert(`⚠ Could not save\n\n${e.message}\n\nYour scanned rows have been kept — fix the issue above and click Save again.`); }
    finally { setBusy(false); }
  }, [rows, whId, date, moveTo]);

  // Delete one opening stock entry
  const deleteEntry = useCallback(async (entry: HistoryEntry) => {
    const detail = entry.imeis.length > 0
      ? `${entry.model}\n${entry.imeis.length} IMEI(s): ${entry.imeis.slice(0,3).join(', ')}${entry.imeis.length > 3 ? '…' : ''}`
      : `${entry.model} × ${entry.quantity} units`;
    if (!confirm(`Delete this opening stock entry?\n\n${detail}\n\nThis will reduce stock by ${entry.imeis.length || entry.quantity} unit(s).`)) return;
    setDeleting(entry.id);
    try {
      await api(`/inventory/transactions/${entry.id}`, { method: 'DELETE' });
      setHistory(h => h.filter(x => x.id !== entry.id));
    } catch (e: any) { alert('Delete failed: ' + e.message); }
    finally { setDeleting(null); }
  }, []);

  const sv = rows.filter(r => r.status === 'saved' && r.productId);
  const summary = sv.reduce((a: Record<string,number>, r) => { const k = r.model; a[k] = (a[k] || 0) + (r.imei ? 1 : r.qty); return a; }, {});

  const thS: React.CSSProperties = { padding: '10px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', background: '#fff' };
  // CI: table-cell input style. Explicitly resets ALL global input styling so
  // the scan grid looks clean — no blue glow ring (the "cylindrical shape"),
  // no border, no rounded corners on focus.
  const CI  = (ex: React.CSSProperties = {}): React.CSSProperties => ({ width: '100%', height: '100%', border: 'none', borderRadius: 0, padding: '0 10px', background: 'transparent', fontSize: 13, color: '#101828', outline: 'none', boxShadow: 'none', fontFamily: 'inherit', boxSizing: 'border-box', ...ex });

  const filteredHistory = hFilter
    ? history.filter(h => h.model.toLowerCase().includes(hFilter.toLowerCase()) || h.ean.includes(hFilter) || h.imeis.some(im => im.includes(hFilter)))
    : history;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f8fafc', overflow: 'hidden' }}>

      {/* Header — two compact rows, no flex-wrap stretching */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
        {/* Row 1: title + save button */}
        <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, background: '#fffbeb', color: '#92400e', border: '1px solid #fcd34d', padding: '2px 8px', borderRadius: 20, fontWeight: 700, flexShrink: 0 }}>OPENING STOCK</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', flexShrink: 0 }}>Opening Stock Entry</span>
          <div style={{ flex: 1 }} />
          {tab === 'scan' && <>
            <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
              {sv.length} items · {sv.reduce((s, r) => s + (r.imei ? 1 : r.qty), 0)} units
            </span>
            <button onClick={commit} disabled={!sv.length || busy} style={{
              height: 30, padding: '0 14px', border: 'none', borderRadius: 7, flexShrink: 0,
              background: (!sv.length || busy) ? '#94a3b8' : '#d97706', color: '#fff',
              fontSize: 12, fontWeight: 700, cursor: (!sv.length || busy) ? 'not-allowed' : 'pointer',
            }}>
              {busy ? 'Saving…' : `✓ Save (${sv.length})`}
            </button>
          </>}
        </div>
        {/* Row 2: warehouse + date + clear — all compact, no stretching */}
        {tab === 'scan' && (
          <div style={{ padding: '0 14px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <select value={whId} onChange={e => setWhId(e.target.value)} style={{
              height: 30, padding: '0 8px', border: '1px solid #d0d5dd', borderRadius: 7,
              fontSize: 12, background: '#fff', outline: 'none', maxWidth: 180, flex: '0 1 180px',
            }}>
              {whs.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{
              height: 30, padding: '0 8px', border: '1px solid #d0d5dd', borderRadius: 7,
              fontSize: 12, outline: 'none', width: 130, flexShrink: 0,
            }} />
            <button onClick={() => { if (!confirm('Clear all rows?')) return; eCache.current.clear(); setRows([mk()]); localStorage.removeItem(DK); }} style={{
              height: 30, padding: '0 10px', border: '1px solid #fecdd3', borderRadius: 6,
              background: '#fff5f5', color: '#dc2626', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
            }}>Clear All</button>
          </div>
        )}
      </div>

      {/* Info banner */}
      <div style={{ background: '#fffbeb', borderBottom: '1px solid #fcd34d', padding: '6px 16px', fontSize: 12, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>📦</span>
        <span><strong>Opening Stock</strong> — Enter your existing showroom inventory. No supplier needed. Scan all EANs first, then scan IMEIs for phones.</span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#fff', flexShrink: 0 }}>
        {([['scan', '📷 Scan / Add'], ['history', `📋 View & Manage (${history.length || ''})`]] as const).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '8px 20px', fontSize: 12, fontWeight: tab === t ? 700 : 500, color: tab === t ? '#d97706' : '#64748b', background: 'none', border: 'none', borderBottom: `2px solid ${tab === t ? '#d97706' : 'transparent'}`, cursor: 'pointer' }}>
            {l}
          </button>
        ))}
      </div>

      {/* ── SCAN TAB ── */}
      {tab === 'scan' && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed', minWidth: 860 }}>
              <colgroup>
                <col style={{ width: 36 }} /><col style={{ width: 150 }} /><col />
                <col style={{ width: 60 }} /><col style={{ width: 180 }} /><col style={{ width: 160 }} /><col style={{ width: 90 }} /><col style={{ width: 42 }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={thS}>#</th>
                  <th style={thS}>EAN / BARCODE</th>
                  <th style={thS}>PRODUCT NAME</th>
                  <th style={{ ...thS, textAlign: 'center' }}>QTY</th>
                  <th style={{ ...thS, color: '#dc2626' }}>IMEI (15 DIGITS)</th>
                  <th style={{ ...thS, color: '#2563eb' }}>SR. NO.</th>
                  <th style={thS}>STATUS</th>
                  <th style={thS}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const isA = ar === i;
                  const needsImei = row.status === 'found' && row.imeiRequired;
                  const needsSrno = row.status === 'found' && row.srnoRequired;
                  const bg = row.errMsg ? '#fff5f5' : needsImei ? '#fffbeb' : needsSrno ? '#eff6ff' : row.status === 'saved' ? '#f0fdf4' : isA ? '#f0f9ff' : i % 2 === 0 ? '#fff' : '#fafafa';
                  return (
                    <tr key={row.id} style={{ background: bg, height: 40 }} onClick={() => setAr(i)}>
                      <td style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'center', fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{i + 1}</td>
                      <td style={{ borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', padding: 0 }}>
                        <input ref={R(i, 'ean')} value={row.ean} inputMode="numeric"
                          onChange={e => {
                            const v = e.target.value;
                            upd(i, { ean: v, status: 'empty', errMsg: '', errField: '' });
                            // Auto-submit at standard barcode lengths — guard prevents double-fire when
                            // scanner also sends Enter (which would call handleEan a second time)
                            if (v.length === 8 || v.length === 12 || v.length === 13) {
                              scanning.current[i] = true;
                              setTimeout(() => { handleEan(i, v.trim()); scanning.current[i] = false; }, 80);
                            }
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === 'Tab') {
                              e.preventDefault();
                              // Skip if onChange already triggered (scanner double-fire guard)
                              if (scanning.current[i]) { scanning.current[i] = false; return; }
                              handleEan(i, (e.target as HTMLInputElement).value);
                            }
                          }}
                          onPaste={e => { e.preventDefault(); const raw = e.clipboardData.getData('text'); const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean); if (lines.length > 1) { setRows(rs => { const needed = i + lines.length; const cur = [...rs]; while (cur.length < needed) cur.push(mk()); return cur; }); lines.forEach((line, offset) => { setTimeout(() => { const ri = i + offset; setRows(rs => rs.map((r, x) => x === ri ? { ...r, ean: line, status: 'loading', errMsg: '', errField: '' } : r)); ERef.current(ri, line); }, 20 * offset); }); } else if (lines[0]) { upd(i, { ean: lines[0] }); setTimeout(() => handleEan(i, lines[0]), 30); } }}
                          onFocus={() => setAr(i)}
                          placeholder="Scan barcode…"
                          style={CI({ fontFamily: 'monospace', fontSize: 13 })} />
                      </td>
                      <td style={{ borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', padding: '0 10px', overflow: 'hidden' }}>
                        {row.status === 'loading' && <span style={{ fontSize: 11, color: '#2563eb' }}>Looking up…</span>}
                        {row.status === 'not_found' && <span style={{ fontSize: 11, color: '#dc2626' }}>✕ Not found in Product Master</span>}
                        {row.model && (
                          <div style={{display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical' as any,overflow:'hidden',fontSize:13,fontWeight:600,color:'#0f172a',lineHeight:1.35,wordBreak:'break-word'}}>
                            {row.model}
                          </div>
                        )}
                        {!row.model && row.status === 'empty' && <span style={{ fontSize: 11, color: '#cbd5e1' }}>Auto-filled after EAN scan</span>}
                        {row.errMsg && !row.model && <span style={{ fontSize: 11, color: '#dc2626' }}>{row.errMsg}</span>}
                      </td>
                      <td style={{ borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', padding: 0, textAlign: 'center' }}>
                        {row.productId && !row.imeiRequired ? (
                          <input ref={R(i, 'qty')} type="number" min={1} value={row.qty}
                            onChange={e => upd(i, { qty: Math.max(1, parseInt(e.target.value) || 1) })}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); if (row.status !== 'saved') upd(i, { status: 'saved' }); moveTo(i + 1, 'ean'); } }}
                            onFocus={() => setAr(i)}
                            style={CI({ textAlign: 'center', fontWeight: 700, color: '#16a34a', fontSize: 14 })} />
                        ) : (
                          <span style={{ fontSize: 13, fontWeight: 700, color: row.imei ? '#16a34a' : '#94a3b8' }}>{row.productId ? (row.imei ? 1 : '—') : '—'}</span>
                        )}
                      </td>
                      <td style={{ borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', outline: row.errField === 'imei' ? '1px solid #fca5a5' : '1px solid transparent', padding: 0 }}>
                        {row.imeiRequired ? (
                          <input ref={R(i, 'imei')} value={row.imei} inputMode="numeric"
                            onChange={e => { const v = e.target.value; upd(i, { imei: v, errMsg: '', errField: '' }); if (/^\d{15}$/.test(v.trim())) setTimeout(() => handleImei(i, v.trim()), 60); }}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); handleImei(i, (e.target as HTMLInputElement).value); } }}
                            onFocus={() => setAr(i)}
                            placeholder="Scan IMEI (15 digits)…"
                            style={CI({ fontFamily: 'monospace', fontSize: 13, color: row.errField === 'imei' ? '#dc2626' : '#0f172a' })} />
                        ) : <span style={{ fontSize: 11, color: '#e2e8f0', padding: '0 10px' }}>—</span>}
                      </td>
                      {/* Sr. No. column */}
                      <td style={{ borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', outline: row.errField === 'srno' ? '1px solid #bfdbfe' : '1px solid transparent', padding: 0 }}>
                        {row.srnoRequired ? (
                          <input ref={R(i, 'srno')} value={row.srno}
                            onChange={e => { const v = e.target.value; upd(i, { srno: v, errMsg: '', errField: '' }); }}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); handleSrno(i, (e.target as HTMLInputElement).value); } }}
                            onFocus={() => setAr(i)}
                            placeholder="Enter Serial No…"
                            style={CI({ fontSize: 13, color: row.errField === 'srno' ? '#dc2626' : '#0f172a' })} />
                        ) : <span style={{ fontSize: 11, color: '#e2e8f0', padding: '0 10px' }}>—</span>}
                      </td>
                      <td style={{ borderBottom: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', padding: '0 8px', textAlign: 'center' }}>
                        {row.errMsg && <span style={{ fontSize: 10, background: '#fee2e2', color: '#dc2626', padding: '2px 7px', borderRadius: 10, fontWeight: 700 }}>✕ Error</span>}
                        {!row.errMsg && row.status === 'saved' && <span style={{ fontSize: 10, background: '#dcfce7', color: '#15803d', padding: '2px 7px', borderRadius: 10, fontWeight: 700 }}>✓</span>}
                        {!row.errMsg && needsImei && <span style={{ fontSize: 10, background: '#fef9c3', color: '#92400e', padding: '2px 7px', borderRadius: 10, fontWeight: 700 }}>⚠ IMEI</span>}
                        {!row.errMsg && needsSrno && <span style={{ fontSize: 10, background: '#dbeafe', color: '#1d4ed8', padding: '2px 7px', borderRadius: 10, fontWeight: 700 }}>⚠ S/N</span>}
                        {row.status === 'loading' && <div className="spinner" style={{ width: 14, height: 14, margin: '0 auto' }} />}
                      </td>
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
          {/* Summary */}
          <div style={{ width: 280, borderLeft: '1px solid #e2e8f0', background: '#fff', display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #e2e8f0', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em' }}>Summary — {date.split('-').reverse().join('-')}</div>
            <div style={{ flex: 1, padding: '8px 14px' }}>
              {Object.entries(summary).length === 0 && <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 12, textAlign: 'center' }}>Scan products to see summary</div>}
              {Object.entries(summary).sort(([a],[b])=>a.localeCompare(b)).map(([model, qty]) => (
                <div key={model} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, padding: '5px 0', borderBottom: '1px solid #f1f5f9', fontSize: 11 }}>
                  <span style={{ color: '#374151', wordBreak: 'break-word', lineHeight: 1.35, flex: 1 }}>{model}</span>
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
      )}

      {/* ── HISTORY / MANAGE TAB ── */}
      {tab === 'history' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Search + refresh bar */}
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Search box with icon */}
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input value={hFilter} onChange={e => setHFilter(e.target.value)}
                placeholder="Search product, EAN or IMEI…"
                style={{ width: '100%', height: 34, padding: '0 12px 0 32px', border: '1px solid #d0d5dd', borderRadius: 8, fontSize: 13, outline: 'none', background: '#fff', boxSizing: 'border-box' }} />
            </div>
            {hFilter && (
              <button onClick={() => setHFilter('')}
                style={{ height: 34, padding: '0 12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
                ✕ Clear
              </button>
            )}
            <button onClick={loadHistory}
              style={{ height: 34, padding: '0 14px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontSize: 12, color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              Refresh
            </button>
            <div style={{ fontSize: 12, color: '#64748b', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0 12px', height: 34, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span style={{ fontWeight: 700, color: '#0f172a' }}>{filteredHistory.length}</span> entries ·
              <span style={{ fontWeight: 700, color: '#16a34a' }}>{filteredHistory.reduce((s, h) => s + (h.imeis.length || h.quantity), 0)}</span> units
            </div>
          </div>

          {hLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12, color: '#64748b' }}>
              <div className="spinner" style={{ width: 20, height: 20 }} /> Loading…
            </div>
          ) : filteredHistory.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#94a3b8', gap: 8 }}>
              <span style={{ fontSize: 32 }}>📦</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>No opening stock entries yet</span>
              <span style={{ fontSize: 13 }}>Switch to the Scan tab to add your inventory</span>
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                    {['Product', 'EAN', 'Qty / IMEIs', 'Warehouse', 'Date', 'Actions'].map(h => (
                      <th key={h} style={{ ...thS, padding: '10px 14px', background: '#f8fafc' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((entry, idx) => (
                    <>
                      <tr key={entry.id} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '9px 14px', fontWeight: 600, color: '#0f172a' }}>
                          <div style={{ fontSize: 13 }}>{entry.model}</div>
                          <div style={{ fontSize: 10, color: '#94a3b8' }}>{entry.brand}</div>
                        </td>
                        <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>{entry.ean}</td>
                        <td style={{ padding: '9px 14px' }}>
                          {entry.imeis.length > 0 ? (
                            <div>
                              <span style={{ fontWeight: 700, color: '#16a34a' }}>{entry.imeis.length} IMEI{entry.imeis.length !== 1 ? 's' : ''}</span>
                              {entry.imeis.length > 0 && (
                                <button onClick={() => setExpandId(expandId === entry.id ? null : entry.id)}
                                  style={{ marginLeft: 8, fontSize: 10, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                                  {expandId === entry.id ? 'hide' : 'show'}
                                </button>
                              )}
                            </div>
                          ) : (
                            <span style={{ fontWeight: 700, color: '#16a34a' }}>{entry.quantity} units</span>
                          )}
                        </td>
                        <td style={{ padding: '9px 14px', color: '#64748b', fontSize: 12 }}>{entry.warehouseName}</td>
                        <td style={{ padding: '9px 14px', color: '#64748b', fontSize: 12, whiteSpace: 'nowrap' }}>
                          <div>{fmtDate(entry.createdAt)}</div>
                          <div style={{ fontSize: 10, color: '#94a3b8' }}>{fmtTime(entry.createdAt)}</div>
                        </td>
                        <td style={{ padding: '9px 14px' }}>
                          <button onClick={() => deleteEntry(entry)} disabled={deleting === entry.id}
                            style={{ height: 28, padding: '0 12px', border: '1px solid #fca5a5', borderRadius: 6, background: '#fef2f2', color: '#dc2626', fontSize: 11, fontWeight: 600, cursor: 'pointer', opacity: deleting === entry.id ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                            {deleting === entry.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </td>
                      </tr>
                      {/* IMEI expand row */}
                      {expandId === entry.id && entry.imeis.length > 0 && (
                        <tr key={`${entry.id}-imeis`} style={{ background: '#f0f9ff' }}>
                          <td colSpan={6} style={{ padding: '8px 14px 12px 14px' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#1d4ed8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>IMEIs in this entry</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {entry.imeis.map(im => (
                                <span key={im} style={{ fontFamily: 'monospace', fontSize: 12, background: '#fff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '3px 10px', color: '#1e40af' }}>{im}</span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
export default OpeningStock;
