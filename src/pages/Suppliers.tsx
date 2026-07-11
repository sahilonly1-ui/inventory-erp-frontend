import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';

interface Supplier { id: string; name: string; code: string; state?: string; phone?: string; email?: string; gstin?: string; contactPerson?: string; address?: string; notes?: string; }

const INDIAN_STATES = ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Delhi','Goa','Gujarat','Haryana','Himachal Pradesh','Jammu & Kashmir','Jharkhand','Karnataka','Kerala','Ladakh','Lakshadweep','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Puducherry','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Chandigarh','Dadra & Nagar Haveli','Daman & Diu','Other'];

const inp: React.CSSProperties = { height:36, padding:'0 10px', border:'1.5px solid #d0d5dd', borderRadius:7, fontSize:13, color:'#101828', outline:'none', width:'100%', boxSizing:'border-box', background:'#fff', transition:'border-color .15s' };
const focus = (e: React.FocusEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => (e.target as HTMLElement).style.borderColor='#2563eb';
const blur  = (e: React.FocusEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>) => (e.target as HTMLElement).style.borderColor='#d0d5dd';

function SupplierForm({ initial, onSave, onCancel }: { initial?: Partial<Supplier>; onSave:(v:any)=>void; onCancel:()=>void }) {
  const [f, setF] = useState({ name:'', state:'', contactPerson:'', phone:'', email:'', gstin:'', address:'', notes:'', ...initial });
  const set = (k:string, v:string) => setF(x=>({...x,[k]:v}));
  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
        {/* Name - full width */}
        <div style={{ gridColumn:'1/-1' }}>
          <label style={{ fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:4 }}>Supplier Name *</label>
          <input style={inp} value={f.name} onChange={e=>set('name',e.target.value)} placeholder="e.g. Nalanda Enterprises" onFocus={focus} onBlur={blur} autoFocus />
          <div style={{ fontSize:10, color:'#94a3b8', marginTop:3 }}>Will be auto-formatted to Title Case</div>
        </div>
        {/* State */}
        <div>
          <label style={{ fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:4 }}>State *</label>
          <select style={{ ...inp, background:'#fff' }} value={f.state} onChange={e=>set('state',e.target.value)} onFocus={focus} onBlur={blur}>
            <option value="">Select state…</option>
            {INDIAN_STATES.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {/* Contact */}
        <div>
          <label style={{ fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:4 }}>Contact Person</label>
          <input style={inp} value={f.contactPerson} onChange={e=>set('contactPerson',e.target.value)} placeholder="Contact name" onFocus={focus} onBlur={blur} />
        </div>
        <div>
          <label style={{ fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:4 }}>Phone</label>
          <input style={inp} value={f.phone} onChange={e=>set('phone',e.target.value)} placeholder="+91 9876543210" onFocus={focus} onBlur={blur} />
        </div>
        <div>
          <label style={{ fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:4 }}>GSTIN</label>
          <input style={inp} value={f.gstin} onChange={e=>set('gstin',e.target.value)} placeholder="27XXXXX1234X1ZX" onFocus={focus} onBlur={blur} />
        </div>
        <div style={{ gridColumn:'1/-1' }}>
          <label style={{ fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:4 }}>Address</label>
          <input style={inp} value={f.address} onChange={e=>set('address',e.target.value)} placeholder="Full address" onFocus={focus} onBlur={blur} />
        </div>
        <div style={{ gridColumn:'1/-1' }}>
          <label style={{ fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:4 }}>Notes</label>
          <input style={inp} value={f.notes} onChange={e=>set('notes',e.target.value)} placeholder="Any notes about this supplier" onFocus={focus} onBlur={blur} />
        </div>
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={()=>onSave(f)} disabled={!f.name.trim()||!f.state}
          style={{ height:36, padding:'0 20px', border:'none', borderRadius:7, background: (!f.name.trim()||!f.state) ? '#94a3b8' : '#2563eb', color:'#fff', fontSize:13, fontWeight:700, cursor: (!f.name.trim()||!f.state) ? 'not-allowed' : 'pointer', transition:'background .15s' }}>
          Save Supplier
        </button>
        <button onClick={onCancel} style={{ height:36, padding:'0 16px', border:'1px solid #e2e8f0', borderRadius:7, background:'#fff', fontSize:13, color:'#64748b', cursor:'pointer' }}>Cancel</button>
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
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await api<any>('/vendors'); setSuppliers(Array.isArray(d) ? d : d.items || []); }
    catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = suppliers.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.phone||'').includes(search) || (s.state||'').toLowerCase().includes(search.toLowerCase()) ||
    (s.gstin||'').toLowerCase().includes(search.toLowerCase())
  );

  const save = async (form: any, id?: string) => {
    setBusy(id||'new');
    try {
      if (id) { await api(`/vendors/${id}`, { method:'PATCH', body:JSON.stringify(form) }); setEditing(null); }
      else { await api('/vendors', { method:'POST', body:JSON.stringify(form) }); setAdding(false); }
      load();
    } catch(e:any) { alert(e.message); }
    finally { setBusy(''); }
  };

  const del = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    setBusy(id);
    try { await api(`/vendors/${id}`, { method:'DELETE' }); setSelected(s=>{const n=new Set(s);n.delete(id);return n;}); load(); }
    catch(e:any) { alert(e.message); }
    finally { setBusy(''); }
  };

  const bulkDelete = async () => {
    if (!selected.size || !confirm(`Permanently delete ${selected.size} supplier(s)?`)) return;
    setBusy('bulk');
    try { for (const id of selected) await api(`/vendors/${id}`, { method:'DELETE' }).catch(()=>{}); setSelected(new Set()); load(); }
    finally { setBusy(''); }
  };

  const clearAll = async () => {
    const count = suppliers.length;
    if (!confirm(`DELETE ALL ${count} suppliers? Existing stock records won't be affected.`)) return;
    setBusy('clear');
    try { await api('/vendors/clear-all', { method:'DELETE' }); setSelected(new Set()); load(); }
    catch(e:any) { alert(e.message); }
    finally { setBusy(''); }
  };

  const toggleAll = () => setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(s=>s.id)));
  const toggle = (id:string) => setSelected(s=>{ const n=new Set(s); n.has(id)?n.delete(id):n.add(id); return n; });

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 0px)', background:'#f8fafc' }}>
      {/* Header */}
      <div style={{ padding:'16px 24px', borderBottom:'1px solid #e2e8f0', background:'#fff', display:'flex', alignItems:'center', gap:12 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:800, color:'#0f172a', letterSpacing:'-.3px' }}>Supplier Master</div>
          <div style={{ fontSize:12, color:'#94a3b8', marginTop:2 }}>{suppliers.length} suppliers · {selected.size > 0 ? `${selected.size} selected` : 'Click row to select'}</div>
        </div>
        <div style={{ flex:1 }} />
        {suppliers.length > 0 && selected.size === 0 && (
          <button onClick={clearAll} disabled={busy==='clear'}
            style={{ height:32, padding:'0 12px', border:'1px solid #fca5a5', borderRadius:7, background:'#fef2f2', color:'#dc2626', fontSize:11, fontWeight:600, cursor:'pointer' }}>
            {busy==='clear' ? 'Clearing…' : 'Reset All'}
          </button>
        )}
        {selected.size > 0 && (
          <button onClick={bulkDelete} disabled={busy==='bulk'}
            style={{ height:32, padding:'0 14px', border:'none', borderRadius:7, background:'#dc2626', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>
            {busy==='bulk' ? 'Deleting…' : `Delete ${selected.size}`}
          </button>
        )}
        <button onClick={()=>{setAdding(true);setEditing(null);setSelected(new Set());}}
          style={{ height:36, padding:'0 18px', border:'none', borderRadius:8, background:'#2563eb', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 1px 3px rgba(37,99,235,.3)' }}>
          + Add Supplier
        </button>
      </div>

      <div style={{ flex:1, overflow:'auto', padding:'16px 24px' }}>
        {/* Add form */}
        {adding && (
          <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:'20px 24px', marginBottom:16, boxShadow:'0 1px 4px rgba(0,0,0,.06)' }}>
            <div style={{ fontSize:14, fontWeight:700, color:'#0f172a', marginBottom:16 }}>Add New Supplier</div>
            <SupplierForm onSave={f=>save(f)} onCancel={()=>setAdding(false)} />
          </div>
        )}

        {/* Search */}
        <div style={{ position:'relative', marginBottom:12 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input ref={searchRef} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, state, phone, GSTIN…"
            style={{ ...inp, paddingLeft:38, height:40, boxShadow:'0 1px 2px rgba(0,0,0,.05)' }} onFocus={focus} onBlur={blur} />
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ display:'flex', justifyContent:'center', padding:'48px 0' }}>
            <div className="spinner" style={{ width:24, height:24 }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:'64px 20px', textAlign:'center', boxShadow:'0 1px 2px rgba(0,0,0,.04)' }}>
            <div style={{ fontSize:36, marginBottom:12 }}>🏢</div>
            <div style={{ fontSize:17, fontWeight:700, color:'#0f172a', marginBottom:6 }}>{search ? `No results for "${search}"` : 'No suppliers yet'}</div>
            <div style={{ fontSize:13, color:'#94a3b8', marginBottom:20 }}>{search ? 'Try a different term' : 'Add your first supplier or they will be auto-created during Stock In/Out'}</div>
            {!search && <button onClick={()=>setAdding(true)} style={{ height:36, padding:'0 20px', border:'none', borderRadius:7, background:'#2563eb', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}>+ Add First Supplier</button>}
          </div>
        ) : (
          <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,.06)' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#f8fafc' }}>
                  <th style={{ padding:'0 12px', height:40, width:44, borderBottom:'1px solid #e2e8f0' }}>
                    <input type="checkbox" checked={selected.size===filtered.length&&filtered.length>0} onChange={toggleAll} style={{ accentColor:'#2563eb', width:15, height:15 }} />
                  </th>
                  {['Supplier Name','State','Contact','Phone','GSTIN','Actions'].map(h=>(
                    <th key={h} style={{ padding:'0 14px', height:40, textAlign:'left', fontWeight:700, color:'#64748b', fontSize:10, textTransform:'uppercase', letterSpacing:'.08em', borderBottom:'1px solid #e2e8f0', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s,i) => {
                  if (editing === s.id) return (
                    <tr key={s.id}>
                      <td colSpan={7} style={{ padding:'16px 24px', background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
                        <div style={{ fontSize:13, fontWeight:700, marginBottom:14 }}>Editing: {s.name}</div>
                        <SupplierForm initial={s} onSave={f=>save(f,s.id)} onCancel={()=>setEditing(null)} />
                      </td>
                    </tr>
                  );
                  const isSelected = selected.has(s.id);
                  return (
                    <tr key={s.id} style={{ borderBottom:'1px solid #f1f5f9', background: isSelected ? '#eff6ff' : i%2===0?'#fff':'#fafafa', transition:'background .1s' }}
                      onMouseEnter={e=>{ if (!isSelected) (e.currentTarget as HTMLElement).style.background='#f8fafc'; }}
                      onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.background=isSelected?'#eff6ff':i%2===0?'#fff':'#fafafa'; }}>
                      <td style={{ padding:'0 12px', height:48 }}>
                        <input type="checkbox" checked={isSelected} onChange={()=>toggle(s.id)} style={{ accentColor:'#2563eb', width:15, height:15 }} />
                      </td>
                      <td style={{ padding:'0 14px', fontWeight:700, color:'#0f172a' }}>{s.name}</td>
                      <td style={{ padding:'0 14px', color:'#2563eb', fontSize:12 }}>{s.state||<span style={{color:'#cbd5e1'}}>—</span>}</td>
                      <td style={{ padding:'0 14px', color:'#475569' }}>{s.contactPerson||<span style={{color:'#cbd5e1'}}>—</span>}</td>
                      <td style={{ padding:'0 14px', color:'#475569' }}>{s.phone||<span style={{color:'#cbd5e1'}}>—</span>}</td>
                      <td style={{ padding:'0 14px', fontFamily:'monospace', fontSize:11, color:'#64748b' }}>{s.gstin||<span style={{color:'#cbd5e1'}}>—</span>}</td>
                      <td style={{ padding:'0 14px' }}>
                        <div style={{ display:'flex', gap:6 }}>
                          <button onClick={()=>setEditing(editing===s.id?null:s.id)}
                            style={{ height:28, padding:'0 12px', border:'1px solid #e2e8f0', borderRadius:6, background:'#fff', fontSize:11, fontWeight:600, color:'#475569', cursor:'pointer', transition:'all .1s' }}>Edit</button>
                          <button onClick={()=>del(s.id,s.name)} disabled={busy===s.id}
                            style={{ height:28, padding:'0 12px', border:'1px solid #fecdd3', borderRadius:6, background:'#fff5f5', fontSize:11, fontWeight:600, color:'#dc2626', cursor:'pointer', transition:'all .1s' }}>
                            {busy===s.id?'…':'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ padding:'10px 16px', background:'#f8fafc', borderTop:'1px solid #e2e8f0', fontSize:11, color:'#94a3b8', display:'flex', justifyContent:'space-between' }}>
              <span>Showing {filtered.length} of {suppliers.length} suppliers</span>
              {selected.size>0 && <span style={{ color:'#2563eb', fontWeight:600 }}>{selected.size} selected</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
