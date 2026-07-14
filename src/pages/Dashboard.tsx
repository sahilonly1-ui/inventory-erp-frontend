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

  // ── Edit: fetch full entry detail → write to StockIn draft → redirect ──────
  const openEditPanel=async(ids:string[], vendorLabel:string, sign:'+'|'-')=>{
    // Show loading state on the button (use a simple flag via editPanel.loadingDetail)
    setEditPanel(p=>({...p,open:false,loadingDetail:true}));
    try{
      const detail=await api<{transactions:EntryTxn[]}>(`/inventory/transactions/entry-detail?ids=${ids.join(',')}`);
      const txns=detail.transactions;

      // Build Row[] in the exact shape StockIn expects (sin_draft_v2)
      // Each transaction becomes one row per IMEI (phones) or one row with qty (accessories)
      const uid=()=>Math.random().toString(36).slice(2,9);
      const rows:any[]=[];
      for(const t of txns){
        if(t.imeiRequired&&t.imeis.length){
          // One row per IMEI
          for(const im of t.imeis){
            rows.push({
              id:uid(),ean:t.ean,productId:t.productId,model:t.model,brand:t.brand,
              imeiRequired:true,qty:1,imei:im.imei1,srno:'',imeiType:im.imeiType||'NIL',
              status:'saved',errMsg:'',errField:'',
              _origTxnId:t.id,_origImeiId:im.id, // track for cleanup
            });
          }
        }else{
          // One row with full quantity
          rows.push({
            id:uid(),ean:t.ean,productId:t.productId,model:t.model,brand:t.brand,
            imeiRequired:t.imeiRequired,qty:Math.abs(t.quantity),imei:'',srno:'',imeiType:'NIL',
            status:'saved',errMsg:'',errField:'',
            _origTxnId:t.id,
          });
        }
      }
      // Add one blank row at the end for new additions
      rows.push({id:uid(),ean:'',productId:'',model:'',brand:'',imeiRequired:false,qty:0,imei:'',srno:'',imeiType:'NIL',status:'empty',errMsg:'',errField:''});

      const supplierName=txns[0]?.vendorName??vendorLabel;
      const dateStr=txns[0]?.createdAt?.slice(0,10)??new Date().toISOString().slice(0,10);

      // Write the edit context to localStorage — StockIn reads this on mount
      localStorage.setItem('sin_draft_v2', JSON.stringify({
        r:rows, s:supplierName, iv:'', dt:dateStr,
      }));
      // Also store the original txn IDs so StockIn knows to delete them on save
      localStorage.setItem('sin_edit_mode', JSON.stringify({
        txnIds:ids,
        supplierName,
        supplierVendorId:txns[0]?.vendorId??'',
        sign,
        originalDate:dateStr,
      }));

    }catch(e:any){
      alert('Failed to load entry: '+e.message);
      setEditPanel(p=>({...p,loadingDetail:false}));
      return;
    }

    setEditPanel(p=>({...p,loadingDetail:false}));
    // Navigate to Stock In — React Router navigate
    window.location.href='/stock-in';
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
      <button onClick={()=>openEditPanel(ids,label,sign)} disabled={editPanel.loadingDetail}
        style={{height:26,padding:'0 10px',border:'1px solid #bfdbfe',borderRadius:5,background:'#eff6ff',cursor:editPanel.loadingDetail?'wait':'pointer',color:'#2563eb',fontSize:11,fontWeight:600,display:'flex',alignItems:'center',gap:4,opacity:editPanel.loadingDetail?0.6:1}}>
        {editPanel.loadingDetail?<div className="spinner" style={{width:10,height:10}}/>:<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>}
        {editPanel.loadingDetail?'Loading…':'Edit'}
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

    </div>
  );
}

// AddImeiInput not used after redirect refactor
