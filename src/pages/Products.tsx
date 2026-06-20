import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';

type Status = 'ACTIVE'|'INACTIVE'|'DISCONTINUED'|'OPEN_BOX_ONLY'|'BLOCKED';
interface Brand    { id:string; name:string; }
interface Category { id:string; name:string; parentId?:string; children?:Category[]; }
interface StockLevel { id:string; warehouseId:string; quantity:number; warehouse?:{id:string;name:string;code:string;}; }
interface Attr { id:string; key:string; value:string; }
interface Product {
  id:string; ean:string; model:string; brand:string;
  brandId?:string; categoryId?:string; category?:Category;
  vendorId?:string; vendor?:{id:string;name:string;};
  status:Status; costPrice:string; sellingPrice:string;
  gstRate:string; hsnCode?:string; description?:string;
  imeiRequired:boolean; serialRequired:boolean; minStock:number;
  images:string[]; attributes:Attr[]; stockLevels:StockLevel[];
  createdAt:string; updatedAt:string;
}
interface Paged<T>{ items:T[]; page:number; limit:number; total:number; totalPages:number; }
interface Stats { total:number; active:number; lowStock:number; outOfStock:number; }
interface SavedView { id:string; name:string; filters:any; columns:string[]; sortBy?:string; sortDir?:string; }

const ALL_COLS = [
  { key:'ean',          label:'EAN',         w:130 },
  { key:'model',        label:'Product Name', w:240 },
  { key:'brand',        label:'Brand',        w:100 },
  { key:'category',     label:'Category',     w:110 },
  { key:'status',       label:'Status',       w:100 },
  { key:'sellingPrice', label:'MRP ₹',         w:85  },
  { key:'costPrice',    label:'Cost ₹',        w:85  },
  { key:'stock',        label:'Stock',        w:70  },
  { key:'updatedAt',    label:'Last Updated', w:110 },
  { key:'vendor',       label:'Vendor',       w:110 },
];
const DEF_COLS = ['ean','model','brand','category','status','sellingPrice','costPrice','stock','updatedAt'];

const SORT_OPTIONS = [
  { val:'updatedAt:desc', label:'Recently Updated' },
  { val:'createdAt:desc', label:'Recently Added' },
  { val:'createdAt:asc',  label:'Oldest First' },
  { val:'sellingPrice:desc', label:'MRP: High to Low' },
  { val:'sellingPrice:asc',  label:'MRP: Low to High' },
  { val:'costPrice:desc',    label:'Cost: High to Low' },
  { val:'costPrice:asc',     label:'Cost: Low to High' },
  { val:'model:asc',         label:'Name: A → Z' },
  { val:'model:desc',        label:'Name: Z → A' },
  { val:'brand:asc',         label:'Brand: A → Z' },
  { val:'stock:desc',        label:'Qty: High to Low' },
  { val:'stock:asc',         label:'Qty: Low to High' },
];

const S_CLS:Record<Status,string>={ACTIVE:'badge b-active',INACTIVE:'badge b-inactive',DISCONTINUED:'badge b-discontinued',OPEN_BOX_ONLY:'badge b-openbox',BLOCKED:'badge b-blocked'};
const S_LBL:Record<Status,string>={ACTIVE:'Active',INACTIVE:'Inactive',DISCONTINUED:'Discontinued',OPEN_BOX_ONLY:'Open Box',BLOCKED:'Blocked'};

const fmt=(n:string|number)=>'₹'+Number(n).toLocaleString('en-IN',{maximumFractionDigits:0});
const fmtDate=(s:string)=>new Date(s).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'});
const stockQty=(p:Product)=>(p.stockLevels||[]).reduce((s,l)=>s+l.quantity,0);

function qs(obj:any){const p=new URLSearchParams();Object.entries(obj).forEach(([k,v])=>{if(v===undefined||v===null||v==='')return;if(Array.isArray(v))v.forEach(x=>p.append(k,String(x)));else p.set(k,String(v));});return p.toString()?'?'+p.toString():'';}

// ── Excel helpers ─────────────────────────────────────────────────────────
const TEMPLATE_HEADERS = ['EAN','Product Name','Brand','Category','Status','MRP','Cost Price','Action'];

function downloadTemplate(){
  const sample=[
    ['8801234567890','Samsung Galaxy A55 8/128GB (Black)','Samsung','Smartphones','ACTIVE','22999','18000','UPDATE'],
  ];
  const csv=[TEMPLATE_HEADERS,...sample].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');
  a.href=url;a.download='iTechArena_Product_Import_Template.csv';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
}

async function exportProducts(filters:any,visCols:string[],total:number, selectedItems?:Product[]){
  // If specific items selected, export only those
  if(selectedItems && selectedItems.length > 0){
    return buildAndDownloadCSV(selectedItems, visCols, `Products_Selected_${selectedItems.length}`);
  }
  if(!total){throw new Error('No products to export');}
  // Paginate through all results (200 per page to stay under server limit)
  const allItems:Product[] = [];
  const pageSize = 200;
  const totalPages = Math.ceil(total / pageSize); // export ALL products, no cap
  for(let page = 1; page <= totalPages; page++){
    const data = await api<Paged<Product>>(`/products${qs({...filters,page,limit:pageSize})}`);
    if(!data?.items?.length) break;
    allItems.push(...data.items);
  }
  if(!allItems.length) throw new Error('No data returned');
  return buildAndDownloadCSV(allItems, visCols, `Products_${new Date().toISOString().slice(0,10)}`);
}

function buildAndDownloadCSV(items:Product[], visCols:string[], filename:string){
  const colMap:Record<string,string>={ean:'EAN',model:'Product Name',brand:'Brand',category:'Category',vendor:'Vendor',status:'Status',costPrice:'Cost Price',sellingPrice:'MRP',stock:'Stock',updatedAt:'Last Updated'};
  const headers=visCols.map(k=>colMap[k]||k);
  const rows=items.map(p=>visCols.map(k=>{
    if(k==='ean')return p.ean;if(k==='model')return p.model;if(k==='brand')return p.brand;
    if(k==='category')return p.category?.name||'';if(k==='vendor')return p.vendor?.name||'';
    if(k==='status')return S_LBL[p.status];if(k==='costPrice')return Number(p.costPrice);
    if(k==='sellingPrice')return Number(p.sellingPrice);if(k==='stock')return stockQty(p);
    if(k==='updatedAt')return fmtDate(p.updatedAt);return '';
  }));
  const esc=(v:any)=>{const sv=String(v??'');return(sv.includes(',')||sv.includes('"'))?`"${sv.replace(/"/g,'""')}"`:`${sv}`;};
  const csv=[headers,...rows].map(r=>r.map(esc).join(',')).join('\n');
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');
  a.href=url;a.download=`${filename}.csv`;
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
}

// ColReorder moved inline to table headers

