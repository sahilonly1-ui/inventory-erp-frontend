import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

interface Supplier { id: string; name: string; code: string; phone?: string; email?: string; gstin?: string; contactPerson?: string; address?: string; }

const inp: React.CSSProperties = { height:36, padding:'0 10px', border:'1.5px solid #d0d5dd', borderRadius:7, fontSize:13, color:'#101828', outline:'none', width:'100%', boxSizing:'border-box', background:'#fff' };

function SupplierForm({ initial, onSave, onCancel }: { initial?: Partial<Supplier>; onSave:(v:any)=>void; onCancel:()=>void }) {
  const [f, setF] = useState({ name:'', code:'', phone:'', email:'', gstin:'', contactPerson:'', address:'', ...initial });
  const set = (k:string, v:string) => setF(x=>({...x,[k]:v}));
  const fields = [['name','Supplier Name *'],['code','Supplier Code *'],['contactPerson','Contact Person'],['phone','Phone Number'],['email','Email Address'],['gstin','GSTIN']];
  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
        {fields.map(([k,l])=>(
          <div key={k}>
            <label style={{ fontSize:11, fontWeight:600, color:'#64748b', textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:4 }}>{l}</label>
            <input style={inp} value={(f as any)[k]} onChange={e=>set(k,e.target.value)} placeholder={l.replace(' *','')}
              onFocus={e=>(e.target as HTMLInputElement).style.borderColor='#2563eb'}
              onBlur={e=>(e.target as HTMLInputElement).style.borderColor='#d0d5dd'} />
          </div>
        ))}
      </div>
      <div style={{ marginBottom:16 }}>
        <label style={{ fontSize:11, fontWeight:600, color:'#64748b', textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:4 }}>Address</label>
        <textarea value={f.address} onChange={e=>set('address',e.target.value)} rows={2}
          style={{ ...inp, height:'auto', paddingTop:8, paddingBottom:8, resize:'vertical' }} />
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={()=>onSave(f)} disabled={!f.name||!f.code}
          style={{ height:36, padding:'0 20px', border:'none', borderRadius:7, background:'#2563eb', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity:(!f.name||!f.code)?0.5:1 }}>
          Save Supplier
        </button>
        <button onClick={onCancel} style={{ height:36, padding:'0 16px', border:'1px solid #d0d5dd', borderRadius:7, background:'#fff', fontSize:13, color:'#475467', cursor:'pointer' }}>Cancel</button>
      </div>
    </div>
  );
}

