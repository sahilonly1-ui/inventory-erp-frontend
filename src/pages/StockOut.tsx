import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api/client';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Warehouse { id:string; name:string; }
type FC = 'ean'|'imei'|'srno';
type RS = 'empty'|'loading'|'not_found'|'found'|'saved'|'err';
interface Row { id:string; ean:string; productId:string; model:string; brand:string; imeiRequired:boolean; qty:number; imei:string; srno:string; status:RS; errMsg:string; errField:'imei'|'srno'|''; }

// ── Constants ─────────────────────────────────────────────────────────────────
const uid=()=>Math.random().toString(36).slice(2,9);
const genDoc=()=>`SOUT-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(Math.random()*9000+1000)}`;
const mk=():Row=>({id:uid(),ean:'',productId:'',model:'',brand:'',imeiRequired:false,qty:0,imei:'',srno:'',status:'empty',errMsg:'',errField:''});
const CK='erp_customers_v1';
const getC=():string[]=>{try{return JSON.parse(localStorage.getItem(CK)||'[]');}catch{return[];}};
const saveC=(n:string)=>{const h=getC().filter(x=>x!==n);localStorage.setItem(CK,JSON.stringify([n,...h].slice(0,100)));};
const DEF=['Amazon','Flipkart','JioMart','Meesho','Walk In Customer','Service Center','Return'];
const pCache=new Map<string,{id:string;model:string;brand:string;imeiRequired:boolean}|null>();
let seq=0;

