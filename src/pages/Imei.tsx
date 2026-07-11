import { useState, useEffect, useCallback, useRef } from 'react';
import { api, getAccessToken } from '../api/client';

interface ImeiUnit {
  id: string; imei1: string; imei2?: string; status: string;
  imeiType: string; swiped: boolean;
  product?: { ean: string; model: string; brand: string; };
  warehouse?: { name: string; };
  createdAt: string; updatedAt: string;
}
interface Page { items: ImeiUnit[]; total: number; page: number; limit: number; totalPages: number; }

const STATUS_COLORS: Record<string,{bg:string;color:string}> = {
  IN_STOCK:    { bg:'#dcfce7', color:'#15803d' },
  SOLD:        { bg:'#fee2e2', color:'#dc2626' },
  RETURNED:    { bg:'#fef9c3', color:'#854d0e' },
  OPEN_BOX:    { bg:'#e0f2fe', color:'#0369a1' },
  SERVICE:     { bg:'#f3e8ff', color:'#7c3aed' },
  DAMAGED:     { bg:'#fee2e2', color:'#9f1239' },
  LOST:        { bg:'#f1f5f9', color:'#475569' },
};
const TYPE_LABELS: Record<string,string> = { NIL:'Standard', OPEN_BOX:'Open Box', DEMO:'Demo', SECOND_IMEI:'2nd IMEI' };
const fmtDate = (s:string) => new Date(s).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });

