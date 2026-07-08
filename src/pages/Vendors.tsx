import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

interface Vendor { id: string; name: string; code: string; contactPerson?: string; phone?: string; email?: string; gstin?: string; address?: string; }

const inpS: React.CSSProperties = { height: 34, padding: '0 10px', border: '1px solid var(--bdr)', borderRadius: 'var(--r-md)', fontSize: 13, background: 'var(--surf-0)', color: 'var(--txt)', outline: 'none', width: '100%' };

function VendorForm({ initial, onSave, onCancel }: { initial?: Partial<Vendor>; onSave: (v: any) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ name: '', code: '', contactPerson: '', phone: '', email: '', gstin: '', address: '', ...initial });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {[['name', 'Vendor Name *'], ['code', 'Vendor Code *'], ['contactPerson', 'Contact Person'], ['phone', 'Phone'], ['email', 'Email'], ['gstin', 'GSTIN']].map(([k, l]) => (
        <div key={k}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-2)', display: 'block', marginBottom: 4 }}>{l}</label>
          <input style={inpS} value={(form as any)[k]} onChange={e => set(k, e.target.value)} placeholder={l.replace(' *', '')} />
        </div>
      ))}
      <div style={{ gridColumn: '1/-1' }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-2)', display: 'block', marginBottom: 4 }}>Address</label>
        <textarea style={{ ...inpS, height: 70, resize: 'vertical', paddingTop: 8 }} value={form.address} onChange={e => set('address', e.target.value)} />
      </div>
      <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" onClick={() => onSave(form)} disabled={!form.name || !form.code}>Save Vendor</button>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export function Vendors() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState('');
  const [selected, setSelected] = useState<Vendor | null>(null);

  const load = useCallback(() => api<Vendor[]>('/vendors').then(setVendors).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  const filtered = vendors.filter(v =>
    v.name.toLowerCase().includes(search.toLowerCase()) ||
    v.code.toLowerCase().includes(search.toLowerCase()) ||
    (v.phone || '').includes(search) ||
    (v.gstin || '').toLowerCase().includes(search.toLowerCase())
  );

  const save = async (form: any, id?: string) => {
    setBusy(id || 'new');
    try {
      if (id) { await api(`/vendors/${id}`, { method: 'PATCH', body: JSON.stringify(form) }); setEditing(null); }
      else { await api('/vendors', { method: 'POST', body: JSON.stringify(form) }); setAdding(false); }
      load();
    } catch (e: any) { alert(e.message); }
    finally { setBusy(''); }
  };

  const del = async (id: string, name: string) => {
    if (!confirm(`Delete vendor "${name}"?`)) return;
    setBusy(id);
    try { await api(`/vendors/${id}`, { method: 'DELETE' }); setSelected(null); load(); }
    catch (e: any) { alert(e.message); }
    finally { setBusy(''); }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Vendor Master</div>
          <div className="page-subtitle">{vendors.length} vendors</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => { setAdding(true); setSelected(null); setEditing(null); }}>+ Add Vendor</button>
        </div>
      </div>

      {adding && (
        <div className="grid-wrap" style={{ marginBottom: 16, padding: '16px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: 'var(--txt)' }}>New Vendor</div>
          <VendorForm onSave={form => save(form)} onCancel={() => setAdding(false)} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 360px' : '1fr', gap: 12 }}>
        <div>
          <div style={{ marginBottom: 10 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendor name, code, GSTIN, phone…"
              style={{ ...inpS, height: 36, paddingLeft: 36 }} />
          </div>

          <div className="grid-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--surf-1)' }}>
                  {['Code', 'Name', 'Contact', 'Phone', 'GSTIN', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--txt-3)', fontSize: 10, textTransform: 'uppercase', borderBottom: '1px solid var(--bdr)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((v, i) => (
                  <tr key={v.id} onClick={() => setSelected(selected?.id === v.id ? null : v)}
                    style={{ borderBottom: '1px solid var(--bdr-s)', cursor: 'pointer', background: selected?.id === v.id ? 'var(--brand-l)' : i % 2 === 0 ? 'transparent' : 'var(--surf-1)' }}>
                    <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 11 }}>{v.code}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{v.name}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--txt-2)' }}>{v.contactPerson || '—'}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--txt-2)' }}>{v.phone || '—'}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--txt-3)' }}>{v.gstin || '—'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                        <button className="btn btn-secondary" style={{ fontSize: 11, height: 26, padding: '0 10px' }} onClick={() => { setEditing(v.id); setSelected(null); }}>✎ Edit</button>
                        <button className="btn" style={{ fontSize: 11, height: 26, padding: '0 10px', background: 'var(--err-bg)', color: 'var(--err)', border: '1px solid var(--err-bdr)' }} onClick={() => del(v.id, v.name)} disabled={busy === v.id}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: '40px 0', textAlign: 'center', color: 'var(--txt-3)' }}>
                    {search ? `No vendors matching "${search}"` : 'No vendors yet — add one above'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          {editing && (
            <div className="grid-wrap" style={{ marginTop: 12, padding: '16px 20px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Edit Vendor — {vendors.find(v => v.id === editing)?.name}</div>
              <VendorForm initial={vendors.find(v => v.id === editing)} onSave={form => save(form, editing)} onCancel={() => setEditing(null)} />
            </div>
          )}
        </div>

        {selected && (
          <div className="grid-wrap" style={{ padding: '16px 20px', alignSelf: 'start' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{selected.name}</div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--txt-3)' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
              {[['Code', selected.code], ['Contact', selected.contactPerson || '—'], ['Phone', selected.phone || '—'], ['Email', selected.email || '—'], ['GSTIN', selected.gstin || '—'], ['Address', selected.address || '—']].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--bdr-s)' }}>
                  <span style={{ color: 'var(--txt-3)', fontWeight: 500 }}>{l}</span>
                  <span style={{ color: 'var(--txt)', textAlign: 'right', maxWidth: 200 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