// ── Bulk Import Modal ─────────────────────────────────────────────────────
function BulkImportModal({categories,brands,onClose,onDone}:{categories:Category[];brands:Brand[];onClose:()=>void;onDone:()=>void}){
  const [step,setStep]=useState<'upload'|'preview'|'importing'|'done'>('upload');
  const [rows,setRows]=useState<any[]>([]);
  const [result,setResult]=useState<any>(null);
  const [err,setErr]=useState('');
  const [importBusy,setImportBusy]=useState(false);
  const [importProgress,setImportProgress]=useState(0);

  const parseCSV=(text:string)=>{
      const lines=text.split('\n').map(l=>l.trim().replace(/\r/,'')).filter(l=>l.length>0);
    if(!lines.length)return[];
    const headers=lines[0].split(',').map(h=>h.trim().replace(/^"|"$/g,'').toLowerCase());
    return lines.slice(1).filter(l=>l.trim()).map(line=>{
      const vals:string[]=[];let cur='';let inQ=false;
      for(const c of line){if(c==='"')inQ=!inQ;else if(c===','&&!inQ){vals.push(cur.trim());cur='';}else cur+=c;}
      vals.push(cur.trim());
      const obj:any={};
      headers.forEach((h,i)=>{
        const v=(vals[i]||'').replace(/^"|"$/g,'').trim();
        if(h==='ean'||h==='barcode')obj.ean=v;
        else if(h==='product name'||h==='model'||h==='name')obj.model=v;
        else if(h==='brand')obj.brand=v;
        else if(h==='category'){const cat=categories.find(c=>c.name.toLowerCase()===v.toLowerCase());obj.categoryId=cat?.id;obj._category=v;}
        else if(h==='status')obj.status=(['ACTIVE','INACTIVE','DISCONTINUED','OPEN_BOX_ONLY','BLOCKED'].includes(v.toUpperCase())?v.toUpperCase():'ACTIVE');
        else if(h==='cost price'||h==='cost')obj.costPrice=parseFloat(v)||0;
        else if(h==='mrp'||h==='selling price')obj.sellingPrice=parseFloat(v)||0;
        else if(h==='action')obj.action=(v||'UPDATE').trim().toUpperCase();
        else if(h==='gst%'||h==='gst')obj.gstRate=parseFloat(v)||18;
        else if(h==='hsn code'||h==='hsn')obj.hsnCode=v;
        else if(h==='min stock')obj.minStock=parseInt(v)||0;
        else if(h==='description')obj.description=v;
      });
      if(!obj.status)obj.status='ACTIVE';
      if(!obj.gstRate)obj.gstRate=18;
      if(!obj.action)obj.action='UPDATE';
      return obj;
    }).filter(r=>r.ean&&r.ean.trim()&&r.model&&r.model.trim());
  };

  const handleFile=(e:React.ChangeEvent<HTMLInputElement>)=>{
    const f=e.target.files?.[0];if(!f)return;
    const reader=new FileReader();
    reader.onload=ev=>{
      try{const parsed=parseCSV(ev.target?.result as string);setRows(parsed);setStep('preview');setErr('');}
      catch(e:any){setErr('Parse error: '+e.message);}
    };
    reader.readAsText(f,'UTF-8');
  };

  const doImport=async()=>{
    if(!rows.length)return;
    setStep('importing');setImportProgress(10);
    
    // Animate progress bar while waiting (real progress happens server-side)
    const progressTimer=setInterval(()=>{
      setImportProgress(prev=>{
        if(prev>=85)return prev; // hold at 85% until done
        return prev+Math.random()*3; // slowly creep up
      });
    },800);
    
    try{
      const cleanRows=rows.map(({_orig,_category,...r}:any)=>r);
      const BASE=(import.meta.env.VITE_API_URL as string)||(window.location.origin+'/api/v1');
      
      // Use fetch directly so we can set a long timeout via AbortController
      const controller=new AbortController();
      const timeoutId=setTimeout(()=>controller.abort(),300000); // 5 min timeout
      
      let token='';
      try{token=(await import('../api/client')).getAccessToken()||'';}catch{}
      
      const resp=await fetch(
        BASE.replace('/api/v1','')+'/api/v1/products/bulk-import',
        {method:'POST',signal:controller.signal,
         headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
         body:JSON.stringify({rows:cleanRows})}
      );
      clearTimeout(timeoutId);
      
      if(!resp.ok){
        const errBody=await resp.json().catch(()=>({}));
        throw new Error(errBody.message||`Server error ${resp.status}`);
      }
      const r=await resp.json();
      const data=r.data||r;
      clearInterval(progressTimer);setImportProgress(100);
      setResult({
        created:data.created||0,
        updated:data.updated||0,
        totalErrors:data.totalErrors||0,
        errors:data.errors||[],
      });
      setStep('done');
    }catch(e:any){
      clearInterval(progressTimer);
      const msg=e.name==='AbortError'?'Request timed out after 5 minutes':(e.message||'Import failed');
      setErr(msg);setStep('preview');
    }
  };

  return(
    <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="modal" style={{width:580,maxHeight:'80vh',display:'flex',flexDirection:'column'}}>
        <div className="modal-hdr" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div className="modal-ttl">Bulk Import Products</div>
            <div style={{fontSize:11,color:'var(--txt-3)',marginTop:2}}>Upload CSV · preview · import</div>
          </div>
          <button onClick={onClose} style={{width:28,height:28,background:'var(--surf-1)',border:'1px solid var(--bdr)',borderRadius:'var(--r-md)',cursor:'pointer',fontSize:14,fontWeight:700,color:'var(--txt-2)'}}>✕</button>
        </div>
        <div className="modal-body" style={{flex:1,overflowY:'auto'}}>
          {step==='upload'&&(
            <>
              <div style={{background:'var(--info-bg)',border:'1px solid var(--info-bdr)',borderRadius:'var(--r-md)',padding:'12px 14px',marginBottom:14,fontSize:12,color:'var(--info)'}}>
                <strong>How to use:</strong> Download the template, fill in your products, save as CSV, then upload here.
              </div>
              <button onClick={downloadTemplate}
                style={{display:'flex',alignItems:'center',gap:8,padding:'10px 14px',background:'var(--surf-1)',border:'1px solid var(--bdr)',borderRadius:'var(--r-md)',cursor:'pointer',fontSize:13,fontWeight:500,marginBottom:14,width:'100%'}}>
                <span style={{fontSize:16}}>📄</span>
                <div style={{textAlign:'left'}}>
                  <div style={{fontWeight:600,color:'var(--txt)'}}>Download Template CSV</div>
                  <div style={{fontSize:11,color:'var(--txt-3)'}}>Pre-filled column headers: {TEMPLATE_HEADERS.join(', ')}</div>
                </div>
              </button>
              <div style={{border:'2px dashed var(--bdr)',borderRadius:'var(--r-lg)',padding:'28px',textAlign:'center',cursor:'pointer'}}
                onClick={()=>document.getElementById('import-file')?.click()}>
                <div style={{fontSize:28,marginBottom:8}}>📂</div>
                <div style={{fontSize:14,fontWeight:600,color:'var(--txt)',marginBottom:4}}>Click to upload CSV file</div>
                <div style={{fontSize:12,color:'var(--txt-3)'}}>Accepts .csv files exported from Excel or Google Sheets</div>
                <input id="import-file" type="file" accept=".csv,.txt" style={{display:'none'}} onChange={handleFile}/>
              </div>
              {err&&<div className="alert alert-err" style={{marginTop:10}}>{err}</div>}
            </>
          )}
          {step==='preview'&&(
            <>
              <div style={{fontSize:13,fontWeight:500,marginBottom:10,color:'var(--txt)'}}>
                {rows.length} products ready to import. Review before importing:
              </div>
              <div style={{overflowX:'auto',border:'1px solid var(--bdr)',borderRadius:'var(--r-md)'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead>
                    <tr style={{background:'var(--surf-1)'}}>
                      {['EAN','Name','Brand','Category','Status','Cost','MRP','Action'].map(h=>(
                        <th key={h} style={{padding:'7px 10px',textAlign:'left',fontWeight:600,color:'var(--txt-3)',fontSize:10,textTransform:'uppercase',borderBottom:'1px solid var(--bdr)'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0,10).map((r,i)=>(
                      <tr key={i} style={{borderBottom:'1px solid var(--bdr-s)'}}>
                        <td style={{padding:'6px 10px',fontFamily:'var(--mono)',fontSize:11}}>{r.ean}</td>
                        <td style={{padding:'6px 10px',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.model}</td>
                        <td style={{padding:'6px 10px'}}>{r.brand||'—'}</td>
                        <td style={{padding:'6px 10px'}}>{r._category||'—'}</td>
                        <td style={{padding:'6px 10px'}}><span className={S_CLS[r.status as Status]||'badge b-active'}>{S_LBL[r.status as Status]||r.status}</span></td>
                        <td style={{padding:'6px 10px'}}>{r.costPrice?fmt(r.costPrice):'₹0'}</td>
                        <td style={{padding:'6px 10px'}}>{r.sellingPrice?fmt(r.sellingPrice):'₹0'}</td>
                        <td style={{padding:'6px 10px'}}>
                          <span style={{
                            fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:'var(--r-full)',
                            background: r.action==='DELETE' ? 'var(--err-bg)' : 'var(--ok-bg)',
                            color:      r.action==='DELETE' ? 'var(--err)'    : 'var(--ok)',
                            border: `1px solid ${r.action==='DELETE' ? 'var(--err-bdr)' : 'var(--ok-bdr)'}`,
                          }}>{r.action||'UPDATE'}</span>
                        </td>
                      </tr>
                    ))}
                    {rows.length>10&&<tr><td colSpan={8} style={{padding:'8px 10px',textAlign:'center',color:'var(--txt-3)',fontSize:11}}>...and {rows.length-10} more</td></tr>}
                  </tbody>
                </table>
              </div>
              {err&&<div className="alert alert-err" style={{marginTop:10}}>{err}</div>}
            </>
          )}
          {step==='importing'&&(
            <div style={{textAlign:'center',padding:'40px 32px'}}>
              <div className="spinner" style={{width:32,height:32,margin:'0 auto 20px',borderWidth:3}}/>
              <div style={{fontSize:16,fontWeight:700,color:'var(--txt)',marginBottom:8}}>
                Importing {rows.length.toLocaleString()} products…
              </div>
              <div style={{background:'var(--surf-2)',borderRadius:'var(--r-full)',height:6,overflow:'hidden',marginBottom:10,maxWidth:300,margin:'12px auto'}}>
                <div style={{background:'var(--brand)',height:'100%',borderRadius:'var(--r-full)',width:importProgress+'%',transition:'width .5s ease'}}/>
              </div>
              <div style={{fontSize:12,color:'var(--txt-3)'}}>Processing… please wait, do not close this window</div>
            </div>
          )}
          {step==='done'&&result&&(
            <div style={{textAlign:'center',padding:'24px'}}>
              <div style={{fontSize:32,marginBottom:12}}>✅</div>
              <div style={{fontSize:15,fontWeight:700,marginBottom:8}}>Import Complete</div>
              <div style={{display:'flex',justifyContent:'center',gap:16,marginBottom:12,flexWrap:'wrap'}}>
                <div style={{textAlign:'center'}}><div style={{fontSize:22,fontWeight:800,color:'var(--ok)'}}>{result.created}</div><div style={{fontSize:11,color:'var(--txt-3)'}}>New products</div></div>
                <div style={{textAlign:'center'}}><div style={{fontSize:22,fontWeight:800,color:'var(--brand)'}}>{result.updated}</div><div style={{fontSize:11,color:'var(--txt-3)'}}>Updated</div></div>
                {!!result.deleted&&<div style={{textAlign:'center'}}><div style={{fontSize:22,fontWeight:800,color:'var(--err)'}}>{result.deleted}</div><div style={{fontSize:11,color:'var(--txt-3)'}}>Deleted</div></div>}
                <div style={{textAlign:'center'}}><div style={{fontSize:22,fontWeight:800,color:'var(--err)'}}>{result.totalErrors}</div><div style={{fontSize:11,color:'var(--txt-3)'}}>Errors</div></div>
              </div>
              {(!!result.brandsRemoved||!!result.categoriesRemoved)&&(
                <div style={{fontSize:11,color:'var(--txt-3)',marginBottom:10}}>
                  🧹 Cleaned up {result.brandsRemoved||0} empty brand(s) and {result.categoriesRemoved||0} empty category(ies)
                </div>
              )}
              {result.errors?.length>0&&<div style={{textAlign:'left',background:'var(--err-bg)',border:'1px solid var(--err-bdr)',borderRadius:'var(--r-md)',padding:'10px 12px',fontSize:11,color:'var(--err)'}}>{result.errors.map((e:string,i:number)=><div key={i}>{e}</div>)}</div>}
            </div>
          )}
        </div>
        <div className="modal-ftr">
          <button onClick={onClose} style={{height:34,padding:'0 14px',background:'var(--surf-0)',border:'1px solid var(--bdr)',borderRadius:'var(--r-md)',fontSize:13,cursor:'pointer',color:'var(--txt-2)'}}>
            {step==='done'?'Close':'Cancel'}
          </button>
          {step==='preview'&&(
            <>
              <button onClick={()=>setStep('upload')} style={{height:34,padding:'0 14px',background:'var(--surf-0)',border:'1px solid var(--bdr)',borderRadius:'var(--r-md)',fontSize:13,cursor:'pointer',color:'var(--txt-2)'}}>← Back</button>
              <button onClick={doImport} style={{height:34,padding:'0 18px',background:'var(--brand)',color:'#fff',border:'none',borderRadius:'var(--r-md)',fontSize:13,fontWeight:600,cursor:'pointer'}}>
                Import {rows.length} Products
              </button>
            </>
          )}
          {step==='done'&&<button onClick={()=>{onDone();onClose();}} style={{height:34,padding:'0 18px',background:'var(--brand)',color:'#fff',border:'none',borderRadius:'var(--r-md)',fontSize:13,fontWeight:600,cursor:'pointer'}}>✓ View Products</button>}
        </div>
      </div>
    </div>
  );
}

// ── Add Product Modal ─────────────────────────────────────────────────────
function AddProductModal({brands:initBrands,categories,onClose,onSaved}:{brands:Brand[];categories:Category[];onClose:()=>void;onSaved:()=>void}){
  const [brands,setBrands]=useState<Brand[]>(initBrands);
  const [form,setForm]=useState({ean:'',model:'',brand:'',brandId:'',categoryId:'',costPrice:'',sellingPrice:'',status:'ACTIVE' as Status});
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState('');
  const [newBrand,setNewBrand]=useState('');
  const [addingBrand,setAddingBrand]=useState(false);
  const set=(k:string,v:string)=>setForm(f=>({...f,[k]:v}));

  const addBrand=async()=>{
    if(!newBrand.trim())return;
    setAddingBrand(true);
    try{
      const b=await api<any>('/products/brands',{method:'POST',body:JSON.stringify({name:newBrand.trim()})});
      const newB={id:b.id||b.data?.id,name:newBrand.trim()};
      setBrands(prev=>[...prev,newB]);
      set('brand',newBrand.trim());set('brandId',newB.id);
      setNewBrand('');
    }catch(e:any){setErr('Brand error: '+e.message);}
    finally{setAddingBrand(false);}
  };

  const save=async()=>{
    if(!form.ean.trim()){setErr('EAN/Barcode is required');return;}
    if(!form.model.trim()){setErr('Product Name is required');return;}
    if(!form.brand.trim()){setErr('Brand is required');return;}
    if(!form.costPrice||Number(form.costPrice)<0){setErr('Cost Price is required');return;}
    if(!form.sellingPrice||Number(form.sellingPrice)<0){setErr('MRP is required');return;}
    setBusy(true);setErr('');
    try{
      await api('/products',{method:'POST',body:JSON.stringify({
        ean:form.ean.trim(),model:form.model.trim(),brand:form.brand.trim(),
        brandId:form.brandId||undefined,
        categoryId:form.categoryId||undefined,
        costPrice:Number(form.costPrice),sellingPrice:Number(form.sellingPrice),
        status:form.status,
      })});
      onSaved();onClose();
    }catch(e:any){setErr(e.message||'Failed to save');}
    finally{setBusy(false);}
  };

  const inp={height:34,padding:'0 10px',border:'1px solid var(--bdr)',borderRadius:'var(--r-md)',fontSize:13,outline:'none',width:'100%',boxSizing:'border-box' as const};
  const lbl={fontSize:11,fontWeight:600,color:'var(--txt-2)',marginBottom:4,display:'block' as const};

  return(
    <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="modal" style={{width:540}}>
        <div className="modal-hdr" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div className="modal-ttl">Add New Product</div>
          <button onClick={onClose} style={{width:28,height:28,background:'var(--err-bg)',border:'1px solid var(--err-bdr)',borderRadius:'var(--r-md)',cursor:'pointer',fontSize:14,fontWeight:700,color:'var(--err)'}}>✕</button>
        </div>
        <div className="modal-body" style={{maxHeight:'65vh',overflowY:'auto'}}>
          {err&&<div className="alert alert-err" style={{marginBottom:12}}>{err}</div>}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div style={{gridColumn:'span 2'}}>
              <label style={lbl}>EAN / Barcode <span style={{color:'var(--err)'}}>*</span></label>
              <input style={inp} value={form.ean} onChange={e=>set('ean',e.target.value)} placeholder="e.g. 8801234567890"/>
            </div>
            <div style={{gridColumn:'span 2'}}>
              <label style={lbl}>Product Name <span style={{color:'var(--err)'}}>*</span></label>
              <input style={inp} value={form.model} onChange={e=>set('model',e.target.value)} placeholder="Full product name"/>
            </div>
            {/* Brand with inline add */}
            <div style={{gridColumn:'span 2'}}>
              <label style={lbl}>Brand <span style={{color:'var(--err)'}}>*</span></label>
              <div style={{display:'flex',gap:6}}>
                <select value={form.brandId} onChange={e=>{const b=brands.find(x=>x.id===e.target.value);set('brandId',e.target.value);set('brand',b?.name||'');}}
                  style={{...inp,flex:1,appearance:'none',cursor:'pointer'}}>
                  <option value="">Select brand…</option>
                  {brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              {/* Inline add brand */}
              <div style={{display:'flex',gap:5,marginTop:5}}>
                <input value={newBrand} onChange={e=>setNewBrand(e.target.value)} placeholder="Or type new brand name…"
                  style={{...inp,flex:1,height:28,fontSize:12}}
                  onKeyDown={e=>e.key==='Enter'&&addBrand()}/>
                <button onClick={addBrand} disabled={addingBrand||!newBrand.trim()}
                  style={{height:28,padding:'0 10px',background:'var(--surf-2)',border:'1px solid var(--bdr)',borderRadius:'var(--r-md)',fontSize:11,fontWeight:600,cursor:'pointer',color:'var(--brand)',whiteSpace:'nowrap'}}>
                  {addingBrand?'Adding…':'+ Add Brand'}
                </button>
              </div>
            </div>
            <div>
              <label style={lbl}>Cost Price ₹ <span style={{color:'var(--err)'}}>*</span></label>
              <input type="number" style={inp} value={form.costPrice} onChange={e=>set('costPrice',e.target.value)} placeholder="0"/>
            </div>
            <div>
              <label style={lbl}>MRP ₹ <span style={{color:'var(--err)'}}>*</span></label>
              <input type="number" style={inp} value={form.sellingPrice} onChange={e=>set('sellingPrice',e.target.value)} placeholder="0"/>
            </div>
            <div>
              <label style={lbl}>Category</label>
              <select style={{...inp,appearance:'none',cursor:'pointer'}} value={form.categoryId} onChange={e=>set('categoryId',e.target.value)}>
                <option value="">Select category…</option>
                {categories.filter(c=>!c.parentId).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Status</label>
              <select style={{...inp,appearance:'none',cursor:'pointer'}} value={form.status} onChange={e=>set('status',e.target.value as Status)}>
                {(['ACTIVE','INACTIVE','DISCONTINUED','OPEN_BOX_ONLY','BLOCKED'] as Status[]).map(s=><option key={s} value={s}>{S_LBL[s]}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="modal-ftr">
          <button onClick={onClose} style={{height:34,padding:'0 14px',background:'var(--surf-0)',border:'1px solid var(--bdr)',borderRadius:'var(--r-md)',fontSize:13,cursor:'pointer',color:'var(--txt-2)'}}>Cancel</button>
          <button onClick={save} disabled={busy} style={{height:34,padding:'0 18px',background:'var(--brand)',color:'#fff',border:'none',borderRadius:'var(--r-md)',fontSize:13,fontWeight:600,cursor:'pointer'}}>
            {busy?'Saving…':'Save Product'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Status Manager Modal ─────────────────────────────────────────────────
function StatusManager({labels,onSave,onClose}:{labels:Record<string,string>;onSave:(l:Record<string,string>)=>void;onClose:()=>void}){
  const STATUSES:Status[]=['ACTIVE','INACTIVE','DISCONTINUED','OPEN_BOX_ONLY','BLOCKED'];
  const DEF_LABELS:Record<string,string>={ACTIVE:'Active',INACTIVE:'Inactive',DISCONTINUED:'Discontinued',OPEN_BOX_ONLY:'Open Box',BLOCKED:'Blocked'};
  const [local,setLocal]=useState<Record<string,string>>({...DEF_LABELS,...labels});
  const set=(k:string,v:string)=>setLocal(prev=>({...prev,[k]:v}));
  const reset=(k:string)=>setLocal(prev=>({...prev,[k]:DEF_LABELS[k]}));
  const save=()=>{onSave(local);localStorage.setItem('erp_status_labels',JSON.stringify(local));onClose();};
  const STATUS_COLORS:Record<string,string>={ACTIVE:'#16a34a',INACTIVE:'#6b7280',DISCONTINUED:'#dc2626',OPEN_BOX_ONLY:'#d97706',BLOCKED:'#991b1b'};
  return(
    <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="modal" style={{width:440}}>
        <div className="modal-hdr" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div><div className="modal-ttl">Status Labels</div><div style={{fontSize:11,color:'var(--txt-3)',marginTop:1}}>Rename how statuses appear in the ERP</div></div>
          <button onClick={onClose} style={{width:28,height:28,background:'var(--err-bg)',border:'1px solid var(--err-bdr)',borderRadius:'var(--r-md)',cursor:'pointer',fontSize:14,fontWeight:700,color:'var(--err)'}}>✕</button>
        </div>
        <div className="modal-body">
          {STATUSES.map(s=>(
            <div key={s} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid var(--bdr-s)'}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:STATUS_COLORS[s],flexShrink:0}}/>
              <span style={{fontSize:11,color:'var(--txt-3)',width:130,flexShrink:0}}>{s}</span>
              <input value={local[s]||''} onChange={e=>set(s,e.target.value)}
                style={{flex:1,height:30,padding:'0 8px',border:'1px solid var(--bdr)',borderRadius:'var(--r-md)',fontSize:13,outline:'none'}}/>
              {local[s]!==DEF_LABELS[s]&&(
                <button onClick={()=>reset(s)} title="Reset to default"
                  style={{height:28,padding:'0 8px',fontSize:11,background:'none',border:'1px solid var(--bdr)',borderRadius:'var(--r-sm)',cursor:'pointer',color:'var(--txt-3)',whiteSpace:'nowrap'}}>
                  Reset
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="modal-ftr">
          <button onClick={onClose} style={{height:34,padding:'0 14px',background:'var(--surf-0)',border:'1px solid var(--bdr)',borderRadius:'var(--r-md)',fontSize:13,cursor:'pointer',color:'var(--txt-2)'}}>Cancel</button>
          <button onClick={save} style={{height:34,padding:'0 18px',background:'var(--brand)',color:'#fff',border:'none',borderRadius:'var(--r-md)',fontSize:13,fontWeight:600,cursor:'pointer'}}>Save Labels</button>
        </div>
      </div>
    </div>
  );
}

// ── Brand Master Modal (with Excel Import/Export) ────────────────────────
function BrandMaster({brands,onClose,onRefresh}:{brands:Brand[];onClose:()=>void;onRefresh:()=>void}){
  const [newName,setNewName]=useState('');
  const [editId,setEditId]=useState<string|null>(null);
  const [editName,setEditName]=useState('');
  const [busy,setBusy]=useState('');
  const [search,setSearch]=useState('');
  const [tab,setTab]=useState<'list'|'import'>('list');
  const [importRows,setImportRows]=useState<{name:string;action:string;_orig?:string}[]>([]);
  const [importBusy,setImportBusy]=useState(false);
  const [importProgress,setImportProgress]=useState(0);
  const [importResult,setImportResult]=useState<any>(null);

  const filtered=brands.filter(b=>b.name.toLowerCase().includes(search.toLowerCase()));
  const inp={height:34,padding:'0 10px',border:'1px solid var(--bdr)',borderRadius:'var(--r-md)',fontSize:13,outline:'none'};

  // ── Export brands to CSV ──
  const exportBrands=()=>{
    const rows=['Name,Action',...brands.map(b=>'"'+b.name+'",ADD')];
    const csv=rows.join('\n');
    const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');
    a.href=url;a.download='Brands_'+new Date().toISOString().slice(0,10)+'.csv';
    document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
  };

  // ── Download blank template ──
  const downloadTemplate=()=>{
    const csv='Name,Action\nSamsung,ADD\nApple,ADD\nJBL,ADD\nOld Brand,DELETE\nWrong Name,UPDATE';
    const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');
    a.href=url;a.download='Brand_Import_Template.csv';
    document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
  };

  // ── Parse CSV file ──
  const handleFile=(e:React.ChangeEvent<HTMLInputElement>)=>{
    const f=e.target.files?.[0];if(!f)return;
    const reader=new FileReader();
    reader.onload=ev=>{
      const text=ev.target?.result as string;
      const lines=text.split('\n').map(l=>l.trim().replace(/\r/,'')).filter(l=>l.length>0);
      if(!lines.length)return;
      const isHeader=lines[0].toLowerCase().includes('name');
      const rows=lines.slice(isHeader?1:0).filter(l=>l.trim()).map(line=>{
        const parts=line.split(',').map(v=>v.trim().replace(/^"|"$/g,''));
        return { name:parts[0]||'', action:(parts[1]||'ADD').toUpperCase(), _orig:line };
      }).filter(r=>r.name);
      setImportRows(rows);setImportResult(null);
    };
    reader.readAsText(f,'UTF-8');
    e.target.value='';
  };

  // ── Run import ──
  const runImport=async()=>{
    if(!importRows.length)return;
    setImportBusy(true);
    try{
      const r=await api<any>('/products/brands/bulk-import',{method:'POST',body:JSON.stringify({rows:importRows})});
      setImportResult(r);onRefresh();
    }catch(e:any){setImportResult({error:e.message});}
    finally{setImportBusy(false);}
  };

  const add=async()=>{if(!newName.trim())return;setBusy('add');try{await api('/products/brands',{method:'POST',body:JSON.stringify({name:newName.trim()})});setNewName('');onRefresh();}finally{setBusy('');}};
  const save=async(id:string)=>{setBusy(id);try{await api(`/products/brands/${id}`,{method:'PATCH',body:JSON.stringify({name:editName.trim()})});setEditId(null);onRefresh();}finally{setBusy('');}};
  const del=async(id:string,name:string)=>{if(!confirm(`Delete "${name}"?`))return;setBusy(id+'-d');try{await api(`/products/brands/${id}`,{method:'DELETE'});onRefresh();}finally{setBusy('');}};

  return(
    <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="modal" style={{width:560,maxHeight:'85vh',display:'flex',flexDirection:'column'}}>
        {/* Header */}
        <div className="modal-hdr" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div className="modal-ttl">Brand Master</div>
            <div style={{fontSize:11,color:'var(--txt-3)',marginTop:1}}>{brands.length} brands total</div>
          </div>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            {/* Export & Template buttons */}
            <button onClick={exportBrands} title="Export all brands to CSV"
              style={{height:28,padding:'0 10px',background:'var(--ok-bg)',border:'1px solid var(--ok-bdr)',borderRadius:'var(--r-md)',fontSize:11,fontWeight:600,cursor:'pointer',color:'var(--ok)',display:'flex',alignItems:'center',gap:4}}>
              <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export CSV
            </button>
            <button onClick={downloadTemplate} title="Download import template"
              style={{height:28,padding:'0 10px',background:'var(--info-bg)',border:'1px solid var(--info-bdr)',borderRadius:'var(--r-md)',fontSize:11,fontWeight:600,cursor:'pointer',color:'var(--info)',display:'flex',alignItems:'center',gap:4}}>
              <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Template
            </button>
            <button onClick={onClose} style={{width:28,height:28,background:'var(--err-bg)',border:'1px solid var(--err-bdr)',borderRadius:'var(--r-md)',cursor:'pointer',fontSize:14,fontWeight:700,color:'var(--err)'}}>✕</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{display:'flex',borderBottom:'1px solid var(--bdr)',padding:'0 20px'}}>
          {(['list','import'] as const).map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              style={{padding:'9px 14px',fontSize:12,fontWeight:tab===t?600:500,color:tab===t?'var(--brand)':'var(--txt-3)',
                border:'none',borderBottom:`2px solid ${tab===t?'var(--brand)':'transparent'}`,
                background:'none',cursor:'pointer',transition:'color .12s'}}>
              {t==='list'?`📋 Manage (${brands.length})`:'📥 Bulk Import/Edit'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{flex:1,overflowY:'auto',padding:'16px 20px'}}>
          {tab==='list'&&(
            <>
              {/* Add new inline */}
              <div style={{display:'flex',gap:6,marginBottom:12}}>
                <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Type new brand name and press Enter…"
                  onKeyDown={e=>e.key==='Enter'&&add()}
                  style={{...inp,flex:1,height:36}}/>
                <button onClick={add} disabled={busy==='add'||!newName.trim()}
                  style={{height:36,padding:'0 16px',background:'var(--brand)',color:'#fff',border:'none',borderRadius:'var(--r-md)',fontSize:13,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>
                  {busy==='add'?'Adding…':'+ Add Brand'}
                </button>
              </div>

              {/* Search */}
              <div style={{position:'relative',marginBottom:10}}>
                <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--txt-3)',pointerEvents:'none'}}>
                  <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                </span>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search brands…"
                  style={{...inp,width:'100%',height:32,fontSize:12,paddingLeft:30}}/>
              </div>

              {/* Count */}
              <div style={{fontSize:11,color:'var(--txt-3)',marginBottom:8}}>
                {filtered.length} brand{filtered.length!==1?'s':''} {search&&`matching "${search}"`}
              </div>

              {/* Brand list */}
              <div style={{display:'flex',flexDirection:'column',gap:3}}>
                {filtered.map((b,i)=>(
                  <div key={b.id} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',
                    background:i%2===0?'var(--surf-1)':'var(--surf-0)',
                    border:'1px solid var(--bdr-s)',borderRadius:'var(--r-md)'}}>
                    {editId===b.id?(
                      <>
                        <input autoFocus value={editName} onChange={e=>setEditName(e.target.value)}
                          onKeyDown={e=>{if(e.key==='Enter')save(b.id);if(e.key==='Escape')setEditId(null);}}
                          style={{flex:1,height:30,padding:'0 10px',border:'1.5px solid var(--brand)',borderRadius:'var(--r-md)',fontSize:13,outline:'none',boxShadow:'0 0 0 3px rgba(37,99,235,.1)'}}/>
                        <button onClick={()=>save(b.id)} disabled={busy===b.id}
                          style={{height:28,padding:'0 12px',fontSize:12,fontWeight:600,background:'var(--brand)',color:'#fff',border:'none',borderRadius:'var(--r-md)',cursor:'pointer',whiteSpace:'nowrap'}}>
                          {busy===b.id?'Saving…':'✓ Save'}
                        </button>
                        <button onClick={()=>setEditId(null)}
                          style={{height:28,padding:'0 10px',fontSize:12,background:'var(--surf-2)',border:'1px solid var(--bdr)',borderRadius:'var(--r-md)',cursor:'pointer',color:'var(--txt-2)'}}>
                          Cancel
                        </button>
                      </>
                    ):(
                      <>
                        <div style={{width:26,height:26,background:'var(--brand-l)',borderRadius:'var(--r-sm)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                          <span style={{fontSize:11,fontWeight:700,color:'var(--brand)'}}>{b.name[0]?.toUpperCase()}</span>
                        </div>
                        <span style={{flex:1,fontSize:13,fontWeight:500,color:'var(--txt)'}}>{b.name}</span>
                        <button onClick={()=>{setEditId(b.id);setEditName(b.name);}}
                          style={{height:26,padding:'0 10px',fontSize:11,fontWeight:600,background:'var(--surf-0)',border:'1px solid var(--bdr-h)',borderRadius:'var(--r-md)',cursor:'pointer',color:'var(--txt-2)',whiteSpace:'nowrap'}}>
                          ✎ Edit
                        </button>
                        <button onClick={()=>del(b.id,b.name)} disabled={busy===b.id+'-d'}
                          style={{height:26,padding:'0 10px',fontSize:11,fontWeight:600,background:'var(--err-bg)',border:'1px solid var(--err-bdr)',borderRadius:'var(--r-md)',cursor:'pointer',color:'var(--err)',whiteSpace:'nowrap'}}>
                          {busy===b.id+'-d'?'…':'🗑 Delete'}
                        </button>
                      </>
                    )}
                  </div>
                ))}
                {filtered.length===0&&(
                  <div style={{textAlign:'center',padding:'32px 0',color:'var(--txt-3)'}}>
                    <div style={{fontSize:24,marginBottom:8}}>🔍</div>
                    <div style={{fontSize:13}}>{search?`No brands matching "${search}"`:'No brands yet — add one above'}</div>
                  </div>
                )}
              </div>
            </>
          )}

          {tab==='import'&&(
            <>
              {/* Instructions */}
              <div style={{background:'var(--info-bg)',border:'1px solid var(--info-bdr)',borderRadius:'var(--r-md)',padding:'12px 14px',marginBottom:14,fontSize:12,color:'var(--info)',lineHeight:1.6}}>
                <strong>How it works:</strong><br/>
                • Export current brands → edit in Excel → re-import<br/>
                • Or download the template, fill brand names, set Action column<br/>
                • <strong>Action column:</strong> <code style={{background:'rgba(2,132,199,.1)',padding:'1px 5px',borderRadius:3}}>ADD</code> = create new &nbsp;
                <code style={{background:'rgba(2,132,199,.1)',padding:'1px 5px',borderRadius:3}}>UPDATE</code> = rename existing &nbsp;
                <code style={{background:'rgba(2,132,199,.1)',padding:'1px 5px',borderRadius:3}}>DELETE</code> = remove brand
              </div>

              {/* Upload area */}
              {!importRows.length&&!importResult&&(
                <div
                  onClick={()=>document.getElementById('brand-import-file')?.click()}
                  style={{border:'2px dashed var(--bdr)',borderRadius:'var(--r-lg)',padding:'36px 24px',textAlign:'center',cursor:'pointer',transition:'border-color .15s,background .15s'}}
                  onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='var(--brand)';(e.currentTarget as HTMLElement).style.background='var(--brand-l)';}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='var(--bdr)';(e.currentTarget as HTMLElement).style.background='';}}
                >
                  <div style={{fontSize:32,marginBottom:10}}>📂</div>
                  <div style={{fontSize:14,fontWeight:600,color:'var(--txt)',marginBottom:4}}>Click to upload CSV</div>
                  <div style={{fontSize:12,color:'var(--txt-3)'}}>Export first, edit in Excel, then re-upload</div>
                  <input id="brand-import-file" type="file" accept=".csv,.txt" style={{display:'none'}} onChange={handleFile}/>
                </div>
              )}

              {/* Preview */}
              {importRows.length>0&&!importResult&&(
                <>
                  <div style={{fontSize:13,fontWeight:600,marginBottom:10,color:'var(--txt)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span>{importRows.length} rows ready to process</span>
                    <button onClick={()=>setImportRows([])} style={{fontSize:11,background:'none',border:'none',color:'var(--txt-3)',cursor:'pointer'}}>← Upload different file</button>
                  </div>
                  <div style={{border:'1px solid var(--bdr)',borderRadius:'var(--r-md)',overflow:'hidden',marginBottom:12}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                      <thead>
                        <tr style={{background:'var(--surf-1)'}}>
                          <th style={{padding:'7px 12px',textAlign:'left',fontWeight:600,color:'var(--txt-3)',fontSize:10,textTransform:'uppercase',borderBottom:'1px solid var(--bdr)'}}>Brand Name</th>
                          <th style={{padding:'7px 12px',textAlign:'left',fontWeight:600,color:'var(--txt-3)',fontSize:10,textTransform:'uppercase',borderBottom:'1px solid var(--bdr)',width:90}}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.slice(0,15).map((r,i)=>(
                          <tr key={i} style={{borderBottom:'1px solid var(--bdr-s)'}}>
                            <td style={{padding:'7px 12px',fontWeight:500}}>{r.name}</td>
                            <td style={{padding:'7px 12px'}}>
                              <span style={{
                                display:'inline-flex',alignItems:'center',padding:'2px 8px',borderRadius:'var(--r-full)',fontSize:10,fontWeight:700,
                                background:r.action==='DELETE'?'var(--err-bg)':r.action==='UPDATE'?'var(--brand-l)':'var(--ok-bg)',
                                color:r.action==='DELETE'?'var(--err)':r.action==='UPDATE'?'var(--brand)':'var(--ok)',
                              }}>
                                {r.action}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {importRows.length>15&&(
                          <tr><td colSpan={2} style={{padding:'7px 12px',textAlign:'center',color:'var(--txt-3)',fontSize:11}}>…and {importRows.length-15} more</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div style={{display:'flex',gap:8}}>
                    <button onClick={()=>{document.getElementById('brand-import-file')?.click();}}
                      style={{height:34,padding:'0 14px',background:'var(--surf-0)',border:'1px solid var(--bdr)',borderRadius:'var(--r-md)',fontSize:13,cursor:'pointer',color:'var(--txt-2)'}}>
                      Change File
                    </button>
                    <button onClick={runImport} disabled={importBusy}
                      style={{height:34,padding:'0 20px',background:'var(--brand)',color:'#fff',border:'none',borderRadius:'var(--r-md)',fontSize:13,fontWeight:700,cursor:'pointer',flex:1}}>
                      {importBusy?'Processing…':`Apply ${importRows.length} Changes`}
                    </button>
                    <input id="brand-import-file" type="file" accept=".csv,.txt" style={{display:'none'}} onChange={handleFile}/>
                  </div>
                </>
              )}

              {/* Result */}
              {importResult&&(
                <div style={{textAlign:'center',padding:'24px 0'}}>
                  {importResult.error?(
                    <>
                      <div style={{fontSize:32,marginBottom:10}}>❌</div>
                      <div style={{fontSize:14,fontWeight:600,color:'var(--err)',marginBottom:8}}>Import Failed</div>
                      <div style={{fontSize:12,color:'var(--err)',background:'var(--err-bg)',border:'1px solid var(--err-bdr)',borderRadius:'var(--r-md)',padding:'10px 14px'}}>{importResult.error}</div>
                    </>
                  ):(
                    <>
                      <div style={{fontSize:36,marginBottom:12}}>✅</div>
                      <div style={{fontSize:15,fontWeight:700,color:'var(--txt)',marginBottom:14}}>Import Complete</div>
                      <div style={{display:'flex',justifyContent:'center',gap:20,marginBottom:14}}>
                        <div><div style={{fontSize:24,fontWeight:800,color:'var(--ok)'}}>{importResult.created}</div><div style={{fontSize:11,color:'var(--txt-3)'}}>Created</div></div>
                        <div><div style={{fontSize:24,fontWeight:800,color:'var(--brand)'}}>{importResult.updated}</div><div style={{fontSize:11,color:'var(--txt-3)'}}>Updated</div></div>
                        <div><div style={{fontSize:24,fontWeight:800,color:'var(--warn)'}}>{importResult.deleted}</div><div style={{fontSize:11,color:'var(--txt-3)'}}>Deleted</div></div>
                        <div><div style={{fontSize:24,fontWeight:800,color:'var(--err)'}}>{importResult.totalErrors}</div><div style={{fontSize:11,color:'var(--txt-3)'}}>Errors</div></div>
                      </div>
                      {importResult.errors?.length>0&&(
                        <div style={{textAlign:'left',background:'var(--err-bg)',border:'1px solid var(--err-bdr)',borderRadius:'var(--r-md)',padding:'10px 12px',fontSize:11,color:'var(--err)',marginBottom:10}}>
                          {importResult.errors.map((e:string,i:number)=><div key={i}>• {e}</div>)}
                        </div>
                      )}
                    </>
                  )}
                  <button onClick={()=>{setImportRows([]);setImportResult(null);}}
                    style={{height:32,padding:'0 16px',background:'var(--surf-1)',border:'1px solid var(--bdr)',borderRadius:'var(--r-md)',fontSize:12,cursor:'pointer',color:'var(--txt-2)',marginTop:8}}>
                    Import Another File
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Category Master ───────────────────────────────────────────────────────
function CategoryMaster({categories,onClose,onRefresh}:{categories:Category[];onClose:()=>void;onRefresh:()=>void}){
  const [newName,setNewName]=useState('');
  const [busy,setBusy]=useState('');
  const [search,setSearch]=useState('');
  const flat=categories.filter(c=>!c.parentId);
  const filtered=flat.filter(c=>c.name.toLowerCase().includes(search.toLowerCase()));
  const add=async()=>{if(!newName.trim())return;setBusy('add');try{await api('/products/categories',{method:'POST',body:JSON.stringify({name:newName.trim()})});setNewName('');onRefresh();}finally{setBusy('');}};
  const del=async(id:string,name:string)=>{if(!confirm(`Delete "${name}"?`))return;setBusy(id);try{await api(`/products/categories/${id}`,{method:'DELETE'});onRefresh();}finally{setBusy('');}};
  const inp={height:34,padding:'0 10px',border:'1px solid var(--bdr)',borderRadius:'var(--r-md)',fontSize:13,outline:'none'};
  return(
    <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="modal" style={{width:440,maxHeight:'75vh',display:'flex',flexDirection:'column'}}>
        <div className="modal-hdr" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div><div className="modal-ttl">Category Master</div><div style={{fontSize:11,color:'var(--txt-3)',marginTop:1}}>{flat.length} categories</div></div>
          <button onClick={onClose} style={{width:28,height:28,background:'var(--err-bg)',border:'1px solid var(--err-bdr)',borderRadius:'var(--r-md)',cursor:'pointer',fontSize:14,fontWeight:700,color:'var(--err)'}}>✕</button>
        </div>
        <div className="modal-body" style={{flex:1,overflowY:'auto',paddingTop:12}}>
          <div style={{display:'flex',gap:6,marginBottom:10}}>
            <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="New category…"
              onKeyDown={e=>e.key==='Enter'&&add()} style={{...inp,flex:1}}/>
            <button onClick={add} disabled={busy==='add'||!newName.trim()}
              style={{height:34,padding:'0 14px',background:'var(--brand)',color:'#fff',border:'none',borderRadius:'var(--r-md)',fontSize:13,fontWeight:600,cursor:'pointer'}}>
              {busy==='add'?'…':'+ Add'}
            </button>
          </div>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…"
            style={{...inp,width:'100%',height:30,fontSize:12,marginBottom:8}}/>
          {filtered.map(c=>(
            <div key={c.id} style={{display:'flex',alignItems:'center',gap:7,padding:'7px 10px',background:'var(--surf-1)',border:'1px solid var(--bdr-s)',borderRadius:'var(--r-md)',marginBottom:4}}>
              <span style={{flex:1,fontSize:13,fontWeight:500}}>{c.name}</span>
              <button onClick={()=>del(c.id,c.name)} disabled={busy===c.id}
                style={{height:24,padding:'0 8px',fontSize:11,background:'none',border:'1px solid var(--err-bdr)',borderRadius:'var(--r-sm)',cursor:'pointer',color:'var(--err)'}}>
                {busy===c.id?'…':'Delete'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Drawer ────────────────────────────────────────────────────────────────
function Drawer({pid,brands,categories,onClose,onUpdated}:{pid:string;brands:Brand[];categories:Category[];onClose:()=>void;onUpdated:()=>void}){
  const [p,setP]=useState<any>(null);
  const [tab,setTab]=useState<'info'|'stock'|'history'>('info');
  const load=()=>api<any>(`/products/${pid}`).then(setP).catch(console.error);
  useEffect(()=>{load();},[pid]);
  const save=async(field:string,value:any)=>{await api(`/products/${pid}`,{method:'PATCH',body:JSON.stringify({[field]:value})});load();onUpdated();};
  const qty=p?stockQty(p):0;
  const FRow=({label,val,field,type='text',opts}:{label:string;val:string;field:string;type?:string;opts?:{v:string;l:string}[]})=>{
    const [ed,setEd]=useState(false);const [v,setV]=useState(val);const [busy,setBusy]=useState(false);
    const go=async(nv:string)=>{setBusy(true);try{await save(field,type==='number'?parseFloat(nv):nv);}finally{setBusy(false);setEd(false);}};
    return(
      <div className="info-field">
        <div className="info-lbl" style={{display:'flex',justifyContent:'space-between'}}>
          {label}
          {!ed&&<span onClick={()=>{setV(val);setEd(true);}} style={{fontSize:10,color:'var(--brand)',cursor:'pointer',fontWeight:600}}>Edit</span>}
        </div>
        {ed?(
          <div style={{marginTop:4}}>
            {opts?(<select autoFocus value={v} onChange={e=>setV(e.target.value)} style={{width:'100%',height:28,padding:'0 6px',border:'1px solid var(--brand)',borderRadius:'var(--r-sm)',fontSize:12,outline:'none'}}>
              {opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
            </select>):(<input autoFocus type={type} value={v} onChange={e=>setV(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter')go(v);if(e.key==='Escape')setEd(false);}}
              style={{width:'100%',height:28,padding:'0 8px',border:'1px solid var(--brand)',borderRadius:'var(--r-sm)',fontSize:12,outline:'none'}}/>)}
            <div style={{display:'flex',gap:4,marginTop:4}}>
              <button onClick={()=>go(v)} disabled={busy} style={{height:22,padding:'0 8px',fontSize:11,fontWeight:600,background:'var(--brand)',color:'#fff',border:'none',borderRadius:'var(--r-sm)',cursor:'pointer'}}>{busy?'…':'Save'}</button>
              <button onClick={()=>setEd(false)} style={{height:22,padding:'0 6px',fontSize:11,background:'var(--surf-2)',border:'1px solid var(--bdr)',borderRadius:'var(--r-sm)',cursor:'pointer',color:'var(--txt-2)'}}>Cancel</button>
            </div>
          </div>
        ):<div className="info-val">{val||'—'}</div>}
      </div>
    );
  };
  return(
    <>
      <div className="drawer-overlay" onClick={onClose}/>
      <aside className="drawer">
        {!p?(<div style={{display:'flex',alignItems:'center',justifyContent:'center',flex:1,gap:10,color:'var(--txt-3)'}}><div className="spinner"/>Loading…</div>):(
          <>
            <div className="drawer-hdr">
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:10}}>
                <div style={{flex:1,minWidth:0}}>
                  <div className="drawer-ean">{p.ean}</div>
                  <div className="drawer-title">{p.model}</div>
                  <div className="drawer-meta">
                    <span className={S_CLS[p.status as Status]}>{S_LBL[p.status as Status]}</span>
                    <span style={{fontSize:11,color:'var(--txt-3)'}}>{p.brand}</span>
                  </div>
                </div>
                <button onClick={onClose} style={{width:34,height:34,flexShrink:0,background:'var(--err-bg)',border:'2px solid var(--err)',borderRadius:'var(--r-md)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:18,fontWeight:800,color:'var(--err)'}}>✕</button>
              </div>
            </div>
            <div className="drawer-tabs">
              {(['info','stock','history'] as const).map(t=>(<button key={t} className={`drawer-tab${tab===t?' on':''}`} onClick={()=>setTab(t)}>{t==='info'?'General':t==='stock'?'Stock':'History'}</button>))}
            </div>
            <div className="drawer-body">
              {tab==='info'&&(
                <>
                  <div style={{background:'var(--surf-1)',border:'1px solid var(--bdr-s)',borderRadius:'var(--r-md)',padding:'10px 12px',marginBottom:12}}>
                    <div style={{fontSize:10,fontWeight:700,color:'var(--txt-3)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:8}}>Product Status — click to change</div>
                    <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                      {(['ACTIVE','INACTIVE','DISCONTINUED','OPEN_BOX_ONLY','BLOCKED'] as Status[]).map(s=>(
                        <button key={s} onClick={()=>save('status',s)}
                          style={{height:26,padding:'0 10px',fontSize:11,fontWeight:600,cursor:'pointer',borderRadius:'var(--r-full)',
                            background:p.status===s?'var(--brand)':'var(--surf-0)',color:p.status===s?'#fff':'var(--txt-2)',
                            border:`1.5px solid ${p.status===s?'var(--brand)':'var(--bdr)'}`}}>
                          {S_LBL[s]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="info-grid">
                    <FRow label="Product Name" val={p.model} field="model"/>
                    <FRow label="Brand" val={p.brand||'—'} field="brand"
                      opts={brands.length?[{v:'',l:'Select…'},...brands.map(b=>({v:b.name,l:b.name}))]:undefined}/>
                    <FRow label="Category" val={p.category?.name||'—'} field="categoryId"
                      opts={[{v:'',l:'No category'},...categories.filter(c=>!c.parentId).map(c=>({v:c.id,l:c.name}))]}/>
                    <div className="info-field"><div className="info-lbl">EAN</div><div className="info-val mono">{p.ean}</div></div>
                    <FRow label="MRP ₹" val={String(Number(p.sellingPrice).toFixed(0))} field="sellingPrice" type="number"/>
                    <FRow label="Cost Price ₹" val={String(Number(p.costPrice).toFixed(0))} field="costPrice" type="number"/>
                  </div>
                </>
              )}
              {tab==='stock'&&(
                <>
                  <div className="stock-total"><div className="stock-total-lbl">Total Stock</div><div className="stock-total-val">{qty.toLocaleString()} units</div></div>
                  {(p.stockLevels||[]).length===0&&<div className="empty"><div className="empty-ico">📦</div><div className="empty-ttl">No warehouse stock</div></div>}
                  {(p.stockLevels||[]).map((sl:StockLevel)=>(
                    <div key={sl.id} className="wh-row">
                      <div><div className="wh-name">{sl.warehouse?.name||'Main Warehouse'}</div><div className="wh-code">{sl.warehouse?.code}</div></div>
                      <div className={`wh-qty ${sl.quantity===0?'b':sl.quantity<=(p.minStock||3)?'w':'g'}`}>{sl.quantity}</div>
                    </div>
                  ))}
                </>
              )}
              {tab==='history'&&(
                <>
                  {(p.history||[]).length===0&&<div className="empty"><div className="empty-ico">📋</div><div className="empty-ttl">No history yet</div></div>}
                  {(p.history||[]).map((h:any)=>(
                    <div key={h.id} className="hist-item">
                      <div className={`hist-dot ${h.action?.toLowerCase()}`}/>
                      <div style={{flex:1}}><div className="hist-action">{h.action}</div><div className="hist-time">{new Date(h.createdAt).toLocaleString('en-IN')}</div>
                        {h.newValue&&<div className="hist-json">{JSON.stringify(h.newValue,null,2)}</div>}</div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}

// ── Reusable dropdown ─────────────────────────────────────────────────────
function DD({label,btnCls,children}:{label:string;btnCls?:string;children:React.ReactNode}){
  const [open,setOpen]=useState(false);const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{const h=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false);};document.addEventListener('mousedown',h);return()=>document.removeEventListener('mousedown',h);},[]);
  return(<div style={{position:'relative',display:'inline-block'}} ref={ref}>
    <button className={`btn ${btnCls||'btn-secondary'}`} style={{fontSize:12,height:32,padding:'0 10px'}} onClick={()=>setOpen(o=>!o)}>{label}</button>
    {open&&<div className="dd-menu">{children}</div>}
  </div>);
}

// ── MAIN ──────────────────────────────────────────────────────────────────
export default function Products(){
  const [products,setProducts]=useState<Paged<Product>|null>(null);
  const [editCell,setEditCell]=useState<{id:string;field:'status'|'costPrice'|'sellingPrice'}|null>(null);
  const [editVal,setEditVal]=useState<string>('');
  const [savingCell,setSavingCell]=useState(false);
  const [stats,setStats]=useState<Stats|null>(null);
  const [brands,setBrands]=useState<Brand[]>([]);
  const [categories,setCategories]=useState<Category[]>([]);
  const [views,setViews]=useState<SavedView[]>([]);
  const [loading,setLoading]=useState(true);
  const [bgLoad,setBgLoad]=useState(false);
  const [error,setError]=useState('');

  const [search,setSearch]=useState('');
  const [brandF,setBrandF]=useState('');
  const [catF,setCatF]=useState('');
  const [statusF,setStatusF]=useState('');
  const [lowStock,setLowStock]=useState(false);  // < 3 units
  const [outOfStock,setOutOfStock]=useState(false);
  const [sortKey,setSortKey]=useState('updatedAt:desc');
  const [page,setPage]=useState(1);
  const [limit,setLimit]=useState(50);

  const [sel,setSel]=useState<Set<string>>(new Set());
  const [bulkAction,setBulkAction]=useState('');
  const [bulkVal,setBulkVal]=useState('');
  const [bulkBusy,setBulkBusy]=useState(false);
  // v3 = MRP before Cost + Last Updated in defaults. Bumping clears old saved order.
  const COLS_VER = 'v3';
  const [visCols,setVisCols]=useState<string[]>(()=>{
    try{
      const saved=localStorage.getItem('erp_cols');
      const ver=localStorage.getItem('erp_cols_ver');
      if(saved&&ver===COLS_VER) return JSON.parse(saved);
      // Version mismatch — clear old and use new defaults
      localStorage.removeItem('erp_cols');
      localStorage.setItem('erp_cols_ver',COLS_VER);
      return DEF_COLS;
    }catch{return DEF_COLS;}
  });
  const [drawer,setDrawer]=useState<string|null>(null);
  const [showBrandMaster,setShowBrandMaster]=useState(false);
  const [showCatMaster,setShowCatMaster]=useState(false);
  const [showAddProduct,setShowAddProduct]=useState(false);
  const [showBulkImport,setShowBulkImport]=useState(false);
  const [toast,setToast]=useState('');
  const [syncing,setSyncing]=useState(false);
  // ── Column drag (refs updated after saveCols declared below) ──
  const [dragCol,setDragCol]=useState<string|null>(null);
  const [dragOver,setDragOver]=useState<string|null>(null);
  const [dragPos,setDragPos]=useState({x:0,y:0});
  const dragColRef=useRef<string|null>(null);
  const dragOverRef=useRef<string|null>(null);
  const dragStateRef=useRef<{visCols:string[];saveCols:(c:string[])=>void}>({visCols:[],saveCols:()=>{}});
  // Custom status display labels (stored in localStorage)
  const [statusLabels,setStatusLabels]=useState<Record<string,string>>(()=>{
    try{return JSON.parse(localStorage.getItem('erp_status_labels')||'null')||{};}catch{return {};}
  });
  const getStatusLabel=(s:string)=>statusLabels[s]||S_LBL[s as Status]||s;
  const [showStatusMgr,setShowStatusMgr]=useState(false);
  const [resetting,setResetting]=useState(false);
  const dbRef=useRef<ReturnType<typeof setTimeout>>();

  const showT=(msg:string)=>{setToast(msg);setTimeout(()=>setToast(''),3500);};
  const [sortBy,sortDir]=(sortKey+':desc').split(':') as [string,'asc'|'desc'];

  const loadMeta=useCallback(async()=>{
    const [b,c,v,s]=await Promise.allSettled([api<Brand[]>('/products/brands/list'),api<Category[]>('/products/categories'),api<SavedView[]>('/products/views'),api<Stats>('/products/stats')]);
    if(b.status==='fulfilled'&&Array.isArray(b.value))setBrands(b.value);
    if(c.status==='fulfilled'&&Array.isArray(c.value))setCategories(c.value);
    if(v.status==='fulfilled'&&Array.isArray(v.value))setViews(v.value);
    if(s.status==='fulfilled'&&s.value)setStats(s.value as Stats);
  },[]);

  const currentFilters=useMemo(()=>({
    search:search||undefined,brand:brandF||undefined,categoryId:catF||undefined,status:statusF||undefined,
    // lowStock = products with stock 1-3; outOfStock = 0
    lowStock:lowStock||undefined,outOfStock:outOfStock||undefined,
    sortBy:sortBy||undefined,sortDir,
  }),[search,brandF,catF,statusF,lowStock,outOfStock,sortBy,sortDir]);

  const loadProducts=useCallback(async()=>{
    setBgLoad(true);setError('');
    try{const data=await api<Paged<Product>>(`/products${qs({...currentFilters,page,limit})}`);setProducts(data);}
    catch(e:any){setError(e.message||'Failed');}
    finally{setLoading(false);setBgLoad(false);}
  },[currentFilters,page,limit]);

  useEffect(()=>{loadMeta();},[loadMeta]);
  useEffect(()=>{clearTimeout(dbRef.current);dbRef.current=setTimeout(()=>loadProducts(),search?350:0);return()=>clearTimeout(dbRef.current);},[loadProducts]);

  const reset=()=>{setSearch('');setBrandF('');setCatF('');setStatusF('');setLowStock(false);setOutOfStock(false);setPage(1);setSel(new Set());};
  const hasF=!!(search||brandF||catF||statusF||lowStock||outOfStock);
  const toggleSel=(id:string)=>setSel(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  const selAll=()=>setSel(prev=>prev.size===(products?.items.length||0)?new Set():new Set(products?.items.map(p=>p.id)||[]));
  const saveCols=(cols:string[])=>{setVisCols(cols);localStorage.setItem('erp_cols',JSON.stringify(cols));};

  // Keep dragStateRef current (declared here, after saveCols)
  dragStateRef.current={visCols,saveCols};

  const startColDrag=useCallback((colKey:string,e:React.MouseEvent)=>{
    e.preventDefault();
    dragColRef.current=colKey;
    dragOverRef.current=null;
    setDragCol(colKey);setDragOver(null);
    setDragPos({x:e.clientX,y:e.clientY});

    const findColAtPoint=(x:number,y:number)=>{
      // Query ALL rendered column headers and check geometry
      const headers=document.querySelectorAll<HTMLElement>('[data-colkey]');
      for(const th of headers){
        const r=th.getBoundingClientRect();
        if(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom){
          return th.getAttribute('data-colkey');
        }
      }
      return null;
    };

    const onMove=(ev:MouseEvent)=>{
      setDragPos({x:ev.clientX,y:ev.clientY});
      const key=findColAtPoint(ev.clientX,ev.clientY);
      if(key&&key!==dragColRef.current&&dragOverRef.current!==key){
        dragOverRef.current=key;
        setDragOver(key);
      }
    };

    const onUp=(ev:MouseEvent)=>{
      // Final check at release point
      const key=findColAtPoint(ev.clientX,ev.clientY);
      if(key&&key!==dragColRef.current) dragOverRef.current=key;

      const from=dragColRef.current;
      const to=dragOverRef.current;
      if(from&&to&&from!==to){
        const {visCols:vc,saveCols:sc}=dragStateRef.current;
        const cols=[...vc];
        const fi=cols.indexOf(from),ti=cols.indexOf(to);
        if(fi>=0&&ti>=0){
          cols.splice(fi,1);
          cols.splice(ti,0,from);
          sc(cols);
        }
      }
      dragColRef.current=null;dragOverRef.current=null;
      setDragCol(null);setDragOver(null);
      document.removeEventListener('mousemove',onMove);
      document.removeEventListener('mouseup',onUp);
    };

    document.addEventListener('mousemove',onMove);
    document.addEventListener('mouseup',onUp);
  },[]);
  const cols=useMemo(()=>ALL_COLS.filter(c=>visCols.includes(c.key)),[visCols]);

  // Bulk apply
  const doBulk=async()=>{
    if(!bulkAction||(!bulkVal&&bulkAction!=='imei_on'&&bulkAction!=='imei_off'))return;
    setBulkBusy(true);
    try{
      const d:any={};
      if(bulkAction==='status')d.status=bulkVal;
      if(bulkAction==='brand'){const b=brands.find(x=>x.id===bulkVal);d.brandId=bulkVal;d.brand=b?.name||bulkVal;}
      if(bulkAction==='category')d.categoryId=bulkVal;
      await api('/products/bulk',{method:'POST',body:JSON.stringify({ids:[...sel],...d})});
      showT(`Updated ${sel.size} products`);setSel(new Set());setBulkAction('');setBulkVal('');loadProducts();loadMeta();
    }catch(e:any){showT('Error: '+e.message);}finally{setBulkBusy(false);}
  };

  const del=async(id:string)=>{if(!confirm('Delete this product?'))return;await api(`/products/${id}`,{method:'DELETE'});showT('Deleted');loadProducts();};

  const handleExport=async(selectedOnly=false)=>{
    const selectedProds=selectedOnly?items.filter(p=>sel.has(p.id)):[];
    try{
      await exportProducts(currentFilters,visCols,products?.total||0,selectedOnly?selectedProds:undefined);
      showT(selectedOnly?`Downloaded ${selectedProds.length} products`:'Download started ✓');
    }catch(e:any){showT('Export error: '+(e.message||'Unknown error'));}
  };

  const handleSyncBrands=async()=>{setSyncing(true);try{const r=await api<any>('/products/brands/sync',{method:'POST'});showT(`✓ ${r.created} brands synced`);loadMeta();}catch(e:any){showT('Sync error: '+e.message);}finally{setSyncing(false);}};

  const handleResetStock=async()=>{
    if(!confirm('Set ALL product stock to ZERO?\n\nThis will reset inventory for every product in every warehouse. Cannot be undone.'))return;
    setResetting(true);
    try{const r=await api<any>('/inventory/reset-all-stock',{method:'POST'});showT(`✓ Reset ${r.reset} stock entries to zero`);}
    catch(e:any){showT('Error: '+e.message);}finally{setResetting(false);}
  };

  const [deletingAll,setDeletingAll]=useState(false);
  const handleDeleteAll=async()=>{
    const total=products?.total||0;
    const confirmed=confirm(
      `⚠️ PERMANENTLY DELETE ALL ${total.toLocaleString()} PRODUCTS?\n\n`+
      `This will delete every product in the system, and remove any brand or category that has no other products left.\n\n`+
      `This action CANNOT be undone. Type OK to confirm.`
    );
    if(!confirmed)return;
    setDeletingAll(true);
    try{
      const r=await api<any>('/products/delete-all',{method:'DELETE'});
      showT(`Deleted ${r.deleted} products · removed ${r.brandsRemoved||0} brands · ${r.categoriesRemoved||0} categories`);
      setSel(new Set());loadProducts();loadMeta();
    }catch(e:any){showT('Error: '+e.message);}
    finally{setDeletingAll(false);}
  };

  const handleDedup=async()=>{
    if(!confirm('Merge duplicate category names?'))return;
    try{const r=await api<any>('/products/categories/dedup',{method:'POST'});showT(`Merged ${r.deduplicated} duplicates`);loadMeta();}
    catch(e:any){showT('Error: '+e.message);}
  };

  const kpiClick=(key:string)=>{reset();if(key==='active')setStatusF('ACTIVE');if(key==='low')setLowStock(true);if(key==='out')setOutOfStock(true);};

  const applyView=(v:SavedView)=>{const f=v.filters||{};setSearch(f.search||'');setBrandF(f.brand||'');setCatF(f.categoryId||'');setStatusF(f.status||'');setLowStock(!!f.lowStock);setOutOfStock(!!f.outOfStock);if(v.columns?.length)setVisCols(v.columns);if(v.sortBy&&v.sortDir)setSortKey(v.sortBy+':'+v.sortDir);setPage(1);};
  const saveView=async(name:string)=>{const v=await api<SavedView>('/products/views',{method:'POST',body:JSON.stringify({name,filters:currentFilters,columns:visCols,sortBy,sortDir})});setViews(prev=>[...prev,v]);showT('View saved');};
  const delView=async(id:string)=>{await api(`/products/views/${id}`,{method:'DELETE'});setViews(prev=>prev.filter(v=>v.id!==id));};

  const items=products?.items??[];
  const allSel=items.length>0&&sel.size===items.length;

  // Optimistically patch one field on one product, then sync with server.
  const patchField=async(p:Product,field:'status'|'costPrice'|'sellingPrice',value:string)=>{
    const payload:any=field==='status'?{status:value}:{[field]:Number(value)};
    setSavingCell(true);
    // optimistic UI update
    setProducts(prev=>prev?{...prev,items:prev.items.map(it=>it.id===p.id?{...it,...payload} as Product:it)}:prev);
    try{
      await api(`/products/${p.id}`,{method:'PATCH',body:JSON.stringify(payload)});
      showT('Saved ✓');
    }catch(e:any){
      showT('Save failed: '+e.message);
      loadProducts(); // revert to server truth on failure
    }finally{
      setSavingCell(false);setEditCell(null);
    }
  };

  const cellVal=(p:Product,key:string)=>{
    if(key==='model')return<span style={{fontWeight:500,cursor:'pointer'}} onClick={()=>setDrawer(p.id)}>{p.model}</span>;
    if(key==='ean')return<span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--txt-2)'}}>{p.ean}</span>;

    if(key==='status'){
      const isEditing=editCell?.id===p.id&&editCell.field==='status';
      if(isEditing)return(
        <select autoFocus value={p.status} disabled={savingCell}
          onChange={e=>patchField(p,'status',e.target.value)}
          onBlur={()=>setEditCell(null)}
          style={{fontSize:12,padding:'2px 4px',borderRadius:'var(--r-sm)',border:'1px solid var(--brand)',outline:'none',cursor:'pointer'}}
          onClick={e=>e.stopPropagation()}>
          {(['ACTIVE','INACTIVE','DISCONTINUED','OPEN_BOX_ONLY','BLOCKED'] as Status[]).map(s=><option key={s} value={s}>{getStatusLabel(s)}</option>)}
        </select>
      );
      return(
        <span className={S_CLS[p.status]} style={{cursor:'pointer'}} title="Click to change status"
          onClick={e=>{e.stopPropagation();setEditCell({id:p.id,field:'status'});}}>
          {getStatusLabel(p.status)}
        </span>
      );
    }

    if(key==='stock'){const q=stockQty(p);return<span className={`spill ${q===0?'spill-out':q<=3?'spill-low':'spill-in'}`}>{q}</span>;}

    if(key==='costPrice'||key==='sellingPrice'){
      const isEditing=editCell?.id===p.id&&editCell.field===key;
      const raw=key==='costPrice'?p.costPrice:p.sellingPrice;
      if(isEditing)return(
        <span style={{display:'inline-flex',alignItems:'center',gap:4}} onClick={e=>e.stopPropagation()}>
          <input type="number" autoFocus value={editVal} disabled={savingCell}
            onChange={e=>setEditVal(e.target.value)}
            onKeyDown={e=>{
              if(e.key==='Enter'&&editVal)patchField(p,key,editVal);
              if(e.key==='Escape')setEditCell(null);
            }}
            style={{width:74,fontSize:13,padding:'3px 6px',borderRadius:'var(--r-sm)',border:'1px solid var(--brand)',outline:'none'}}/>
          <button title="Save" disabled={savingCell||!editVal} onClick={()=>patchField(p,key,editVal)}
            style={{width:22,height:22,display:'flex',alignItems:'center',justifyContent:'center',border:'none',borderRadius:'var(--r-sm)',background:'var(--ok-bg)',color:'var(--ok)',cursor:'pointer',fontSize:12,fontWeight:700}}>✓</button>
          <button title="Cancel" disabled={savingCell} onClick={()=>setEditCell(null)}
            style={{width:22,height:22,display:'flex',alignItems:'center',justifyContent:'center',border:'none',borderRadius:'var(--r-sm)',background:'var(--err-bg)',color:'var(--err)',cursor:'pointer',fontSize:11,fontWeight:700}}>✕</button>
        </span>
      );
      return(
        <span style={{display:'inline-flex',alignItems:'center',gap:5,fontVariantNumeric:'tabular-nums',cursor:'pointer'}}
          onClick={e=>{e.stopPropagation();setEditVal(String(Number(raw)));setEditCell({id:p.id,field:key as any});}}
          title="Click to edit">
          {fmt(raw)}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{opacity:.45}}>
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </span>
      );
    }

    if(key==='brand')return<span style={{fontSize:13,color:'var(--txt-2)'}}>{p.brand||'—'}</span>;
    if(key==='category')return<span style={{fontSize:12,color:'var(--txt-2)'}}>{p.category?.name||'—'}</span>;
    if(key==='vendor')return<span style={{fontSize:12,color:'var(--txt-2)'}}>{p.vendor?.name||'—'}</span>;
    if(key==='updatedAt')return<span style={{fontSize:11,color:'var(--txt-3)'}}>{fmtDate(p.updatedAt)}</span>;
    return<span style={{fontSize:13,color:'var(--txt-2)'}}>{String((p as any)[key]??'—')}</span>;
  };

  return(
    <>
      {bgLoad&&<div className="loading-bar"/>}

      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Product Master</div>
          <div className="page-subtitle">{products?`${products.total.toLocaleString()} products`:'Loading…'}{hasF&&' · filtered'}</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={()=>setShowAddProduct(true)} style={{fontSize:12,height:32,padding:'0 12px'}}>+ Add Product</button>
          <button className="btn btn-secondary" onClick={()=>setShowBrandMaster(true)} style={{fontSize:12,height:32,padding:'0 10px'}}>🏷 Brands</button>
          <button className="btn btn-secondary" onClick={()=>setShowCatMaster(true)} style={{fontSize:12,height:32,padding:'0 10px'}}>📂 Categories</button>
          <button className="btn btn-secondary" onClick={()=>setShowStatusMgr(true)} style={{fontSize:12,height:32,padding:'0 10px'}}>🔵 Status</button>
          <button className="btn btn-secondary" onClick={()=>{loadMeta();loadProducts();showT('Refreshed ✓');}} style={{fontSize:12,height:32,padding:'0 10px'}} title="Refresh all data">🔄 Refresh</button>

          <DD label="Import/Export">
            <button className="dd-item" onClick={()=>setShowBulkImport(true)}>⬆ Bulk Import (CSV)</button>
            <button className="dd-item" onClick={downloadTemplate}>📄 Download Template</button>
            <button className="dd-item" onClick={()=>handleExport(false)}>⬇ Export All / Filtered (CSV)</button>
          </DD>

          <DD label="Tools ▾">
            <button className="dd-item" onClick={handleResetStock} disabled={resetting} style={{color:'var(--err)'}}>{resetting?'Resetting…':'⚠ Reset All Stock to Zero'}</button>
            <hr className="dd-divider"/>
            <button className="dd-item" onClick={handleDeleteAll} disabled={deletingAll} style={{color:'var(--err)',fontWeight:700}}>{deletingAll?'Deleting…':'🗑️ Delete ALL Products'}</button>
          </DD>

          <DD label={`Views${views.length>0?` (${views.length})`:''}`}>
            <div className="dd-lbl">Saved Views</div>
            {views.length===0&&<div style={{padding:'6px 9px',fontSize:12,color:'var(--txt-3)'}}>No views yet</div>}
            {views.map(v=>(<div key={v.id} style={{display:'flex',alignItems:'center',padding:'5px 9px',gap:6}}><span style={{flex:1,fontSize:12,cursor:'pointer'}} onClick={()=>applyView(v)}>{v.name}</span><button style={{background:'none',border:'none',color:'var(--txt-3)',fontSize:11,cursor:'pointer',padding:'1px 4px'}} onClick={()=>delView(v.id)}>✕</button></div>))}
            <hr className="dd-divider"/>
            <div className="dd-save-row">
              <input className="dd-save-inp" placeholder="Save current view…" onKeyDown={async e=>{if(e.key==='Enter'){await saveView((e.target as HTMLInputElement).value);(e.target as HTMLInputElement).value='';}}}/>
              <button className="dd-save-btn" onClick={async e=>{const i=(e.currentTarget.previousSibling as HTMLInputElement);if(i.value){await saveView(i.value);i.value='';}}}>Save</button>
            </div>
          </DD>

          <button className={`btn ${sel.size>0?'btn-primary':'btn-secondary'}`}
            disabled={sel.size===0} onClick={()=>setSel(prev=>prev.size>0&&sel.size>0?prev:new Set(products?.items.map(p=>p.id)||[]))}
            style={{fontSize:12,height:32,padding:'0 10px'}}>
            Bulk Edit{sel.size>0&&` (${sel.size})`}
          </button>
        </div>
      </div>

      <div className="page-body">
        {/* KPI Cards */}
        <div className="kpi-grid">
          {[
            {ico:'📦',val:stats?.total,lbl:'Total Products',clr:'',key:''},
            {ico:'✅',val:stats?.active,lbl:'Active ↗',clr:'var(--ok)',key:'active'},
            {ico:'🟡',val:stats?.lowStock,lbl:'With Stock ↗',clr:'var(--warn)',key:'low'},
            {ico:'🚫',val:stats?.outOfStock,lbl:'Zero Stock ↗',clr:'var(--err)',key:'out'},
            {ico:'🏷',val:brands.length,lbl:'Brands ↗',clr:'#7c3aed',key:'brands'},
            {ico:'📂',val:categories.length,lbl:'Categories ↗',clr:'var(--info)',key:'cats'},
          ].map(k=>(
            <div key={k.lbl} className="kpi-card" style={{cursor:k.key?'pointer':'default'}}
              onClick={()=>{if(k.key==='brands')setShowBrandMaster(true);else if(k.key==='cats')setShowCatMaster(true);else if(k.key)kpiClick(k.key);}}>
              <div className="kpi-icon" style={{background:'#f8fafc',fontSize:15}}>{k.ico}</div>
              <div className="kpi-value" style={k.clr?{color:k.clr}:{}}>{k.val?.toLocaleString()??'—'}</div>
              <div className="kpi-label">{k.lbl}</div>
            </div>
          ))}
        </div>

        {/* Search + Sort row */}
        <div className="filter-bar">
          <div className="search-row">
            <div className="search-wrap">
              <span className="search-icon"><svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></span>
              <input className="search-input" placeholder="Search EAN, product name, brand, category…" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/>
            </div>
            <select className="f-select" value={sortKey} onChange={e=>setSortKey(e.target.value)} style={{maxWidth:190,marginLeft:'auto'}}>
              {SORT_OPTIONS.map(o=><option key={o.val} value={o.val}>{o.label}</option>)}
            </select>
            {hasF&&<button className="f-clear" onClick={reset}>✕ Clear</button>}
          </div>

          {/* Filter chips */}
          <div className="filter-row">
            <select className="f-select" value={brandF} onChange={e=>{setBrandF(e.target.value);setPage(1);}}>
              <option value="">All Brands</option>
              <option value="__blank__">— No Brand —</option>
              {brands.map(b=><option key={b.id} value={b.name}>{b.name}</option>)}
            </select>
            <select className="f-select" value={catF} onChange={e=>{setCatF(e.target.value);setPage(1);}}>
              <option value="">All Categories</option>
              <option value="__blank__">— No Category —</option>
              {categories.filter(c=>!c.parentId).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="f-select" value={statusF} onChange={e=>{setStatusF(e.target.value);setPage(1);}}>
              <option value="">All Status</option>
              {(['ACTIVE','INACTIVE','DISCONTINUED','OPEN_BOX_ONLY','BLOCKED'] as Status[]).map(s=><option key={s} value={s}>{getStatusLabel(s)}</option>)}
            </select>
            <button className={`f-toggle${lowStock?' on-warn':''}`} onClick={()=>{setLowStock(v=>!v);setOutOfStock(false);setPage(1);}}>⚠ Low Stock (&lt;3)</button>
            <button className={`f-toggle${outOfStock?' on-err':''}`} onClick={()=>{setOutOfStock(v=>!v);setLowStock(false);setPage(1);}}>🚫 Zero Stock</button>
          </div>
        </div>


        {/* Bulk edit bar - only when items selected */}
        {sel.size>0&&(
          <div style={{background:'#1e293b',borderRadius:'var(--r-lg)',padding:'10px 14px',display:'flex',alignItems:'center',gap:10,marginBottom:10,flexWrap:'wrap',animation:'fadeUp .2s ease'}}>
            <span style={{fontSize:12,fontWeight:700,color:'#fff',background:'var(--brand)',padding:'2px 10px',borderRadius:'var(--r-full)'}}>{sel.size} selected</span>

            {/* Custom bulk action buttons - NOT a native select */}
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {[
                {k:'status',l:'Change Status'},
                {k:'brand',l:'Change Brand'},
                {k:'category',l:'Change Category'},
              ].map(a=>(
                <button key={a.k} onClick={()=>setBulkAction(bulkAction===a.k?'':a.k)}
                  style={{height:28,padding:'0 10px',fontSize:11,fontWeight:600,cursor:'pointer',borderRadius:'var(--r-md)',
                    background:bulkAction===a.k?'var(--brand)':'rgba(255,255,255,.12)',
                    color:'#fff',border:`1px solid ${bulkAction===a.k?'var(--brand)':'rgba(255,255,255,.2)'}`}}>
                  {a.l}
                </button>
              ))}
            </div>

            {/* Value select based on chosen action */}
            {bulkAction==='status'&&(
              <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                {(['ACTIVE','INACTIVE','DISCONTINUED','OPEN_BOX_ONLY','BLOCKED'] as Status[]).map(s=>(
                  <button key={s} onClick={()=>setBulkVal(bulkVal===s?'':s)}
                    style={{height:26,padding:'0 8px',fontSize:11,fontWeight:600,cursor:'pointer',borderRadius:'var(--r-full)',
                      background:bulkVal===s?'var(--brand)':'rgba(255,255,255,.1)',color:'#fff',border:`1px solid ${bulkVal===s?'var(--brand)':'rgba(255,255,255,.2)'}`}}>
                    {S_LBL[s]}
                  </button>
                ))}
              </div>
            )}
            {bulkAction==='brand'&&brands.length>0&&(
              <select value={bulkVal} onChange={e=>setBulkVal(e.target.value)}
                style={{height:28,padding:'0 8px',background:'rgba(255,255,255,.15)',border:'1px solid rgba(255,255,255,.3)',borderRadius:'var(--r-md)',color:'#fff',fontSize:12,outline:'none'}}>
                <option value="">Select brand…</option>
                {brands.map(b=><option key={b.id} value={b.id} style={{color:'#000',background:'#fff'}}>{b.name}</option>)}
              </select>
            )}
            {bulkAction==='category'&&(
              <select value={bulkVal} onChange={e=>setBulkVal(e.target.value)}
                style={{height:28,padding:'0 8px',background:'rgba(255,255,255,.15)',border:'1px solid rgba(255,255,255,.3)',borderRadius:'var(--r-md)',color:'#fff',fontSize:12,outline:'none'}}>
                <option value="">Select category…</option>
                {categories.filter(c=>!c.parentId).map(c=><option key={c.id} value={c.id} style={{color:'#000',background:'#fff'}}>{c.name}</option>)}
              </select>
            )}

            {bulkAction&&bulkVal&&(
              <button onClick={doBulk} disabled={bulkBusy}
                style={{height:28,padding:'0 14px',background:'#16a34a',color:'#fff',border:'none',borderRadius:'var(--r-md)',fontSize:12,fontWeight:700,cursor:'pointer'}}>
                {bulkBusy?'Applying…':'✓ Apply to all'}
              </button>
            )}

            <button
              onClick={async()=>{
                const selectedProducts=items.filter(p=>sel.has(p.id));
                try{
                  await exportProducts(currentFilters,visCols,0,selectedProducts);
                  showT(`Downloaded ${selectedProducts.length} products`);
                }catch(e:any){showT('Download failed: '+e.message);}
              }}
              style={{height:28,padding:'0 12px',background:'rgba(255,255,255,.12)',border:'1px solid rgba(255,255,255,.2)',borderRadius:'var(--r-md)',fontSize:11,fontWeight:600,cursor:'pointer',color:'#fff'}}>
              ⬇ Download Selected
            </button>
            <button onClick={async()=>{
                if(!window.confirm(`Permanently delete ${sel.size} product(s)? This cannot be undone.`))return;
                try{
                  const ids=[...sel];
                  const r=await api<any>('/products/bulk-delete',{method:'DELETE',body:JSON.stringify({ids})});
                  const extra=(r.brandsRemoved||r.categoriesRemoved)?` · removed ${r.brandsRemoved||0} brand(s), ${r.categoriesRemoved||0} category(ies)`:'';
                  showT(`Deleted ${r.deleted??ids.length} products${extra}`);
                  setSel(new Set());setBulkAction('');setBulkVal('');
                  loadProducts();loadMeta();
                }catch(e:any){showT('Delete failed: '+e.message);}
              }}
              style={{height:28,padding:'0 12px',background:'rgba(239,68,68,.2)',border:'1px solid rgba(239,68,68,.4)',borderRadius:'var(--r-md)',fontSize:11,fontWeight:600,cursor:'pointer',color:'#fca5a5'}}>
              🗑 Delete Selected
            </button>
            <button onClick={()=>{setSel(new Set());setBulkAction('');setBulkVal('');}}
              style={{marginLeft:'auto',background:'none',border:'none',color:'rgba(255,255,255,.5)',fontSize:12,cursor:'pointer'}}>
              Cancel
            </button>
          </div>
        )}

        {error&&<div className="alert alert-err">{error}<button onClick={()=>{setError('');loadProducts();}} style={{marginLeft:8,padding:'1px 8px',fontSize:11,height:'auto',background:'none',color:'var(--err)',border:'1px solid var(--err-bdr)',borderRadius:4,cursor:'pointer'}}>Retry</button></div>}

        {/* Grid */}
        <div className="grid-wrap">
          {loading?(<div className="empty" style={{padding:'60px 24px'}}><div className="spinner" style={{margin:'0 auto 14px'}}/><div className="empty-txt">Loading…</div></div>)
          :error?(<div className="empty"><div className="empty-ico">⚠️</div><div className="empty-ttl">Could not load</div><button style={{marginTop:12,height:30,padding:'0 14px',fontSize:12}} onClick={()=>{setError('');loadProducts();}}>Retry</button></div>)
          :items.length===0?(<div className="empty"><div className="empty-ico">🔍</div><div className="empty-ttl">{hasF?'No matching products':'No products yet'}</div>{hasF&&<button style={{marginTop:12,height:30,padding:'0 14px',fontSize:12}} onClick={reset}>Clear filters</button>}</div>):(
            <div className="grid-scroll">
              <table className="grid-table">
                <thead className="grid-thead">
                  <tr>
                    <th style={{width:36,padding:'9px 12px'}}>
                      <input type="checkbox" checked={allSel} onChange={selAll} style={{width:13,height:13,accentColor:'var(--brand)',cursor:'pointer'}}/>
                    </th>
                    {cols.map(c=>(
                      <th key={c.key} style={{minWidth:c.w,maxWidth:c.w+40}}>
                        {c.label}
                      </th>
                    ))}
                    <th style={{width:64}}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(p=>{
                    const q=stockQty(p);const isLow=q>0&&q<=3;
                    return(<tr key={p.id} className={`grid-row${sel.has(p.id)?' sel':''}${isLow?' low':''}`}>
                      <td style={{padding:'9px 12px'}}><input type="checkbox" checked={sel.has(p.id)} onChange={()=>toggleSel(p.id)} style={{width:13,height:13,accentColor:'var(--brand)',cursor:'pointer'}}/></td>
                      {cols.map(c=>(<td key={c.key} style={{maxWidth:c.w+40,overflow:'hidden',textOverflow:'ellipsis'}}>{cellVal(p,c.key)}</td>))}
                      <td><div style={{display:'flex',gap:3}}>
                        <button className="btn-icon" title="Edit" onClick={()=>setDrawer(p.id)}><svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                        <button className="btn-icon" title="Delete" onClick={()=>del(p.id)} style={{color:'var(--err)'}}><svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
                      </div></td>
                    </tr>);
                  })}
                </tbody>
              </table>
            </div>
          )}
          {products&&products.totalPages>1&&(
            <div className="pagination">
              <span className="pg-info">{((page-1)*limit+1).toLocaleString()}–{Math.min(page*limit,products.total).toLocaleString()} of {products.total.toLocaleString()}</span>
              <div className="pg-btns">
                <button className="pg-btn" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>←</button>
                {Array.from({length:Math.min(7,products.totalPages)},(_,i)=>i+1).map(n=>(<button key={n} className={`pg-btn${page===n?' on':''}`} onClick={()=>setPage(n)}>{n}</button>))}
                {products.totalPages>7&&<span style={{padding:'0 3px',color:'var(--txt-3)',fontSize:12}}>…</span>}
                <button className="pg-btn" disabled={page>=products.totalPages} onClick={()=>setPage(p=>p+1)}>→</button>
              </div>
              <select className="per-page" value={limit} onChange={e=>{setLimit(+e.target.value);setPage(1);}}>
                {[25,50,100,200].map(n=><option key={n} value={n}>{n}/pg</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {toast&&<div className="toasts"><div className="toast">{toast}</div></div>}

      {/* Modern floating drag indicator */}
      {showStatusMgr&&<StatusManager labels={statusLabels} onSave={setStatusLabels} onClose={()=>setShowStatusMgr(false)}/>}
      {showBrandMaster&&<BrandMaster brands={brands} onClose={()=>setShowBrandMaster(false)} onRefresh={loadMeta}/>}
      {showCatMaster&&<CategoryMaster categories={categories} onClose={()=>setShowCatMaster(false)} onRefresh={loadMeta}/>}
      {showAddProduct&&<AddProductModal brands={brands} categories={categories} onClose={()=>setShowAddProduct(false)} onSaved={()=>{loadProducts();loadMeta();showT('Product added ✓');}}/>}
      {showBulkImport&&<BulkImportModal categories={categories} brands={brands} onClose={()=>setShowBulkImport(false)} onDone={()=>{loadProducts();loadMeta();}}/>}
      {drawer&&<Drawer pid={drawer} brands={brands} categories={categories} onClose={()=>setDrawer(null)} onUpdated={()=>{loadProducts();loadMeta();}}/>}
    </>
  );
}
