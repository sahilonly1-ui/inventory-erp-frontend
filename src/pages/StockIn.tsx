import { useState, useEffect, useRef, useCallback, KeyboardEvent } from 'react';
import { api } from '../api/client';

// ── Types ───────────────────────────────────────────────────────────────────
interface Warehouse { id: string; name: string; }
interface Supplier  { id: string; name: string; code: string; }
type RowStatus = 'empty' | 'found' | 'awaiting_imei' | 'awaiting_qty' | 'saved' | 'err';

interface Row {
  id: string;
  ean: string; productId: string; model: string; brand: string; imeiRequired: boolean;
  qty: number; imei: string;
  status: RowStatus; errMsg: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);
const genDoc = () => `SIN-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(Math.floor(Math.random()*9000+1000))}`;
const emptyRow = (): Row => ({ id: uid(), ean:'', productId:'', model:'', brand:'', imeiRequired:false, qty:0, imei:'', status:'empty', errMsg:'' });
const SUPP_KEY = 'erp_suppliers_v1';
const getSuppHistory = (): string[] => { try { return JSON.parse(localStorage.getItem(SUPP_KEY)||'[]'); } catch { return []; } };
const saveSuppHistory = (name: string) => {
  const h = getSuppHistory().filter(s => s !== name);
  localStorage.setItem(SUPP_KEY, JSON.stringify([name, ...h].slice(0, 100)));
};

// ── Input style ──────────────────────────────────────────────────────────────
const cellInp: React.CSSProperties = { width:'100%', height:'100%', border:'none', padding:'0 8px', background:'transparent', fontSize:13, color:'#101828', outline:'none', fontFamily:'inherit' };

