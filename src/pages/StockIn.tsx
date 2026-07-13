import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api/client';

interface Warehouse { id: string; name: string; }
type FCell = 'ean'|'imei1'|'imei2';
type RS = 'empty'|'loading'|'not_found'|'awaiting_imei'|'saved'|'err';
interface Row { id:string; ean:string; productId:string; model:string; brand:string; imeiRequired:boolean; qty:number; imei1:string; imei2:string; status:RS; errMsg:string; }

const uid = () => Math.random().toString(36).slice(2,9);
const genDoc = () => `SIN-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(Math.random()*9000+1000)}`;
const mkRow = (): Row => ({ id:uid(), ean:'', productId:'', model:'', brand:'', imeiRequired:false, qty:0, imei1:'', imei2:'', status:'empty', errMsg:'' });
const SHKEY = 'erp_supp_v3';
const getH = (): string[] => { try { return JSON.parse(localStorage.getItem(SHKEY)||'[]'); } catch { return []; } };
const saveH = (n:string) => { const h=getH().filter(x=>x!==n); localStorage.setItem(SHKEY,JSON.stringify([n,...h].slice(0,100))); };
const toT = (s:string) => s.trim().replace(/\b\w+/g,w=>w[0].toUpperCase()+w.slice(1).toLowerCase());
const eCache = new Map<string,{productId:string;model:string;brand:string;imeiRequired:boolean}|null>();
let seq = 0;
const STATES = ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Delhi','Goa','Gujarat','Haryana','Himachal Pradesh','Jammu & Kashmir','Jharkhand','Karnataka','Kerala','Ladakh','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Puducherry','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Other'];

function SuppModal({ name, onSave, onSkip }: { name:string; onSave:(s:string)=>void; onSkip:()=>void }) {
  const [state,setState]=useState('');
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:600,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'#fff',borderRadius:16,padding:28,width:420,boxShadow:'0 24px 64px rgba(0,0,0,.2)'}}>
        <div style={{fontSize:17,fontWeight:800,color:'#0f172a',marginBottom:4}}>New Supplier</div>
        <div style={{fontSize:13,color:'#64748b',marginBottom:20}}><strong style={{color:'#2563eb'}}>{toT(name)}</strong> — select state to register.</div>
        <label style={{fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'.07em',display:'block',marginBottom:6}}>State *</label>
        <select value={state} onChange={e=>setState(e.target.value)} autoFocus style={{width:'100%',height:42,padding:'0 12px',border:'1.5px solid #d0d5dd',borderRadius:8,fontSize:14,background:'#fff',outline:'none',marginBottom:20}}>
          <option value="">Select state…</option>
          {STATES.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{display:'flex',gap:10}}>
          <button onClick={()=>state&&onSave(state)} disabled={!state} style={{flex:1,height:42,border:'none',borderRadius:8,background:state?'#2563eb':'#94a3b8',color:'#fff',fontSize:14,fontWeight:700,cursor:state?'pointer':'not-allowed'}}>Save &amp; Continue</button>
          <button onClick={onSkip} style={{height:42,padding:'0 18px',border:'1px solid #e2e8f0',borderRadius:8,background:'#fff',fontSize:13,color:'#64748b',cursor:'pointer'}}>Skip</button>
        </div>
      </div>
    </div>
  );
}