export function Imei() {
  const [data, setData] = useState<Page|null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [swipedFilter, setSwipedFilter] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(async (q=search, s=statusFilter, t=typeFilter, sw=swipedFilter, pg=page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page:String(pg), limit:'50' });
      if (q) params.set('search', q);
      if (s) params.set('status', s);
      if (t) params.set('imeiType', t);
      if (sw) params.set('swiped', sw);
      const d = await api<Page>(`/imei?${params}`);
      setData(d);
    } catch {}
    finally { setLoading(false); }
  }, [search, statusFilter, typeFilter, swipedFilter, page]);

  useEffect(() => { load(); }, [load]);

  const onSearch = (v:string) => {
    setSearch(v); setPage(1);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(v, statusFilter, typeFilter, swipedFilter, 1), 300);
  };

  const toggleSwiped = async (id:string, current:boolean) => {
    try {
      await api(`/imei/${id}/status`, { method:'PATCH', body:JSON.stringify({ status: current ? 'IN_STOCK' : 'IN_STOCK', swiped: !current }) });
      setData(d => d ? { ...d, items: d.items.map(i => i.id===id ? {...i, swiped:!current} : i) } : d);
    } catch {}
  };

  const exportXlsx = async () => {
    setExporting(true);
    try {
      const base = (import.meta.env.VITE_API_URL as string) ?? 'https://inventory-erp-backend-iplr.onrender.com/api/v1';
      const params = new URLSearchParams({ limit:'5000' });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('imeiType', typeFilter);
      if (swipedFilter) params.set('swiped', swipedFilter);
      const resp = await fetch(`${base}/reports/imei_summary`, {
        method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${getAccessToken()}` },
        body: JSON.stringify({}),
      });
      if (!resp.ok) throw new Error('Export failed');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href=url; a.download=`IMEI_Export_${new Date().toISOString().slice(0,10)}.xlsx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch(e:any) { alert(e.message); }
    finally { setExporting(false); }
  };

  const items = data?.items || [];

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'#f8fafc' }}>
      {/* Header */}
      <div style={{ padding:'14px 24px', borderBottom:'1px solid #e2e8f0', background:'#fff', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
          <div>
            <div style={{ fontSize:18, fontWeight:800, color:'#0f172a', letterSpacing:'-.3px' }}>IMEI Tracker</div>
            <div style={{ fontSize:12, color:'#94a3b8', marginTop:1 }}>{data?.total?.toLocaleString()||'…'} IMEI units</div>
          </div>
          <div style={{ flex:1 }} />
          <button onClick={exportXlsx} disabled={exporting}
            style={{ height:34, padding:'0 16px', border:'1px solid #d0d5dd', borderRadius:8, background:'#fff', fontSize:12, fontWeight:600, color:'#374151', cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            {exporting ? 'Exporting…' : 'Export XLSX'}
          </button>
        </div>

        {/* Filters row */}
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <div style={{ position:'relative', flex:1, minWidth:200 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input ref={searchRef} value={search} onChange={e=>onSearch(e.target.value)} placeholder="Search IMEI, product name, barcode…"
              style={{ width:'100%', height:34, paddingLeft:30, paddingRight:10, border:'1.5px solid #e2e8f0', borderRadius:8, fontSize:13, outline:'none', boxSizing:'border-box', background:'#fff' }}
              onFocus={e=>(e.target as HTMLInputElement).style.borderColor='#2563eb'} onBlur={e=>(e.target as HTMLInputElement).style.borderColor='#e2e8f0'} />
          </div>
          {[
            { value:statusFilter, set:(v:string)=>{setStatusFilter(v);setPage(1);load(search,v,typeFilter,swipedFilter,1);}, opts:[['','All Status'],['IN_STOCK','In Stock'],['SOLD','Sold'],['RETURNED','Returned'],['OPEN_BOX','Open Box'],['SERVICE','Service'],['DAMAGED','Damaged'],['LOST','Lost']] },
            { value:typeFilter, set:(v:string)=>{setTypeFilter(v);setPage(1);load(search,statusFilter,v,swipedFilter,1);}, opts:[['','All Types'],['NIL','Standard'],['OPEN_BOX','Open Box'],['DEMO','Demo'],['SECOND_IMEI','2nd IMEI']] },
            { value:swipedFilter, set:(v:string)=>{setSwipedFilter(v);setPage(1);load(search,statusFilter,typeFilter,v,1);}, opts:[['','All (Swiped)'],['true','Swiped'],['false','Unswiped']] },
          ].map((f,fi)=>(
            <select key={fi} value={f.value} onChange={e=>f.set(e.target.value)}
              style={{ height:34, padding:'0 28px 0 10px', border:'1.5px solid #e2e8f0', borderRadius:8, fontSize:12, background:'#fff', outline:'none', cursor:'pointer', color:'#374151', minWidth:120 }}>
              {f.opts.map(([v,l])=><option key={v as string} value={v as string}>{l as string}</option>)}
            </select>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ flex:1, overflow:'auto' }}>
        {loading ? (
          <div style={{ display:'flex', justifyContent:'center', padding:'48px' }}><div className="spinner" style={{ width:28, height:28 }} /></div>
        ) : items.length === 0 ? (
          <div style={{ textAlign:'center', padding:'64px 20px', color:'#94a3b8' }}>
            <div style={{ fontSize:36, marginBottom:12 }}>📱</div>
            <div style={{ fontSize:16, fontWeight:700, color:'#374151', marginBottom:6 }}>{search||statusFilter||typeFilter||swipedFilter ? 'No results found' : 'No IMEI records yet'}</div>
            <div style={{ fontSize:13 }}>IMEI records will appear here after Stock In operations</div>
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#f8fafc', position:'sticky', top:0, zIndex:5 }}>
                {['IMEI / Serial','Product','Brand','Warehouse','Type','Status','Swiped','Date',''].map((h,i)=>(
                  <th key={i} style={{ padding:'0 12px', height:36, textAlign:'left', fontWeight:700, color:'#64748b', fontSize:10, textTransform:'uppercase', letterSpacing:'.07em', borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item,i)=>{
                const sc = STATUS_COLORS[item.status] || { bg:'#f1f5f9', color:'#475569' };
                return (
                  <tr key={item.id} style={{ borderBottom:'1px solid #f1f5f9', background:i%2===0?'#fff':'#fafafa' }}
                    onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='#f8fafc'}
                    onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background=i%2===0?'#fff':'#fafafa'}>
                    <td style={{ padding:'0 12px', height:42, fontFamily:'monospace', fontSize:11.5, color:'#1e293b', fontWeight:600 }}>
                      <div>{item.imei1}</div>
                      {item.imei2 && <div style={{ color:'#94a3b8', fontSize:10 }}>{item.imei2}</div>}
                    </td>
                    <td style={{ padding:'0 12px', color:'#0f172a', fontWeight:500, maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.product?.model||'—'}</td>
                    <td style={{ padding:'0 12px', color:'#64748b' }}>{item.product?.brand||'—'}</td>
                    <td style={{ padding:'0 12px', color:'#64748b' }}>{item.warehouse?.name||'—'}</td>
                    <td style={{ padding:'0 12px' }}>
                      {item.imeiType !== 'NIL' && (
                        <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10, fontWeight:600, background:'#eff6ff', color:'#2563eb' }}>
                          {TYPE_LABELS[item.imeiType]||item.imeiType}
                        </span>
                      )}
                    </td>
                    <td style={{ padding:'0 12px' }}>
                      <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10, fontWeight:700, background:sc.bg, color:sc.color }}>
                        {item.status.replace(/_/g,' ')}
                      </span>
                    </td>
                    <td style={{ padding:'0 12px' }}>
                      <button onClick={()=>toggleSwiped(item.id, item.swiped)}
                        style={{ width:36, height:20, borderRadius:10, border:'none', background:item.swiped?'#2563eb':'#e2e8f0', cursor:'pointer', position:'relative', transition:'background .2s', flexShrink:0, display:'inline-block' }}>
                        <div style={{ width:14, height:14, borderRadius:'50%', background:'#fff', position:'absolute', top:3, left:item.swiped?19:3, transition:'left .2s', boxShadow:'0 1px 3px rgba(0,0,0,.15)' }} />
                      </button>
                    </td>
                    <td style={{ padding:'0 12px', color:'#94a3b8', whiteSpace:'nowrap', fontSize:11 }}>{fmtDate(item.createdAt)}</td>
                    <td style={{ padding:'0 12px', width:60 }}>
                      <select defaultValue="" onChange={async e=>{ const v=e.target.value; if(!v) return; try { await api(`/imei/${item.imei1}/status`,{method:'PATCH',body:JSON.stringify({status:v})}); setData(d=>d?{...d,items:d.items.map(x=>x.id===item.id?{...x,status:v}:x)}:d); } catch(err:any){alert(err.message);} e.target.value=''; }}
                        style={{ height:26, padding:'0 6px', border:'1px solid #e2e8f0', borderRadius:5, fontSize:11, background:'#fff', cursor:'pointer', color:'#64748b', maxWidth:90 }}>
                        <option value="">Change</option>
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
      {data && data.totalPages > 1 && (
        <div style={{ padding:'10px 24px', borderTop:'1px solid #e2e8f0', background:'#fff', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:12, color:'#64748b' }}>Showing {((page-1)*50)+1}–{Math.min(page*50,data.total)} of {data.total.toLocaleString()}</span>
          <div style={{ display:'flex', gap:6 }}>
            <button disabled={page<=1} onClick={()=>setPage(p=>p-1)} style={{ height:30, padding:'0 12px', border:'1px solid #e2e8f0', borderRadius:7, background:'#fff', fontSize:12, cursor:page<=1?'not-allowed':'pointer', opacity:page<=1?.4:1 }}>← Prev</button>
            <span style={{ fontSize:12, padding:'0 12px', lineHeight:'30px', color:'#374151', fontWeight:600 }}>Page {page} of {data.totalPages}</span>
            <button disabled={page>=data.totalPages} onClick={()=>setPage(p=>p+1)} style={{ height:30, padding:'0 12px', border:'1px solid #e2e8f0', borderRadius:7, background:'#fff', fontSize:12, cursor:page>=data.totalPages?'not-allowed':'pointer', opacity:page>=data.totalPages?.4:1 }}>Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}
