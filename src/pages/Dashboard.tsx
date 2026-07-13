import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';

interface Txn { id:string; type:string; qty:number; product:string; vendor?:string; warehouse:string; createdAt:string; }
interface Daily { totals:{stockInUnits:number;stockOutUnits:number;stockInTxns:number;stockOutTxns:number;imeiIn:number;imeiOut:number}; byProduct:{productId:string;ean:string;model:string;brand:string;inQty:number;outQty:number;vendors:string[]}[]; recentTxns:Txn[]; }
interface Stats { products:number; activeProducts:number; vendors:number; categories:number; brands:number; today:{stockIn:number;stockOut:number;imeiScanned:number}; }
interface Supplier { id:string; name:string; }

const fmtT = (s:string) => new Date(s).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
const fmtD = (s:string) => new Date(s).toLocaleDateString('en-IN',{day:'2-digit',month:'short'});

export function Dashboard() {
  const [stats,setStats]=useState<Stats|null>(null);
  const [daily,setDaily]=useState<Daily|null>(null);
  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState<'in'|'out'|'all'>('in');
  const [deleting,setDeleting]=useState<string|null>(null);
  const [editModal,setEditModal]=useState<{ids:string[];label:string;currentVendorId:string}|null>(null);
  const [suppliers,setSuppliers]=useState<Supplier[]>([]);
  const [editVendorId,setEditVendorId]=useState('');
  const [editing,setEditing]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);
    try{const [s,d]=await Promise.all([api<Stats>('/inventory/dashboard-stats'),api<Daily>(`/inventory/daily-summary?date=${date}`)]);setStats(s);setDaily(d);}catch{}
    finally{setLoading(false);}
  },[date]);

  useEffect(()=>{load();},[load]);
  useEffect(()=>{api<Supplier[]>('/vendors').then(setSuppliers).catch(()=>{});},[]);

  const bulkDelete=async(ids:string[],label:string)=>{
    if(!confirm(`Permanently delete all ${ids.length} transaction(s) for "${label}"?\n\nThis removes the stock entry as if it was never scanned.`))return;
    setDeleting(ids[0]);
    try{
      for(const id of ids) await api(`/inventory/transactions/${id}`,{method:'DELETE'});
      load();
    }catch(e:any){alert('Delete failed: '+e.message);}
    finally{setDeleting(null);}
  };

  const openEdit=(ids:string[],label:string,currentVendorId:string)=>{
    setEditModal({ids,label,currentVendorId});
    setEditVendorId(currentVendorId||'');
  };

  const saveEdit=async()=>{
    if(!editModal)return;
    setEditing(true);
    try{
      for(const id of editModal.ids) await api(`/inventory/transactions/${id}`,{method:'PATCH',body:JSON.stringify({vendorId:editVendorId||null})});
      setEditModal(null);
      load();
    }catch(e:any){alert('Edit failed: '+e.message);}
    finally{setEditing(false);}
  };

  // Group transactions by vendor
  const inTxns=(daily?.recentTxns||[]).filter(t=>t.qty>0);
  const outTxns=(daily?.recentTxns||[]).filter(t=>t.qty<0);
  const byVendor=(txns:Txn[])=>txns.reduce((a:Record<string,Txn[]>,t)=>{const v=t.vendor||'No Vendor';if(!a[v])a[v]=[];a[v].push(t);return a;},{});
  const inGroups=byVendor(inTxns);
  const outGroups=byVendor(outTxns);

  const ActionBtns=({ids,model,vendor,color}:{ids:string[];model:string;vendor?:string;color:string})=>(
    <div style={{display:'flex',gap:6,flexShrink:0}}>
      <button onClick={()=>openEdit(ids,model,'')}
        style={{height:26,padding:'0 10px',border:'1px solid #bfdbfe',borderRadius:5,background:'#eff6ff',cursor:'pointer',color:'#2563eb',fontSize:11,fontWeight:600,display:'flex',alignItems:'center',gap:4}}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Edit
      </button>
      <button onClick={()=>bulkDelete(ids,model)} disabled={!!deleting}
        style={{height:26,padding:'0 10px',border:'1px solid #fca5a5',borderRadius:5,background:'#fef2f2',cursor:'pointer',color:'#dc2626',fontSize:11,fontWeight:600,display:'flex',alignItems:'center',gap:4,opacity:deleting?0.6:1}}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        {deleting===ids[0]?'…':'Delete'}
      </button>
    </div>
  );

  const VendorCard=({vendor,txns,color,sign}:{vendor:string;txns:Txn[];color:string;sign:'+'|'-'})=>{
    const total=txns.reduce((s,t)=>s+Math.abs(t.qty),0);
    const [open,setOpen]=useState(true);
    const byProd=txns.reduce((a:Record<string,Txn[]>,t)=>{const k=t.product.split('(')[0].trim();if(!a[k])a[k]=[];a[k].push(t);return a;},{});
    const allIds=txns.map(t=>t.id);
    return (
      <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:10,marginBottom:8,overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
        {/* Vendor header with Edit + Delete All */}
        <div style={{padding:'10px 14px',display:'flex',alignItems:'center',gap:10,background:'#f8fafc',borderBottom:open?'1px solid #e2e8f0':'none'}}>
          <div onClick={()=>setOpen(x=>!x)} style={{flex:1,cursor:'pointer'}}>
            <div style={{fontWeight:700,fontSize:13,color:'#0f172a'}}>{vendor}</div>
            <div style={{fontSize:11,color:'#94a3b8',marginTop:1}}>{txns.length} transaction{txns.length!==1?'s':''} · {sign}{total} units · {new Date(txns[0].createdAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})} {new Date(txns[0].createdAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</div>
          </div>
          <span style={{fontWeight:800,fontSize:14,color}}>{sign}{total}</span>
          {/* Entry-level Edit & Delete (for whole vendor block) */}
          <ActionBtns ids={allIds} model={`all items from ${vendor}`} vendor={vendor} color={color} />
          <span onClick={()=>setOpen(x=>!x)} style={{color:'#94a3b8',fontSize:11,cursor:'pointer',userSelect:'none'}}>{open?'▲':'▼'}</span>
        </div>
        {open&&(
          <div>
            {Object.entries(byProd).map(([model,txnList])=>{
              const qty=txnList.reduce((s,t)=>s+Math.abs(t.qty),0);
              return (
                <div key={model} style={{display:'flex',alignItems:'center',padding:'8px 14px',borderBottom:'1px solid #f1f5f9',gap:8}}>
                  <span style={{flex:1,fontSize:12,color:'#374151',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{model}</span>
                  <span style={{fontWeight:700,fontSize:13,color,flexShrink:0}}>{sign}{qty}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const kpis=stats?[
    {l:'Total Products',v:stats.products,c:'#374151'},
    {l:'Active',v:stats.activeProducts,c:'#16a34a'},
    {l:'Brands',v:stats.brands,c:'#2563eb'},
    {l:'Categories',v:stats.categories,c:'#7c3aed'},
    {l:'Vendors',v:stats.vendors,c:'#0891b2'},
    {l:'Stock In Today',v:daily?.totals.stockInUnits??0,c:'#16a34a'},
    {l:'Stock Out Today',v:daily?.totals.stockOutUnits??0,c:'#dc2626'},
  ]:[];

  const fmtDateLong=(d:string)=>new Date(d+'T00:00:00').toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short',year:'numeric'});

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',background:'#f8fafc',overflow:'hidden'}}>
      {/* Compact header */}
      <div style={{padding:'12px 24px',background:'#fff',borderBottom:'1px solid #e2e8f0',display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
        <div>
          <div style={{fontSize:17,fontWeight:800,color:'#0f172a',letterSpacing:'-.3px'}}>Dashboard</div>
          <div style={{fontSize:11,color:'#94a3b8',marginTop:1}}>{fmtDateLong(date)}</div>
        </div>
        <div style={{flex:1}}/>
        <div style={{display:'flex',alignItems:'center',gap:6,background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:8,padding:'4px 10px 4px 8px'}}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)}
            style={{height:24,border:'none',background:'transparent',fontSize:12,outline:'none',color:'#374151',fontWeight:600,cursor:'pointer'}} />
        </div>
        <button onClick={load} title="Refresh" style={{width:30,height:30,border:'1px solid #e2e8f0',borderRadius:7,background:'#fff',cursor:'pointer',fontSize:14,color:'#64748b',display:'flex',alignItems:'center',justifyContent:'center'}}>↺</button>
      </div>

      {loading?(
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',flex:1}}><div className="spinner" style={{width:28,height:28}}/></div>
      ):(
        <div style={{flex:1,overflow:'auto',padding:'14px 24px'}}>
          {/* KPI strip */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:8,marginBottom:16}}>
            {kpis.map(k=>(
              <div key={k.l} style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:10,padding:'12px 14px',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
                <div style={{fontSize:22,fontWeight:800,color:k.c,lineHeight:1.2}}>{k.v.toLocaleString('en-IN')}</div>
                <div style={{fontSize:10,color:'#94a3b8',marginTop:4,fontWeight:600,textTransform:'uppercase',letterSpacing:'.05em',lineHeight:1.3}}>{k.l}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{display:'flex',gap:0,marginBottom:14,borderBottom:'1px solid #e2e8f0'}}>
            {([['in','📥 Stock In Today'],['out','📤 Stock Out Today'],['all','📊 All Movements']] as const).map(([t,l])=>(
              <button key={t} onClick={()=>setTab(t)} style={{padding:'8px 18px',fontSize:12,fontWeight:tab===t?700:500,color:tab===t?'#2563eb':'#64748b',background:'none',border:'none',borderBottom:`2px solid ${tab===t?'#2563eb':'transparent'}`,cursor:'pointer',transition:'all .1s',display:'flex',alignItems:'center',gap:6}}>
                {l}
                {t==='in'&&daily&&<span style={{background:'#eff6ff',color:'#2563eb',borderRadius:10,padding:'1px 7px',fontSize:10,fontWeight:700}}>{daily.totals.stockInTxns}</span>}
                {t==='out'&&daily&&daily.totals.stockOutTxns>0&&<span style={{background:'#fef2f2',color:'#dc2626',borderRadius:10,padding:'1px 7px',fontSize:10,fontWeight:700}}>{daily.totals.stockOutTxns}</span>}
              </button>
            ))}
          </div>

          {/* Stock In */}
          {tab==='in'&&(
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
              <div>
                <div style={{fontSize:10,fontWeight:800,color:'#16a34a',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10}}>RECEIVED — BY SUPPLIER</div>
                {Object.keys(inGroups).length===0
                  ?<div style={{color:'#94a3b8',fontSize:13,padding:'24px 0',textAlign:'center'}}>No stock received on {fmtDateLong(date)}</div>
                  :Object.entries(inGroups).map(([v,txns])=><VendorCard key={v} vendor={v} txns={txns} color="#16a34a" sign="+"/>)
                }
              </div>
              <div>
                <div style={{fontSize:10,fontWeight:800,color:'#16a34a',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10}}>TOP RECEIVED PRODUCTS</div>
                <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:10,overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                    <thead><tr style={{background:'#f8fafc'}}>
                      {['Product','Units In'].map(h=><th key={h} style={{padding:'8px 12px',textAlign:h==='Units In'?'right':'left',fontWeight:700,color:'#64748b',fontSize:10,textTransform:'uppercase',borderBottom:'1px solid #e2e8f0'}}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {(daily?.byProduct||[]).filter(p=>p.inQty>0).sort((a,b)=>b.inQty-a.inQty).slice(0,15).map((p,i)=>(
                        <tr key={p.productId} style={{borderBottom:'1px solid #f1f5f9',background:i%2===0?'#fff':'#fafafa'}}>
                          <td style={{padding:'7px 12px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:220}}>{p.model}</td>
                          <td style={{padding:'7px 12px',textAlign:'right',fontWeight:700,color:'#16a34a'}}>+{p.inQty}</td>
                        </tr>
                      ))}
                      {!(daily?.byProduct||[]).some(p=>p.inQty>0)&&<tr><td colSpan={2} style={{padding:'20px 12px',textAlign:'center',color:'#94a3b8',fontSize:12}}>No inbound products today</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Stock Out */}
          {tab==='out'&&(
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
              <div>
                <div style={{fontSize:10,fontWeight:800,color:'#dc2626',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10}}>DISPATCHED — BY CUSTOMER</div>
                {Object.keys(outGroups).length===0
                  ?<div style={{color:'#94a3b8',fontSize:13,padding:'24px 0',textAlign:'center'}}>No dispatches on {fmtDateLong(date)}</div>
                  :Object.entries(outGroups).map(([v,txns])=><VendorCard key={v} vendor={v} txns={txns} color="#dc2626" sign="-"/>)
                }
              </div>
              <div>
                <div style={{fontSize:10,fontWeight:800,color:'#dc2626',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10}}>TOP DISPATCHED PRODUCTS</div>
                <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:10,overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                    <thead><tr style={{background:'#f8fafc'}}>
                      {['Product','Units Out'].map(h=><th key={h} style={{padding:'8px 12px',textAlign:h==='Units Out'?'right':'left',fontWeight:700,color:'#64748b',fontSize:10,textTransform:'uppercase',borderBottom:'1px solid #e2e8f0'}}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {(daily?.byProduct||[]).filter(p=>p.outQty>0).sort((a,b)=>b.outQty-a.outQty).slice(0,15).map((p,i)=>(
                        <tr key={p.productId} style={{borderBottom:'1px solid #f1f5f9',background:i%2===0?'#fff':'#fafafa'}}>
                          <td style={{padding:'7px 12px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:220}}>{p.model}</td>
                          <td style={{padding:'7px 12px',textAlign:'right',fontWeight:700,color:'#dc2626'}}>-{p.outQty}</td>
                        </tr>
                      ))}
                      {!(daily?.byProduct||[]).some(p=>p.outQty>0)&&<tr><td colSpan={2} style={{padding:'20px 12px',textAlign:'center',color:'#94a3b8',fontSize:12}}>No dispatches today</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* All Movements */}
          {tab==='all'&&(
            <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:10,overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead><tr style={{background:'#f8fafc',position:'sticky',top:0}}>
                  {['Time','Type','Product','Qty','Warehouse','Actions'].map(h=>(
                    <th key={h} style={{padding:'8px 12px',textAlign:'left',fontWeight:700,color:'#64748b',fontSize:10,textTransform:'uppercase',borderBottom:'1px solid #e2e8f0',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {(daily?.recentTxns||[]).map((t,i)=>(
                    <tr key={t.id} style={{borderBottom:'1px solid #f1f5f9',background:i%2===0?'#fff':'#fafafa'}}>
                      <td style={{padding:'6px 12px',color:'#94a3b8',fontFamily:'monospace',fontSize:11}}>{fmtT(t.createdAt)}</td>
                      <td style={{padding:'6px 12px'}}><span style={{fontSize:10,padding:'2px 7px',borderRadius:10,fontWeight:700,background:t.qty>0?'#dcfce7':'#fee2e2',color:t.qty>0?'#16a34a':'#dc2626'}}>{t.type.replace(/_/g,' ')}</span></td>
                      <td style={{padding:'6px 12px',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.product}</td>
                      <td style={{padding:'6px 12px',fontWeight:700,color:t.qty>0?'#16a34a':'#dc2626'}}>{t.qty>0?`+${t.qty}`:t.qty}</td>
                      <td style={{padding:'6px 12px',color:'#64748b'}}>{t.warehouse}</td>
                      <td style={{padding:'6px 12px'}}>
                        <div style={{display:'flex',gap:6}}>
                          <button onClick={()=>openEdit([t.id],t.product.split('(')[0],'')}
                            style={{height:24,padding:'0 8px',border:'1px solid #bfdbfe',borderRadius:5,background:'#eff6ff',cursor:'pointer',color:'#2563eb',fontSize:10,fontWeight:600,display:'flex',alignItems:'center',gap:3}}>
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            Edit
                          </button>
                          <button onClick={()=>bulkDelete([t.id],t.product.split('(')[0])} disabled={!!deleting}
                            style={{height:24,padding:'0 8px',border:'1px solid #fca5a5',borderRadius:5,background:'#fef2f2',cursor:'pointer',color:'#dc2626',fontSize:10,fontWeight:600,display:'flex',alignItems:'center',gap:3,opacity:deleting?0.6:1}}>
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!(daily?.recentTxns?.length)&&<tr><td colSpan={6} style={{padding:'30px 0',textAlign:'center',color:'#94a3b8',fontSize:13}}>No transactions on {fmtDateLong(date)}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {editModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(15,23,42,.5)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#fff',borderRadius:14,padding:28,width:440,boxShadow:'0 24px 60px rgba(0,0,0,.2)'}}>
            <div style={{fontSize:16,fontWeight:800,color:'#0f172a',marginBottom:4}}>Edit Entry</div>
            <div style={{fontSize:12,color:'#64748b',marginBottom:20}}>{editModal.label}</div>
            <label style={{fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'.07em',display:'block',marginBottom:6}}>Assign Supplier</label>
            <select value={editVendorId} onChange={e=>setEditVendorId(e.target.value)}
              style={{width:'100%',height:40,padding:'0 12px',border:'1.5px solid #d0d5dd',borderRadius:8,fontSize:13,background:'#fff',outline:'none',marginBottom:20,boxSizing:'border-box'}}>
              <option value="">— No Supplier</option>
              {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div style={{display:'flex',gap:10}}>
              <button onClick={saveEdit} disabled={editing} style={{flex:1,height:40,border:'none',borderRadius:8,background:editing?'#94a3b8':'#2563eb',color:'#fff',fontSize:14,fontWeight:700,cursor:editing?'not-allowed':'pointer'}}>
                {editing?'Saving…':'Save Changes'}
              </button>
              <button onClick={()=>setEditModal(null)} style={{height:40,padding:'0 18px',border:'1px solid #e2e8f0',borderRadius:8,background:'#fff',fontSize:13,color:'#64748b',cursor:'pointer'}}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