export function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string|null>(null);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api<Supplier[]|{items:Supplier[]}>('/vendors')
      .then(d => { setSuppliers(Array.isArray(d) ? d : (d as any).items || []); })
      .catch(()=>{})
      .finally(()=>setLoading(false));
  }, []);

  useEffect(()=>{ load(); },[load]);

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.code.toLowerCase().includes(search.toLowerCase()) ||
    (s.phone||'').includes(search) ||
    (s.gstin||'').toLowerCase().includes(search.toLowerCase())
  );

  const save = async (form:any, id?:string) => {
    setBusy(id||'new');
    try {
      if (id) { await api(`/vendors/${id}`,{method:'PATCH',body:JSON.stringify(form)}); setEditing(null); }
      else { await api('/vendors',{method:'POST',body:JSON.stringify(form)}); setAdding(false); }
      load();
    } catch(e:any) { alert(e.message); }
    finally { setBusy(''); }
  };

  const del = async (id:string, name:string) => {
    if (!confirm(`Delete supplier "${name}"?`)) return;
    setBusy(id);
    try { await api(`/vendors/${id}`,{method:'DELETE'}); load(); setSelected(s=>{const n=new Set(s);n.delete(id);return n;}); }
    catch(e:any) { alert(e.message); }
    finally { setBusy(''); }
  };

  const bulkDelete = async () => {
    if (!selected.size || !confirm(`Delete ${selected.size} supplier(s)? This cannot be undone.`)) return;
    setBusy('bulk');
    try { for (const id of selected) { await api(`/vendors/${id}`,{method:'DELETE'}).catch(()=>{}); } setSelected(new Set()); load(); }
    finally { setBusy(''); }
  };

  const toggleAll = () => { setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(s=>s.id))); };
  const toggle = (id:string) => setSelected(s=>{ const n=new Set(s); n.has(id)?n.delete(id):n.add(id); return n; });

  return (
    <>
      {/* Page header */}
      <div style={{ padding:'16px 20px', borderBottom:'1px solid #e4e7ec', background:'#fff', display:'flex', alignItems:'center', gap:12 }}>
        <div>
          <div style={{ fontSize:16, fontWeight:700, color:'#101828' }}>Supplier Master</div>
          <div style={{ fontSize:12, color:'#98a2b3', marginTop:1 }}>{suppliers.length} suppliers registered</div>
        </div>
        <div style={{ flex:1 }} />
        {selected.size > 0 && (
          <button onClick={bulkDelete} disabled={busy==='bulk'}
            style={{ height:34, padding:'0 14px', border:'1px solid #fca5a5', borderRadius:7, background:'#fef2f2', color:'#dc2626', fontSize:12, fontWeight:600, cursor:'pointer' }}>
            {busy==='bulk' ? 'Deleting…' : `Delete ${selected.size} selected`}
          </button>
        )}
        <button onClick={()=>{setAdding(true);setEditing(null);}}
          style={{ height:34, padding:'0 16px', border:'none', borderRadius:7, background:'#2563eb', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
          + Add Supplier
        </button>
      </div>

      <div style={{ padding:'16px 20px', flex:1, overflow:'auto' }}>
        {/* Add form */}
        {adding && (
          <div style={{ background:'#fff', border:'1px solid #e4e7ec', borderRadius:10, padding:'20px', marginBottom:16, boxShadow:'0 1px 4px rgba(0,0,0,.06)' }}>
            <div style={{ fontSize:14, fontWeight:700, color:'#101828', marginBottom:16 }}>New Supplier</div>
            <SupplierForm onSave={f=>save(f)} onCancel={()=>setAdding(false)} />
          </div>
        )}

        {/* Search */}
        <div style={{ position:'relative', marginBottom:12 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#98a2b3" strokeWidth="2" style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search suppliers by name, code, GSTIN, phone…"
            style={{ ...inp, paddingLeft:34, height:38 }} />
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:48 }}><div className="spinner" style={{ width:24, height:24 }}/></div>
        ) : filtered.length === 0 ? (
          <div style={{ background:'#fff', border:'1px solid #e4e7ec', borderRadius:10, padding:'60px 20px', textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:12 }}>🏢</div>
            <div style={{ fontSize:16, fontWeight:700, color:'#344054', marginBottom:6 }}>{search ? `No results for "${search}"` : 'No suppliers yet'}</div>
            <div style={{ fontSize:13, color:'#98a2b3', marginBottom:20 }}>{search ? 'Try a different search term' : 'Add your first supplier using the button above'}</div>
          </div>
        ) : (
          <div style={{ background:'#fff', border:'1px solid #e4e7ec', borderRadius:10, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,.04)' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#f8fafc' }}>
                  <th style={{ padding:'0 12px', height:36, width:40, borderBottom:'2px solid #e4e7ec' }}>
                    <input type="checkbox" checked={selected.size===filtered.length&&filtered.length>0} onChange={toggleAll} style={{ accentColor:'#2563eb' }} />
                  </th>
                  {['Code','Supplier Name','Contact','Phone','GSTIN','Actions'].map(h=>(
                    <th key={h} style={{ padding:'0 12px', height:36, textAlign:'left', fontWeight:600, color:'#64748b', fontSize:11, textTransform:'uppercase', letterSpacing:'.06em', borderBottom:'2px solid #e4e7ec', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s,i)=>{
                  if (editing === s.id) return (
                    <tr key={s.id}>
                      <td colSpan={7} style={{ padding:'16px 20px', borderBottom:'1px solid #e4e7ec', background:'#f8fafc' }}>
                        <div style={{ fontSize:13, fontWeight:600, marginBottom:14, color:'#101828' }}>Edit: {s.name}</div>
                        <SupplierForm initial={s} onSave={f=>save(f,s.id)} onCancel={()=>setEditing(null)} />
                      </td>
                    </tr>
                  );
                  return (
                    <tr key={s.id} style={{ borderBottom:'1px solid #f2f4f7', background: selected.has(s.id) ? '#eff6ff' : i%2===0?'#fff':'#fafafa' }}>
                      <td style={{ padding:'0 12px', height:46 }}><input type="checkbox" checked={selected.has(s.id)} onChange={()=>toggle(s.id)} style={{ accentColor:'#2563eb' }}/></td>
                      <td style={{ padding:'0 12px', fontFamily:'monospace', fontSize:12, color:'#475467' }}>{s.code}</td>
                      <td style={{ padding:'0 12px', fontWeight:600, color:'#101828' }}>{s.name}</td>
                      <td style={{ padding:'0 12px', color:'#64748b' }}>{s.contactPerson||'—'}</td>
                      <td style={{ padding:'0 12px', color:'#64748b' }}>{s.phone||'—'}</td>
                      <td style={{ padding:'0 12px', fontFamily:'monospace', fontSize:12, color:'#64748b' }}>{s.gstin||'—'}</td>
                      <td style={{ padding:'0 12px' }}>
                        <div style={{ display:'flex', gap:6 }}>
                          <button onClick={()=>setEditing(s.id)} style={{ height:28, padding:'0 10px', border:'1px solid #e4e7ec', borderRadius:6, background:'#fff', fontSize:11, fontWeight:600, color:'#475467', cursor:'pointer' }}>Edit</button>
                          <button onClick={()=>del(s.id,s.name)} disabled={busy===s.id} style={{ height:28, padding:'0 10px', border:'1px solid #fca5a5', borderRadius:6, background:'#fef2f2', fontSize:11, fontWeight:600, color:'#dc2626', cursor:'pointer' }}>{busy===s.id?'…':'Delete'}</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
