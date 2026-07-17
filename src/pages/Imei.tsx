import { useState, useEffect, useCallback, useRef } from 'react';
import { api, getAccessToken } from '../api/client';

interface ImeiUnit {
  id:string; imei1:string; imei2?:string; status:string; imeiType:string;
  swiped:boolean; swipedAt?:string;
  activated:boolean; activatedAt?:string;
  product?:{ ean:string; model:string; brand:string; };
  warehouse?:{ name:string; };
  supplier?:{ name:string; };
  createdAt:string; updatedAt:string;
}
interface Page { items:ImeiUnit[]; total:number; page:number; totalPages:number; }

const STATUS_META: Record<string,{bg:string;color:string;dot:string}> = {
  IN_STOCK:  {bg:'#dcfce7',color:'#15803d',dot:'#16a34a'},
  SOLD:      {bg:'#fee2e2',color:'#dc2626',dot:'#dc2626'},
  RETURNED:  {bg:'#fef9c3',color:'#854d0e',dot:'#ca8a04'},
  OPEN_BOX:  {bg:'#dbeafe',color:'#1d4ed8',dot:'#2563eb'},
  SERVICE:   {bg:'#ede9fe',color:'#6d28d9',dot:'#7c3aed'},
  DAMAGED:   {bg:'#fee2e2',color:'#9f1239',dot:'#be123c'},
  LOST:      {bg:'#f1f5f9',color:'#475569',dot:'#64748b'},
};
const TYPE_META: Record<string,{label:string;bg:string;color:string}> = {
  NIL:         {label:'Standard',  bg:'#f1f5f9',color:'#475569'},
  OPEN_BOX:    {label:'Open Box',  bg:'#dbeafe',color:'#1d4ed8'},
  DEMO:        {label:'Demo',      bg:'#fef9c3',color:'#854d0e'},
  SECOND_IMEI: {label:'2nd IMEI', bg:'#ede9fe',color:'#6d28d9'},
};
const fmt = (s:string) => new Date(s).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'});

