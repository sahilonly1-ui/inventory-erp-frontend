import { useState, useEffect, useRef, useCallback, KeyboardEvent } from 'react';
import { api } from '../api/client';

interface Warehouse { id: string; name: string; }
type RowStatus = 'empty' | 'found' | 'awaiting_imei' | 'saved' | 'err';
interface Row { id: string; ean: string; productId: string; model: string; brand: string; imeiRequired: boolean; qty: number; imei: string; status: RowStatus; errMsg: string; }

const uid = () => Math.random().toString(36).slice(2, 9);
const genDoc = () => `SOUT-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(Math.floor(Math.random()*9000+1000))}`;
const emptyRow = (): Row => ({ id:uid(), ean:'', productId:'', model:'', brand:'', imeiRequired:false, qty:0, imei:'', status:'empty', errMsg:'' });
const PARTY_KEY = 'erp_customers_v1';
const getPartyHistory = (): string[] => { try { return JSON.parse(localStorage.getItem(PARTY_KEY)||'[]'); } catch { return []; } };
const savePartyHistory = (name: string) => { const h = getPartyHistory().filter(s => s !== name); localStorage.setItem(PARTY_KEY, JSON.stringify([name, ...h].slice(0, 100))); };
const DEFAULT_PARTIES = ['Amazon','Flipkart','JioMart','Prime','Meesho','Walk In Customer','Service Center','Return'];
const cellInp: React.CSSProperties = { width:'100%', height:'100%', border:'none', padding:'0 8px', background:'transparent', fontSize:13, color:'#101828', outline:'none', fontFamily:'inherit' };

