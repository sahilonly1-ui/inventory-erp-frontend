import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api/client';

// ── Types ──────────────────────────────────────────────────────────────────
interface Txn { id:string; type:string; qty:number; product:string; productId:string; ean:string; vendor?:string; vendorId?:string; warehouse:string; warehouseId:string; createdAt:string; }
interface Daily { totals:{stockInUnits:number;stockOutUnits:number;stockInTxns:number;stockOutTxns:number;imeiIn:number;imeiOut:number}; byProduct:{productId:string;ean:string;model:string;brand:string;inQty:number;outQty:number;vendors:string[]}[]; recentTxns:Txn[]; }
interface Stats { products:number; activeProducts:number; vendors:number; categories:number; brands:number; today:{stockIn:number;stockOut:number;imeiScanned:number}; }
interface Supplier { id:string; name:string; }
interface ImeiRow { id:string; imei1:string; imeiType:string; status:string; }
interface EntryTxn {
  id:string; productId:string; ean:string; model:string; brand:string; imeiRequired:boolean;
  quantity:number; remarks:string|null; vendorId:string|null; vendorName:string|null;
  warehouseId:string; warehouseName:string; createdAt:string; imeis:ImeiRow[];
}

// Edit panel row — one per product line (one per original transaction)
interface EditRow {
  txnId: string;           // original transaction id
  productId: string;
  ean: string;
  model: string;
  imeiRequired: boolean;
  quantity: number;        // editable for non-IMEI products
  imeis: EditImei[];       // editable list for IMEI products
  warehouseId: string;
  deleted: boolean;        // mark for deletion
  isNew: boolean;          // newly added row (not yet saved)
}
interface EditImei {
  id: string | null;       // null = new (not yet in DB)
  imei1: string;
  imeiType: string;
  deleted: boolean;
}

const fmtT = (s:string) => new Date(s).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
const uid = () => Math.random().toString(36).slice(2,9);

