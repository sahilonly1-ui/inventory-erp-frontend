import { useState, useEffect } from 'react';
import { api, getAccessToken } from '../api/client';

interface Warehouse { id: string; name: string; }

const REPORTS = [
  { value:'stock_in',         label:'Stock In Report',     icon:'📥', desc:'All inbound stock movements' },
  { value:'stock_out',        label:'Stock Out Report',    icon:'📤', desc:'All outbound dispatches' },
  { value:'imei_summary',     label:'IMEI Summary',        icon:'📱', desc:'All IMEIs — full lifecycle' },
  { value:'imei_open_box',    label:'Open Box IMEIs',      icon:'📦', desc:'IMEIs marked as Open Box' },
  { value:'imei_demo',        label:'Demo Units',          icon:'🎯', desc:'IMEIs marked as Demo' },
  { value:'imei_second',      label:'Second IMEI Units',   icon:'2️⃣', desc:'IMEIs marked as 2nd IMEI' },
  { value:'imei_swiped',      label:'Swiped IMEIs',        icon:'✅', desc:'All swiped IMEI records' },
  { value:'imei_unswiped',    label:'Unswiped IMEIs',      icon:'⭕', desc:'IMEIs not yet swiped' },
  { value:'product_summary',  label:'Product Summary',     icon:'📦', desc:'Product-wise stock levels' },
  { value:'vendor_summary',   label:'Vendor Summary',      icon:'🏢', desc:'Stock received per vendor' },
  { value:'warehouse_summary',label:'Warehouse Summary',   icon:'🏭', desc:'Stock by warehouse' },
  { value:'audit_log',        label:'Audit Log',           icon:'🔍', desc:'All system changes' },
];

// Map local value → backend type or custom endpoint
const IMEI_FILTERED: Record<string,{imeiType?:string;swiped?:string}> = {
  imei_open_box:  { imeiType:'OPEN_BOX' },
  imei_demo:      { imeiType:'DEMO' },
  imei_second:    { imeiType:'SECOND_IMEI' },
  imei_swiped:    { swiped:'true' },
  imei_unswiped:  { swiped:'false' },
};
const REPORT_TYPE_MAP: Record<string,string> = {
  stock_in:'stock_in', stock_out:'stock_out', imei_summary:'imei_summary',
  product_summary:'product_summary', vendor_summary:'vendor_summary',
  warehouse_summary:'warehouse_summary', audit_log:'audit_log',
};

