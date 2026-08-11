import { useState, useEffect, useCallback, useRef } from 'react';
import { api, getAccessToken } from '../api/client';
import { ImeiBulkUpload } from './ImeiBulkUpload';

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
// Dates are stored anchored at UTC noon, so render them in UTC — this keeps the
// calendar day identical to what was entered, on any device in any timezone.
const fmt     = (s:string) => new Date(s).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'});
const fmtTime = (s:string) => new Date(s).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});

// ── Filter Pill ────────────────────────────────────────────────────────────────
function FilterPill({
  label, value, options, onChange, icon,
}:{
  label:string;
  value:string;
  options:[string,string][];
  onChange:(v:string)=>void;
  icon:React.ReactNode;
}){
  const [open,setOpen]=useState(false);
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const fn=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false);};
    document.addEventListener('mousedown',fn);
    return()=>document.removeEventListener('mousedown',fn);
  },[]);

  const active = value!=='';
  const displayLabel = value ? options.find(([v])=>v===value)?.[1] || label : label;

  return(
    <div ref={ref} style={{position:'relative'}}>
      <button onClick={()=>setOpen(o=>!o)} style={{
        display:'flex',alignItems:'center',gap:6,
        height:34,padding:'0 12px',
        border:`1.5px solid ${active?'#2563eb':'#e2e8f0'}`,
        borderRadius:20,
        background:active?'#eff6ff':'#fff',
        color:active?'#1d4ed8':'#64748b',
        fontSize:12,fontWeight:active?700:500,
        cursor:'pointer',whiteSpace:'nowrap',
        transition:'all .15s',
      }}>
        <span style={{color:active?'#2563eb':'#94a3b8',display:'flex',alignItems:'center'}}>{icon}</span>
        <span>{displayLabel}</span>
        {active && (
          <span onClick={e=>{e.stopPropagation();onChange('');}} style={{
            marginLeft:2,width:14,height:14,borderRadius:'50%',
            background:'#bfdbfe',color:'#1d4ed8',
            display:'flex',alignItems:'center',justifyContent:'center',
            fontSize:9,fontWeight:800,lineHeight:1,
          }}>✕</span>
        )}
        {!active && <span style={{fontSize:9,color:'#94a3b8',marginLeft:2}}>▼</span>}
      </button>
      {open && (
        <div style={{
          position:'absolute',top:'calc(100% + 6px)',left:0,zIndex:300,
          background:'#fff',border:'1px solid #e2e8f0',borderRadius:10,
          boxShadow:'0 8px 24px rgba(0,0,0,.1)',minWidth:170,overflow:'hidden',
        }}>
          {options.map(([v,l])=>(
            <button key={v} onClick={()=>{onChange(v);setOpen(false);}} style={{
              display:'flex',alignItems:'center',gap:8,
              width:'100%',padding:'9px 14px',border:'none',textAlign:'left',
              background:value===v?'#eff6ff':'#fff',
              color:value===v?'#1d4ed8':'#374151',
              fontSize:12,fontWeight:value===v?700:400,cursor:'pointer',
              borderBottom:'1px solid #f8fafc',
            }}>
              {value===v && <span style={{color:'#2563eb',fontSize:10}}>✓</span>}
              {value!==v && <span style={{width:10,display:'inline-block'}}/>}
              {l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Imei() {
  const [data,setData]         = useState<Page|null>(null);
  const [loading,setLoading]   = useState(true);
  const [search,setSearch]     = useState('');
  const [status,setStatus]     = useState('');
  const [imeiType,setImeiType] = useState('');
  const [swiped,setSwiped]     = useState('');
  const [activated,setActivated] = useState('');
  const [brand,setBrand]       = useState('');
  const [page,setPage]         = useState(1);
  const [exporting,setExporting] = useState(false);
  const [showBulk,setShowBulk]   = useState(false);
  const [updatingId,setUpdatingId] = useState<string|null>(null);
  const [expandedId,setExpandedId] = useState<string|null>(null);
  // Date picker for swiped/activated: { id, field: 'swiped'|'activated', date }
  const [datePicker,setDatePicker] = useState<{id:string;field:'swiped'|'activated';date:string}|null>(null);
  const debRef = useRef<ReturnType<typeof setTimeout>>();
  const today = new Date().toISOString().slice(0,10);

  const load = useCallback(async(
    q=search, s=status, t=imeiType, sw=swiped, act=activated, pg=page, br=brand
  )=>{
    setLoading(true);
    try{
      const params=new URLSearchParams({page:String(pg),limit:'50'});
      if(q)   params.set('search',q);
      if(s)   params.set('status',s);
      if(t)   params.set('imeiType',t);
      if(sw)  params.set('swiped',sw);
      if(act) params.set('activated',act);
      if(br)  params.set('brand',br);
      const d=await api<Page>(`/imei?${params}`);
      setData(d);
    }catch{}
    finally{setLoading(false);}
  },[search,status,imeiType,swiped,activated,page,brand]);

  useEffect(()=>{load();},[load]);

  const onSearch=(v:string)=>{
    setSearch(v);setPage(1);
    clearTimeout(debRef.current);
    debRef.current=setTimeout(()=>load(v,status,imeiType,swiped,activated,1),350);
  };

  const onFilterChange=(key:'status'|'imeiType'|'swiped'|'activated'|'brand',val:string)=>{
    const ns  = key==='status'    ? val : status;
    const nt  = key==='imeiType'  ? val : imeiType;
    const nsw = key==='swiped'    ? val : swiped;
    const nact= key==='activated' ? val : activated;
    const nbr = key==='brand'     ? val : brand;
    if(key==='status')    setStatus(val);
    if(key==='imeiType')  setImeiType(val);
    if(key==='swiped')    setSwiped(val);
    if(key==='activated') setActivated(val);
    if(key==='brand')     setBrand(val);
    setPage(1);
    load(search,ns,nt,nsw,nact,1,nbr);
  };

  const clearAll=()=>{
    setSearch('');setStatus('');setImeiType('');setSwiped('');setActivated('');setBrand('');setPage(1);
    load('','','','','',1,'');
  };

  // When toggle is OFF → turn ON with today's date directly (no popup)
  // When toggle is ON → turn OFF immediately
  const handleSwipedClick=(id:string,cur:boolean)=>{
    if(cur){
      commitSwiped(id,false,null);
    } else {
      commitSwiped(id,true,today);
    }
  };

  const handleActivatedClick=(id:string,cur:boolean)=>{
    if(cur){
      commitActivated(id,false,null);
    } else {
      commitActivated(id,true,today);
    }
  };

  const commitSwiped=async(id:string,newSwiped:boolean,dateStr:string|null)=>{
    setUpdatingId(id);
    const isoDate = newSwiped && dateStr ? `${dateStr}T12:00:00.000Z` : null;
    setData(d=>d?{...d,items:d.items.map(i=>i.id===id?{...i,swiped:newSwiped,swipedAt:isoDate??undefined}:i)}:d);
    try{
      const body:any={swiped:newSwiped};
      if(newSwiped&&dateStr) body.swipedAt=isoDate;
      const res=await api<{id:string;swiped:boolean;swipedAt:string|null}>(`/imei/${id}/swiped`,{method:'PATCH',body:JSON.stringify(body)});
      setData(d=>d?{...d,items:d.items.map(i=>i.id===id?{...i,swiped:res.swiped,swipedAt:res.swipedAt??undefined}:i)}:d);
    }catch(e:any){
      setData(d=>d?{...d,items:d.items.map(i=>i.id===id?{...i,swiped:!newSwiped}:i)}:d);
      alert(e.message);
    }
    finally{setUpdatingId(null);}
  };

  const commitActivated=async(id:string,newVal:boolean,dateStr:string|null)=>{
    setUpdatingId(id);
    const isoDate = newVal && dateStr ? `${dateStr}T12:00:00.000Z` : null;
    setData(d=>d?{...d,items:d.items.map(i=>i.id===id?{...i,activated:newVal,activatedAt:isoDate??undefined}:i)}:d);
    try{
      const body:any={activated:newVal};
      if(newVal&&dateStr) body.activatedAt=isoDate;
      const res=await api<{id:string;activated:boolean;activatedAt:string|null}>(`/imei/${id}/activated`,{method:'PATCH',body:JSON.stringify(body)});
      setData(d=>d?{...d,items:d.items.map(i=>i.id===id?{...i,activated:res.activated,activatedAt:res.activatedAt??undefined}:i)}:d);
    }catch(e:any){
      setData(d=>d?{...d,items:d.items.map(i=>i.id===id?{...i,activated:!newVal}:i)}:d);
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
        body:JSON.stringify({search:search||undefined,status:status||undefined,imeiType:imeiType||undefined,swiped:swiped||undefined,activated:activated||undefined,brand:brand||undefined}),
      });
      if(!resp.ok)throw new Error('Export failed');
      const blob=await resp.blob();
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;
      a.download=`IMEI_Export_${new Date().toISOString().slice(0,10)}.xlsx`;
      document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
    }catch(e:any){alert(e.message);}
    finally{setExporting(false);}
  };

  const items = data?.items||[];
  const total = data?.total||0;
  const hasFilters = !!(search||status||imeiType||swiped||activated||brand);
  // Derive unique brands from loaded items for the filter dropdown
  const brandOptions:[string,string][] = [['','All Brands'],...Array.from(new Set(items.map(i=>i.product?.brand||'').filter(Boolean))).sort().map(b=>[b,b] as [string,string])];

  // Icons
  const IcoStatus    = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>;
  const IcoType      = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>;
  const IcoSwiped    = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>;
  const IcoActivated = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
  const IcoBrand     = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;

  const thS:React.CSSProperties = {
    padding:'10px 14px',textAlign:'left',fontSize:10,fontWeight:700,
    color:'#64748b',textTransform:'uppercase',letterSpacing:'.07em',
    borderBottom:'2px solid #e2e8f0',whiteSpace:'nowrap',background:'#fff',
    position:'sticky',top:0,zIndex:1,
  };

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',background:'#f8fafc',overflow:'hidden'}}>

      {/* ── Header ── */}
      <div style={{padding:'12px 20px',borderBottom:'1px solid #e2e8f0',background:'#fff',flexShrink:0}}>

        {/* Title row */}
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:10}}>
          <div>
            <div style={{fontSize:17,fontWeight:800,color:'#0f172a',letterSpacing:'-.3px'}}>IMEI Tracker</div>
            <div style={{fontSize:11,color:'#94a3b8',marginTop:1}}>
              {loading ? 'Loading…' : `${total.toLocaleString('en-IN')} records`}
              {hasFilters && <span style={{marginLeft:6,color:'#2563eb',fontWeight:600}}>· filtered</span>}
            </div>
          </div>
          <div style={{flex:1}}/>
          <button onClick={exportXlsx} disabled={exporting} style={{
            height:32,padding:'0 14px',border:'1px solid #d0d5dd',borderRadius:7,
            background:'#fff',fontSize:12,fontWeight:600,color:'#374151',
            cursor:exporting?'not-allowed':'pointer',display:'flex',alignItems:'center',gap:6,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            {exporting?'Exporting…':'Download XLSX'}
          </button>
          <button onClick={()=>setShowBulk(true)} style={{
            height:32,padding:'0 14px',border:'1.5px solid #c7d2fe',borderRadius:7,
            background:'#eff6ff',fontSize:12,fontWeight:700,color:'#4338ca',
            cursor:'pointer',display:'flex',alignItems:'center',gap:6,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Bulk Swipe / Activate
          </button>
        </div>

        {/* Search bar */}
        <div style={{position:'relative',marginBottom:10}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"
            style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',pointerEvents:'none'}}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input value={search} onChange={e=>onSearch(e.target.value)}
            placeholder="Search IMEI, serial no., product name, brand…"
            style={{
              width:'100%',height:36,paddingLeft:34,paddingRight:search?32:10,
              border:'1.5px solid #e2e8f0',borderRadius:8,fontSize:13,outline:'none',
              background:'#fff',boxSizing:'border-box',color:'#0f172a',
            }}
            onFocus={e=>(e.target as HTMLInputElement).style.borderColor='#2563eb'}
            onBlur={e=>(e.target as HTMLInputElement).style.borderColor='#e2e8f0'}
          />
          {search && (
            <button onClick={()=>onSearch('')} style={{
              position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',
              width:18,height:18,borderRadius:'50%',border:'none',background:'#e2e8f0',
              color:'#64748b',fontSize:11,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',
            }}>✕</button>
          )}
        </div>

        {/* Filter pills row */}
        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
          <FilterPill
            label="Status" value={status} icon={IcoStatus}
            onChange={v=>onFilterChange('status',v)}
            options={[
              ['','All Status'],
              ['IN_STOCK','● In Stock'],
              ['SOLD','● Sold'],
              ['RETURNED','● Returned'],
              ['OPEN_BOX','● Open Box'],
              ['SERVICE','● Service'],
              ['DAMAGED','● Damaged'],
              ['LOST','● Lost'],
            ]}
          />
          <FilterPill
            label="IMEI Type" value={imeiType} icon={IcoType}
            onChange={v=>onFilterChange('imeiType',v)}
            options={[
              ['','All Types'],
              ['NIL','Standard'],
              ['OPEN_BOX','Open Box'],
              ['DEMO','Demo'],
              ['SECOND_IMEI','2nd IMEI'],
            ]}
          />
          <FilterPill
            label="Swiped" value={swiped} icon={IcoSwiped}
            onChange={v=>onFilterChange('swiped',v)}
            options={[
              ['','All'],
              ['true','Swiped ✓'],
              ['false','Not Swiped'],
            ]}
          />
          <FilterPill
            label="Activated" value={activated} icon={IcoActivated}
            onChange={v=>onFilterChange('activated',v)}
            options={[
              ['','All'],
              ['true','Activated ✓'],
              ['false','Not Activated'],
            ]}
          />
          <FilterPill
            label="Brand" value={brand} icon={IcoBrand}
            onChange={v=>onFilterChange('brand',v)}
            options={brandOptions}
          />
          {hasFilters && (
            <button onClick={clearAll} style={{
              height:34,padding:'0 14px',border:'1.5px solid #fca5a5',
              borderRadius:20,background:'#fef2f2',color:'#dc2626',
              fontSize:12,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:5,
            }}>
              <span>✕</span> Clear all
            </button>
          )}
        </div>
      </div>

      {/* ── Table ── */}
      <div style={{flex:1,overflow:'auto'}}>
        {loading ? (
          <div style={{display:'flex',justifyContent:'center',padding:'64px'}}>
            <div className="spinner" style={{width:28,height:28}}/>
          </div>
        ) : items.length===0 ? (
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'60%',gap:12,color:'#94a3b8'}}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5">
              <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            <div style={{fontSize:14,fontWeight:600}}>No records found</div>
            {hasFilters && <button onClick={clearAll} style={{fontSize:12,color:'#2563eb',background:'none',border:'none',cursor:'pointer',textDecoration:'underline'}}>Clear filters</button>}
          </div>
        ) : (
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:1100}}>
            <thead>
              <tr>
                <th style={thS}>IMEI / SERIAL</th>
                <th style={thS}>Product</th>
                <th style={thS}>Status</th>
                <th style={{...thS,textAlign:'center'}}>Swiped</th>
                <th style={thS}>Swiped On</th>
                <th style={{...thS,textAlign:'center',color:'#7c3aed'}}>Activated</th>
                <th style={{...thS,color:'#7c3aed'}}>Activated On</th>
                <th style={thS}>Supplier</th>
                <th style={thS}>Stock In</th>
                <th style={thS}>Last Updated</th>
                <th style={thS}>Change Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item,idx)=>{
                const sm = STATUS_META[item.status]||{bg:'#f1f5f9',color:'#64748b',dot:'#94a3b8'};
                const isExp = expandedId===item.id;
                return(
                  <>
                    <tr key={item.id}
                      style={{background:idx%2===0?'#fff':'#fafafa',borderBottom:'1px solid #f1f5f9',cursor:'pointer'}}
                      onClick={()=>setExpandedId(isExp?null:item.id)}>
                      {/* IMEI */}
                      <td style={{padding:'10px 14px',fontFamily:'monospace',fontSize:12,fontWeight:600,color:'#0f172a',whiteSpace:'nowrap'}}>
                        <div>{item.imei1}</div>
                        {item.imei2 && <div style={{fontSize:10,color:'#94a3b8',marginTop:2}}>{item.imei2}</div>}
                      </td>
                      {/* Product */}
                      <td style={{padding:'10px 14px',maxWidth:240}}>
                        <div style={{fontWeight:600,color:'#0f172a',fontSize:12,wordBreak:'break-word',whiteSpace:'normal',lineHeight:1.4}}>{item.product?.model||'—'}</div>
                        <div style={{fontSize:10,color:'#94a3b8',marginTop:2}}>{item.product?.brand} · {item.product?.ean}</div>
                      </td>
                      {/* Status */}
                      <td style={{padding:'10px 14px',whiteSpace:'nowrap'}}>
                        <span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'3px 10px',borderRadius:20,background:sm.bg,color:sm.color,fontSize:11,fontWeight:700}}>
                          <span style={{width:6,height:6,borderRadius:'50%',background:sm.dot,flexShrink:0}}/>
                          {item.status.replace(/_/g,' ')}
                        </span>
                      </td>
                      {/* Swiped toggle */}
                      <td style={{padding:'10px 14px',textAlign:'center'}}>
                        <button onClick={e=>{e.stopPropagation();handleSwipedClick(item.id,item.swiped);}}
                          disabled={updatingId===item.id}
                          title={item.swiped?'Mark not swiped':'Mark as swiped'}
                          style={{width:44,height:24,borderRadius:12,border:'none',cursor:'pointer',
                            background:item.swiped?'#2563eb':'#e2e8f0',transition:'background .2s',position:'relative',display:'inline-block'}}>
                          <span style={{position:'absolute',top:2,left:item.swiped?22:2,width:20,height:20,borderRadius:'50%',background:'#fff',transition:'left .2s',display:'block'}}/>
                        </button>
                      </td>
                      {/* Swiped On — click to edit date */}
                      <td style={{padding:'10px 14px',whiteSpace:'nowrap',fontSize:11}}>
                        {item.swiped&&item.swipedAt?(
                          <div onClick={e=>{e.stopPropagation();setDatePicker({id:item.id,field:'swiped',date:item.swipedAt!.slice(0,10)});}} style={{cursor:'pointer',display:'inline-block'}}>
                            <div style={{color:'#2563eb',fontWeight:600,textDecoration:'underline dotted'}}>{fmt(item.swipedAt)}</div>
                            <div style={{color:'#94a3b8',fontSize:10}}>tap to edit</div>
                          </div>
                        ):'—'}
                      </td>
                      {/* Activated toggle */}
                      <td style={{padding:'10px 14px',textAlign:'center'}}>
                        <button onClick={e=>{e.stopPropagation();handleActivatedClick(item.id,item.activated);}}
                          disabled={updatingId===item.id}
                          title={item.activated?'Mark not activated':'Mark as activated'}
                          style={{width:44,height:24,borderRadius:12,border:'none',cursor:'pointer',
                            background:item.activated?'#7c3aed':'#e2e8f0',transition:'background .2s',position:'relative',display:'inline-block'}}>
                          <span style={{position:'absolute',top:2,left:item.activated?22:2,width:20,height:20,borderRadius:'50%',background:'#fff',transition:'left .2s',display:'block'}}/>
                        </button>
                      </td>
                      {/* Activated On — click to edit date */}
                      <td style={{padding:'10px 14px',whiteSpace:'nowrap',fontSize:11}}>
                        {item.activated&&item.activatedAt?(
                          <div onClick={e=>{e.stopPropagation();setDatePicker({id:item.id,field:'activated',date:item.activatedAt!.slice(0,10)});}} style={{cursor:'pointer',display:'inline-block'}}>
                            <div style={{color:'#7c3aed',fontWeight:600,textDecoration:'underline dotted'}}>{fmt(item.activatedAt)}</div>
                            <div style={{color:'#94a3b8',fontSize:10}}>tap to edit</div>
                          </div>
                        ):'—'}
                      </td>
                      {/* Supplier */}
                      <td style={{padding:'10px 14px',color:'#374151',fontSize:12}}>{item.supplier?.name||'—'}</td>
                      {/* Stock In */}
                      <td style={{padding:'10px 14px',color:'#64748b',fontSize:11,whiteSpace:'nowrap'}}>{fmt(item.createdAt)}</td>
                      {/* Last Updated */}
                      <td style={{padding:'10px 14px',color:'#94a3b8',fontSize:11,whiteSpace:'nowrap'}}>{fmt(item.updatedAt)}</td>
                      {/* Change Status */}
                      <td style={{padding:'10px 14px'}} onClick={e=>e.stopPropagation()}>
                        <select value={item.status} onChange={e=>changeStatus(item.id,item.imei1,e.target.value)}
                          disabled={updatingId===item.id}
                          style={{height:28,padding:'0 8px',border:'1px solid #e2e8f0',borderRadius:6,fontSize:11,background:'#fff',outline:'none',cursor:'pointer'}}>
                          {['IN_STOCK','SOLD','RETURNED','OPEN_BOX','SERVICE','DAMAGED','LOST'].map(s=>(
                            <option key={s} value={s}>{s.replace(/_/g,' ')}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                    {isExp && (
                      <tr key={`${item.id}-exp`} style={{background:'#f0f9ff'}}>
                        <td colSpan={11} style={{padding:'12px 24px'}}>
                          <div style={{display:'flex',gap:32,flexWrap:'wrap',fontSize:12}}>
                            <div><span style={{color:'#94a3b8',fontWeight:600}}>IMEI 1 </span><span style={{fontFamily:'monospace',fontWeight:700}}>{item.imei1}</span></div>
                            {item.imei2&&<div><span style={{color:'#94a3b8',fontWeight:600}}>IMEI 2 </span><span style={{fontFamily:'monospace',fontWeight:700}}>{item.imei2}</span></div>}
                            <div><span style={{color:'#94a3b8',fontWeight:600}}>Warehouse </span><span>{item.warehouse?.name||'—'}</span></div>
                            <div><span style={{color:'#94a3b8',fontWeight:600}}>Type </span>
                              <span style={{padding:'2px 8px',borderRadius:10,background:TYPE_META[item.imeiType]?.bg||'#f1f5f9',color:TYPE_META[item.imeiType]?.color||'#64748b',fontWeight:600,fontSize:11}}>
                                {TYPE_META[item.imeiType]?.label||item.imeiType}
                              </span>
                            </div>
                            <div><span style={{color:'#94a3b8',fontWeight:600}}>Added </span><span>{fmt(item.createdAt)} {fmtTime(item.createdAt)}</span></div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Pagination ── */}
      {data && data.totalPages>1 && (
        <div style={{padding:'10px 20px',borderTop:'1px solid #e2e8f0',background:'#fff',display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
          <span style={{fontSize:12,color:'#64748b',flex:1}}>
            Page {data.page} of {data.totalPages} · {total.toLocaleString('en-IN')} total
          </span>
          {Array.from({length:data.totalPages},(_,i)=>i+1).filter(p=>p===1||p===data.totalPages||Math.abs(p-data.page)<=2).map((p,i,arr)=>(
            <>
              {i>0&&arr[i-1]!==p-1&&<span key={`d${p}`} style={{color:'#94a3b8',fontSize:12}}>…</span>}
              <button key={p} onClick={()=>{setPage(p);load(search,status,imeiType,swiped,activated,p);}}
                style={{width:32,height:32,border:`1.5px solid ${p===data.page?'#2563eb':'#e2e8f0'}`,borderRadius:7,
                  background:p===data.page?'#2563eb':'#fff',color:p===data.page?'#fff':'#374151',
                  fontSize:12,fontWeight:p===data.page?700:400,cursor:'pointer'}}>
                {p}
              </button>
            </>
          ))}
        </div>
      )}
      {showBulk && (
        <ImeiBulkUpload
          onClose={()=>setShowBulk(false)}
          onDone={()=>{ load(search,status,imeiType,swiped,activated,page,brand); }}
        />
      )}

      {/* ── Date Picker Modal for Swiped / Activated ── */}
      {datePicker && (
        <div style={{position:'fixed',inset:0,zIndex:500,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,.35)'}} onClick={()=>setDatePicker(null)}/>
          <div style={{position:'relative',background:'#fff',borderRadius:14,boxShadow:'0 8px 40px rgba(0,0,0,.18)',padding:'24px 28px',minWidth:280,zIndex:1}}>
            <div style={{fontSize:14,fontWeight:800,color:'#0f172a',marginBottom:4}}>
              {datePicker.field==='swiped'?'📄 Set Swiped Date':'✅ Set Activated Date'}
            </div>
            <div style={{fontSize:11,color:'#94a3b8',marginBottom:16}}>
              {datePicker.field==='swiped'?'Date when SIM was swiped':'Date when device was activated'}
            </div>
            <input type="date" value={datePicker.date}
              max={today}
              onChange={e=>setDatePicker(p=>p?{...p,date:e.target.value}:p)}
              style={{width:'100%',height:38,padding:'0 12px',border:'1.5px solid #d0d5dd',borderRadius:8,fontSize:14,outline:'none',boxSizing:'border-box',marginBottom:16}}
            />
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={()=>setDatePicker(null)}
                style={{height:34,padding:'0 16px',border:'1px solid #e2e8f0',borderRadius:7,background:'#f8fafc',fontSize:12,fontWeight:600,color:'#64748b',cursor:'pointer'}}>
                Cancel
              </button>
              <button
                onClick={()=>{
                  if(!datePicker.date)return;
                  const {id,field,date}=datePicker;
                  setDatePicker(null);
                  if(field==='swiped') commitSwiped(id,true,date);
                  else commitActivated(id,true,date);
                }}
                style={{height:34,padding:'0 16px',border:'none',borderRadius:7,
                  background:datePicker.field==='swiped'?'#2563eb':'#7c3aed',
                  color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer'}}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default Imei;
