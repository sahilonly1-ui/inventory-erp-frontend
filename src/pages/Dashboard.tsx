import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';

interface Txn { id:string; type:string; qty:number; product:string; vendor?:string; warehouse:string; createdAt:string; }
interface Daily { totals:{ stockInUnits:number; stockOutUnits:number; stockInTxns:number; stockOutTxns:number; imeiIn:number; imeiOut:number }; byProduct:{productId:string;ean:string;model:string;brand:string;inQty:number;outQty:number;vendors:string[]}[]; recentTxns:Txn[]; }
interface Stats { products:number; activeProducts:number; vendors:number; categories:number; brands:number; today:{ stockIn:number; stockOut:number; imeiScanned:number }; }

const fmtT=(s:string)=>new Date(s).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
const fmtDate=(s:string)=>{ const d=new Date(s); return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}`; };

export function Dashboard() {
  const [stats,setStats]=useState<Stats|null>(null);
  const [daily,setDaily]=useState<Daily|null>(null);
  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState<'in'|'out'|'all'>('in');
  const [deleting,setDeleting]=useState<string|null>(null);

  const load=useCallback(async()=>{
    setLoading(true);
    try {
      const [s,d]=await Promise.all([
        api<Stats>('/inventory/dashboard-stats'),
        api<Daily>(`/inventory/daily-summary?date=${date}`),
      ]);
      setStats(s); setDaily(d);
    } catch {}
    finally{setLoading(false);}
  },[date]);

  useEffect(()=>{load();},[load]);

  const deleteTxn=async(id:string,label:string)=>{
    if(!confirm(`Reverse stock movement for "${label}"?\nThis creates an offsetting adjustment and is logged in Version History.`))return;
    setDeleting(id);
    try{
      await api(`/inventory/transactions/${id}`,{method:'DELETE'});
      load();
    }catch(e:any){alert('Could not reverse: '+e.message);}
    finally{setDeleting(null);}
  };

  // Group stock-in transactions by vendor
  const inTxns=(daily?.recentTxns||[]).filter(t=>t.qty>0);
  const outTxns=(daily?.recentTxns||[]).filter(t=>t.qty<0);

  const byVendor=(txns:Txn[])=>txns.reduce((a:Record<string,Txn[]>,t)=>{
    const v=t.vendor||'No Vendor'; if(!a[v])a[v]=[]; a[v].push(t); return a;
  },{});

  const inGroups=byVendor(inTxns);
  const outGroups=byVendor(outTxns);

  const bulkDelete=async(ids:string[],label:string)=>{
    if(!confirm(`Permanently delete all ${ids.length} transaction(s) for "${label}"?\nStock levels will be corrected. This cannot be undone.`))return;
    setDeleting(ids[0]);
    try{
      for(const id of ids) await api(`/inventory/transactions/${id}`,{method:'DELETE'});
      load();
    }catch(e:any){alert('Delete failed: '+e.message);}
    finally{setDeleting(null);}
  };

  const VendorCard=({vendor,txns,color,sign}:{vendor:string;txns:Txn[];color:string;sign:'+'|'-'})=>{
    const total=txns.reduce((s,t)=>s+Math.abs(t.qty),0);
    const [open,setOpen]=useState(true);
    const byProd=txns.reduce((a:Record<string,Txn[]>,t)=>{const k=t.product.split('(')[0].trim();if(!a[k])a[k]=[];a[k].push(t);return a;},{});
    return (
      <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:10,marginBottom:8,overflow:'hidden'}}>
        <div style={{padding:'9px 14px',display:'flex',alignItems:'center',justifyContent:'space-between',background:'#f8fafc',borderBottom:open?'1px solid #e2e8f0':'none'}}>
          <div onClick={()=>setOpen(x=>!x)} style={{fontWeight:700,fontSize:13,color:'#0f172a',cursor:'pointer',flex:1}}>{vendor}</div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontWeight:800,fontSize:13,color}}>{sign}{total} units</span>
            <button onClick={()=>bulkDelete(txns.map(t=>t.id),`all items from ${vendor}`)} disabled={!!deleting}
              style={{height:28,padding:'0 12px',border:'1px solid #fca5a5',borderRadius:6,background:'#fef2f2',cursor:'pointer',color:'#dc2626',fontSize:11,fontWeight:700,display:'flex',alignItems:'center',gap:5}}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              Delete All
            </button>
            <span onClick={()=>setOpen(x=>!x)} style={{color:'#94a3b8',fontSize:12,cursor:'pointer',userSelect:'none'}}>{open?'▲':'▼'}</span>
          </div>
        </div>
        {open&&(
          <div>
            {Object.entries(byProd).map(([model,txnList])=>{
              const qty=txnList.reduce((s,t)=>s+Math.abs(t.qty),0);
              return (
                <div key={model} style={{display:'flex',alignItems:'center',padding:'7px 14px',borderBottom:'1px solid #f1f5f9',gap:10}}>
                  <span style={{flex:1,fontSize:12,color:'#374151',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{model}</span>
                  <span style={{fontWeight:700,fontSize:13,color,flexShrink:0,minWidth:36,textAlign:'right'}}>{sign}{qty}</span>
                  {/* ONE delete button per product — deletes ALL qty transactions for this product */}
                  <button onClick={()=>bulkDelete(txnList.map(t=>t.id),model)} disabled={!!deleting}
                    title={`Delete all ${qty} unit(s) of "${model}" — removes from stock permanently`}
                    style={{height:26,padding:'0 10px',border:'1px solid #fca5a5',borderRadius:5,background:'#fef2f2',cursor:'pointer',color:'#dc2626',fontSize:11,fontWeight:600,display:'flex',alignItems:'center',gap:4,flexShrink:0}}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                    Delete {qty > 1 ? `(${qty})` : ''}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const kpis=stats?[
    {l:'Products',v:stats.products,c:'#374151'},
    {l:'Active',v:stats.activeProducts,c:'#16a34a'},
    {l:'Brands',v:stats.brands,c:'#2563eb'},
    {l:'Categories',v:stats.categories,c:'#7c3aed'},
    {l:'Vendors',v:stats.vendors,c:'#0891b2'},
    {l:'Stock In',v:daily?.totals.stockInUnits??0,c:'#16a34a'},
    {l:'Stock Out',v:daily?.totals.stockOutUnits??0,c:'#dc2626'},
  ]:[];

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',background:'#f8fafc',overflow:'hidden'}}>
      {/* Compact header */}
      <div style={{padding:'10px 20px',borderBottom:'1px solid #e2e8f0',background:'#fff',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
        <div style={{fontSize:16,fontWeight:800,color:'#0f172a',letterSpacing:'-.3px'}}>Dashboard</div>
        <div style={{flex:1}}/>
        <span style={{fontSize:11,color:'#94a3b8'}}>Date</span>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{height:28,padding:'0 8px',border:'1px solid #e2e8f0',borderRadius:7,fontSize:12,background:'#fff',color:'#374151',outline:'none'}}/>
        <button onClick={load} style={{height:28,width:28,border:'1px solid #e2e8f0',borderRadius:7,background:'#fff',cursor:'pointer',fontSize:15,color:'#64748b',display:'flex',alignItems:'center',justifyContent:'center'}}>↺</button>
      </div>

      {loading ? (
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',flex:1}}><div className="spinner" style={{width:28,height:28}}/></div>
      ) : (
        <div style={{flex:1,overflow:'auto',padding:'12px 20px'}}>
          {/* KPI strip */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:8,marginBottom:14}}>
            {kpis.map(k=>(
              <div key={k.l} style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:9,padding:'10px 12px',textAlign:'center',boxShadow:'0 1px 2px rgba(0,0,0,.04)'}}>
                <div style={{fontSize:20,fontWeight:800,color:k.c,lineHeight:1.2}}>{k.v.toLocaleString('en-IN')}</div>
                <div style={{fontSize:10,color:'#94a3b8',marginTop:3,fontWeight:600,textTransform:'uppercase',letterSpacing:'.05em'}}>{k.l}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{display:'flex',gap:0,marginBottom:14,borderBottom:'1px solid #e2e8f0'}}>
            {([['in','📥 Stock In Today'],['out','📤 Stock Out Today'],['all','📊 All Movements']] as const).map(([t,l])=>(
              <button key={t} onClick={()=>setTab(t)} style={{padding:'8px 16px',fontSize:12,fontWeight:tab===t?700:500,color:tab===t?'#2563eb':'#64748b',background:'none',border:'none',borderBottom:`2px solid ${tab===t?'#2563eb':'transparent'}`,cursor:'pointer',transition:'all .1s'}}>
                {l} {t==='in'&&daily&&<span style={{background:'#eff6ff',color:'#2563eb',borderRadius:10,padding:'1px 6px',fontSize:10,fontWeight:700,marginLeft:4}}>{daily.totals.stockInTxns}</span>}
                {t==='out'&&daily&&<span style={{background:'#fef2f2',color:'#dc2626',borderRadius:10,padding:'1px 6px',fontSize:10,fontWeight:700,marginLeft:4}}>{daily.totals.stockOutTxns}</span>}
              </button>
            ))}
          </div>

          {/* Stock In tab */}
          {tab==='in'&&(
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <div>
                <div style={{fontSize:10,fontWeight:800,color:'#16a34a',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:8}}>RECEIVED — BY SUPPLIER</div>
                {Object.keys(inGroups).length===0
                  ?<div style={{color:'#94a3b8',fontSize:13,padding:'20px 0'}}>No stock received on {date}</div>
                  :Object.entries(inGroups).map(([v,txns])=><VendorCard key={v} vendor={v} txns={txns} color="#16a34a" sign="+"/>)
                }
              </div>
              <div>
                <div style={{fontSize:10,fontWeight:800,color:'#16a34a',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:8}}>TOP RECEIVED PRODUCTS</div>
                <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:10,overflow:'hidden'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                    <thead><tr style={{background:'#f8fafc'}}>
                      {['Product','Units'].map(h=><th key={h} style={{padding:'7px 12px',textAlign:h==='Units'?'right':'left',fontWeight:700,color:'#64748b',fontSize:10,textTransform:'uppercase',borderBottom:'1px solid #e2e8f0'}}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {(daily?.byProduct||[]).filter(p=>p.inQty>0).sort((a,b)=>b.inQty-a.inQty).slice(0,15).map((p,i)=>(
                        <tr key={p.productId} style={{borderBottom:'1px solid #f1f5f9',background:i%2===0?'#fff':'#fafafa'}}>
                          <td style={{padding:'6px 12px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:220}}>{p.model}</td>
                          <td style={{padding:'6px 12px',textAlign:'right',fontWeight:700,color:'#16a34a'}}>+{p.inQty}</td>
                        </tr>
                      ))}
                      {!(daily?.byProduct||[]).some(p=>p.inQty>0)&&<tr><td colSpan={2} style={{padding:'20px 12px',textAlign:'center',color:'#94a3b8',fontSize:12}}>No inbound today</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Stock Out tab */}
          {tab==='out'&&(
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <div>
                <div style={{fontSize:10,fontWeight:800,color:'#dc2626',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:8}}>DISPATCHED — BY CUSTOMER</div>
                {Object.keys(outGroups).length===0
                  ?<div style={{color:'#94a3b8',fontSize:13,padding:'20px 0'}}>No dispatches on {date}</div>
                  :Object.entries(outGroups).map(([v,txns])=><VendorCard key={v} vendor={v} txns={txns} color="#dc2626" sign="-"/>)
                }
              </div>
              <div>
                <div style={{fontSize:10,fontWeight:800,color:'#dc2626',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:8}}>TOP DISPATCHED PRODUCTS</div>
                <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:10,overflow:'hidden'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                    <thead><tr style={{background:'#f8fafc'}}>
                      {['Product','Units'].map(h=><th key={h} style={{padding:'7px 12px',textAlign:h==='Units'?'right':'left',fontWeight:700,color:'#64748b',fontSize:10,textTransform:'uppercase',borderBottom:'1px solid #e2e8f0'}}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {(daily?.byProduct||[]).filter(p=>p.outQty>0).sort((a,b)=>b.outQty-a.outQty).slice(0,15).map((p,i)=>(
                        <tr key={p.productId} style={{borderBottom:'1px solid #f1f5f9',background:i%2===0?'#fff':'#fafafa'}}>
                          <td style={{padding:'6px 12px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:220}}>{p.model}</td>
                          <td style={{padding:'6px 12px',textAlign:'right',fontWeight:700,color:'#dc2626'}}>-{p.outQty}</td>
                        </tr>
                      ))}
                      {!(daily?.byProduct||[]).some(p=>p.outQty>0)&&<tr><td colSpan={2} style={{padding:'20px 12px',textAlign:'center',color:'#94a3b8',fontSize:12}}>No dispatches today</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* All movements tab */}
          {tab==='all'&&(
            <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:10,overflow:'hidden'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead><tr style={{background:'#f8fafc',position:'sticky',top:0}}>
                  {['Time','Type','Product','Qty','Warehouse','Reverse'].map(h=>(
                    <th key={h} style={{padding:'7px 12px',textAlign:'left',fontWeight:700,color:'#64748b',fontSize:10,textTransform:'uppercase',borderBottom:'1px solid #e2e8f0',whiteSpace:'nowrap'}}>{h}</th>
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
                        <button onClick={()=>deleteTxn(t.id,t.product.split('(')[0])} disabled={deleting===t.id}
                          title="Reverse this transaction"
                          style={{height:26,padding:'0 10px',border:'1px solid #fca5a5',borderRadius:5,background:'#fff5f5',cursor:'pointer',color:'#dc2626',fontSize:11,fontWeight:600,opacity:deleting===t.id?.5:1}}>
                          {deleting===t.id?'…':'↩ Reverse'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!(daily?.recentTxns?.length)&&<tr><td colSpan={6} style={{padding:'30px 0',textAlign:'center',color:'#94a3b8',fontSize:13}}>No transactions on {date}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