export function StockOut() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [customer, setCustomer] = useState('');
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().slice(0,10));
  const [invoiceNo, setInvoiceNo] = useState('');
  const [custSearch, setCustSearch] = useState('');
  const [custDrop, setCustDrop] = useState(false);
  const [custHistory, setCustHistory] = useState<string[]>(() => [...new Set([...DEFAULT_PARTIES, ...getPartyHistory()])]);
  const [docNumber] = useState(genDoc);
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [activeRow, setActiveRow] = useState(0);
  const [focusCell, setFocusCell] = useState<'ean'|'imei'>('ean');
  const refs = useRef<Record<string, HTMLInputElement|null>>({});
  const setRef = (i: number, c: 'ean'|'imei') => (el: HTMLInputElement|null) => { refs.current[`${i}-${c}`] = el; };

  useEffect(() => { api<Warehouse[]>('/warehouses').then(ws => { setWarehouses(ws); if (ws.length) setWarehouseId(ws[0].id); }).catch(()=>{}); }, []);
  useEffect(() => { const el = refs.current[`${activeRow}-${focusCell}`]; if (el) setTimeout(() => el.focus(), 30); }, [activeRow, focusCell]);

  const updateRow = useCallback((idx: number, p: Partial<Row>) => setRows(rs => rs.map((r,i) => i===idx ? {...r,...p} : r)), []);
  const addRowAfter = useCallback((idx: number, next: 'ean'|'imei', pre?: Partial<Row>) => {
    setRows(rs => { const n = {...emptyRow(),...pre}; const u = [...rs]; u.splice(idx+1,0,n); return u; });
    setActiveRow(idx+1); setFocusCell(next);
  }, []);

  const handleEan = useCallback(async (idx: number, ean: string) => {
    const v = ean.trim(); if (!v || !warehouseId) return;
    try {
      const res = await api<{ product: any }>(`/inventory/lookup?ean=${encodeURIComponent(v)}`);
      const p = res.product;
      if (p.imeiRequired) {
        updateRow(idx, { productId:p.id, model:p.model, brand:p.brand, imeiRequired:true, qty:0, status:'awaiting_imei', errMsg:'' });
        setFocusCell('imei');
      } else {
        await api('/inventory/stock-out', { method:'POST', body:JSON.stringify({ productId:p.id, warehouseId, quantity:1, remarks:`${docNumber}${customer ? ' → '+customer : ''}${invoiceNo ? ' | '+invoiceNo : ''}` }) });
        updateRow(idx, { productId:p.id, model:p.model, brand:p.brand, imeiRequired:false, qty:1, status:'saved', errMsg:'' });
        addRowAfter(idx, 'ean');
      }
    } catch (e:any) { updateRow(idx, { ean:v, status:'err', errMsg: e.message?.includes('No active product') ? 'EAN not found' : e.message }); }
  }, [warehouseId, addRowAfter, updateRow, docNumber, customer, invoiceNo]);

  const handleImei = useCallback(async (idx: number, imei: string) => {
    const v = imei.trim(); if (!v) return;
    const row = rows[idx]; if (!row.productId) return;
    try {
      const data = await api<{ status: string }>(`/imei/${encodeURIComponent(v)}`);
      if ((data as any).status !== 'IN_STOCK') {
        updateRow(idx, { errMsg:`IMEI ${v} status: ${(data as any).status}. Cannot dispatch.`, imei:v }); setFocusCell('imei'); return;
      }
    } catch { updateRow(idx, { errMsg:`IMEI ${v} not found`, imei:v }); setFocusCell('imei'); return; }
    try {
      await api('/imei/dispatch', { method:'POST', body:JSON.stringify({ imeis:[v], channel:'STOCK_OUT', remarks:`${docNumber}${customer ? ' → '+customer : ''}` }) });
      updateRow(idx, { imei:v, qty:row.qty+1, status:'saved', errMsg:'' });
      addRowAfter(idx, 'imei', { productId:row.productId, model:row.model, brand:row.brand, imeiRequired:true, status:'awaiting_imei' });
    } catch (e:any) { updateRow(idx, { errMsg:e.message, imei:v }); setFocusCell('imei'); }
  }, [rows, addRowAfter, updateRow, docNumber, customer]);

  const deleteRow = (idx: number) => { setRows(rs => rs.length===1 ? [emptyRow()] : rs.filter((_,i)=>i!==idx)); if (activeRow >= idx && activeRow > 0) setActiveRow(r => r-1); };
  const clearAll = () => { if (!confirm('Clear all rows?')) return; setRows([emptyRow()]); setActiveRow(0); setFocusCell('ean'); };
  const onEanKey = (e: KeyboardEvent<HTMLInputElement>, idx: number) => { if (e.key==='Enter'||e.key==='Tab') { e.preventDefault(); handleEan(idx, (e.target as HTMLInputElement).value); } };
  const onImeiKey = (e: KeyboardEvent<HTMLInputElement>, idx: number) => { if (e.key==='Enter') { e.preventDefault(); handleImei(idx, (e.target as HTMLInputElement).value); } if (e.key==='Escape') updateRow(idx, { errMsg:'' }); };

  const allCust = custHistory.filter(c => c.toLowerCase().includes(custSearch.toLowerCase())).slice(0,8);
  const savedRows = rows.filter(r => r.status==='saved' && r.qty>0);
  const summary = Object.values(savedRows.reduce((a:any,r)=>{ const k=r.model||r.ean; if(!a[k]) a[k]={model:k,qty:0}; a[k].qty+=r.qty; return a; },{})) as any[];
  const total = summary.reduce((s,r)=>s+r.qty,0);

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 0px)', background:'#f5f7fa' }}>
      {/* Header */}
      <div style={{ background:'#fff', borderBottom:'1px solid #e4e7ec', padding:'10px 16px', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
          <span style={{ fontSize:11, fontWeight:700, color:'#dc2626', background:'#fff1f2', padding:'3px 10px', borderRadius:20, border:'1px solid #fecdd3', letterSpacing:'.02em' }}>{docNumber}</span>
          <span style={{ fontSize:12, fontWeight:600, color:'#475467', marginLeft:4 }}>Stock Out Entry</span>
          <div style={{ flex:1 }} />
          <span style={{ fontSize:11, color:'#98a2b3' }}>{savedRows.length} items · {total} units</span>
          <button onClick={clearAll} style={{ height:28, padding:'0 10px', border:'1px solid #fca5a5', borderRadius:6, background:'#fef2f2', color:'#dc2626', fontSize:11, fontWeight:600, cursor:'pointer' }}>Clear All</button>
          <button style={{ height:28, padding:'0 14px', border:'none', borderRadius:6, background:'#dc2626', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', opacity:savedRows.length?1:.4 }} disabled={!savedRows.length}>✓ Done</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 160px 180px 160px', gap:8 }}>
          {/* Customer */}
          <div style={{ position:'relative' }}>
            <label style={{ fontSize:10, fontWeight:700, color:'#98a2b3', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:3 }}>Issued To / Customer *</label>
            <input value={custSearch || customer} placeholder="Amazon, Walk In Customer…"
              onChange={e => { setCustSearch(e.target.value); setCustomer(''); setCustDrop(true); }}
              onFocus={() => { setCustSearch(customer); setCustDrop(true); }}
              onBlur={() => setTimeout(()=>{ setCustDrop(false); if (custSearch && !customer) { setCustomer(custSearch); savePartyHistory(custSearch); setCustHistory(h => [...new Set([custSearch,...h])]); } },200)}
              onKeyDown={e => { if (e.key==='Enter'&&custSearch) { setCustomer(custSearch); savePartyHistory(custSearch); setCustHistory(h=>[...new Set([custSearch,...h])]); setCustSearch(''); setCustDrop(false); } }}
              style={{ width:'100%', height:34, padding:'0 10px', border:`1.5px solid ${customer?'#dc2626':'#d0d5dd'}`, borderRadius:7, fontSize:13, outline:'none', boxSizing:'border-box' }} />
            {custDrop && allCust.length > 0 && (
              <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'#fff', border:'1px solid #e4e7ec', borderRadius:8, boxShadow:'0 8px 24px rgba(0,0,0,.1)', zIndex:200, marginTop:2, overflow:'hidden' }}>
                {allCust.map(c=>(
                  <div key={c} onMouseDown={()=>{ setCustomer(c); savePartyHistory(c); setCustHistory(h=>[...new Set([c,...h])]); setCustSearch(''); setCustDrop(false); }} style={{ padding:'8px 12px', fontSize:13, cursor:'pointer' }} onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='#f5f7fa'} onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>{c}</div>
                ))}
                {custSearch && !allCust.find(c=>c.toLowerCase()===custSearch.toLowerCase()) && (
                  <div onMouseDown={()=>{ setCustomer(custSearch); savePartyHistory(custSearch); setCustHistory(h=>[...new Set([custSearch,...h])]); setCustSearch(''); setCustDrop(false); }} style={{ padding:'8px 12px', fontSize:13, cursor:'pointer', color:'#dc2626', fontWeight:600, borderTop:'1px solid #f2f4f7' }}>＋ Add "{custSearch}"</div>
                )}
              </div>
            )}
          </div>
          <div><label style={{ fontSize:10, fontWeight:700, color:'#98a2b3', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:3 }}>Date</label><input type="date" value={sessionDate} onChange={e=>setSessionDate(e.target.value)} style={{ width:'100%', height:34, padding:'0 10px', border:'1.5px solid #d0d5dd', borderRadius:7, fontSize:13, outline:'none', boxSizing:'border-box' }} /></div>
          <div><label style={{ fontSize:10, fontWeight:700, color:'#98a2b3', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:3 }}>Invoice No. <span style={{ color:'#c4c8d0', fontWeight:400 }}>(optional)</span></label><input value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)} placeholder="e.g. SO-2026-001" style={{ width:'100%', height:34, padding:'0 10px', border:'1.5px solid #d0d5dd', borderRadius:7, fontSize:13, outline:'none', boxSizing:'border-box' }} /></div>
          <div><label style={{ fontSize:10, fontWeight:700, color:'#98a2b3', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:3 }}>Warehouse</label><select value={warehouseId} onChange={e=>setWarehouseId(e.target.value)} style={{ width:'100%', height:34, padding:'0 10px', border:'1.5px solid #d0d5dd', borderRadius:7, fontSize:13, outline:'none', background:'#fff', boxSizing:'border-box' }}>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
        </div>
      </div>

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        {/* Grid */}
        <div style={{ flex:1, overflowY:'auto', overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, tableLayout:'fixed' }}>
            <colgroup><col style={{width:40}}/><col style={{width:160}}/><col /><col style={{width:60}}/><col style={{width:200}}/><col style={{width:110}}/><col style={{width:38}}/></colgroup>
            <thead>
              <tr style={{ background:'#f8fafc', position:'sticky', top:0, zIndex:5 }}>
                {['#','EAN / Barcode','Product Name','Qty','IMEI / Serial No.','Status',''].map((h,i)=>(
                  <th key={i} style={{ padding:'0 8px', height:32, textAlign:i===3?'center':'left', fontWeight:600, color:'#64748b', fontSize:11, textTransform:'uppercase', letterSpacing:'.06em', borderBottom:'2px solid #e4e7ec', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const isActive = idx===activeRow;
                const bg = row.status==='saved'?'#f0fdf4':row.errMsg?'#fff8f8':isActive?'#f0f9ff':idx%2===0?'#fff':'#fafafa';
                return (
                  <tr key={row.id} style={{ background:bg }} onClick={()=>setActiveRow(idx)}>
                    <td style={{ padding:'0 8px', height:36, textAlign:'center', color:'#94a3b8', fontSize:11, fontWeight:600, background:'#f8fafc', borderBottom:'1px solid #e4e7ec', borderRight:'1px solid #e4e7ec' }}>{idx+1}</td>
                    <td style={{ borderBottom:'1px solid #e4e7ec', borderRight:'1px solid #e4e7ec', padding:0 }}>
                      <div style={{ height:36, border:isActive&&focusCell==='ean'?'2px solid #2563eb':'2px solid transparent', borderRadius:isActive&&focusCell==='ean'?4:0 }}>
                        <input ref={setRef(idx,'ean')} value={row.ean} onChange={e=>updateRow(idx,{ean:e.target.value,errMsg:'',status:'empty'})} onKeyDown={e=>onEanKey(e,idx)} onFocus={()=>{setActiveRow(idx);setFocusCell('ean');}} placeholder={idx===0?'Scan EAN…':''} style={{...cellInp,background:isActive&&focusCell==='ean'?'#fff':'transparent'}} />
                      </div>
                    </td>
                    <td style={{ borderBottom:'1px solid #e4e7ec', borderRight:'1px solid #e4e7ec', padding:0 }}>
                      <input value={row.model} readOnly tabIndex={-1} placeholder="Auto-filled" style={{...cellInp,color:row.model?'#101828':'#94a3b8',fontWeight:row.model?500:400,cursor:'default'}} />
                    </td>
                    <td style={{ borderBottom:'1px solid #e4e7ec', borderRight:'1px solid #e4e7ec', textAlign:'center' }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:36, fontSize:14, fontWeight:700, color:row.qty>0?'#dc2626':'#94a3b8' }}>{row.qty>0?row.qty:'—'}</div>
                    </td>
                    <td style={{ borderBottom:'1px solid #e4e7ec', borderRight:'1px solid #e4e7ec', padding:0 }}>
                      <div style={{ height:36, border:isActive&&focusCell==='imei'?'2px solid #f59e0b':'2px solid transparent', borderRadius:isActive&&focusCell==='imei'?4:0 }}>
                        <input ref={setRef(idx,'imei')} value={row.imei} onChange={e=>updateRow(idx,{imei:e.target.value,errMsg:''})} onKeyDown={e=>onImeiKey(e,idx)} onFocus={()=>{setActiveRow(idx);setFocusCell('imei');}} readOnly={!row.imeiRequired} placeholder={row.imeiRequired?'Scan IMEI to dispatch…':'—'} style={{...cellInp,fontFamily:row.imeiRequired?'monospace':'inherit',fontSize:12,color:row.errMsg&&row.imei?'#dc2626':'#101828',background:isActive&&focusCell==='imei'?'#fffbeb':'transparent',cursor:row.imeiRequired?'text':'default'}} />
                      </div>
                    </td>
                    <td style={{ borderBottom:'1px solid #e4e7ec', borderRight:'1px solid #e4e7ec', padding:'0 8px', textAlign:'center' }}>
                      {row.errMsg && <span style={{ fontSize:10, background:'#fef2f2', color:'#dc2626', padding:'2px 8px', borderRadius:10, fontWeight:600 }} title={row.errMsg}>✕ Error</span>}
                      {row.status==='saved' && !row.errMsg && <span style={{ fontSize:10, background:'#dcfce7', color:'#15803d', padding:'2px 8px', borderRadius:10, fontWeight:600 }}>✓ Out</span>}
                      {row.status==='awaiting_imei' && !row.errMsg && <span style={{ fontSize:10, background:'#fef9c3', color:'#854d0e', padding:'2px 8px', borderRadius:10 }}>Scan IMEI</span>}
                    </td>
                    <td style={{ borderBottom:'1px solid #e4e7ec', padding:0, textAlign:'center' }}>
                      <button onClick={e=>{e.stopPropagation();deleteRow(idx);}} style={{ width:28, height:28, border:'none', background:'none', cursor:'pointer', color:'#d1d5db', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto' }} onMouseEnter={e=>(e.currentTarget as HTMLElement).style.color='#dc2626'} onMouseLeave={e=>(e.currentTarget as HTMLElement).style.color='#d1d5db'}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Right panel */}
        <div style={{ width:260, borderLeft:'1px solid #e4e7ec', background:'#fff', display:'flex', flexDirection:'column', flexShrink:0 }}>
          <div style={{ padding:'10px 12px 8px', borderBottom:'1px solid #f2f4f7' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#98a2b3', textTransform:'uppercase', letterSpacing:'.08em' }}>Dispatched — {sessionDate}</div>
            {customer && <div style={{ fontSize:11, fontWeight:600, color:'#dc2626', marginTop:2 }}>To: {customer}</div>}
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:'6px 0' }}>
            {summary.length===0 ? <div style={{ padding:'24px 12px', textAlign:'center', color:'#c4c8d0', fontSize:12 }}>Scan products to see summary</div>
              : summary.map((s:any)=>(
                <div key={s.model} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 14px', fontSize:12 }}>
                  <span style={{ color:'#344054', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:175 }}>{s.model}</span>
                  <span style={{ fontWeight:700, color:'#dc2626', flexShrink:0, marginLeft:6 }}>{s.qty}</span>
                </div>
              ))
            }
          </div>
          {total>0 && <div style={{ padding:'10px 14px', borderTop:'1px solid #f2f4f7', display:'flex', justifyContent:'space-between', fontSize:13, fontWeight:700 }}><span style={{ color:'#344054' }}>Grand Total</span><span style={{ color:'#dc2626' }}>{total} units</span></div>}
        </div>
      </div>
    </div>
  );
}