export function Imei() {
  const [data,setData]=useState<Page|null>(null);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState('');
  const [imeiType,setImeiType]=useState('');
  const [swiped,setSwiped]=useState('');
  const [page,setPage]=useState(1);
  const [exporting,setExporting]=useState(false);
  const [updatingId,setUpdatingId]=useState<string|null>(null);
  const [expandedId,setExpandedId]=useState<string|null>(null);
  const debRef=useRef<ReturnType<typeof setTimeout>>();

  const load=useCallback(async(q=search,s=status,t=imeiType,sw=swiped,pg=page)=>{
    setLoading(true);
    try{
      const params=new URLSearchParams({page:String(pg),limit:'50'});
      if(q)params.set('search',q);
      if(s)params.set('status',s);
      if(t)params.set('imeiType',t);
      if(sw)params.set('swiped',sw);
      const d=await api<Page>(`/imei?${params}`);
      setData(d);
    }catch{}
    finally{setLoading(false);}
  },[search,status,imeiType,swiped,page]);

  useEffect(()=>{load();},[load]);

  const onSearch=(v:string)=>{
    setSearch(v);setPage(1);
    clearTimeout(debRef.current);
    debRef.current=setTimeout(()=>load(v,status,imeiType,swiped,1),350);
  };

  const setFilter=(key:'status'|'imeiType'|'swiped',val:string)=>{
    const ns=key==='status'?val:status;
    const nt=key==='imeiType'?val:imeiType;
    const nsw=key==='swiped'?val:swiped;
    if(key==='status')setStatus(val);
    if(key==='imeiType')setImeiType(val);
    if(key==='swiped')setSwiped(val);
    setPage(1);
    load(search,ns,nt,nsw,1);
  };

  const toggleSwiped=async(id:string,imei1:string,cur:boolean)=>{
    setUpdatingId(id);
    const newSwiped=!cur;
    // Optimistic UI update immediately
    setData(d=>d?{...d,items:d.items.map(i=>i.id===id?{...i,swiped:newSwiped,swipedAt:newSwiped?new Date().toISOString():undefined}:i)}:d);
    try{
      // Use dedicated /swiped endpoint (by DB id) — avoids early-return bug in /status
      const res=await api<{id:string;swiped:boolean;swipedAt:string|null}>(`/imei/${id}/swiped`,{method:'PATCH',body:JSON.stringify({swiped:newSwiped})});
      // Sync actual swipedAt from server
      setData(d=>d?{...d,items:d.items.map(i=>i.id===id?{...i,swiped:res.swiped,swipedAt:res.swipedAt??undefined}:i)}:d);
    }catch(e:any){
      // Revert optimistic update on failure
      setData(d=>d?{...d,items:d.items.map(i=>i.id===id?{...i,swiped:cur,swipedAt:cur?i.swipedAt:undefined}:i)}:d);
      alert(e.message);
    }
    finally{setUpdatingId(null);}
  };

  const toggleActivated=async(id:string,cur:boolean)=>{
    setUpdatingId(id);
    const newVal=!cur;
    setData(d=>d?{...d,items:d.items.map(i=>i.id===id?{...i,activated:newVal,activatedAt:newVal?new Date().toISOString():undefined}:i)}:d);
    try{
      const res=await api<{id:string;activated:boolean;activatedAt:string|null}>(`/imei/${id}/activated`,{method:'PATCH',body:JSON.stringify({activated:newVal})});
      setData(d=>d?{...d,items:d.items.map(i=>i.id===id?{...i,activated:res.activated,activatedAt:res.activatedAt??undefined}:i)}:d);
    }catch(e:any){
      setData(d=>d?{...d,items:d.items.map(i=>i.id===id?{...i,activated:cur,activatedAt:cur?i.activatedAt:undefined}:i)}:d);
      alert(e.message);
    }
    finally{setUpdatingId(null);}
  };

  const changeStatus=async(id:string,imei1:string,ns:string)=>{
    setUpdatingId(id);
    try{
      await api(`/imei/${encodeURIComponent(imei1)}/status`,{method:'PATCH',body:JSON.stringify({status:ns})});
      setData(d=>d?{...d,items:d.items.map(i=>i.id===id?{...i,status:ns}:i)}:d);
    }catch(e:any){alert(e.message);}
    finally{setUpdatingId(null);}
  };

  const exportXlsx=async()=>{
    setExporting(true);
    try{
      const base=(import.meta.env.VITE_API_URL as string)??'https://inventory-erp-backend-iplr.onrender.com/api/v1';
      const resp=await fetch(`${base}/reports/imei_filtered`,{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${getAccessToken()}`},
        body:JSON.stringify({search:search||undefined,imeiType:imeiType||undefined,swiped:swiped||undefined}),
      });
      if(!resp.ok)throw new Error('Export failed');
      const blob=await resp.blob();
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;
      a.download=`IMEI_Export_${search?search.replace(/\s+/g,'_')+'_':''}${new Date().toISOString().slice(0,10)}.xlsx`;
      document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
    }catch(e:any){alert(e.message);}
    finally{setExporting(false);}
  };

  const items=data?.items||[];
  const total=data?.total||0;

  const activeFilters=[
    status&&`Status: ${status.replace(/_/g,' ')}`,
    imeiType&&`Type: ${TYPE_META[imeiType]?.label||imeiType}`,
    swiped&&(swiped==='true'?'Swiped':'Unswiped'),
  ].filter(Boolean);

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',background:'#f8fafc'}}>
      {/* Header */}
      <div style={{padding:'14px 20px',borderBottom:'1px solid #e2e8f0',background:'#fff',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
          <div>
            <div style={{fontSize:18,fontWeight:800,color:'#0f172a',letterSpacing:'-.3px'}}>IMEI Tracker</div>
            <div style={{fontSize:12,color:'#94a3b8',marginTop:1}}>
              {loading?'Loading…':`${total.toLocaleString('en-IN')} records`}
              {activeFilters.length>0&&<span style={{marginLeft:6,color:'#2563eb'}}>· {activeFilters.join(' · ')}</span>}
            </div>
          </div>
          <div style={{flex:1}}/>
          <button onClick={()=>{setSearch('');setStatus('');setImeiType('');setSwiped('');setPage(1);load('','','','',1);}}
            style={{height:32,padding:'0 12px',border:'1px solid #e2e8f0',borderRadius:7,background:'#fff',fontSize:12,color:'#64748b',cursor:'pointer'}}>
            Clear filters
          </button>
          <button onClick={exportXlsx} disabled={exporting}
            style={{height:32,padding:'0 14px',border:'1px solid #d0d5dd',borderRadius:7,background:'#fff',fontSize:12,fontWeight:600,color:'#374151',cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            {exporting?'Exporting…':'Download XLSX'}
          </button>
        </div>

        {/* Search + filters */}
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <div style={{position:'relative',flex:'1 1 280px'}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',pointerEvents:'none'}}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input value={search} onChange={e=>onSearch(e.target.value)}
              placeholder="Search IMEI, product name (e.g. Moto 60 Pro)…"
              style={{width:'100%',height:36,paddingLeft:34,paddingRight:10,border:'1.5px solid #e2e8f0',borderRadius:8,fontSize:13,outline:'none',boxSizing:'border-box',background:'#fff'}}
              onFocus={e=>(e.target as HTMLElement).style.borderColor='#2563eb'} onBlur={e=>(e.target as HTMLElement).style.borderColor='#e2e8f0'} />
          </div>
          {[
            {val:status, set:(v:string)=>setFilter('status',v), label:'Status',
              opts:[['','All Status'],['IN_STOCK','In Stock'],['SOLD','Sold'],['RETURNED','Returned'],['OPEN_BOX','Open Box'],['SERVICE','Service'],['DAMAGED','Damaged'],['LOST','Lost']]},
            {val:imeiType, set:(v:string)=>setFilter('imeiType',v), label:'Type',
              opts:[['','All Types'],['NIL','Standard'],['OPEN_BOX','Open Box'],['DEMO','Demo'],['SECOND_IMEI','2nd IMEI']]},
            {val:swiped, set:(v:string)=>setFilter('swiped',v), label:'Swiped',
              opts:[['','All'],['true','Swiped ✓'],['false','Unswiped ○']]},
          ].map((f,fi)=>(
            <select key={fi} value={f.val} onChange={e=>f.set(e.target.value)}
              style={{height:36,padding:'0 28px 0 10px',border:`1.5px solid ${f.val?'#2563eb':'#e2e8f0'}`,borderRadius:8,fontSize:12,background:'#fff',outline:'none',cursor:'pointer',color:f.val?'#2563eb':'#374151',minWidth:110,fontWeight:f.val?600:400}}>
              {f.opts.map(([v,l])=><option key={v as string} value={v as string}>{l as string}</option>)}
            </select>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{flex:1,overflow:'auto'}}>
        {loading ? (
          <div style={{display:'flex',justifyContent:'center',padding:'48px'}}><div className="spinner" style={{width:28,height:28}}/></div>
        ) : items.length === 0 ? (
          <div style={{textAlign:'center',padding:'64px 20px',color:'#94a3b8'}}>
            <div style={{fontSize:32,marginBottom:12}}>📱</div>
            <div style={{fontSize:15,fontWeight:700,color:'#374151',marginBottom:6}}>
              {search||status||imeiType||swiped?'No matching IMEI records':'No IMEI records yet'}
            </div>
            <div style={{fontSize:13}}>
              {search?`Try fewer keywords — partial matches work (e.g. "Edge 60")`:
               'IMEI records appear automatically when stock is received'}
            </div>
          </div>
        ) : (
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr style={{background:'#f8fafc',position:'sticky',top:0,zIndex:5,boxShadow:'0 1px 0 #e2e8f0'}}>
                {['IMEI 1 / IMEI 2','Product','Status','Swiped','Swiped On','Activated','Activated On','Supplier','Stock In','Last Updated','Change Status'].map(h=>(
                  <th key={h} style={{padding:'0 12px',height:36,textAlign:'left',fontWeight:700,color:'#64748b',fontSize:10,textTransform:'uppercase',letterSpacing:'.07em',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item,i)=>{
                const sm=STATUS_META[item.status]||{bg:'#f1f5f9',color:'#475569',dot:'#64748b'};
                const tm=TYPE_META[item.imeiType]||TYPE_META.NIL;
                const isExp=expandedId===item.id;
                return (
                  <tr key={item.id}
                    style={{borderBottom:'1px solid #f1f5f9',background:i%2===0?'#fff':'#fafafa',cursor:'pointer',transition:'background .08s'}}
                    onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='#f0f9ff'}
                    onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background=i%2===0?'#fff':'#fafafa'}
                    onClick={()=>setExpandedId(isExp?null:item.id)}>
                    {/* IMEI */}
                    <td style={{padding:'8px 12px',minWidth:160}}>
                      <div style={{fontFamily:'monospace',fontSize:12,fontWeight:700,color:'#0f172a',letterSpacing:'.01em'}}>{item.imei1}</div>
                      {item.imei2&&<div style={{fontFamily:'monospace',fontSize:10,color:'#94a3b8',marginTop:1}}>IMEI2: {item.imei2}</div>}
                    </td>
                    {/* Product */}
                    <td style={{padding:'8px 12px',maxWidth:220}}>
                      <div style={{fontWeight:600,color:'#0f172a',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.product?.model||'—'}</div>
                      <div style={{fontSize:10,color:'#94a3b8',marginTop:1}}>{item.product?.brand||''}{item.product?.ean?` · ${item.product.ean}`:''}</div>
                    </td>
                    {/* Status */}
                    <td style={{padding:'8px 12px'}}>
                      <span style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:11,padding:'3px 9px',borderRadius:20,fontWeight:700,background:sm.bg,color:sm.color}}>
                        <span style={{width:6,height:6,borderRadius:'50%',background:sm.dot,flexShrink:0}}/>
                        {item.status.replace(/_/g,' ')}
                      </span>
                    </td>

                    {/* Swiped toggle */}
                    <td style={{padding:'8px 12px'}} onClick={e=>e.stopPropagation()}>
                      <button onClick={()=>toggleSwiped(item.id,item.imei1,item.swiped)} disabled={updatingId===item.id} title={item.swiped?'Mark unswiped':'Mark swiped'}
                        style={{width:44,height:22,borderRadius:11,border:'none',background:item.swiped?'#2563eb':'#e2e8f0',cursor:'pointer',position:'relative',transition:'background .2s',display:'inline-block',flexShrink:0,opacity:updatingId===item.id?.5:1}}>
                        <span style={{width:16,height:16,borderRadius:'50%',background:'#fff',position:'absolute',top:3,left:item.swiped?25:3,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)',display:'block'}}/>
                      </button>
                    </td>
                    {/* Swiped On date/time */}
                    <td style={{padding:'8px 12px',whiteSpace:'nowrap',fontSize:11}}>
                      {item.swiped&&item.swipedAt?(
                        <span style={{color:'#2563eb',fontWeight:600}}>
                          {new Date(item.swipedAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}
                          <br/>
                          <span style={{color:'#94a3b8',fontWeight:400}}>{new Date(item.swipedAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</span>
                        </span>
                      ):'—'}
                    </td>
                    {/* Activated toggle */}
                    <td style={{padding:'8px 12px',whiteSpace:'nowrap'}}>
                      <button onClick={()=>toggleActivated(item.id,item.activated)} disabled={updatingId===item.id} title={item.activated?'Mark not activated':'Mark as activated'}
                        style={{width:44,height:24,borderRadius:12,border:'none',cursor:'pointer',background:item.activated?'#7c3aed':'#e2e8f0',transition:'background .2s',position:'relative',flexShrink:0,display:'inline-block'}}>
                        <span style={{position:'absolute',top:2,left:item.activated?22:2,width:20,height:20,borderRadius:'50%',background:'#fff',transition:'left .2s',display:'block'}}/>
                      </button>
                    </td>
                    {/* Activated On date/time */}
                    <td style={{padding:'8px 12px',whiteSpace:'nowrap',fontSize:11}}>
                      {item.activated&&item.activatedAt?(
                        <span style={{color:'#7c3aed',fontWeight:600}}>
                          {new Date(item.activatedAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}
                          <br/>
                          <span style={{color:'#94a3b8',fontWeight:400}}>{new Date(item.activatedAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</span>
                        </span>
                      ):'—'}
                    </td>
                    {/* Supplier */}
                    <td style={{padding:'8px 12px',color:'#374151',maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {(item as any).supplier?.name||<span style={{color:'#cbd5e1'}}>—</span>}
                    </td>
                    {/* Warehouse */}

                    {/* Stock In Date */}
                    <td style={{padding:'8px 12px',color:'#374151',whiteSpace:'nowrap'}}>{fmt(item.createdAt)}</td>
                    {/* Last Updated */}
                    <td style={{padding:'8px 12px',color:'#94a3b8',whiteSpace:'nowrap'}}>
                      {item.status==='SOLD'?<span style={{color:'#dc2626',fontWeight:600}}>{fmt(item.updatedAt)}</span>:fmt(item.updatedAt)}
                    </td>
                    {/* Change Status */}
                    <td style={{padding:'8px 12px'}} onClick={e=>e.stopPropagation()}>
                      <select defaultValue="" onChange={async e=>{const v=e.target.value;if(!v)return;await changeStatus(item.id,item.imei1,v);e.target.value='';}}
                        disabled={updatingId===item.id}
                        style={{height:28,padding:'0 6px',border:'1px solid #e2e8f0',borderRadius:6,fontSize:11,background:'#fff',cursor:'pointer',color:'#374151',maxWidth:100,opacity:updatingId===item.id?.5:1}}>
                        <option value="">Change…</option>
                        {['IN_STOCK','RETURNED','OPEN_BOX','SERVICE','DAMAGED','LOST'].map(s=><option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data&&data.totalPages>1&&(
        <div style={{padding:'10px 20px',borderTop:'1px solid #e2e8f0',background:'#fff',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
          <span style={{fontSize:12,color:'#64748b'}}>Showing {((page-1)*50)+1}–{Math.min(page*50,total)} of {total.toLocaleString('en-IN')}</span>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            <button disabled={page<=1} onClick={()=>setPage(p=>p-1)} style={{height:30,padding:'0 12px',border:'1px solid #e2e8f0',borderRadius:7,background:'#fff',fontSize:12,cursor:page<=1?'not-allowed':'pointer',opacity:page<=1?.4:1}}>← Prev</button>
            <span style={{fontSize:12,padding:'0 10px',color:'#374151',fontWeight:600}}>Page {page} of {data.totalPages}</span>
            <button disabled={page>=data.totalPages} onClick={()=>setPage(p=>p+1)} style={{height:30,padding:'0 12px',border:'1px solid #e2e8f0',borderRadius:7,background:'#fff',fontSize:12,cursor:page>=data.totalPages?'not-allowed':'pointer',opacity:page>=data.totalPages?.4:1}}>Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
