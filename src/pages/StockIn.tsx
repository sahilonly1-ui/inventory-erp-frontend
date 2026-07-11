import { useState, useEffect, useRef, useCallback, KeyboardEvent } from 'react';
import { api } from '../api/client';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Warehouse { id: string; name: string; }
type RowStatus = 'empty'|'loading'|'found'|'not_found'|'awaiting_imei'|'saved'|'err';
interface Row { id:string; ean:string; productId:string; model:string; brand:string; imeiRequired:boolean; qty:number; imei:string; status:RowStatus; errMsg:string; }

// ── Helpers ───────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2,9);
const genDoc = () => `SIN-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(Math.floor(Math.random()*9000+1000))}`;
const emptyRow = (): Row => ({ id:uid(), ean:'', productId:'', model:'', brand:'', imeiRequired:false, qty:0, imei:'', status:'empty', errMsg:'' });

const SUPP_KEY = 'erp_suppliers_v2';
const getHistory = (): string[] => { try { return JSON.parse(localStorage.getItem(SUPP_KEY)||'[]'); } catch { return []; } };
const saveHistory = (n:string) => { const h=getHistory().filter(x=>x!==n); localStorage.setItem(SUPP_KEY, JSON.stringify([n,...h].slice(0,100))); };
const toTitle = (s:string) => s.trim().replace(/\b\w+/g, w=>w[0].toUpperCase()+w.slice(1).toLowerCase());

// Product cache to avoid repeated API calls for same EAN
const productCache = new Map<string, { productId:string; model:string; brand:string; imeiRequired:boolean }|null>();

// ── State creation modal ──────────────────────────────────────────────────────
const STATES = ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Delhi','Goa','Gujarat','Haryana','Himachal Pradesh','Jammu & Kashmir','Jharkhand','Karnataka','Kerala','Ladakh','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Puducherry','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Chandigarh','Other'];