export function StockIn() {
  const [whs,setWhs]=useState<Warehouse[]>([]);
  const [whId,setWhId]=useState('');
  const [supp,setSupp]=useState('');
  const [suppId,setSuppId]=useState('');
  const [inv,setInv]=useState('');
  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [ss,setSs]=useState('');
  const [sDrop,setSDrop]=useState(false);
  const [sHist,setSHist]=useState<string[]>(getH);
  const [sModal,setSModal]=useState<string|null>(null);
  const [doc]=useState(genDoc);
  const [rows,setRows]=useState<Row[]>([mkRow()]);
  const [aRow,setARow]=useState(0);
  const [fc,setFc]=useState<FCell>('ean');
  const [busy,setBusy]=useState(false);
  const [drawer,setDrawer]=useState<string|null>(null);
  const [df,setDf]=useState({ean:'',model:'',brand:'',cat:'',cost:'',sell:'',mrp:'',gst:'18',imei:false});
  const refs=useRef<Record<string,HTMLInputElement|null>>({});
  const R=(i:number,c:FCell)=>(el:HTMLInputElement|null)=>{refs.current[`${i}-${c}`]=el;};
  const ERef=useRef<(i:number,e:string)=>void>(()=>{});

  useEffect(()=>{
    api<Warehouse[]>('/warehouses').then(ws=>{setWhs(ws);const m=ws.find(w=>w.name.toLowerCase().includes('main'));setWhId(m?.id||ws[0]?.id||'');}).catch(()=>{});
  },[]);

  // moveTo: reliable focus with retry (up to 12×40ms = 480ms)
  const moveTo=useCallback((ri:number,cell:FCell)=>{
    setARow(ri); setFc(cell);
    let n=0;
    const go=()=>{ const el=refs.current[`${ri}-${cell}`]; if(el){try{el.focus();if(cell==='ean')el.select();}catch{}return;} if(++n<12)setTimeout(go,40); };
    setTimeout(go,20);
  },[]);

  const upd=useCallback((i:number,p:Partial<Row>)=>setRows(rs=>rs.map((r,x)=>x===i?{...r,...p}:r)),[]);

  const ins=useCallback((i:number,pre:Partial<Row>={})=>{
    const nr={...mkRow(),...pre};
    setRows(rs=>{const n=[...rs];if(i>=rs.length-1)n.push(nr);else n.splice(i+1,0,nr);return n;});
    return i+1;
  },[]);

  const handleEan=useCallback(async(i:number,ean:string)=>{
    const v=ean.trim();if(!v)return;
    const mSeq=++seq;
    upd(i,{ean:v,status:'loading',errMsg:''});
    let p=eCache.get(v);
    if(p===undefined){
      try{
        const r=await api<{product:{id:string;model:string;brand:string;imeiRequired:boolean}}>(`/inventory/lookup?ean=${encodeURIComponent(v)}`);
        p={productId:r.product.id,model:r.product.model,brand:r.product.brand,imeiRequired:r.product.imeiRequired};
        eCache.set(v,p);
      }catch{eCache.set(v,null);p=null;}
    }
    if(mSeq!==seq)return;
    if(!p){upd(i,{status:'not_found',errMsg:''});setDrawer(v);setDf(d=>({...d,ean:v}));moveTo(i,'ean');return;}
    upd(i,{...p,status:p.imeiRequired?'awaiting_imei':'saved',qty:p.imeiRequired?0:1});
    if(p.imeiRequired){moveTo(i,'imei1');}
    else{const ni=ins(i);moveTo(ni,'ean');}
  },[upd,ins,moveTo]);

  useEffect(()=>{ERef.current=handleEan;},[handleEan]);

  const handleImei1=useCallback(async(i:number,imei:string)=>{
    const v=imei.trim();if(!v)return;
    const row=rows[i];
    // EAN detection in IMEI1 field
    const isE=eCache.has(v)||(/^\d{8}$|^\d{12,13}$/.test(v)&&!/^\d{15}$/.test(v));
    if(isE){upd(i,{imei1:'',errMsg:''});const ni=ins(i,{ean:v});moveTo(ni,'ean');setTimeout(()=>ERef.current(ni,v),0);return;}
    if(!row.productId)return;
    try{await api(`/imei/${encodeURIComponent(v)}`);upd(i,{errMsg:`IMEI ${v} already exists!`,status:'err'});moveTo(i,'imei1');return;}catch{}
    upd(i,{imei1:v,qty:1,status:'saved',errMsg:''});
    moveTo(i,'imei2');
  },[rows,upd,ins,moveTo]);

  const handleImei2=useCallback(async(i:number,imei:string)=>{
    const v=imei.trim();
    const row=rows[i];
    if(v){
      const isE=eCache.has(v)||(/^\d{8}$|^\d{12,13}$/.test(v)&&!/^\d{15}$/.test(v));
      if(isE){upd(i,{imei2:''});const ni=ins(i,{ean:v});moveTo(ni,'ean');setTimeout(()=>ERef.current(ni,v),0);return;}
      upd(i,{imei2:v});
    }
    const ni=ins(i,{productId:row.productId,model:row.model,brand:row.brand,imeiRequired:true,status:'awaiting_imei'});
    moveTo(ni,'imei1');
  },[rows,upd,ins,moveTo]);

  const del=(i:number)=>{setRows(rs=>rs.length===1?[mkRow()]:rs.filter((_,x)=>x!==i));moveTo(Math.max(0,aRow>=i?aRow-1:aRow),'ean');};
  const clear=()=>{if(!confirm('Clear all?'))return;eCache.clear();setRows([mkRow()]);moveTo(0,'ean');};

  const commit=useCallback(async()=>{
    const sv=rows.filter(r=>r.status==='saved'&&r.productId);
    if(!sv.length||!whId)return;
    setBusy(true);
    try{
      for(const r of sv){
        if(r.imeiRequired&&r.imei1)
          await api('/imei/receive',{method:'POST',body:JSON.stringify({productId:r.productId,warehouseId:whId,imeis:[{imei1:r.imei1,imei2:r.imei2||undefined}],vendorId:suppId||undefined,remarks:`${doc}${supp?' | '+supp:''}${inv?' | INV:'+inv:''}`})});
        else if(!r.imeiRequired)
          await api('/inventory/stock-in',{method:'POST',body:JSON.stringify({productId:r.productId,warehouseId:whId,quantity:r.qty,vendorId:suppId||undefined,remarks:`${doc}${inv?' | INV:'+inv:''}`})});
      }
      eCache.clear();setRows([mkRow()]);moveTo(0,'ean');setSupp('');setSuppId('');setInv('');
      alert(`✓ ${sv.length} item(s) committed — ${doc}`);
    }catch(e:any){alert('Error: '+e.message);}
    finally{setBusy(false);}
  },[rows,whId,suppId,supp,inv,doc,moveTo]);

  const resolveSupp=useCallback(async(name:string,state?:string)=>{
    const t=toT(name);
    try{const r=await api<any>('/vendors/find-or-create',{method:'POST',body:JSON.stringify({name:t,state})});
      if(r.needsState){setSModal(name);return;}
      if(r.vendor){setSupp(t);setSuppId(r.vendor.id);saveH(t);setSHist(getH());}
    }catch{}
  },[]);

  const sv=rows.filter(r=>r.status==='saved'&&r.qty>0);
  const sm=Object.values(sv.reduce((a:any,r)=>{const k=r.model||r.ean;if(!a[k])a[k]={m:k,q:0};a[k].q+=r.qty;return a;},{})) as any[];
  const tot=sm.reduce((s,r)=>s+r.q,0);
  const sg=sHist.filter(x=>x.toLowerCase().includes(ss.toLowerCase())).slice(0,8);

  const CI=(ex:React.CSSProperties={}):React.CSSProperties=>({width:'100%',height:'100%',border:'none',padding:'0 10px',background:'transparent',fontSize:13,color:'#101828',outline:'none',fontFamily:'inherit',...ex});
  const isA=(i:number)=>i===aRow;
  const eOL=(i:number)=>isA(i)&&fc==='ean'?'2px solid #2563eb':'2px solid transparent';
  const iOL=(i:number,c:FCell)=>isA(i)&&fc===c?'2px solid #f59e0b':'2px solid transparent';

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',background:'#fff',overflow:'hidden'}}>
      <div style={{background:'#fff',borderBottom:'1px solid #e2e8f0',padding:'8px 16px',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
          <span style={{fontSize:11,fontWeight:700,color:'#2563eb',background:'#eff6ff',padding:'3px 12px',borderRadius:20,border:'1px solid #bfdbfe'}}>{doc}</span>
          <span style={{fontSize:13,fontWeight:700,color:'#0f172a'}}>Stock In Entry</span>
          <div style={{flex:1}}/>
          <span style={{fontSize:11,color:'#94a3b8'}}>{sv.length} items · {tot} units</span>
          <button onClick={clear} style={{height:28,padding:'0 10px',border:'1px solid #fecdd3',borderRadius:6,background:'#fff5f5',color:'#dc2626',fontSize:11,fontWeight:600,cursor:'pointer'}}>Clear All</button>
          <button onClick={commit} disabled={!sv.length||busy} style={{height:30,padding:'0 18px',border:'none',borderRadius:7,background:(!sv.length||busy)?'#94a3b8':'#16a34a',color:'#fff',fontSize:12,fontWeight:700,cursor:(!sv.length||busy)?'not-allowed':'pointer'}}>
            {busy?'Saving…':`✓ Done (${sv.length})`}
          </button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 148px 200px 180px',gap:8}}>
          <div style={{position:'relative'}}>
            <label style={{fontSize:9,fontWeight:800,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'.08em',display:'block',marginBottom:3}}>SUPPLIER / RECEIVED FROM *</label>
            <input value={ss||(supp?toT(supp):'')} placeholder="Type supplier name…"
              onChange={e=>{setSs(e.target.value);setSupp('');setSuppId('');setSDrop(true);}}
              onFocus={()=>{setSs(supp);setSDrop(true);}}
              onBlur={()=>setTimeout(()=>{setSDrop(false);if(ss&&!supp){const n=toT(ss);setSupp(n);resolveSupp(n);}},200)}
              onKeyDown={e=>{if(e.key==='Enter'&&ss){const n=toT(ss);setSupp(n);setSs('');setSDrop(false);resolveSupp(n);}}}
              style={{width:'100%',height:34,padding:'0 10px',border:`1.5px solid ${supp?'#2563eb':'#d0d5dd'}`,borderRadius:7,fontSize:13,outline:'none',boxSizing:'border-box'}} />
            {sDrop&&(sg.length>0||ss)&&(
              <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#fff',border:'1px solid #e2e8f0',borderRadius:8,boxShadow:'0 8px 24px rgba(0,0,0,.12)',zIndex:200,marginTop:2,overflow:'hidden'}}>
                {sg.map(s=><div key={s} onMouseDown={()=>{setSupp(s);setSs('');setSDrop(false);resolveSupp(s);}} style={{padding:'8px 12px',fontSize:13,cursor:'pointer'}} onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='#f8fafc'} onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>{s}</div>)}
                {ss&&!sg.find(x=>x.toLowerCase()===ss.toLowerCase())&&(
                  <div onMouseDown={()=>{const n=toT(ss);setSupp(n);setSs('');setSDrop(false);resolveSupp(n);}} style={{padding:'8px 12px',fontSize:13,cursor:'pointer',color:'#2563eb',fontWeight:600,borderTop:'1px solid #f1f5f9'}}>＋ Add "{toT(ss)}"</div>
                )}
              </div>
            )}
          </div>
          <div>
            <label style={{fontSize:9,fontWeight:800,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'.08em',display:'block',marginBottom:3}}>DATE</label>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{width:'100%',height:34,padding:'0 10px',border:'1.5px solid #d0d5dd',borderRadius:7,fontSize:13,outline:'none',boxSizing:'border-box'}} />
          </div>
          <div>
            <label style={{fontSize:9,fontWeight:800,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'.08em',display:'block',marginBottom:3}}>INVOICE NO. (OPTIONAL)</label>
            <input value={inv} onChange={e=>setInv(e.target.value)} placeholder="e.g. INV-2026-001" style={{width:'100%',height:34,padding:'0 10px',border:'1.5px solid #d0d5dd',borderRadius:7,fontSize:13,outline:'none',boxSizing:'border-box'}} />
          </div>
          <div>
            <label style={{fontSize:9,fontWeight:800,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'.08em',display:'block',marginBottom:3}}>WAREHOUSE</label>
            <select value={whId} onChange={e=>setWhId(e.target.value)} style={{width:'100%',height:34,padding:'0 8px',border:'1.5px solid #d0d5dd',borderRadius:7,fontSize:13,outline:'none',background:'#fff',boxSizing:'border-box'}}>
              {whs.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div style={{flex:1,display:'flex',overflow:'hidden'}}>
        <div style={{flex:1,overflowY:'auto',overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13,tableLayout:'fixed',minWidth:920}}>
            <colgroup><col style={{width:36}}/><col style={{width:145}}/><col/><col style={{width:50}}/><col style={{width:165}}/><col style={{width:165}}/><col style={{width:85}}/><col style={{width:42}}/></colgroup>
            <thead>
              <tr style={{background:'#f8fafc',position:'sticky',top:0,zIndex:5,boxShadow:'0 1px 0 #e2e8f0'}}>
                {['#','EAN / BARCODE','PRODUCT NAME','QTY','IMEI 1','IMEI 2 (optional)','STATUS',''].map((h,i)=>(
                  <th key={i} style={{padding:'0 10px',height:34,textAlign:i===3?'center':'left',fontWeight:700,color:'#64748b',fontSize:10,textTransform:'uppercase',letterSpacing:'.07em',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row,i)=>{
                const bg=row.status==='saved'?'#f0fdf4':row.errMsg?'#fff5f5':isA(i)?'#f0f9ff':i%2===0?'#fff':'#fafafa';
                return (
                  <tr key={row.id} style={{background:bg}}>
                    <td style={{padding:'0 8px',height:38,textAlign:'center',color:'#cbd5e1',fontSize:11,fontWeight:700,background:'#f8fafc',borderBottom:'1px solid #e2e8f0',borderRight:'1px solid #e2e8f0'}}>{i+1}</td>
                    <td style={{borderBottom:'1px solid #e2e8f0',borderRight:'1px solid #e2e8f0',padding:0}}>
                      <div style={{height:38,outline:eOL(i),display:'flex',alignItems:'center'}}>
                        <input ref={R(i,'ean')} value={row.ean}
                          onChange={e=>upd(i,{ean:e.target.value,status:'empty',errMsg:''})}
                          onKeyDown={e=>{if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();handleEan(i,(e.target as HTMLInputElement).value);}}}
                          onPaste={e=>{e.preventDefault();const v=e.clipboardData.getData('text').trim();if(v){upd(i,{ean:v});setTimeout(()=>handleEan(i,v),30);}}}
                          onFocus={()=>{setARow(i);setFc('ean');}}
                          placeholder={i===0?'Scan EAN…':''} style={CI()} />
                        {row.status==='loading'&&<div className="spinner" style={{width:13,height:13,margin:'0 6px',flexShrink:0}}/>}
                      </div>
                    </td>
                    <td style={{borderBottom:'1px solid #e2e8f0',borderRight:'1px solid #e2e8f0',padding:'0 10px',color:row.model?'#0f172a':'#cbd5e1',fontWeight:row.model?500:400,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {row.model||'Auto-filled after EAN scan'}
                    </td>
                    <td style={{borderBottom:'1px solid #e2e8f0',borderRight:'1px solid #e2e8f0',textAlign:'center',fontWeight:700,fontSize:14,color:row.qty>0?'#16a34a':'#cbd5e1'}}>{row.qty>0?row.qty:'—'}</td>
                    <td style={{borderBottom:'1px solid #e2e8f0',borderRight:'1px solid #e2e8f0',padding:0}}>
                      <div style={{height:38,outline:iOL(i,'imei1'),background:isA(i)&&fc==='imei1'?'#fffbeb':'',display:'flex'}}>
                        <input ref={R(i,'imei1')} value={row.imei1}
                          onChange={e=>upd(i,{imei1:e.target.value,errMsg:''})}
                          onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();handleImei1(i,(e.target as HTMLInputElement).value);}if(e.key==='Tab'){e.preventDefault();moveTo(i+1<rows.length?i+1:i,'ean');}if(e.key==='Escape')upd(i,{errMsg:'',imei1:'',status:row.productId?'awaiting_imei':'empty'});}}
                          onPaste={e=>{if(!row.imeiRequired)return;e.preventDefault();const v=e.clipboardData.getData('text').trim();if(v){upd(i,{imei1:v});setTimeout(()=>handleImei1(i,v),30);}}}
                          onFocus={()=>{setARow(i);setFc('imei1');}}
                          readOnly={!row.imeiRequired}
                          placeholder={row.imeiRequired?'Scan IMEI 1…':'—'}
                          style={CI({fontFamily:row.imeiRequired?'monospace':'inherit',fontSize:12,color:row.errMsg&&row.imei1?'#dc2626':'#0f172a',cursor:row.imeiRequired?'text':'default'})} />
                      </div>
                    </td>
                    <td style={{borderBottom:'1px solid #e2e8f0',borderRight:'1px solid #e2e8f0',padding:0}}>
                      <div style={{height:38,outline:iOL(i,'imei2'),background:isA(i)&&fc==='imei2'?'#fffbeb':'',display:'flex'}}>
                        <input ref={R(i,'imei2')} value={row.imei2}
                          onChange={e=>upd(i,{imei2:e.target.value})}
                          onKeyDown={e=>{if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();handleImei2(i,(e.target as HTMLInputElement).value);}if(e.key==='Escape'){upd(i,{imei2:''});moveTo(i,'imei1');}}}
                          onPaste={e=>{if(!row.imeiRequired)return;e.preventDefault();const v=e.clipboardData.getData('text').trim();if(v){upd(i,{imei2:v});setTimeout(()=>handleImei2(i,v),30);}}}
                          onFocus={()=>{setARow(i);setFc('imei2');}}
                          readOnly={!row.imeiRequired}
                          placeholder={row.imeiRequired?'Scan IMEI 2 (optional)':'—'}
                          style={CI({fontFamily:row.imeiRequired?'monospace':'inherit',fontSize:12,color:'#475569',cursor:row.imeiRequired?'text':'default'})} />
                      </div>
                    </td>
                    <td style={{borderBottom:'1px solid #e2e8f0',borderRight:'1px solid #e2e8f0',padding:'0 8px',textAlign:'center'}}>
                      {row.errMsg&&<span style={{fontSize:10,background:'#fef2f2',color:'#dc2626',padding:'2px 8px',borderRadius:10,fontWeight:700}} title={row.errMsg}>✕</span>}
                      {!row.errMsg&&row.status==='saved'&&<span style={{fontSize:10,background:'#dcfce7',color:'#15803d',padding:'2px 8px',borderRadius:10,fontWeight:700}}>✓</span>}
                      {!row.errMsg&&row.status==='awaiting_imei'&&<span style={{fontSize:10,background:'#fef9c3',color:'#854d0e',padding:'2px 8px',borderRadius:10}}>IMEI↓</span>}
                      {!row.errMsg&&row.status==='not_found'&&<span style={{fontSize:10,background:'#fef2f2',color:'#dc2626',padding:'2px 8px',borderRadius:10}}>New</span>}
                    </td>
                    <td style={{borderBottom:'1px solid #e2e8f0',padding:0,textAlign:'center'}}>
                      <button onClick={()=>del(i)} title="Delete row"
                        style={{width:40,height:38,border:'none',background:'none',cursor:'pointer',color:'#94a3b8',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto',transition:'color .1s'}}
                        onMouseEnter={e=>(e.currentTarget as HTMLElement).style.color='#dc2626'} onMouseLeave={e=>(e.currentTarget as HTMLElement).style.color='#94a3b8'}>
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{width:240,borderLeft:'1px solid #e2e8f0',background:'#fff',display:'flex',flexDirection:'column',flexShrink:0}}>
          <div style={{padding:'10px 14px 8px',borderBottom:'1px solid #f1f5f9'}}>
            <div style={{fontSize:9,fontWeight:800,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'.1em'}}>STOCK RECEIVED — {date}</div>
            {supp?<div style={{fontSize:11,color:'#2563eb',fontWeight:600,marginTop:2}}>↑ {toT(supp)}</div>:<div style={{fontSize:10,color:'#cbd5e1',marginTop:2}}>No supplier selected</div>}
          </div>
          <div style={{flex:1,overflowY:'auto',padding:'6px 0'}}>
            {sm.length===0?<div style={{padding:'20px 14px',textAlign:'center',color:'#cbd5e1',fontSize:12}}>Scan products…</div>
              :sm.map((s:any)=>(
              <div key={s.m} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 14px',fontSize:12}}>
                <span style={{color:'#374151',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:165}}>{s.m}</span>
                <span style={{fontWeight:700,color:'#16a34a',flexShrink:0,marginLeft:6}}>{s.q}</span>
              </div>
            ))}
          </div>
          {tot>0&&<div style={{padding:'10px 14px',borderTop:'1px solid #f1f5f9',display:'flex',justifyContent:'space-between',fontSize:13,fontWeight:800}}><span style={{color:'#0f172a'}}>Grand Total</span><span style={{color:'#16a34a'}}>{tot}</span></div>}
        </div>
      </div>

      {drawer&&(
        <div style={{position:'fixed',inset:0,zIndex:300,display:'flex',justifyContent:'flex-end'}}>
          <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,.22)'}} onClick={()=>setDrawer(null)}/>
          <div style={{width:380,background:'#fff',boxShadow:'-8px 0 40px rgba(0,0,0,.15)',display:'flex',flexDirection:'column',position:'relative',zIndex:1,borderRadius:'16px 0 0 16px'}}>
            <div style={{padding:'16px 20px',borderBottom:'1px solid #e2e8f0'}}>
              <div style={{fontSize:15,fontWeight:800,color:'#0f172a'}}>New Product Detected</div>
              <div style={{fontSize:12,color:'#94a3b8',marginTop:2}}>EAN <strong style={{color:'#2563eb',fontFamily:'monospace'}}>{drawer}</strong></div>
            </div>
            <div style={{flex:1,overflow:'auto',padding:'16px 20px'}}>
              {([['Product Name *','model','text'],['Brand','brand','text'],['Category','cat','text'],['Sell Price ₹','sell','number'],['MRP ₹','mrp','number'],['Cost ₹','cost','number'],['GST %','gst','number']] as [string,keyof typeof df,string][]).map(([l,k,t])=>(
                <div key={k} style={{marginBottom:12}}>
                  <label style={{fontSize:10,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'.06em',display:'block',marginBottom:4}}>{l}</label>
                  <input type={t} value={df[k] as string} onChange={e=>setDf(d=>({...d,[k]:e.target.value}))} style={{width:'100%',height:36,padding:'0 10px',border:'1.5px solid #d0d5dd',borderRadius:7,fontSize:13,outline:'none',boxSizing:'border-box'}}/>
                </div>
              ))}
              <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',marginBottom:20}}>
                <input type="checkbox" checked={df.imei} onChange={e=>setDf(d=>({...d,imei:e.target.checked}))} style={{width:16,height:16,accentColor:'#2563eb'}}/>
                <span style={{fontSize:13,color:'#374151',fontWeight:500}}>Requires IMEI tracking</span>
              </label>
              <button onClick={async()=>{
                if(!df.model)return;
                try{
                  await api('/products',{method:'POST',body:JSON.stringify({ean:df.ean,model:df.model,brand:df.brand,categoryName:df.cat,costPrice:parseFloat(df.cost)||0,sellingPrice:parseFloat(df.sell)||0,imeiRequired:df.imei,gstRate:parseFloat(df.gst)||18,status:'ACTIVE'})});
                  eCache.delete(df.ean);setDrawer(null);
                  const xi=rows.findIndex(r=>r.ean===df.ean&&r.status==='not_found');
                  if(xi>=0){upd(xi,{errMsg:'',status:'empty'});moveTo(xi,'ean');}
                }catch(e:any){alert(e.message);}
              }} style={{width:'100%',height:42,border:'none',borderRadius:8,background:'#2563eb',color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer'}}>Save &amp; Continue</button>
            </div>
          </div>
        </div>
      )}
      {sModal&&<SuppModal name={sModal} onSave={async s=>{await resolveSupp(sModal,s);setSModal(null);}} onSkip={()=>setSModal(null)}/>}
    </div>
  );
}