export function Dashboard() {
  const [stats,setStats]=useState<Stats|null>(null);
  const [daily,setDaily]=useState<Daily|null>(null);
  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState<'in'|'out'|'all'>('in');
  const [deleting,setDeleting]=useState<string|null>(null);
  const [suppliers,setSuppliers]=useState<Supplier[]>([]);

  // ── Full Edit Panel state ────────────────────────────────────────────────
  const [editPanel,setEditPanel]=useState<{
    open:boolean;
    vendorLabel:string;      // original vendor display name
    allTxnIds:string[];      // original transaction ids (for delete/save reference)
    rows:EditRow[];          // editable product rows
    supplierId:string;       // selected supplier id
    supplierName:string;     // selected supplier display
    warehouseId:string;
    sign:'+' | '-';
    saving:boolean;
    loadingDetail:boolean;
    newEan:string;           // EAN being typed for new row
    newEanStatus:'idle'|'loading'|'found'|'not_found';
    newEanProduct:{id:string;model:string;brand:string;imeiRequired:boolean}|null;
  }>({
    open:false, vendorLabel:'', allTxnIds:[], rows:[], supplierId:'', supplierName:'',
    warehouseId:'', sign:'+', saving:false, loadingDetail:false, newEan:'', newEanStatus:'idle', newEanProduct:null,
  });

  const newEanRef = useRef<HTMLInputElement>(null);

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const [s,d]=await Promise.all([
        api<Stats>('/inventory/dashboard-stats'),
        api<Daily>(`/inventory/daily-summary?date=${date}`),
      ]);
      // Enrich recentTxns with productId/ean/vendorId/warehouseId if missing
      setStats(s);setDaily(d);
    }catch{}
    finally{setLoading(false);}
  },[date]);

  useEffect(()=>{load();},[load]);
  useEffect(()=>{api<Supplier[]>('/vendors').then(setSuppliers).catch(()=>{});},[]);

  // ── Delete whole vendor block ────────────────────────────────────────────
  const bulkDelete=async(ids:string[],label:string)=>{
    if(!confirm(`Permanently delete all ${ids.length} transaction(s) for "${label}"?\n\nThis removes the stock entry as if it was never scanned.`))return;
    setDeleting(ids[0]);
    try{
      if(ids.length>1){
        await api('/inventory/transactions/bulk-delete',{method:'POST',body:JSON.stringify({ids})});
      }else{
        await api(`/inventory/transactions/${ids[0]}`,{method:'DELETE'});
      }
      load();
    }catch(e:any){alert('Delete failed: '+e.message);}
    finally{setDeleting(null);}
  };

  // ── Open full edit panel: fetch detail, build rows ───────────────────────
  const openEditPanel=async(ids:string[], vendorLabel:string, sign:'+'|'-')=>{
    setEditPanel(p=>({...p, open:true, vendorLabel, allTxnIds:ids, rows:[], supplierId:'', supplierName:vendorLabel, sign, loadingDetail:true, newEan:'', newEanStatus:'idle', newEanProduct:null}));
    try{
      const detail=await api<{transactions:EntryTxn[]}>(`/inventory/transactions/entry-detail?ids=${ids.join(',')}`);
      const txns=detail.transactions;
      const rows:EditRow[]=txns.map(t=>({
        txnId:t.id,
        productId:t.productId,
        ean:t.ean,
        model:t.model,
        imeiRequired:t.imeiRequired,
        quantity:Math.abs(t.quantity),
        imeis:t.imeis.map(im=>({id:im.id,imei1:im.imei1,imeiType:im.imeiType,deleted:false})),
        warehouseId:t.warehouseId,
        deleted:false,
        isNew:false,
      }));
      // Supplier from first txn
      const firstVendorId=txns[0]?.vendorId??'';
      const firstVendorName=txns[0]?.vendorName??vendorLabel;
      const warehouseId=txns[0]?.warehouseId??'';
      setEditPanel(p=>({...p,rows,supplierId:firstVendorId,supplierName:firstVendorName,warehouseId,loadingDetail:false}));
    }catch(e:any){
      alert('Failed to load entry detail: '+e.message);
      setEditPanel(p=>({...p,open:false,loadingDetail:false}));
    }
  };

  // ── Look up new EAN for adding a product ────────────────────────────────
  const lookupNewEan=async(ean:string)=>{
    if(!ean.trim())return;
    setEditPanel(p=>({...p,newEanStatus:'loading',newEanProduct:null}));
    try{
      const r=await api<{product:{id:string;model:string;brand:string;imeiRequired:boolean}}>(`/inventory/lookup?ean=${encodeURIComponent(ean.trim())}`);
      setEditPanel(p=>({...p,newEanStatus:'found',newEanProduct:r.product}));
    }catch{
      setEditPanel(p=>({...p,newEanStatus:'not_found',newEanProduct:null}));
    }
  };

  // ── Add a new product row ────────────────────────────────────────────────
  const addNewRow=()=>{
    const {newEanProduct,newEan,warehouseId}=editPanel;
    if(!newEanProduct)return;
    const newRow:EditRow={
      txnId:`new-${uid()}`,
      productId:newEanProduct.id,
      ean:newEan.trim(),
      model:newEanProduct.model,
      imeiRequired:newEanProduct.imeiRequired,
      quantity:1,
      imeis:[],
      warehouseId,
      deleted:false,
      isNew:true,
    };
    setEditPanel(p=>({...p,rows:[...p.rows,newRow],newEan:'',newEanStatus:'idle',newEanProduct:null}));
    setTimeout(()=>newEanRef.current?.focus(),50);
  };

  // ── Add IMEI to a row ────────────────────────────────────────────────────
  const addImeiToRow=(rowIdx:number, imei1:string)=>{
    if(!imei1.trim()||!/^\d{15}$/.test(imei1.trim()))return;
    setEditPanel(p=>{
      const rows=[...p.rows];
      rows[rowIdx]={...rows[rowIdx],imeis:[...rows[rowIdx].imeis,{id:null,imei1:imei1.trim(),imeiType:'NIL',deleted:false}]};
      return {...p,rows};
    });
  };

  // ── Remove an IMEI ───────────────────────────────────────────────────────
  const toggleImeiDeleted=(rowIdx:number,imeiIdx:number)=>{
    setEditPanel(p=>{
      const rows=[...p.rows];
      const imeis=[...rows[rowIdx].imeis];
      imeis[imeiIdx]={...imeis[imeiIdx],deleted:!imeis[imeiIdx].deleted};
      rows[rowIdx]={...rows[rowIdx],imeis};
      return {...p,rows};
    });
  };

  // ── Toggle row deleted ───────────────────────────────────────────────────
  const toggleRowDeleted=(idx:number)=>{
    setEditPanel(p=>{
      const rows=[...p.rows];
      rows[idx]={...rows[idx],deleted:!rows[idx].deleted};
      return {...p,rows};
    });
  };

  // ── Change qty on non-IMEI row ───────────────────────────────────────────
  const setRowQty=(idx:number,qty:number)=>{
    setEditPanel(p=>{
      const rows=[...p.rows];
      rows[idx]={...rows[idx],quantity:Math.max(1,qty)};
      return {...p,rows};
    });
  };

  // ── Save all changes ─────────────────────────────────────────────────────
  const saveEditPanel=async()=>{
    setEditPanel(p=>({...p,saving:true}));
    const {rows,supplierId,allTxnIds,sign}=editPanel;
    const isIn=sign==='+';
    try{
      // 1. Reassign supplier on ALL original transactions
      for(const id of allTxnIds){
        await api(`/inventory/transactions/${id}`,{method:'PATCH',body:JSON.stringify({vendorId:supplierId||null})});
      }

      // 2. Process each existing (non-new) row
      for(const row of rows.filter(r=>!r.isNew)){
        if(row.deleted){
          // Delete this whole transaction
          await api(`/inventory/transactions/${row.txnId}`,{method:'DELETE'});
        } else {
          // Update quantity if non-IMEI (IMEI rows are controlled by imei adds/deletes)
          if(!row.imeiRequired){
            // Get original qty to compute delta
            const origTxn=daily?.recentTxns.find(t=>t.id===row.txnId);
            const origQty=origTxn?Math.abs(origTxn.qty):row.quantity;
            if(origQty!==row.quantity){
              // Adjust: delete original and re-create with new qty
              await api(`/inventory/transactions/${row.txnId}`,{method:'DELETE'});
              await api(isIn?'/inventory/stock-in':'/inventory/stock-out',{method:'POST',body:JSON.stringify({
                productId:row.productId,warehouseId:row.warehouseId,
                quantity:row.quantity,vendorId:supplierId||undefined,
              })});
            }
          }
          // Handle IMEI changes (deletions and additions)
          for(const im of row.imeis){
            if(im.deleted&&im.id){
              // Soft-delete this IMEI
              await api(`/imei/${encodeURIComponent(im.imei1)}/status`,{method:'PATCH',body:JSON.stringify({status:'RETURNED'})});
            }
          }
          // Add new IMEIs (id===null)
          const newImeis=row.imeis.filter(im=>!im.deleted&&!im.id);
          if(newImeis.length){
            await api('/imei/receive',{method:'POST',body:JSON.stringify({
              productId:row.productId,warehouseId:row.warehouseId,
              imeis:newImeis.map(im=>({imei1:im.imei1,imeiType:im.imeiType})),
              vendorId:supplierId||undefined,
              force:true,
            })});
          }
        }
      }

      // 3. Add new product rows (isNew=true, not deleted)
      for(const row of rows.filter(r=>r.isNew&&!r.deleted)){
        if(row.imeiRequired&&row.imeis.length){
          await api('/imei/receive',{method:'POST',body:JSON.stringify({
            productId:row.productId,warehouseId:row.warehouseId,
            imeis:row.imeis.filter(im=>!im.deleted).map(im=>({imei1:im.imei1,imeiType:im.imeiType})),
            vendorId:supplierId||undefined,
            force:true,
          })});
        } else if(!row.imeiRequired){
          await api(isIn?'/inventory/stock-in':'/inventory/stock-out',{method:'POST',body:JSON.stringify({
            productId:row.productId,warehouseId:row.warehouseId,
            quantity:row.quantity,vendorId:supplierId||undefined,
          })});
        }
      }

      setEditPanel(p=>({...p,open:false,saving:false}));
      load();
    }catch(e:any){
      alert('Save failed: '+e.message);
      setEditPanel(p=>({...p,saving:false}));
    }
  };

  // ── Group transactions by vendor ─────────────────────────────────────────
  const inTxns=(daily?.recentTxns||[]).filter(t=>t.qty>0);
  const outTxns=(daily?.recentTxns||[]).filter(t=>t.qty<0);
  const byVendor=(txns:Txn[])=>txns.reduce((a:Record<string,Txn[]>,t)=>{const v=t.vendor||'No Vendor';if(!a[v])a[v]=[];a[v].push(t);return a;},{});
  const inGroups=byVendor(inTxns);
  const outGroups=byVendor(outTxns);

  const ActionBtns=({ids,label,sign}:{ids:string[];label:string;sign:'+'|'-'})=>(
    <div style={{display:'flex',gap:6,flexShrink:0}}>
      <button onClick={()=>openEditPanel(ids,label,sign)}
        style={{height:26,padding:'0 10px',border:'1px solid #bfdbfe',borderRadius:5,background:'#eff6ff',cursor:'pointer',color:'#2563eb',fontSize:11,fontWeight:600,display:'flex',alignItems:'center',gap:4}}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Edit
      </button>
      <button onClick={()=>bulkDelete(ids,label)} disabled={!!deleting}
        style={{height:26,padding:'0 10px',border:'1px solid #fca5a5',borderRadius:5,background:'#fef2f2',cursor:'pointer',color:'#dc2626',fontSize:11,fontWeight:600,display:'flex',alignItems:'center',gap:4,opacity:deleting?0.6:1}}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        {deleting===ids[0]?'…':'Delete'}
      </button>
    </div>
  );

  const VendorCard=({vendor,txns,color,sign}:{vendor:string;txns:Txn[];color:string;sign:'+'|'-'})=>{
    const total=txns.reduce((s,t)=>s+Math.abs(t.qty),0);
    const [open,setOpen]=useState(true);
    const byProd=txns.reduce((a:Record<string,Txn[]>,t)=>{const k=t.product.trim();if(!a[k])a[k]=[];a[k].push(t);return a;},{});
    const allIds=txns.map(t=>t.id);
    return (
      <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:10,marginBottom:8,overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
        <div style={{padding:'10px 14px',display:'flex',alignItems:'center',gap:10,background:'#f8fafc',borderBottom:open?'1px solid #e2e8f0':'none'}}>
          <div onClick={()=>setOpen(x=>!x)} style={{flex:1,cursor:'pointer'}}>
            <div style={{fontWeight:700,fontSize:13,color:'#0f172a'}}>{vendor}</div>
            <div style={{fontSize:11,color:'#94a3b8',marginTop:1}}>{txns.length} transaction{txns.length!==1?'s':''} · {sign}{total} units · {new Date(txns[0].createdAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})} {new Date(txns[0].createdAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</div>
          </div>
          <span style={{fontWeight:800,fontSize:14,color}}>{sign}{total}</span>
          <ActionBtns ids={allIds} label={vendor} sign={sign}/>
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

  // ── Full-screen Edit Panel ───────────────────────────────────────────────
  const EP = editPanel;
  const activeRows=EP.rows.filter(r=>!r.deleted);
  const deletedRows=EP.rows.filter(r=>r.deleted);

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',background:'#f8fafc',overflow:'hidden'}}>
      {/* Header */}
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
                          <button onClick={()=>openEditPanel([t.id],t.vendor||t.product,t.qty>0?'+':'-')}
                            style={{height:24,padding:'0 8px',border:'1px solid #bfdbfe',borderRadius:5,background:'#eff6ff',cursor:'pointer',color:'#2563eb',fontSize:10,fontWeight:600,display:'flex',alignItems:'center',gap:3}}>
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            Edit
                          </button>
                          <button onClick={()=>bulkDelete([t.id],t.product)} disabled={!!deleting}
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

      {/* ── FULL EDIT PANEL (slide-in from right) ───────────────────────── */}
      {EP.open&&(
        <div style={{position:'fixed',inset:0,zIndex:600,display:'flex'}}>
          {/* Backdrop */}
          <div style={{flex:1,background:'rgba(15,23,42,.45)'}} onClick={()=>!EP.saving&&setEditPanel(p=>({...p,open:false}))}/>
          {/* Panel */}
          <div style={{width:660,background:'#fff',display:'flex',flexDirection:'column',boxShadow:'-8px 0 40px rgba(0,0,0,.18)',overflowY:'auto'}}>

            {/* Panel header */}
            <div style={{padding:'16px 20px',borderBottom:'1px solid #e2e8f0',background:'#fff',position:'sticky',top:0,zIndex:2}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:15,fontWeight:800,color:'#0f172a'}}>Edit Stock Entry</div>
                  <div style={{fontSize:11,color:'#94a3b8',marginTop:1}}>
                    {EP.sign==='+' ? '📥 Stock In' : '📤 Stock Out'} · {EP.vendorLabel} · {EP.allTxnIds.length} original transaction{EP.allTxnIds.length!==1?'s':''}
                  </div>
                </div>
                <button onClick={()=>!EP.saving&&setEditPanel(p=>({...p,open:false}))}
                  style={{width:30,height:30,border:'1px solid #e2e8f0',borderRadius:7,background:'#f8fafc',cursor:'pointer',fontSize:16,color:'#64748b',display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
              </div>

              {/* Supplier selector */}
              <div style={{marginTop:14}}>
                <label style={{fontSize:10,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'.07em',display:'block',marginBottom:5}}>
                  {EP.sign==='+' ? 'SUPPLIER / RECEIVED FROM' : 'ISSUED TO / CUSTOMER'}
                </label>
                <select value={EP.supplierId} onChange={e=>{
                    const sel=suppliers.find(s=>s.id===e.target.value);
                    setEditPanel(p=>({...p,supplierId:e.target.value,supplierName:sel?.name||''}));
                  }}
                  style={{width:'100%',height:38,padding:'0 12px',border:'1.5px solid #d0d5dd',borderRadius:8,fontSize:13,background:'#fff',outline:'none',boxSizing:'border-box'}}>
                  <option value="">— No Supplier</option>
                  {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>

            {/* Loading state */}
            {EP.loadingDetail&&(
              <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:12,color:'#94a3b8',fontSize:13}}>
                <div className="spinner" style={{width:20,height:20}}/>
                Loading entry details…
              </div>
            )}

            {/* Product rows */}
            {!EP.loadingDetail&&(
              <div style={{flex:1,padding:'12px 20px'}}>

                {/* Active rows */}
                {activeRows.length===0&&(
                  <div style={{textAlign:'center',padding:'24px',color:'#94a3b8',fontSize:13,background:'#f8fafc',borderRadius:8,marginBottom:12}}>
                    All products removed. Add a product below or save to delete this entry.
                  </div>
                )}

                {EP.rows.map((row,rowIdx)=>{
                  if(row.deleted) return null;
                  const activeImeis=row.imeis.filter(im=>!im.deleted);
                  const deletedImeis=row.imeis.filter(im=>im.deleted);
                  return(
                    <div key={row.txnId} style={{border:'1px solid #e2e8f0',borderRadius:10,marginBottom:10,overflow:'hidden',background:row.isNew?'#f0fdf4':'#fff'}}>
                      {/* Row header */}
                      <div style={{padding:'10px 14px',display:'flex',alignItems:'center',gap:10,background:row.isNew?'#dcfce7':'#f8fafc',borderBottom:'1px solid #e2e8f0'}}>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:700,fontSize:13,color:'#0f172a'}}>{row.model}</div>
                          <div style={{fontSize:11,color:'#94a3b8',marginTop:1}}>
                            EAN: {row.ean}
                            {row.isNew&&<span style={{marginLeft:8,fontSize:10,fontWeight:700,color:'#16a34a',background:'#dcfce7',padding:'1px 7px',borderRadius:10}}>NEW</span>}
                          </div>
                        </div>

                        {/* Quantity (non-IMEI only) */}
                        {!row.imeiRequired&&(
                          <div style={{display:'flex',alignItems:'center',gap:6}}>
                            <label style={{fontSize:11,color:'#64748b',fontWeight:600}}>Qty:</label>
                            <div style={{display:'flex',alignItems:'center',border:'1px solid #d0d5dd',borderRadius:6,overflow:'hidden'}}>
                              <button onClick={()=>setRowQty(rowIdx,row.quantity-1)}
                                style={{width:28,height:28,border:'none',background:'#f8fafc',cursor:'pointer',fontSize:14,color:'#374151',display:'flex',alignItems:'center',justifyContent:'center'}}>−</button>
                              <input type="number" value={row.quantity} min={1}
                                onChange={e=>setRowQty(rowIdx,parseInt(e.target.value)||1)}
                                style={{width:44,height:28,border:'none',textAlign:'center',fontSize:13,fontWeight:700,color:'#0f172a',outline:'none'}}/>
                              <button onClick={()=>setRowQty(rowIdx,row.quantity+1)}
                                style={{width:28,height:28,border:'none',background:'#f8fafc',cursor:'pointer',fontSize:14,color:'#374151',display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
                            </div>
                          </div>
                        )}

                        {/* Delete row button */}
                        <button onClick={()=>toggleRowDeleted(rowIdx)} title="Remove this product"
                          style={{height:28,padding:'0 10px',border:'1px solid #fca5a5',borderRadius:6,background:'#fef2f2',color:'#dc2626',fontSize:11,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:4}}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                          Remove
                        </button>
                      </div>

                      {/* IMEI list */}
                      {row.imeiRequired&&(
                        <div style={{padding:'10px 14px'}}>
                          <div style={{fontSize:10,fontWeight:700,color:'#dc2626',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>
                            IMEIs ({activeImeis.length} active{deletedImeis.length>0?`, ${deletedImeis.length} removed`:''})
                          </div>

                          {/* Active IMEIs */}
                          {activeImeis.map((im,imIdx)=>{
                            const realIdx=row.imeis.indexOf(im);
                            return(
                              <div key={im.id||im.imei1} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,padding:'6px 10px',background:'#f8fafc',borderRadius:6,border:'1px solid #e2e8f0'}}>
                                <span style={{fontFamily:'monospace',fontSize:12,fontWeight:600,color:'#0f172a',flex:1}}>{im.imei1}</span>
                                <span style={{fontSize:10,color:'#64748b',background:'#e2e8f0',padding:'1px 7px',borderRadius:10}}>{im.imeiType==='NIL'?'Standard':im.imeiType}</span>
                                {im.id===null&&<span style={{fontSize:10,fontWeight:700,color:'#16a34a',background:'#dcfce7',padding:'1px 7px',borderRadius:10}}>NEW</span>}
                                <button onClick={()=>toggleImeiDeleted(rowIdx,realIdx)}
                                  style={{width:22,height:22,border:'1px solid #fca5a5',borderRadius:4,background:'#fef2f2',color:'#dc2626',cursor:'pointer',fontSize:12,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700}}>✕</button>
                              </div>
                            );
                          })}

                          {/* Removed IMEIs preview */}
                          {deletedImeis.length>0&&(
                            <div style={{marginTop:6}}>
                              {deletedImeis.map((im,imIdx)=>{
                                const realIdx=row.imeis.indexOf(im);
                                return(
                                  <div key={im.id||im.imei1} style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,padding:'5px 10px',background:'#fff5f5',borderRadius:6,border:'1px dashed #fca5a5',opacity:0.7}}>
                                    <span style={{fontFamily:'monospace',fontSize:12,color:'#dc2626',flex:1,textDecoration:'line-through'}}>{im.imei1}</span>
                                    <span style={{fontSize:10,color:'#dc2626'}}>will be removed</span>
                                    <button onClick={()=>toggleImeiDeleted(rowIdx,realIdx)}
                                      style={{height:20,padding:'0 8px',border:'1px solid #d0d5dd',borderRadius:4,background:'#fff',color:'#374151',cursor:'pointer',fontSize:10,fontWeight:600}}>Undo</button>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Add new IMEI input */}
                          <AddImeiInput onAdd={(imei1)=>addImeiToRow(rowIdx,imei1)}/>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Removed rows (collapsed) */}
                {deletedRows.length>0&&(
                  <div style={{marginTop:8,padding:'8px 12px',background:'#fff5f5',border:'1px dashed #fca5a5',borderRadius:8}}>
                    <div style={{fontSize:11,fontWeight:700,color:'#dc2626',marginBottom:4}}>Will be removed ({deletedRows.length})</div>
                    {deletedRows.map((row,_)=>{
                      const rowIdx=EP.rows.indexOf(row);
                      return(
                        <div key={row.txnId} style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                          <span style={{fontSize:12,color:'#dc2626',flex:1,textDecoration:'line-through'}}>{row.model} ({row.imeiRequired?`${row.imeis.filter(im=>!im.deleted).length} IMEIs`:`qty ${row.quantity}`})</span>
                          <button onClick={()=>toggleRowDeleted(rowIdx)}
                            style={{height:22,padding:'0 8px',border:'1px solid #d0d5dd',borderRadius:4,background:'#fff',color:'#374151',cursor:'pointer',fontSize:10,fontWeight:600}}>Undo</button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add new product section */}
                <div style={{marginTop:16,padding:'14px',background:'#f8fafc',borderRadius:10,border:'2px dashed #e2e8f0'}}>
                  <div style={{fontSize:11,fontWeight:700,color:'#374151',marginBottom:10,textTransform:'uppercase',letterSpacing:'.06em'}}>＋ Add Product to This Entry</div>
                  <div style={{display:'flex',gap:8,alignItems:'flex-start'}}>
                    <div style={{flex:1}}>
                      <input
                        ref={newEanRef}
                        value={EP.newEan}
                        onChange={e=>setEditPanel(p=>({...p,newEan:e.target.value,newEanStatus:'idle',newEanProduct:null}))}
                        onKeyDown={e=>{if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();lookupNewEan(EP.newEan);}}}
                        onPaste={e=>{e.preventDefault();const v=e.clipboardData.getData('text').trim();if(v){setEditPanel(p=>({...p,newEan:v}));setTimeout(()=>lookupNewEan(v),50);}}}
                        placeholder="Scan or type EAN barcode…"
                        style={{width:'100%',height:38,padding:'0 12px',border:'1.5px solid #d0d5dd',borderRadius:7,fontSize:13,outline:'none',boxSizing:'border-box'}}
                      />
                      {EP.newEanStatus==='found'&&EP.newEanProduct&&(
                        <div style={{marginTop:6,padding:'8px 12px',background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:6,fontSize:12}}>
                          <strong style={{color:'#15803d'}}>✓ {EP.newEanProduct.model}</strong>
                          <span style={{color:'#64748b',marginLeft:8}}>{EP.newEanProduct.brand}</span>
                          {EP.newEanProduct.imeiRequired&&<span style={{color:'#dc2626',marginLeft:8,fontSize:10,fontWeight:700}}>IMEI Required</span>}
                        </div>
                      )}
                      {EP.newEanStatus==='not_found'&&(
                        <div style={{marginTop:6,padding:'6px 12px',background:'#fff5f5',border:'1px solid #fecdd3',borderRadius:6,fontSize:12,color:'#dc2626'}}>
                          ✕ EAN not found in Product Master
                        </div>
                      )}
                    </div>
                    <button
                      onClick={()=>EP.newEanStatus==='found'?addNewRow():lookupNewEan(EP.newEan)}
                      disabled={EP.newEanStatus==='loading'}
                      style={{height:38,padding:'0 16px',border:'none',borderRadius:7,background:EP.newEanStatus==='found'?'#16a34a':'#2563eb',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap',flexShrink:0,opacity:EP.newEanStatus==='loading'?0.6:1}}>
                      {EP.newEanStatus==='loading'?'Looking up…':EP.newEanStatus==='found'?'Add Row':'Look Up'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Save / Cancel footer */}
            <div style={{padding:'14px 20px',borderTop:'1px solid #e2e8f0',background:'#fff',position:'sticky',bottom:0,display:'flex',gap:10}}>
              <button onClick={saveEditPanel} disabled={EP.saving||EP.loadingDetail}
                style={{flex:1,height:42,border:'none',borderRadius:8,background:EP.saving?'#94a3b8':'#2563eb',color:'#fff',fontSize:14,fontWeight:700,cursor:EP.saving?'not-allowed':'pointer'}}>
                {EP.saving?'Saving changes…':'💾 Save Changes'}
              </button>
              <button onClick={()=>!EP.saving&&setEditPanel(p=>({...p,open:false}))}
                style={{height:42,padding:'0 20px',border:'1px solid #e2e8f0',borderRadius:8,background:'#fff',fontSize:13,color:'#64748b',cursor:'pointer',fontWeight:600}}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Small component: add-IMEI input inside a row ─────────────────────────
function AddImeiInput({onAdd}:{onAdd:(imei1:string)=>void}) {
  const [val,setVal]=useState('');
  const submit=()=>{
    if(!/^\d{15}$/.test(val.trim())){alert('IMEI must be exactly 15 digits');return;}
    onAdd(val.trim());setVal('');
  };
  return(
    <div style={{display:'flex',gap:6,marginTop:8}}>
      <input value={val} onChange={e=>{setVal(e.target.value);if(/^\d{15}$/.test(e.target.value.trim())){onAdd(e.target.value.trim());setVal('');}}}
        onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();submit();}}}
        placeholder="Scan new IMEI to add (15 digits)…"
        style={{flex:1,height:32,padding:'0 10px',border:'1.5px solid #d0d5dd',borderRadius:6,fontSize:12,fontFamily:'monospace',outline:'none'}}/>
      <button onClick={submit} style={{height:32,padding:'0 12px',border:'none',borderRadius:6,background:'#2563eb',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer'}}>Add</button>
    </div>
  );
}