function SupplierModal({ name, onSave, onSkip }: { name:string; onSave:(state:string)=>void; onSkip:()=>void; }) {
  const [state, setState] = useState('');
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,.5)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'#fff', borderRadius:16, padding:28, width:420, boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
        <div style={{ fontSize:18, fontWeight:800, color:'#0f172a', marginBottom:4 }}>New Supplier</div>
        <div style={{ fontSize:13, color:'#64748b', marginBottom:20 }}>
          <strong style={{ color:'#2563eb' }}>{toTitle(name)}</strong> is not in Supplier Master yet. Please provide State to add them.
        </div>
        <label style={{ fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:6 }}>State *</label>
        <select value={state} onChange={e=>setState(e.target.value)} autoFocus
          style={{ width:'100%', height:40, padding:'0 12px', border:'1.5px solid #d0d5dd', borderRadius:8, fontSize:13, marginBottom:20, background:'#fff', outline:'none' }}>
          <option value="">Select state…</option>
          {STATES.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={()=>state&&onSave(state)} disabled={!state}
            style={{ flex:1, height:40, border:'none', borderRadius:8, background:state?'#2563eb':'#94a3b8', color:'#fff', fontSize:14, fontWeight:700, cursor:state?'pointer':'not-allowed' }}>
            Save &amp; Continue
          </button>
          <button onClick={onSkip} style={{ height:40, padding:'0 16px', border:'1px solid #e2e8f0', borderRadius:8, background:'#fff', fontSize:13, color:'#64748b', cursor:'pointer' }}>Skip</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function StockIn() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [supplier, setSupplier] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().slice(0,10));
  const [suppSearch, setSuppSearch] = useState('');
  const [suppDrop, setSuppDrop] = useState(false);
  const [suppHistory, setSuppHistory] = useState<string[]>(getHistory);
  const [suppModal, setSuppModal] = useState<string|null>(null); // supplier name awaiting state
  const [docNumber] = useState(genDoc);

  // Draft rows — NOT saved until Done is clicked
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [activeRow, setActiveRow] = useState(0);
  const [focusCell, setFocusCell] = useState<'ean'|'imei'>('ean');
  const [committing, setCommitting] = useState(false);

  const [drawer, setDrawer] = useState<string|null>(null);
  const [df, setDf] = useState({ ean:'', model:'', brand:'', categoryName:'', costPrice:'', sellingPrice:'', mrp:'', gstRate:'18', imeiRequired:false });

  const refs = useRef<Record<string, HTMLInputElement|null>>({});
  const setRef = (i:number, c:'ean'|'imei') => (el:HTMLInputElement|null) => { refs.current[`${i}-${c}`] = el; };

  useEffect(() => {
    api<Warehouse[]>('/warehouses').then(ws => {
      setWarehouses(ws);
      const main = ws.find(w=>w.name.toLowerCase().includes('main'));
      setWarehouseId(main?.id || ws[0]?.id || '');
    }).catch(()=>{});
  }, []);

  useEffect(() => {
    const el = refs.current[`${activeRow}-${focusCell}`];
    if (el) setTimeout(() => el.focus(), 20);
  }, [activeRow, focusCell]);

  const updateRow = useCallback((idx:number, p:Partial<Row>) => setRows(rs=>rs.map((r,i)=>i===idx?{...r,...p}:r)), []);

  // Async EAN lookup with cache
  const lookupEan = useCallback(async (ean:string): Promise<{ productId:string; model:string; brand:string; imeiRequired:boolean }|null> => {
    if (productCache.has(ean)) return productCache.get(ean)!;
    try {
      const res = await api<{ product:{ id:string; model:string; brand:string; imeiRequired:boolean } }>(`/inventory/lookup?ean=${encodeURIComponent(ean)}`);
      const p = res.product;
      const result = { productId:p.id, model:p.model, brand:p.brand, imeiRequired:p.imeiRequired };
      productCache.set(ean, result);
      return result;
    } catch { productCache.set(ean, null); return null; }
  }, []);

  const handleEan = useCallback(async (idx:number, ean:string) => {
    const v = ean.trim(); if (!v) return;
    // Move cursor to IMEI immediately (non-blocking UX)
    updateRow(idx, { ean:v, status:'loading', errMsg:'' });
    setFocusCell('imei');

    // Lookup in background
    const product = await lookupEan(v);
    if (!product) {
      setDrawer(v); setDf(d=>({...d, ean:v}));
      updateRow(idx, { status:'not_found', errMsg:'' });
      setFocusCell('ean');
      return;
    }
    updateRow(idx, { ...product, status: product.imeiRequired ? 'awaiting_imei' : 'saved', qty: product.imeiRequired ? 0 : 1 });
    if (!product.imeiRequired) {
      // Non-IMEI product: add row and go to next EAN immediately
      if (idx === rows.length-1) setRows(rs=>[...rs, emptyRow()]);
      setActiveRow(idx+1); setFocusCell('ean');
    }
    // IMEI products: cursor is already on IMEI (moved above)
  }, [rows.length, lookupEan, updateRow]);

  const handleImei = useCallback(async (idx:number, imei:string) => {
    const v = imei.trim(); if (!v) return;
    const row = rows[idx];
    if (!row.productId) { return; }

    // Duplicate check
    try { await api(`/imei/${encodeURIComponent(v)}`); updateRow(idx, { errMsg:`IMEI ${v} already exists!`, status:'err' }); return; }
    catch {}

    // Valid IMEI: add to row (will be committed on Done)
    updateRow(idx, { imei:v, qty:row.qty+1, status:'saved', errMsg:'' });
    // Next row: same product prefilled, focus IMEI (batch scanning)
    const next = { ...emptyRow(), productId:row.productId, model:row.model, brand:row.brand, imeiRequired:true, status:'awaiting_imei' as RowStatus };
    if (idx === rows.length-1) setRows(rs=>[...rs, next]);
    else setRows(rs => { const u=[...rs]; u.splice(idx+1,0,next); return u; });
    setActiveRow(idx+1); setFocusCell('imei');
  }, [rows]);

  // Handle supplier selection/auto-create
  const resolveSupplier = useCallback(async (name:string, state?:string): Promise<string|null> => {
    const titled = toTitle(name);
    try {
      const res = await api<any>('/vendors/find-or-create', { method:'POST', body:JSON.stringify({ name:titled, state }) });
      if (res.needsState) { setSuppModal(name); return null; }
      const v = res.vendor;
      if (v) {
        setSupplier(titled); setSupplierId(v.id);
        saveHistory(titled); setSuppHistory(getHistory());
        return v.id;
      }
    } catch {}
    return null;
  }, []);

  // Commit all draft rows to backend
  const commitAll = useCallback(async () => {
    const saved = rows.filter(r => r.status === 'saved' && r.productId);
    if (!saved.length) return;
    if (!warehouseId) { alert('Select a warehouse'); return; }
    setCommitting(true);
    try {
      for (const r of saved) {
        if (r.imeiRequired && r.imei) {
          await api('/imei/receive', { method:'POST', body:JSON.stringify({ productId:r.productId, warehouseId, imeis:[{imei1:r.imei}], remarks:`${docNumber}${supplier?' | '+supplier:''}${invoiceNo?' | '+invoiceNo:''}` }) });
        } else if (!r.imeiRequired) {
          await api('/inventory/stock-in', { method:'POST', body:JSON.stringify({ productId:r.productId, warehouseId, quantity:r.qty, vendorId:supplierId||undefined, remarks:`${docNumber}${invoiceNo?' | '+invoiceNo:''}` }) });
        }
      }
      // Reset to fresh session
      productCache.clear();
      setRows([emptyRow()]); setActiveRow(0); setFocusCell('ean');
      setSupplier(''); setSupplierId(''); setInvoiceNo('');
      alert(`✓ ${saved.length} items committed as ${docNumber}`);
    } catch(e:any) { alert('Commit failed: '+e.message); }
    finally { setCommitting(false); }
  }, [rows, warehouseId, supplierId, supplier, invoiceNo, docNumber]);

  const deleteRow = (idx:number) => { setRows(rs=>rs.length===1?[emptyRow()]:rs.filter((_,i)=>i!==idx)); if (activeRow>=idx&&activeRow>0) setActiveRow(r=>r-1); };
  const clearAll = () => { if (!confirm('Clear all scanned rows?')) return; productCache.clear(); setRows([emptyRow()]); setActiveRow(0); setFocusCell('ean'); };

  const onEanKey = (e:KeyboardEvent<HTMLInputElement>, idx:number) => { if (e.key==='Enter'||e.key==='Tab') { e.preventDefault(); handleEan(idx,(e.target as HTMLInputElement).value); } };
  const onImeiKey = (e:KeyboardEvent<HTMLInputElement>, idx:number) => { if (e.key==='Enter') { e.preventDefault(); handleImei(idx,(e.target as HTMLInputElement).value); } if (e.key==='Escape') updateRow(idx,{errMsg:''}); };

  const savedRows = rows.filter(r=>r.status==='saved'&&r.qty>0);
  const summary = Object.values(savedRows.reduce((a:any,r)=>{ const k=r.model||r.ean; if(!a[k]) a[k]={model:k,qty:0}; a[k].qty+=r.qty; return a; },{})) as any[];
  const total = summary.reduce((s,r)=>s+r.qty,0);

  const allSugg = [...new Set([...suppHistory.filter(x=>x.toLowerCase().includes(suppSearch.toLowerCase())).slice(0,6)])];

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh)', background:'#fff' }}>
      {/* Header */}
      <div style={{ padding:'10px 20px 10px', borderBottom:'1px solid #e2e8f0', background:'#fff', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
          <span style={{ fontSize:11, fontWeight:700, color:'#2563eb', background:'#eff6ff', padding:'3px 12px', borderRadius:20, border:'1px solid #bfdbfe' }}>{docNumber}</span>
          <span style={{ fontSize:13, fontWeight:700, color:'#0f172a' }}>Stock In Entry</span>
          <div style={{ flex:1 }} />
          <span style={{ fontSize:11, color:'#94a3b8' }}>{savedRows.length} items · {total} units</span>
          <button onClick={clearAll} style={{ height:30, padding:'0 12px', border:'1px solid #fecdd3', borderRadius:7, background:'#fff5f5', color:'#dc2626', fontSize:11, fontWeight:600, cursor:'pointer' }}>Clear All</button>
          <button onClick={commitAll} disabled={!savedRows.length||committing}
            style={{ height:30, padding:'0 16px', border:'none', borderRadius:7, background:(!savedRows.length||committing)?'#94a3b8':'#16a34a', color:'#fff', fontSize:12, fontWeight:700, cursor:(!savedRows.length||committing)?'not-allowed':'pointer', transition:'background .15s' }}>
            {committing ? 'Saving…' : `✓ Done (${savedRows.length})`}
          </button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 148px 200px 168px', gap:10 }}>
          {/* Supplier */}
          <div style={{ position:'relative' }}>
            <label style={{ fontSize:9, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.08em', display:'block', marginBottom:3 }}>SUPPLIER / RECEIVED FROM *</label>
            <input value={suppSearch||(supplier?toTitle(supplier):'')} placeholder="Type supplier name…"
              onChange={e=>{setSuppSearch(e.target.value);setSupplier('');setSupplierId('');setSuppDrop(true);}}
              onFocus={()=>{setSuppSearch(supplier);setSuppDrop(true);}}
              onBlur={()=>setTimeout(()=>{setSuppDrop(false);if(suppSearch&&!supplier){const n=toTitle(suppSearch);setSupplier(n);resolveSupplier(n);}},200)}
              onKeyDown={e=>{if(e.key==='Enter'&&suppSearch){const n=toTitle(suppSearch);setSupplier(n);setSuppSearch('');setSuppDrop(false);resolveSupplier(n);}if(e.key==='Escape')setSuppDrop(false);}}
              style={{ width:'100%', height:34, padding:'0 10px', border:`1.5px solid ${supplier?'#2563eb':'#d0d5dd'}`, borderRadius:7, fontSize:13, outline:'none', boxSizing:'border-box' }} />
            {suppDrop && (allSugg.length>0 || suppSearch) && (
              <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, boxShadow:'0 8px 24px rgba(0,0,0,.1)', zIndex:200, marginTop:2, overflow:'hidden' }}>
                {allSugg.map(s=><div key={s} onMouseDown={()=>{setSupplier(s);setSuppSearch('');setSuppDrop(false);resolveSupplier(s);}} style={{ padding:'8px 12px', fontSize:13, cursor:'pointer', color:'#0f172a' }} onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='#f8fafc'} onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>{s}</div>)}
                {suppSearch && !allSugg.find(x=>x.toLowerCase()===suppSearch.toLowerCase()) && (
                  <div onMouseDown={()=>{const n=toTitle(suppSearch);setSupplier(n);setSuppSearch('');setSuppDrop(false);resolveSupplier(n);}} style={{ padding:'8px 12px', fontSize:13, cursor:'pointer', color:'#2563eb', fontWeight:600, borderTop:'1px solid #f1f5f9' }}>＋ Add "{toTitle(suppSearch)}"</div>
                )}
              </div>
            )}
          </div>
          <div>
            <label style={{ fontSize:9, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.08em', display:'block', marginBottom:3 }}>DATE</label>
            <input type="date" value={sessionDate} onChange={e=>setSessionDate(e.target.value)} style={{ width:'100%', height:34, padding:'0 10px', border:'1.5px solid #d0d5dd', borderRadius:7, fontSize:13, outline:'none', boxSizing:'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize:9, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.08em', display:'block', marginBottom:3 }}>INVOICE NO. (OPTIONAL)</label>
            <input value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)} placeholder="e.g. INV-2026-001" style={{ width:'100%', height:34, padding:'0 10px', border:'1.5px solid #d0d5dd', borderRadius:7, fontSize:13, outline:'none', boxSizing:'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize:9, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.08em', display:'block', marginBottom:3 }}>WAREHOUSE</label>
            <select value={warehouseId} onChange={e=>setWarehouseId(e.target.value)} style={{ width:'100%', height:34, padding:'0 8px', border:'1.5px solid #d0d5dd', borderRadius:7, fontSize:13, outline:'none', background:'#fff', boxSizing:'border-box' }}>
              {warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Grid + Summary */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        <div style={{ flex:1, overflowY:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, tableLayout:'fixed' }}>
            <colgroup><col style={{width:40}}/><col style={{width:155}}/><col/><col style={{width:55}}/><col style={{width:195}}/><col style={{width:100}}/><col style={{width:38}}/></colgroup>
            <thead>
              <tr style={{ background:'#f8fafc', position:'sticky', top:0, zIndex:5 }}>
                {['#','EAN / BARCODE','PRODUCT NAME','QTY','IMEI / SERIAL NO.','STATUS',''].map((h,i)=>(
                  <th key={i} style={{ padding:'0 10px', height:34, textAlign:i===3?'center':'left', fontWeight:700, color:'#64748b', fontSize:10, textTransform:'uppercase', letterSpacing:'.07em', borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row,idx)=>{
                const isActive=idx===activeRow;
                const bg=row.status==='saved'?'#f0fdf4':row.errMsg?'#fff5f5':isActive?'#f0f9ff':idx%2===0?'#fff':'#fafafa';
                return (
                  <tr key={row.id} style={{ background:bg, transition:'background .1s' }} onClick={()=>setActiveRow(idx)}>
                    <td style={{ padding:'0 10px', height:36, textAlign:'center', color:'#cbd5e1', fontSize:11, fontWeight:700, background:'#f8fafc', borderBottom:'1px solid #e2e8f0', borderRight:'1px solid #e2e8f0' }}>{idx+1}</td>
                    {/* EAN */}
                    <td style={{ borderBottom:'1px solid #e2e8f0', borderRight:'1px solid #e2e8f0', padding:0 }}>
                      <div style={{ height:36, outline:isActive&&focusCell==='ean'?'2px solid #2563eb':'2px solid transparent', borderRadius:isActive&&focusCell==='ean'?4:0, display:'flex' }}>
                        <input ref={setRef(idx,'ean')} value={row.ean} onChange={e=>updateRow(idx,{ean:e.target.value,status:'empty',errMsg:''})} onKeyDown={e=>onEanKey(e,idx)} onFocus={()=>{setActiveRow(idx);setFocusCell('ean');}} placeholder={idx===0?'Scan EAN or barcode…':''} style={{ width:'100%', border:'none', padding:'0 10px', background:'transparent', fontSize:13, outline:'none', fontFamily:'inherit' }} />
                        {row.status==='loading' && <div className="spinner" style={{ width:14, height:14, margin:'11px 8px 0 0' }} />}
                      </div>
                    </td>
                    {/* Product Name */}
                    <td style={{ borderBottom:'1px solid #e2e8f0', borderRight:'1px solid #e2e8f0', padding:'0 10px', color:row.model?'#0f172a':'#cbd5e1', fontWeight:row.model?500:400, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {row.model||'Auto-filled after scan'}
                    </td>
                    {/* Qty */}
                    <td style={{ borderBottom:'1px solid #e2e8f0', borderRight:'1px solid #e2e8f0', textAlign:'center', fontWeight:700, fontSize:14, color:row.qty>0?'#16a34a':'#cbd5e1' }}>
                      {row.qty>0?row.qty:'—'}
                    </td>
                    {/* IMEI */}
                    <td style={{ borderBottom:'1px solid #e2e8f0', borderRight:'1px solid #e2e8f0', padding:0 }}>
                      <div style={{ height:36, outline:isActive&&focusCell==='imei'?'2px solid #f59e0b':'2px solid transparent', borderRadius:isActive&&focusCell==='imei'?4:0, display:'flex', background:isActive&&focusCell==='imei'?'#fffbeb':'' }}>
                        <input ref={setRef(idx,'imei')} value={row.imei} onChange={e=>updateRow(idx,{imei:e.target.value,errMsg:''})} onKeyDown={e=>onImeiKey(e,idx)} onFocus={()=>{setActiveRow(idx);setFocusCell('imei');}} readOnly={!row.imeiRequired} placeholder={row.imeiRequired?'Scan IMEI…':'—'}
                          style={{ width:'100%', border:'none', padding:'0 10px', background:'transparent', fontSize:12, outline:'none', fontFamily:row.imeiRequired?'monospace':'inherit', color:row.errMsg&&row.imei?'#dc2626':'#0f172a', cursor:row.imeiRequired?'text':'default' }} />
                      </div>
                    </td>
                    {/* Status */}
                    <td style={{ borderBottom:'1px solid #e2e8f0', borderRight:'1px solid #e2e8f0', padding:'0 10px', textAlign:'center' }}>
                      {row.errMsg&&<span style={{ fontSize:9, background:'#fef2f2', color:'#dc2626', padding:'2px 7px', borderRadius:10, fontWeight:700, cursor:'help', whiteSpace:'nowrap' }} title={row.errMsg}>✕ Error</span>}
                      {!row.errMsg&&row.status==='saved'&&<span style={{ fontSize:9, background:'#dcfce7', color:'#15803d', padding:'2px 7px', borderRadius:10, fontWeight:700 }}>✓</span>}
                      {!row.errMsg&&row.status==='awaiting_imei'&&<span style={{ fontSize:9, background:'#fef9c3', color:'#854d0e', padding:'2px 7px', borderRadius:10 }}>IMEI ↓</span>}
                      {!row.errMsg&&row.status==='not_found'&&<span style={{ fontSize:9, background:'#fef2f2', color:'#dc2626', padding:'2px 7px', borderRadius:10 }}>Not Found</span>}
                    </td>
                    {/* Delete */}
                    <td style={{ borderBottom:'1px solid #e2e8f0', padding:0, textAlign:'center' }}>
                      <button onClick={e=>{e.stopPropagation();deleteRow(idx);}} style={{ width:32, height:36, border:'none', background:'none', cursor:'pointer', color:'#e2e8f0', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto', transition:'color .1s' }} onMouseEnter={e=>(e.currentTarget as HTMLElement).style.color='#dc2626'} onMouseLeave={e=>(e.currentTarget as HTMLElement).style.color='#e2e8f0'}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Live Summary */}
        <div style={{ width:240, borderLeft:'1px solid #e2e8f0', background:'#fff', display:'flex', flexDirection:'column', flexShrink:0 }}>
          <div style={{ padding:'10px 14px 8px', borderBottom:'1px solid #f1f5f9' }}>
            <div style={{ fontSize:9, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.1em' }}>STOCK RECEIVED — {sessionDate}</div>
            {supplier && <div style={{ fontSize:11, color:'#2563eb', fontWeight:600, marginTop:2 }}>↑ {toTitle(supplier)}</div>}
            {!supplier && <div style={{ fontSize:10, color:'#cbd5e1', marginTop:2 }}>No supplier selected</div>}
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:'6px 0' }}>
            {summary.length===0 ? (
              <div style={{ padding:'20px 14px', textAlign:'center', color:'#cbd5e1', fontSize:12 }}>Scan products to see summary</div>
            ) : summary.map((s:any)=>(
              <div key={s.model} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 14px', fontSize:12 }}>
                <span style={{ color:'#374151', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:165 }}>{s.model}</span>
                <span style={{ fontWeight:700, color:'#16a34a', flexShrink:0, marginLeft:6 }}>{s.qty}</span>
              </div>
            ))}
          </div>
          {total>0 && (
            <div style={{ padding:'10px 14px', borderTop:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', fontSize:13, fontWeight:800, color:'#0f172a' }}>
              <span>Grand Total</span><span style={{ color:'#16a34a' }}>{total}</span>
            </div>
          )}
        </div>
      </div>

      {/* New Product Drawer */}
      {drawer&&(
        <div style={{ position:'fixed', inset:0, zIndex:300, display:'flex', justifyContent:'flex-end' }}>
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.25)' }} onClick={()=>setDrawer(null)} />
          <div style={{ width:380, background:'#fff', boxShadow:'-8px 0 40px rgba(0,0,0,.15)', display:'flex', flexDirection:'column', position:'relative', zIndex:1, borderRadius:'16px 0 0 16px' }}>
            <div style={{ padding:'16px 20px', borderBottom:'1px solid #e2e8f0' }}>
              <div style={{ fontSize:15, fontWeight:800, color:'#0f172a' }}>New Product</div>
              <div style={{ fontSize:12, color:'#94a3b8', marginTop:2 }}>EAN <strong style={{ color:'#2563eb', fontFamily:'monospace', fontSize:11 }}>{drawer}</strong> not found</div>
            </div>
            <div style={{ flex:1, overflow:'auto', padding:'16px 20px' }}>
              {[['Product Name *','model','text'],['Brand','brand','text'],['Category','categoryName','text'],['Selling Price ₹','sellingPrice','number'],['MRP ₹','mrp','number'],['Cost Price ₹','costPrice','number'],['GST %','gstRate','number']].map(([l,k,t])=>(
                <div key={k as string} style={{ marginBottom:12 }}>
                  <label style={{ fontSize:10, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:4 }}>{l as string}</label>
                  <input type={t as string} value={(df as any)[k as string]} onChange={e=>setDf(d=>({...d,[k as string]:e.target.value}))} style={{ width:'100%', height:36, padding:'0 10px', border:'1.5px solid #d0d5dd', borderRadius:7, fontSize:13, outline:'none', boxSizing:'border-box' }} onFocus={focus} onBlur={blur} />
                </div>
              ))}
              <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', marginBottom:20 }}>
                <input type="checkbox" checked={df.imeiRequired} onChange={e=>setDf(d=>({...d,imeiRequired:e.target.checked}))} style={{ width:16, height:16, accentColor:'#2563eb' }} />
                <span style={{ fontSize:13, color:'#374151', fontWeight:500 }}>Requires IMEI / Serial tracking</span>
              </label>
              <button onClick={async()=>{ if(!df.model) return; try { await api('/products',{method:'POST',body:JSON.stringify({ean:df.ean,model:df.model,brand:df.brand,categoryName:df.categoryName,costPrice:parseFloat(df.costPrice)||0,sellingPrice:parseFloat(df.sellingPrice)||0,imeiRequired:df.imeiRequired,gstRate:parseFloat(df.gstRate)||18,status:'ACTIVE'})}); productCache.delete(df.ean); setDrawer(null); const idx=rows.findIndex(r=>r.ean===df.ean&&r.status==='not_found'); if(idx>=0){updateRow(idx,{errMsg:'',status:'empty'});setActiveRow(idx);setFocusCell('ean');} } catch(e:any){alert(e.message);}}}
                style={{ width:'100%', height:42, border:'none', borderRadius:8, background:'#2563eb', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer' }}>
                Save &amp; Continue Scanning
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier state modal */}
      {suppModal && <SupplierModal name={suppModal} onSave={async(state)=>{ await resolveSupplier(suppModal, state); setSuppModal(null); }} onSkip={()=>setSuppModal(null)} />}
    </div>
  );
}