// ── Component ────────────────────────────────────────────────────────────────
export function StockIn() {
  const [warehouses, setWarehouses]   = useState<Warehouse[]>([]);
  const [suppliers, setSuppliers]     = useState<Supplier[]>([]);
  const [suppHistory, setSuppHistory] = useState<string[]>(getSuppHistory);

  // Session header
  const [warehouseId, setWarehouseId] = useState('');
  const [supplier, setSupplier]       = useState('');
  const [invoiceNo, setInvoiceNo]     = useState('');
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().slice(0,10));
  const [suppSearch, setSuppSearch]   = useState('');
  const [suppDrop, setSuppDrop]       = useState(false);
  const [docNumber]                   = useState(genDoc);

  // Grid
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [activeRow, setActiveRow] = useState(0);
  const [focusCell, setFocusCell] = useState<'ean'|'imei'>('ean');

  // Right panel
  const [drawer, setDrawer] = useState<string|null>(null); // ean that triggered it
  const [df, setDf] = useState({ ean:'', model:'', brand:'', categoryName:'', costPrice:'', sellingPrice:'', mrp:'', gstRate:'18', imeiRequired:false, hsnCode:'' });

  // Refs for cell focus
  const refs = useRef<Record<string, HTMLInputElement|null>>({});
  const setRef = (rowIdx: number, cell: 'ean'|'imei') => (el: HTMLInputElement|null) => { refs.current[`${rowIdx}-${cell}`] = el; };

  useEffect(() => {
    api<Warehouse[]>('/warehouses').then(ws => { setWarehouses(ws); if (ws.length) setWarehouseId(ws[0].id); }).catch(()=>{});
    api<Supplier[]>('/suppliers').catch(()=>{});
    api<{items: Supplier[]; total: number}>('/vendors').then(d => setSuppliers(Array.isArray(d) ? d : (d as any).items || [])).catch(()=>{});
  }, []);

  // Focus management
  useEffect(() => {
    const el = refs.current[`${activeRow}-${focusCell}`];
    if (el) { setTimeout(() => { el.focus(); }, 30); }
  }, [activeRow, focusCell]);

  const updateRow = useCallback((idx: number, patch: Partial<Row>) => {
    setRows(rs => rs.map((r, i) => i === idx ? { ...r, ...patch } : r));
  }, []);

  const addRowAfter = useCallback((currentIdx: number, nextFocus: 'ean'|'imei', prefill?: Partial<Row>) => {
    setRows(rs => {
      const next = { ...emptyRow(), ...prefill };
      const updated = [...rs];
      updated.splice(currentIdx + 1, 0, next);
      return updated;
    });
    setActiveRow(currentIdx + 1);
    setFocusCell(nextFocus);
  }, []);

  // ── EAN Enter ───────────────────────────────────────────────────────────────
  const handleEan = useCallback(async (idx: number, ean: string) => {
    const v = ean.trim();
    if (!v) return;
    if (!warehouseId) { alert('Select a warehouse first'); return; }
    try {
      const res = await api<{ product: { id:string; ean:string; model:string; brand:string; imeiRequired:boolean } }>(`/inventory/lookup?ean=${encodeURIComponent(v)}`);
      const p = res.product;
      if (p.imeiRequired) {
        updateRow(idx, { productId:p.id, model:p.model, brand:p.brand, imeiRequired:true, qty:0, status:'awaiting_imei', errMsg:'' });
        setFocusCell('imei');
      } else {
        // Non-IMEI: check if same EAN already in rows → increment qty
        const existIdx = rows.findIndex((r, i) => i !== idx && r.productId === p.id && r.status === 'saved');
        if (existIdx >= 0) {
          // Increment existing row
          setRows(rs => rs.map((r, i) => i === existIdx ? { ...r, qty: r.qty + 1 } : r));
          updateRow(idx, { ean:'', productId:'', model:'', brand:'', qty:0, status:'empty', errMsg:'' });
          setFocusCell('ean');
        } else {
          updateRow(idx, { productId:p.id, model:p.model, brand:p.brand, imeiRequired:false, qty:1, status:'saved', errMsg:'' });
          // Auto-save non-IMEI row and move to next
          try {
            await api('/inventory/stock-in', { method:'POST', body: JSON.stringify({ productId:p.id, warehouseId, quantity:1, remarks:`${docNumber}${supplier ? ' | '+supplier : ''}${invoiceNo ? ' | INV:'+invoiceNo : ''}` }) });
          } catch {}
          addRowAfter(idx, 'ean');
        }
      }
    } catch {
      // EAN not found
      updateRow(idx, { ean:v, status:'err', errMsg:'Not found' });
      setDf(f => ({ ...f, ean:v }));
      setDrawer(v);
    }
  }, [warehouseId, rows, addRowAfter, updateRow, docNumber, supplier, invoiceNo]);

  // ── IMEI Enter ──────────────────────────────────────────────────────────────
  const handleImei = useCallback(async (idx: number, imei: string) => {
    const v = imei.trim();
    if (!v) return;
    const row = rows[idx];
    if (!row.productId) { setFocusCell('ean'); return; }

    // Duplicate check
    try {
      await api(`/imei/${encodeURIComponent(v)}`);
      // Found → duplicate
      updateRow(idx, { errMsg:`IMEI ${v} already in system`, imei:v });
      setFocusCell('imei');
      return;
    } catch { /* 404 = not found = OK */ }

    // Valid → save
    try {
      await api('/imei/receive', { method:'POST', body: JSON.stringify({ productId:row.productId, warehouseId, imeis:[{ imei1:v }], remarks:`${docNumber}${supplier ? ' | '+supplier : ''}` }) });
      const newQty = row.qty + 1;
      updateRow(idx, { imei:v, qty:newQty, status:'saved', errMsg:'' });
      // Next row: same product pre-filled, focus IMEI (batch mode)
      addRowAfter(idx, 'imei', { productId:row.productId, model:row.model, brand:row.brand, imeiRequired:true, status:'awaiting_imei' });
    } catch (e:any) {
      updateRow(idx, { errMsg:e.message, imei:v });
      setFocusCell('imei');
    }
  }, [rows, warehouseId, addRowAfter, updateRow, docNumber, supplier]);

  const deleteRow = useCallback((idx: number) => {
    setRows(rs => { if (rs.length === 1) return [emptyRow()]; return rs.filter((_,i) => i !== idx); });
    if (activeRow >= idx && activeRow > 0) setActiveRow(r => r - 1);
  }, [activeRow]);

  const clearAll = () => { if (!confirm('Clear all scanned rows?')) return; setRows([emptyRow()]); setActiveRow(0); setFocusCell('ean'); };

  // ── Supplier autocomplete ────────────────────────────────────────────────────
  const allSuggestions = [...new Set([...suppHistory, ...suppliers.map(s => s.name)])].filter(s => s.toLowerCase().includes(suppSearch.toLowerCase())).slice(0,8);

  const selectSupplier = (name: string) => { setSupplier(name); setSuppSearch(''); setSuppDrop(false); saveSuppHistory(name); setSuppHistory(getSuppHistory()); };

  // ── Drawer save ───────────────────────────────────────────────────────────────
  const saveDrawer = async () => {
    if (!df.model) return;
    try {
      await api('/products', { method:'POST', body: JSON.stringify({ ean:df.ean, model:df.model, brand:df.brand, categoryName:df.categoryName, costPrice:parseFloat(df.costPrice)||0, sellingPrice:parseFloat(df.sellingPrice)||0, imeiRequired:df.imeiRequired, gstRate:parseFloat(df.gstRate)||18, status:'ACTIVE' }) });
      setDrawer(null);
      const idx = rows.findIndex(r => r.ean === df.ean && r.status === 'err');
      if (idx >= 0) { updateRow(idx, { errMsg:'', status:'empty' }); setActiveRow(idx); setFocusCell('ean'); }
    } catch (e:any) { alert(e.message); }
  };

  // ── Summary ───────────────────────────────────────────────────────────────────
  const savedRows = rows.filter(r => r.status === 'saved' && r.qty > 0);
  const summary = Object.values(savedRows.reduce((acc:any, r) => { const k = r.model || r.ean; if (!acc[k]) acc[k] = { model:k, qty:0 }; acc[k].qty += r.qty; return acc; }, {})) as { model:string; qty:number }[];
  const grandTotal = summary.reduce((s,r) => s + r.qty, 0);

  // ── Keyboard handlers ─────────────────────────────────────────────────────────
  const onEanKey = (e: KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); handleEan(idx, (e.target as HTMLInputElement).value); }
  };
  const onImeiKey = (e: KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key === 'Enter') { e.preventDefault(); handleImei(idx, (e.target as HTMLInputElement).value); }
    if (e.key === 'Escape') { updateRow(idx, { errMsg:'' }); }
  };

  // ── Row status pill ───────────────────────────────────────────────────────────
  const StatusPill = ({ row }: { row: Row }) => {
    if (row.errMsg) return <span style={{ fontSize:10, background:'#fef2f2', color:'#dc2626', padding:'2px 8px', borderRadius:10, fontWeight:600 }} title={row.errMsg}>✕ Error</span>;
    if (row.status === 'saved') return <span style={{ fontSize:10, background:'#dcfce7', color:'#15803d', padding:'2px 8px', borderRadius:10, fontWeight:600 }}>✓ {row.imeiRequired ? `IMEI` : `Qty`}</span>;
    if (row.status === 'awaiting_imei') return <span style={{ fontSize:10, background:'#fef9c3', color:'#854d0e', padding:'2px 8px', borderRadius:10 }}>Scan IMEI</span>;
    if (row.status === 'found') return <span style={{ fontSize:10, background:'#dbeafe', color:'#1d4ed8', padding:'2px 8px', borderRadius:10 }}>Found</span>;
    return null;
  };

  const inpStyle = (active: boolean): React.CSSProperties => ({
    width:'100%', height:'100%', border:'none', padding:'0 8px',
    background: active ? '#fff' : 'transparent',
    fontSize:13, color:'#101828', outline:'none', fontFamily:'inherit',
  });

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 0px)', background:'#f5f7fa' }}>
      {/* ── Session Header ──────────────────────────────────────────────────── */}
      <div style={{ background:'#fff', borderBottom:'1px solid #e4e7ec', padding:'10px 16px', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
          <span style={{ fontSize:11, fontWeight:700, color:'#2563eb', background:'#eff6ff', padding:'3px 10px', borderRadius:20, border:'1px solid #bfdbfe', letterSpacing:'.02em' }}>{docNumber}</span>
          <span style={{ fontSize:12, fontWeight:600, color:'#475467', marginLeft:4 }}>Stock In Entry</span>
          <div style={{ flex:1 }} />
          <span style={{ fontSize:11, color:'#98a2b3' }}>{savedRows.length} items · {grandTotal} units</span>
          <button onClick={clearAll} style={{ height:28, padding:'0 10px', border:'1px solid #fca5a5', borderRadius:6, background:'#fef2f2', color:'#dc2626', fontSize:11, fontWeight:600, cursor:'pointer' }}>Clear All</button>
          <button style={{ height:28, padding:'0 14px', border:'none', borderRadius:6, background:'#2563eb', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', opacity:savedRows.length ? 1 : .4 }} disabled={!savedRows.length}>✓ Done</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 160px 180px 160px', gap:8 }}>
          {/* Supplier */}
          <div style={{ position:'relative' }}>
            <label style={{ fontSize:10, fontWeight:700, color:'#98a2b3', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:3 }}>Supplier / Received From *</label>
            <input value={suppSearch || supplier} placeholder="Type supplier name…"
              onChange={e => { setSuppSearch(e.target.value); setSupplier(''); setSuppDrop(true); }}
              onFocus={() => { setSuppSearch(supplier); setSuppDrop(true); }}
              onBlur={() => setTimeout(() => { setSuppDrop(false); if (suppSearch && !supplier) { setSupplier(suppSearch); saveSuppHistory(suppSearch); setSuppHistory(getSuppHistory()); } }, 200)}
              onKeyDown={e => { if (e.key === 'Enter' && suppSearch) { selectSupplier(suppSearch); } if (e.key === 'Escape') setSuppDrop(false); }}
              style={{ width:'100%', height:34, padding:'0 10px', border:`1.5px solid ${supplier ? '#2563eb' : '#d0d5dd'}`, borderRadius:7, fontSize:13, color:'#101828', outline:'none', boxSizing:'border-box' }} />
            {suppDrop && allSuggestions.length > 0 && (
              <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'#fff', border:'1px solid #e4e7ec', borderRadius:8, boxShadow:'0 8px 24px rgba(0,0,0,.1)', zIndex:200, marginTop:2, overflow:'hidden' }}>
                {allSuggestions.map(s => (
                  <div key={s} onMouseDown={() => selectSupplier(s)}
                    style={{ padding:'8px 12px', fontSize:13, cursor:'pointer', color:'#344054' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background='#f5f7fa'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background='transparent'}>{s}</div>
                ))}
                {suppSearch && !allSuggestions.find(s => s.toLowerCase() === suppSearch.toLowerCase()) && (
                  <div onMouseDown={() => selectSupplier(suppSearch)}
                    style={{ padding:'8px 12px', fontSize:13, cursor:'pointer', color:'#2563eb', fontWeight:600, borderTop:'1px solid #f2f4f7' }}>
                    ＋ Add "{suppSearch}"
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Date */}
          <div>
            <label style={{ fontSize:10, fontWeight:700, color:'#98a2b3', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:3 }}>Date</label>
            <input type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)} style={{ width:'100%', height:34, padding:'0 10px', border:'1.5px solid #d0d5dd', borderRadius:7, fontSize:13, color:'#101828', outline:'none', boxSizing:'border-box' }} />
          </div>
          {/* Invoice */}
          <div>
            <label style={{ fontSize:10, fontWeight:700, color:'#98a2b3', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:3 }}>Invoice No. <span style={{ color:'#c4c8d0', fontWeight:400 }}>(optional)</span></label>
            <input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="e.g. INV-2026-001" style={{ width:'100%', height:34, padding:'0 10px', border:'1.5px solid #d0d5dd', borderRadius:7, fontSize:13, color:'#101828', outline:'none', boxSizing:'border-box' }} />
          </div>
          {/* Warehouse */}
          <div>
            <label style={{ fontSize:10, fontWeight:700, color:'#98a2b3', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:3 }}>Warehouse</label>
            <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} style={{ width:'100%', height:34, padding:'0 10px', border:'1.5px solid #d0d5dd', borderRadius:7, fontSize:13, color:'#101828', outline:'none', background:'#fff', boxSizing:'border-box' }}>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Main: Grid + Right Panel ────────────────────────────────────────── */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        {/* Grid */}
        <div style={{ flex:1, overflowY:'auto', overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, tableLayout:'fixed' }}>
            <colgroup>
              <col style={{ width:40 }}/><col style={{ width:160 }}/><col /><col style={{ width:60 }}/><col style={{ width:200 }}/><col style={{ width:110 }}/><col style={{ width:38 }}/>
            </colgroup>
            <thead>
              <tr style={{ background:'#f8fafc', position:'sticky', top:0, zIndex:5 }}>
                {['#','EAN / Barcode','Product Name','Qty','IMEI / Serial No.','Status',''].map((h,i) => (
                  <th key={i} style={{ padding:'0 8px', height:32, textAlign: i === 3 ? 'center' : 'left', fontWeight:600, color:'#64748b', fontSize:11, textTransform:'uppercase', letterSpacing:'.06em', borderBottom:'2px solid #e4e7ec', whiteSpace:'nowrap', userSelect:'none' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const isActive = idx === activeRow;
                const rowBg = row.status === 'saved' ? '#f0fdf4' : row.errMsg ? '#fff8f8' : isActive ? '#f0f9ff' : idx%2===0 ? '#fff' : '#fafafa';
                return (
                  <tr key={row.id} style={{ background:rowBg, transition:'background .1s' }} onClick={() => setActiveRow(idx)}>
                    {/* Row num */}
                    <td style={{ padding:'0 8px', height:36, textAlign:'center', color:'#94a3b8', fontSize:11, fontWeight:600, background:'#f8fafc', borderBottom:'1px solid #e4e7ec', borderRight:'1px solid #e4e7ec' }}>{idx+1}</td>
                    {/* EAN */}
                    <td style={{ borderBottom:'1px solid #e4e7ec', borderRight:'1px solid #e4e7ec', padding:0 }}
                        >
                      <div style={{ display:'flex', height:36, border: isActive && focusCell==='ean' ? '2px solid #2563eb' : '2px solid transparent', borderRadius: isActive && focusCell==='ean' ? 4 : 0 }}>
                        <input ref={setRef(idx,'ean')} value={row.ean}
                          onChange={e => updateRow(idx, { ean:e.target.value, errMsg:'', status:row.status==='err'?'empty':row.status })}
                          onKeyDown={e => onEanKey(e, idx)}
                          onFocus={() => { setActiveRow(idx); setFocusCell('ean'); }}
                          placeholder={idx===0?'Scan EAN or barcode…':''}
                          style={{ ...cellInp, background: isActive && focusCell==='ean' ? '#fff' : 'transparent' }} />
                      </div>
                    </td>
                    {/* Product Name */}
                    <td style={{ borderBottom:'1px solid #e4e7ec', borderRight:'1px solid #e4e7ec', padding:0 }}>
                      <input value={row.model} readOnly tabIndex={-1} placeholder="Auto-filled after scan"
                        style={{ ...cellInp, color: row.model ? '#101828' : '#94a3b8', fontWeight: row.model ? 500 : 400, cursor:'default' }} />
                    </td>
                    {/* Qty — auto, readonly */}
                    <td style={{ borderBottom:'1px solid #e4e7ec', borderRight:'1px solid #e4e7ec', padding:0, textAlign:'center' }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:36, fontSize:14, fontWeight:700, color: row.qty > 0 ? '#16a34a' : '#94a3b8' }}>
                        {row.qty > 0 ? row.qty : '—'}
                      </div>
                    </td>
                    {/* IMEI */}
                    <td style={{ borderBottom:'1px solid #e4e7ec', borderRight:'1px solid #e4e7ec', padding:0 }}>
                      <div style={{ display:'flex', height:36, border: isActive && focusCell==='imei' ? '2px solid #f59e0b' : '2px solid transparent', borderRadius: isActive && focusCell==='imei' ? 4 : 0 }}>
                        <input ref={setRef(idx,'imei')} value={row.imei}
                          onChange={e => updateRow(idx, { imei:e.target.value, errMsg:'' })}
                          onKeyDown={e => onImeiKey(e, idx)}
                          onFocus={() => { setActiveRow(idx); setFocusCell('imei'); }}
                          readOnly={!row.imeiRequired}
                          placeholder={row.imeiRequired ? 'Scan IMEI…' : '—'}
                          style={{ ...cellInp, fontFamily: row.imeiRequired ? 'monospace' : 'inherit', fontSize:12, color: row.errMsg && row.imei ? '#dc2626' : '#101828', background: isActive && focusCell==='imei' ? '#fffbeb' : 'transparent', cursor: row.imeiRequired ? 'text' : 'default' }} />
                      </div>
                    </td>
                    {/* Status */}
                    <td style={{ borderBottom:'1px solid #e4e7ec', borderRight:'1px solid #e4e7ec', padding:'0 8px', textAlign:'center' }}>
                      <StatusPill row={row} />
                    </td>
                    {/* Delete */}
                    <td style={{ borderBottom:'1px solid #e4e7ec', padding:0, textAlign:'center' }}>
                      <button onClick={e => { e.stopPropagation(); deleteRow(idx); }}
                        style={{ width:28, height:28, border:'none', background:'none', cursor:'pointer', color:'#d1d5db', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color='#dc2626'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color='#d1d5db'}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Right: Live Summary ─────────────────────────────────────────── */}
        <div style={{ width:260, borderLeft:'1px solid #e4e7ec', background:'#fff', display:'flex', flexDirection:'column', flexShrink:0 }}>
          <div style={{ padding:'10px 12px 8px', borderBottom:'1px solid #f2f4f7' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#98a2b3', textTransform:'uppercase', letterSpacing:'.08em' }}>Stock Received — {sessionDate}</div>
            {supplier && <div style={{ fontSize:11, fontWeight:600, color:'#2563eb', marginTop:2 }}>From: {supplier}</div>}
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:'6px 0' }}>
            {summary.length === 0 ? (
              <div style={{ padding:'24px 12px', textAlign:'center', color:'#c4c8d0', fontSize:12 }}>Scan products to see summary</div>
            ) : summary.map(s => (
              <div key={s.model} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 14px', fontSize:12 }}>
                <span style={{ color:'#344054', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:175 }}>{s.model}</span>
                <span style={{ fontWeight:700, color:'#16a34a', flexShrink:0, marginLeft:6 }}>{s.qty}</span>
              </div>
            ))}
          </div>
          {grandTotal > 0 && (
            <div style={{ padding:'10px 14px', borderTop:'1px solid #f2f4f7', display:'flex', justifyContent:'space-between', fontSize:13, fontWeight:700 }}>
              <span style={{ color:'#344054' }}>Grand Total</span>
              <span style={{ color:'#16a34a' }}>{grandTotal} units</span>
            </div>
          )}
        </div>
      </div>

      {/* ── New Product Drawer ──────────────────────────────────────────────── */}
      {drawer !== null && (
        <div style={{ position:'fixed', inset:0, zIndex:300, display:'flex', alignItems:'stretch', justifyContent:'flex-end' }}>
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.25)' }} onClick={() => setDrawer(null)} />
          <div style={{ width:380, background:'#fff', boxShadow:'-8px 0 40px rgba(0,0,0,.15)', display:'flex', flexDirection:'column', position:'relative', zIndex:1 }}>
            <div style={{ padding:'16px 20px', borderBottom:'1px solid #e4e7ec', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:15, fontWeight:700, color:'#101828' }}>New Product</div>
                <div style={{ fontSize:12, color:'#98a2b3', marginTop:2 }}>EAN <strong style={{ color:'#2563eb', fontFamily:'monospace' }}>{drawer}</strong> not in system</div>
              </div>
              <button onClick={() => setDrawer(null)} style={{ width:28, height:28, border:'1px solid #e4e7ec', borderRadius:7, background:'#f9fafb', cursor:'pointer', fontSize:16, color:'#6b7280' }}>✕</button>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'16px 20px' }}>
              {[['Product Name *','model','text'],['Brand','brand','text'],['Category','categoryName','text'],['Selling Price ₹','sellingPrice','number'],['MRP ₹','mrp','number'],['Cost Price ₹','costPrice','number'],['GST %','gstRate','number'],['HSN Code','hsnCode','text']].map(([l,k,t]) => (
                <div key={k as string} style={{ marginBottom:12 }}>
                  <label style={{ fontSize:11, fontWeight:600, color:'#64748b', textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:4 }}>{l as string}</label>
                  <input type={t as string} value={df[k as keyof typeof df] as string} onChange={e => setDf(f => ({ ...f, [k as string]: e.target.value }))}
                    style={{ width:'100%', height:36, padding:'0 10px', border:'1.5px solid #d0d5dd', borderRadius:7, fontSize:13, color:'#101828', outline:'none', boxSizing:'border-box' }}
                    onFocus={e => (e.target as HTMLInputElement).style.borderColor='#2563eb'}
                    onBlur={e => (e.target as HTMLInputElement).style.borderColor='#d0d5dd'} />
                </div>
              ))}
              <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', marginBottom:20 }}>
                <input type="checkbox" checked={df.imeiRequired} onChange={e => setDf(f => ({ ...f, imeiRequired:e.target.checked }))} style={{ width:16, height:16, accentColor:'#2563eb' }} />
                <span style={{ fontSize:13, color:'#344054', fontWeight:500 }}>IMEI / Serial tracking required</span>
              </label>
              <button onClick={saveDrawer} style={{ width:'100%', height:42, border:'none', borderRadius:8, background:'#2563eb', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer' }}>Save Product &amp; Continue</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