export function Reports() {
  const [warehouses,setWarehouses]=useState<Warehouse[]>([]);
  const [type,setType]=useState('stock_in');
  const [from,setFrom]=useState(()=>new Date(Date.now()-7*86400000).toISOString().slice(0,10));
  const [to,setTo]=useState(()=>new Date().toISOString().slice(0,10));
  const [whId,setWhId]=useState('');
  const [loading,setLoading]=useState(false);
  const [lastRan,setLastRan]=useState<string|null>(null);

  useEffect(()=>{api<Warehouse[]>('/warehouses').then(setWarehouses).catch(()=>{});}, []);

  const run=async()=>{
    setLoading(true);
    try{
      const base=(import.meta.env.VITE_API_URL as string)??'https://inventory-erp-backend-iplr.onrender.com/api/v1';
      let url='', body:any={};

      if (IMEI_FILTERED[type]) {
        // Use filtered IMEI endpoint
        url = `${base}/reports/imei_filtered`;
        body = { ...IMEI_FILTERED[type] };
      } else {
        // Use standard report endpoint
        url = `${base}/reports/${REPORT_TYPE_MAP[type]||type}`;
        body = {
          from: from ? new Date(from) : undefined,
          to: to ? new Date(to+'T23:59:59Z') : undefined,
          warehouseId: whId||undefined,
        };
      }

      const resp=await fetch(url,{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${getAccessToken()}`},
        body:JSON.stringify(body),
      });
      if(!resp.ok){const j=await resp.json();throw new Error(j?.error?.message||'Export failed');}
      const blob=await resp.blob();
      const objUrl=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=objUrl;
      const label=REPORTS.find(r=>r.value===type)?.label||type;
      a.download=`${label.replace(/\s+/g,'_')}_${to}.xlsx`;
      document.body.appendChild(a);a.click();document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
      setLastRan(new Date().toLocaleTimeString('en-IN'));
    }catch(e:any){alert('Export failed: '+e.message);}
    finally{setLoading(false);}
  };

  const selected=REPORTS.find(r=>r.value===type);
  const isImeiFiltered=!!IMEI_FILTERED[type];
  const inp:React.CSSProperties={height:36,padding:'0 10px',border:'1.5px solid #d0d5dd',borderRadius:7,fontSize:13,color:'#101828',outline:'none',width:'100%',boxSizing:'border-box',background:'#fff'};

  return (
    <>
      <div style={{padding:'14px 20px',borderBottom:'1px solid #e2e8f0',background:'#fff'}}>
        <div style={{fontSize:18,fontWeight:800,color:'#0f172a',letterSpacing:'-.3px'}}>Reports</div>
        <div style={{fontSize:12,color:'#94a3b8',marginTop:2}}>Export inventory data to Excel (XLSX)</div>
      </div>

      <div style={{flex:1,overflow:'auto',padding:'16px 20px'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 320px',gap:16,alignItems:'start'}}>
          {/* Report cards */}
          <div>
            <div style={{fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10}}>Select Report Type</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))',gap:8}}>
              {REPORTS.map(r=>(
                <div key={r.value} onClick={()=>setType(r.value)}
                  style={{background:type===r.value?'#eff6ff':'#fff',border:`1.5px solid ${type===r.value?'#2563eb':'#e2e8f0'}`,borderRadius:10,padding:'12px 14px',cursor:'pointer',transition:'all .1s',boxShadow:type===r.value?'0 0 0 3px rgba(37,99,235,.1)':'none'}}>
                  <div style={{fontSize:20,marginBottom:6}}>{r.icon}</div>
                  <div style={{fontSize:12,fontWeight:700,color:type===r.value?'#2563eb':'#0f172a',lineHeight:1.3}}>{r.label}</div>
                  <div style={{fontSize:11,color:'#94a3b8',marginTop:3}}>{r.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Config panel */}
          <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:12,padding:'20px',position:'sticky',top:16}}>
            <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:18}}>
              <span style={{fontSize:24}}>{selected?.icon}</span>
              <div>
                <div style={{fontSize:14,fontWeight:800,color:'#0f172a'}}>{selected?.label}</div>
                <div style={{fontSize:11,color:'#94a3b8'}}>{selected?.desc}</div>
              </div>
            </div>

            {isImeiFiltered ? (
              <div style={{padding:'12px',background:'#eff6ff',borderRadius:8,marginBottom:16,fontSize:12,color:'#1d4ed8'}}>
                📊 Exports all <strong>{selected?.label}</strong> records without date range filter.
              </div>
            ) : (
              <>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'.06em',display:'block',marginBottom:4}}>From Date</label>
                  <input type="date" style={inp} value={from} onChange={e=>setFrom(e.target.value)} />
                </div>
                <div style={{marginBottom:12}}>
                  <label style={{fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'.06em',display:'block',marginBottom:4}}>To Date</label>
                  <input type="date" style={inp} value={to} onChange={e=>setTo(e.target.value)} />
                </div>
                <div style={{marginBottom:16}}>
                  <label style={{fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'.06em',display:'block',marginBottom:4}}>Warehouse</label>
                  <select style={{...inp,background:'#fff'}} value={whId} onChange={e=>setWhId(e.target.value)}>
                    <option value="">All warehouses</option>
                    {warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>

                <div style={{padding:'10px 12px',background:'#f8fafc',borderRadius:8,marginBottom:16}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#94a3b8',marginBottom:6,textTransform:'uppercase',letterSpacing:'.06em'}}>Quick Ranges</div>
                  {[['Today',0],['Last 7 days',7],['Last 30 days',30],['Last 90 days',90],['This year',365]].map(([l,d])=>(
                    <button key={l as string} onClick={()=>{const now=new Date();setTo(now.toISOString().slice(0,10));setFrom(new Date(now.getTime()-Number(d)*86400000).toISOString().slice(0,10));}}
                      style={{display:'block',background:'none',border:'none',color:'#2563eb',cursor:'pointer',fontSize:12,padding:'3px 0',textAlign:'left',width:'100%'}}>{l as string}</button>
                  ))}
                </div>
              </>
            )}

            <button onClick={run} disabled={loading} style={{width:'100%',height:42,border:'none',borderRadius:8,background:loading?'#94a3b8':'#2563eb',color:'#fff',fontSize:14,fontWeight:700,cursor:loading?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
              {loading?<><div className="spinner" style={{width:16,height:16,borderWidth:2}}/> Generating…</>:'⬇ Download XLSX'}
            </button>

            {lastRan&&<div style={{marginTop:10,fontSize:11,color:'#16a34a',textAlign:'center'}}>✓ Exported at {lastRan}</div>}
          </div>
        </div>
      </div>
    </>
  );
}