export function StockOut(){
  // ── State ──────────────────────────────────────────────────────────────────
  const[whs,setWhs]=useState<Warehouse[]>([]);
  const[whId,setWhId]=useState('');
  const[cust,setCust]=useState('');
  const[inv,setInv]=useState('');
  const[date,setDate]=useState(new Date().toISOString().slice(0,10));
  const[cs,setCs]=useState('');
  const[cDrop,setCDrop]=useState(false);
  const[doc]=useState(genDoc);
  const[rows,setRows]=useState<Row[]>([mk()]);
  const[ar,setAr]=useState(0);
  const[fc,setFc]=useState<FC>('ean');
  const[busy,setBusy]=useState(false);
  const refs=useRef<Record<string,HTMLInputElement|null>>({});
  const R=(i:number,c:FC)=>(el:HTMLInputElement|null)=>{refs.current[`${i}-${c}`]=el;};
  const ERef=useRef<(i:number,e:string)=>void>(()=>{});

  useEffect(()=>{api<Warehouse[]>('/warehouses').then(ws=>{setWhs(ws);const m=ws.find(w=>w.name.toLowerCase().includes('main'));setWhId(m?.id||ws[0]?.id||'');}).catch(()=>{});}, []);

  // ── Reliable focus with retry ─────────────────────────────────────────────
  const moveTo=useCallback((ri:number,cell:FC)=>{
    setAr(ri);setFc(cell);
    let n=0;const go=()=>{const el=refs.current[`${ri}-${cell}`];if(el){try{el.focus();if(cell==='ean')el.select();}catch{}return;}if(++n<12)setTimeout(go,40);};
    setTimeout(go,20);
  },[]);
  const upd=useCallback((i:number,p:Partial<Row>)=>setRows(rs=>rs.map((r,x)=>x===i?{...r,...p}:r)),[]);
  const ins=useCallback((i:number,pre:Partial<Row>={})=>{const nr={...mk(),...pre};setRows(rs=>{const n=[...rs];if(i>=rs.length-1)n.push(nr);else n.splice(i+1,0,nr);return n;});return i+1;},[]);

  // ── EAN scan — same as StockIn: EAN→EAN→EAN flow ─────────────────────────
  const handleEan=useCallback(async(i:number,ean:string)=>{
    const v=ean.trim();if(!v||!whId)return;
    const mSeq=++seq;upd(i,{ean:v,status:'loading',errMsg:'',errField:''});
    let p=pCache.get(v);
    if(p===undefined){
      try{const r=await api<{product:{id:string;model:string;brand:string;imeiRequired:boolean}}>(`/inventory/lookup?ean=${encodeURIComponent(v)}`);
        p={id:r.product.id,model:r.product.model,brand:r.product.brand,imeiRequired:r.product.imeiRequired};pCache.set(v,p);
      }catch{pCache.set(v,null);p=null;}
    }
    if(mSeq!==seq)return;
    if(!p){upd(i,{status:'not_found',errMsg:'EAN not found in product master'});return;}
    // Non-IMEI products auto-save — serial is optional; phones show 'found' to await IMEI
    upd(i,{productId:p.id,model:p.model,brand:p.brand,imeiRequired:p.imeiRequired,status:p.imeiRequired?'found':'saved',qty:1});
    const ni=ins(i);moveTo(ni,'ean'); // EAN → next EAN
  },[whId,upd,ins,moveTo]);
  useEffect(()=>{ERef.current=handleEan;},[handleEan]);

  // ── IMEI column — strict 15 digits, must be IN_STOCK ─────────────────────
  const handleImei=useCallback(async(i:number,val:string)=>{
    const v=val.trim();
    const row=rows[i];
    if(!v){const ni=i+1;if(ni<rows.length)moveTo(ni,'imei');return;}

    // 1. Length check — always 15 digits
    if(!/^\d{15}$/.test(v)){
      upd(i,{errMsg:/^\d+$/.test(v)?`IMEI must be exactly 15 digits — scanned ${v.length}. Re-scan.`:`IMEI must be digits only (15 required). Re-scan.`,status:'err',errField:'imei'});
      moveTo(i,'imei');return;
    }
    if(!row.productId){upd(i,{errMsg:'Scan the EAN barcode first, then IMEI.',status:'err',errField:'imei'});moveTo(i,'imei');return;}

    // 2. Within-session duplicate (same IMEI scanned twice in this dispatch)
    const sessDup=rows.findIndex((r,ri)=>ri!==i&&r.imei===v);
    if(sessDup!==-1){
      upd(i,{errMsg:`Duplicate scan! IMEI already in row ${sessDup+1} of this dispatch.`,status:'err',errField:'imei'});
      moveTo(i,'imei');return;
    }

    // 3. Cross-session check — IMEI must exist AND be IN_STOCK
    try{
      const existing=await api<any>(`/imei/${encodeURIComponent(v)}`);
      const status=existing.status;
      if(status==='SOLD'){
        const dt=new Date(existing.updatedAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
        upd(i,{errMsg:`Already dispatched on ${dt}. IMEI is SOLD — cannot dispatch again.`,status:'err',errField:'imei'});
        moveTo(i,'imei');return;
      }
      if(status!=='IN_STOCK'){
        upd(i,{errMsg:`IMEI status is "${status}" — only IN_STOCK items can be dispatched.`,status:'err',errField:'imei'});
        moveTo(i,'imei');return;
      }
      // Valid — IN_STOCK
    }catch{
      upd(i,{errMsg:`IMEI ${v} not found. It must be stocked in first.`,status:'err',errField:'imei'});
      moveTo(i,'imei');return;
    }

    upd(i,{imei:v,qty:1,status:'saved',errMsg:'',errField:''});
    const ni=i+1;if(ni<rows.length)moveTo(ni,'imei'); // IMEI → next IMEI
  },[rows,upd,moveTo]);

  // ── Sr. No. column — no length restriction, duplicate detection ───────────
  const handleSrno=useCallback((i:number,val:string)=>{
    const v=val.trim();
    const row=rows[i];
    if(!row.productId){const ni=i+1;if(ni<rows.length)moveTo(ni,'srno');return;}
    if(!v){upd(i,{qty:1,status:'saved',errMsg:'',errField:''});const ni=i+1;if(ni<rows.length)moveTo(ni,'srno');return;}
    // Within-session duplicate Sr.No.
    const sessDup=rows.findIndex((r,ri)=>ri!==i&&r.srno===v);
    if(sessDup!==-1){
      upd(i,{errMsg:`Duplicate! Sr.No. "${v}" already in row ${sessDup+1}.`,status:'err',errField:'srno'});
      moveTo(i,'srno');return;
    }
    upd(i,{srno:v,qty:row.imei?row.qty:1,status:'saved',errMsg:'',errField:''});
    const ni=i+1;if(ni<rows.length)moveTo(ni,'srno'); // Sr.No. → next Sr.No.
  },[rows,upd,moveTo]);

  // ── Delete row ─────────────────────────────────────────────────────────────
  const del=(i:number)=>{setRows(rs=>rs.length===1?[mk()]:rs.filter((_,x)=>x!==i));moveTo(Math.max(0,ar>=i?ar-1:ar),'ean');};
  const clear=()=>{if(!confirm('Clear all rows?'))return;pCache.clear();setRows([mk()]);moveTo(0,'ean');};

  // ── Commit — dispatch IMEIs and non-IMEI stock out ─────────────────────────
  const commit=useCallback(async()=>{
    const sv=rows.filter(r=>r.status==='saved'&&r.productId);
    if(!sv.length||!whId)return;
    setBusy(true);
    const rmk=`${doc}${cust?' → '+cust:''}${inv?' | INV:'+inv:''}`;
    try{
      // ── Batch dispatch all IMEIs in one call ──────────────────────────────────────
      const imeiRows=sv.filter(r=>r.imei);
      if(imeiRows.length){
        await api('/imei/dispatch',{method:'POST',body:JSON.stringify({
          imeis:imeiRows.map(r=>r.imei), // all IMEIs in ONE dispatch call
          channel:'STOCK_OUT',
          remarks:rmk,
        })});
      }

      // ── Batch non-IMEI rows by productId (1 call per unique product) ─────────────
      const nonImeiByProduct=sv.filter(r=>!r.imei).reduce((a:any,r)=>{
        if(!a[r.productId])a[r.productId]={productId:r.productId,qty:0,srNos:[] as string[]};
        a[r.productId].qty+=(r.qty||1);
        if(r.srno)a[r.productId].srNos.push(r.srno);
        return a;
      },{});
      for(const[productId,data] of Object.entries(nonImeiByProduct) as any[]){
        await api('/inventory/stock-out',{method:'POST',body:JSON.stringify({
          productId,warehouseId:whId,
          quantity:data.qty,
          remarks:`${rmk}${data.srNos.length?' | S/N:'+data.srNos.join(','):''}`,
        })});
      }

      if(cust)saveC(cust);
      pCache.clear();setRows([mk()]);moveTo(0,'ean');
      alert(`✓ ${sv.length} item(s) dispatched — ${doc}`);
    }catch(e:any){
      alert(`Dispatch failed: ${e.message||'Unknown error'}\n\nCheck IMEI status in IMEI Tracker.`);
    }
    finally{setBusy(false);}
  },[rows,whId,cust,inv,doc,moveTo]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const sv=rows.filter(r=>r.status==='saved'&&r.qty>0);
  const tot=sv.reduce((s,r)=>s+r.qty,0);
  const cSug=[...new Set([...DEF,...getC()])].filter(x=>x.toLowerCase().includes(cs.toLowerCase())).slice(0,8);
  const CI=(ex:React.CSSProperties={}):React.CSSProperties=>({width:'100%',height:'100%',border:'none',padding:'0 10px',background:'transparent',fontSize:13,color:'#101828',outline:'none',fontFamily:'inherit',...ex});

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100vh',background:'#fff',overflow:'hidden'}}>
      {/* ── Session header ──────────────────────────────────────────────── */}
      <div style={{background:'#fff',borderBottom:'1px solid #e2e8f0',padding:'8px 16px',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
          <span style={{fontSize:11,fontWeight:700,color:'#dc2626',background:'#fef2f2',padding:'3px 12px',borderRadius:20,border:'1px solid #fecaca'}}>{doc}</span>
          <span style={{fontSize:13,fontWeight:700,color:'#0f172a'}}>Stock Out Entry</span>
          <div style={{flex:1}}/>
          <span style={{fontSize:11,color:'#94a3b8'}}>{sv.length} items · {tot} units</span>
          <button onClick={clear} style={{height:28,padding:'0 10px',border:'1px solid #fecdd3',borderRadius:6,background:'#fff5f5',color:'#dc2626',fontSize:11,fontWeight:600,cursor:'pointer'}}>Clear All</button>
          <button onClick={commit} disabled={!sv.length||busy}
            style={{height:30,padding:'0 18px',border:'none',borderRadius:7,background:(!sv.length||busy)?'#94a3b8':'#dc2626',color:'#fff',fontSize:12,fontWeight:700,cursor:(!sv.length||busy)?'not-allowed':'pointer'}}>
            {busy?'Dispatching…':`↑ Dispatch (${sv.length})`}
          </button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 148px 200px 180px',gap:8}}>
          {/* Customer autocomplete */}
          <div style={{position:'relative'}}>
            <label style={{fontSize:9,fontWeight:800,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'.08em',display:'block',marginBottom:3}}>ISSUED TO / CUSTOMER</label>
            <input value={cs||(cust?cust:'')} placeholder="Walk In Customer, Amazon, Flipkart…"
              onChange={e=>{setCs(e.target.value);setCust('');setCDrop(true);}}
              onFocus={()=>{setCs(cust);setCDrop(true);}}
              onBlur={()=>setTimeout(()=>{setCDrop(false);if(cs&&!cust){setCust(cs);setCs('');}},200)}
              onKeyDown={e=>{if(e.key==='Enter'&&cs){setCust(cs);setCs('');setCDrop(false);}}}
              style={{width:'100%',height:34,padding:'0 10px',border:`1.5px solid ${cust?'#dc2626':'#d0d5dd'}`,borderRadius:7,fontSize:13,outline:'none',boxSizing:'border-box'}}/>
            {cDrop&&(cSug.length>0||cs)&&(
              <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#fff',border:'1px solid #e2e8f0',borderRadius:8,boxShadow:'0 8px 24px rgba(0,0,0,.12)',zIndex:200,marginTop:2,overflow:'hidden'}}>
                {cSug.map(c=><div key={c} onMouseDown={()=>{setCust(c);setCs('');setCDrop(false);}} style={{padding:'8px 12px',fontSize:13,cursor:'pointer'}} onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='#f8fafc'} onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>{c}</div>)}
              </div>
            )}
          </div>
          <div>
            <label style={{fontSize:9,fontWeight:800,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'.08em',display:'block',marginBottom:3}}>DATE</label>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{width:'100%',height:34,padding:'0 10px',border:'1.5px solid #d0d5dd',borderRadius:7,fontSize:13,outline:'none',boxSizing:'border-box'}}/>
          </div>
          <div>
            <label style={{fontSize:9,fontWeight:800,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'.08em',display:'block',marginBottom:3}}>INVOICE / REF (OPTIONAL)</label>
            <input value={inv} onChange={e=>setInv(e.target.value)} placeholder="INV-OUT-001" style={{width:'100%',height:34,padding:'0 10px',border:'1.5px solid #d0d5dd',borderRadius:7,fontSize:13,outline:'none',boxSizing:'border-box'}}/>
          </div>
          <div>
            <label style={{fontSize:9,fontWeight:800,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'.08em',display:'block',marginBottom:3}}>WAREHOUSE</label>
            <select value={whId} onChange={e=>setWhId(e.target.value)} style={{width:'100%',height:34,padding:'0 8px',border:'1.5px solid #d0d5dd',borderRadius:7,fontSize:13,outline:'none',background:'#fff',boxSizing:'border-box'}}>
              {whs.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Grid + Summary ───────────────────────────────────────────────── */}
      <div style={{flex:1,display:'flex',overflow:'hidden'}}>
        <div style={{flex:1,overflowY:'auto',overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13,tableLayout:'fixed',minWidth:1020}}>
            <colgroup><col style={{width:36}}/><col style={{width:140}}/><col/><col style={{width:50}}/><col style={{width:162}}/><col style={{width:148}}/><col style={{width:80}}/><col style={{width:42}}/></colgroup>
            <thead>
              <tr style={{background:'#f8fafc',position:'sticky',top:0,zIndex:5,boxShadow:'0 1px 0 #e2e8f0'}}>
                {['#','EAN / BARCODE','PRODUCT NAME','QTY','IMEI (15 digits)','Sr. No. (any)','STATUS',''].map((h,i)=>(
                  <th key={i} style={{padding:'0 10px',height:34,textAlign:i===3?'center':'left',fontWeight:700,color:i===4?'#dc2626':i===5?'#2563eb':'#64748b',fontSize:10,textTransform:'uppercase',letterSpacing:'.07em',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row,i)=>{
                const isA=i===ar;
                const bg=row.status==='saved'?'#fef2f2':row.errMsg?'#fff5f5':isA?'#fffbeb':i%2===0?'#fff':'#fafafa';
                const eOL=(f:FC)=>isA&&fc===f?`2px solid ${f==='imei'?'#dc2626':f==='srno'?'#2563eb':'#f59e0b'}`:'2px solid transparent';
                return(
                  <tr key={row.id} style={{background:bg}}>
                    {/* Row # */}
                    <td style={{padding:'0 8px',height:38,textAlign:'center',color:'#cbd5e1',fontSize:11,fontWeight:700,background:'#f8fafc',borderBottom:'1px solid #e2e8f0',borderRight:'1px solid #e2e8f0'}}>{i+1}</td>
                    {/* EAN */}
                    <td style={{borderBottom:'1px solid #e2e8f0',borderRight:'1px solid #e2e8f0',padding:0}}>
                      <div style={{height:38,outline:eOL('ean'),display:'flex',alignItems:'center'}}>
                        <input ref={R(i,'ean')} value={row.ean}
                          onChange={e=>upd(i,{ean:e.target.value,status:'empty',errMsg:'',errField:''})}
                          onKeyDown={e=>{if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();handleEan(i,(e.target as HTMLInputElement).value);}}}
                          onPaste={e=>{e.preventDefault();const v=e.clipboardData.getData('text').trim();if(v){upd(i,{ean:v,status:'loading',errMsg:'',errField:''});setTimeout(()=>handleEan(i,v),80);}}}
                          onFocus={()=>{setAr(i);setFc('ean');}}
                          placeholder={i===0?'Scan EAN to dispatch…':''} style={CI()}/>
                        {row.status==='loading'&&<div className="spinner" style={{width:13,height:13,margin:'0 6px',flexShrink:0}}/>}
                      </div>
                    </td>
                    {/* Product Name */}
                    <td style={{borderBottom:'1px solid #e2e8f0',borderRight:'1px solid #e2e8f0',padding:'0 10px',color:row.model?'#0f172a':'#cbd5e1',fontWeight:row.model?500:400,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {row.model||'Auto-filled after EAN scan'}
                    </td>
                    {/* Qty */}
                    <td style={{borderBottom:'1px solid #e2e8f0',borderRight:'1px solid #e2e8f0',textAlign:'center',fontWeight:700,fontSize:14,color:row.qty>0?'#dc2626':'#cbd5e1'}}>{row.qty>0?row.qty:'—'}</td>
                    {/* IMEI — strict 15 digits, must be IN_STOCK */}
                    <td style={{borderBottom:'1px solid #e2e8f0',borderRight:'1px solid #e2e8f0',padding:0,background:row.errField==='imei'?'#fff5f5':''}}>
                      <div style={{height:38,outline:eOL('imei'),background:isA&&fc==='imei'?'#fff5f5':'',display:'flex'}}>
                        <input ref={R(i,'imei')} value={row.imei}
                          onChange={e=>{
                            const v=e.target.value;upd(i,{imei:v,errMsg:'',errField:''});
                            // Auto-submit when scanner finishes (exactly 15 digits entered)
                            if(/^\d{15}$/.test(v.trim()))setTimeout(()=>handleImei(i,v.trim()),60);
                          }}
                          onKeyDown={e=>{
                            if(e.key==='Enter'){e.preventDefault();handleImei(i,(e.target as HTMLInputElement).value);}
                            if(e.key==='Tab'){e.preventDefault();handleImei(i,(e.target as HTMLInputElement).value);}
                            if(e.key==='Escape')upd(i,{errMsg:'',errField:'',imei:'',status:row.productId?'found':'empty'});
                          }}
                          onPaste={e=>{e.preventDefault();const v=e.clipboardData.getData('text').trim();if(v){upd(i,{imei:v});setTimeout(()=>handleImei(i,v),30);}}}
                          onFocus={()=>{setAr(i);setFc('imei');}}
                          placeholder="Scan IMEI (IN_STOCK only)…"
                          style={CI({fontFamily:'monospace',fontSize:12,color:row.errField==='imei'?'#dc2626':'#0f172a'})}/>
                      </div>
                    </td>
                    {/* Sr. No. — any text */}
                    <td style={{borderBottom:'1px solid #e2e8f0',borderRight:'1px solid #e2e8f0',padding:0}}>
                      <div style={{height:38,outline:eOL('srno'),background:isA&&fc==='srno'?'#eff6ff':'',display:'flex'}}>
                        <input ref={R(i,'srno')} value={row.srno}
                          onChange={e=>upd(i,{srno:e.target.value,errField:row.errField==='srno'?'':row.errField,errMsg:row.errField==='srno'?'':row.errMsg})}
                          onKeyDown={e=>{if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();handleSrno(i,(e.target as HTMLInputElement).value);}}}
                          onPaste={e=>{e.preventDefault();const v=e.clipboardData.getData('text').trim();if(v){upd(i,{srno:v});setTimeout(()=>handleSrno(i,v),30);}}}
                          onFocus={()=>{setAr(i);setFc('srno');}}
                          placeholder="Serial / any text…"
                          style={CI({fontSize:12,color:row.errField==='srno'?'#dc2626':'#374151'})}/>
                      </div>
                    </td>
                    {/* Status */}
                    <td style={{borderBottom:'1px solid #e2e8f0',borderRight:'1px solid #e2e8f0',padding:'0 6px',textAlign:'center'}}>
                      {row.errMsg&&<span style={{fontSize:9,background:'#fef2f2',color:'#dc2626',padding:'2px 6px',borderRadius:8,fontWeight:700,cursor:'help',display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={row.errMsg}>✕ Error</span>}
                      {!row.errMsg&&row.status==='saved'&&<span style={{fontSize:10,background:'#fee2e2',color:'#dc2626',padding:'2px 8px',borderRadius:10,fontWeight:700}}>✓</span>}
                      {!row.errMsg&&row.status==='found'&&<span style={{fontSize:10,background:'#fef9c3',color:'#854d0e',padding:'2px 8px',borderRadius:10}}>Ready</span>}
                      {!row.errMsg&&row.status==='not_found'&&<span style={{fontSize:10,background:'#fef2f2',color:'#dc2626',padding:'2px 8px',borderRadius:10}}>Not Found</span>}
                    </td>
                    {/* Delete */}
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

        {/* ── Live Summary ─────────────────────────────────────────────── */}
        <div style={{width:240,borderLeft:'1px solid #e2e8f0',background:'#fff',display:'flex',flexDirection:'column',flexShrink:0}}>
          <div style={{padding:'10px 14px 8px',borderBottom:'1px solid #f1f5f9'}}>
            <div style={{fontSize:9,fontWeight:800,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'.1em'}}>DISPATCHING — {date}</div>
            {cust?<div style={{fontSize:11,color:'#dc2626',fontWeight:600,marginTop:2}}>→ {cust}</div>:<div style={{fontSize:10,color:'#cbd5e1',marginTop:2}}>No customer selected</div>}
          </div>
          <div style={{flex:1,overflowY:'auto',padding:'6px 0'}}>
            {sv.length===0?<div style={{padding:'20px 14px',textAlign:'center',color:'#cbd5e1',fontSize:12}}>Scan products to dispatch</div>
              :sv.map(r=>(
              <div key={r.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 14px',fontSize:12}}>
                <span style={{color:'#374151',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:165}}>{r.model||r.ean}</span>
                <span style={{fontWeight:700,color:'#dc2626',flexShrink:0,marginLeft:6}}>-{r.qty}</span>
              </div>
            ))}
          </div>
          {tot>0&&<div style={{padding:'10px 14px',borderTop:'1px solid #f1f5f9',display:'flex',justifyContent:'space-between',fontSize:13,fontWeight:800}}><span style={{color:'#0f172a'}}>Grand Total</span><span style={{color:'#dc2626'}}>{tot}</span></div>}
        </div>
      </div>
    </div>
  );
}
