import { useState, useEffect, useCallback } from 'react';
import { useIsPhone, M, MCard, MPill, MButton } from '../mobile/ui';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';

// ── Types ──────────────────────────────────────────────────────────────────
interface Role { id: string; name: string; description: string | null; permissions: string[]; userCount: number; isAdmin: boolean; }
interface UserRow { id: string; email: string; fullName: string; isActive?: boolean; isDeleted?: boolean; roles?: ({ id: string; name: string } | string)[]; createdAt?: string; }

// ── Permission catalog with plain-language descriptions ────────────────────
const PERM_META: Record<string, { label: string; desc: string }> = {
  // Products
  'products.read':   { label: 'View Products',      desc: 'See the Product Master list and product details' },
  'products.create': { label: 'Add Products',        desc: 'Create new products and brands in Product Master' },
  'products.update': { label: 'Edit Products',       desc: 'Change product names, prices, categories and specs' },
  'products.delete': { label: 'Delete / Archive Products', desc: 'Remove products from the catalog (cannot be undone easily)' },
  'categories.manage': { label: 'Manage Categories', desc: 'Create, rename and reorganise product categories' },
  // Inventory
  'inventory.read':        { label: 'View Stock',          desc: 'See current stock levels, Opening Stock and Stock Report' },
  'inventory.stock_in':    { label: 'Stock In',            desc: 'Receive new stock — scan EANs and IMEIs to add inventory' },
  'inventory.stock_out':   { label: 'Stock Out / Dispatch',desc: 'Dispatch items — scan IMEIs to mark stock as sold' },
  'inventory.transfer':    { label: 'Transfer Between Warehouses', desc: 'Move stock from one warehouse to another' },
  'inventory.adjust':      { label: 'Adjust Stock',        desc: 'Manually correct stock counts (use carefully)' },
  'inventory.reconcile':   { label: 'Reconcile Stock',     desc: 'Run full stock reconciliation reports' },
  // IMEI
  'imei.read':    { label: 'View IMEI Tracker',     desc: 'Search and view all IMEIs and serial numbers' },
  'imei.manage':  { label: 'Manage IMEIs',          desc: 'Mark devices as swiped/activated, bulk upload, and change IMEI status' },
  // Vendors & Warehouses
  'vendors.read':      { label: 'View Vendors / Suppliers', desc: 'See the supplier list and vendor details' },
  'vendors.manage':    { label: 'Manage Vendors',           desc: 'Add, edit and remove suppliers' },
  'warehouses.read':   { label: 'View Warehouses',          desc: 'See warehouse list — needed to scan stock in/out' },
  'warehouses.manage': { label: 'Manage Warehouses',        desc: 'Create and configure warehouse locations' },
  // Reports
  'reports.export': { label: 'Export Reports & Excel',  desc: 'Download stock reports, IMEI exports and day-end Excel files' },
  'imports.run':    { label: 'Bulk Import Data',         desc: 'Upload CSV/Excel files to import products or stock in bulk' },
  // Marketplace
  'marketplace.read':   { label: 'View Marketplace',    desc: 'See marketplace listings and Shopify sync status' },
  'marketplace.manage': { label: 'Manage Marketplace',  desc: 'Create, edit and publish marketplace listings' },
  // Users
  'users.read':    { label: 'View Users & Access',  desc: 'See the Users & Access page and who has which role' },
  'users.create':  { label: 'Create Users',          desc: 'Add new staff accounts with a username and password' },
  'users.update':  { label: 'Edit Users',            desc: 'Change names, passwords and activate/deactivate accounts' },
  'users.delete':  { label: 'Delete Users',          desc: 'Permanently remove a user account' },
  'users.restore': { label: 'Restore Users',         desc: 'Reactivate a previously deleted account' },
  'roles.manage':  { label: 'Manage Roles & Permissions', desc: 'Change what each role can do — admin-only typically' },
};

const GROUPS: { title: string; icon: string; codes: string[] }[] = [
  { title: 'Inventory Operations', icon: '📦', codes: ['inventory.read','inventory.stock_in','inventory.stock_out','inventory.transfer','inventory.adjust','inventory.reconcile'] },
  { title: 'IMEI & Serial Tracker', icon: '📱', codes: ['imei.read','imei.manage'] },
  { title: 'Product Master',        icon: '🏷️', codes: ['products.read','products.create','products.update','products.delete','categories.manage'] },
  { title: 'Reports & Exports',     icon: '📊', codes: ['reports.export','imports.run'] },
  { title: 'Vendors & Warehouses',  icon: '🏪', codes: ['vendors.read','vendors.manage','warehouses.read','warehouses.manage'] },
  { title: 'Marketplace / Shopify', icon: '🛒', codes: ['marketplace.read','marketplace.manage'] },
  { title: 'Users & Access Control',icon: '🔑', codes: ['users.read','users.create','users.update','users.delete','users.restore','roles.manage'] },
];

// Role presets make it easier to start fresh
const PRESETS: { name: string; desc: string; codes: string[] }[] = [
  {
    name: 'Sales Staff',
    desc: 'Can scan stock in/out and view IMEI tracker. Cannot change products or users.',
    codes: ['inventory.read','inventory.stock_in','inventory.stock_out','imei.read','imei.manage','vendors.read','warehouses.read','reports.export'],
  },
  {
    name: 'Stock Manager',
    desc: 'Full inventory control including transfers and reconciliation. No user management.',
    codes: ['inventory.read','inventory.stock_in','inventory.stock_out','inventory.transfer','inventory.adjust','inventory.reconcile','imei.read','imei.manage','products.read','vendors.read','vendors.manage','warehouses.read','reports.export','imports.run'],
  },
  {
    name: 'View Only',
    desc: 'Read-only access — can see stock and reports but cannot make any changes.',
    codes: ['inventory.read','imei.read','products.read','vendors.read','warehouses.read','reports.export'],
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────
const roleNames = (u: UserRow): string[] =>
  (u.roles ?? []).map(r => (typeof r === 'string' ? r : r.name));

// ── Styles ─────────────────────────────────────────────────────────────────
const S = {
  card: { background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, boxShadow:'0 1px 3px rgba(0,0,0,.04)' } as React.CSSProperties,
  btn:  { height:36, padding:'0 14px', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', border:'1px solid #e2e8f0', background:'#fff', color:'#334155' } as React.CSSProperties,
  btnP: { height:36, padding:'0 14px', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', border:'none', background:'#2563eb', color:'#fff' } as React.CSSProperties,
  inp:  { width:'100%', height:38, padding:'0 12px', border:'1.5px solid #d0d5dd', borderRadius:8, fontSize:14, outline:'none', boxSizing:'border-box' } as React.CSSProperties,
  lbl:  { fontSize:11, fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:5, display:'block' } as React.CSSProperties,
};

// ── Component ──────────────────────────────────────────────────────────────
export default function Users() {
  const { user: me } = useAuth();
  const [tab, setTab] = useState<'users'|'roles'>('users');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const isPhone = useIsPhone();

  const [showCreate, setShowCreate] = useState(false);
  const [nf, setNf] = useState({ fullName:'', email:'', password:'', roleId:'' });

  const [editRole, setEditRole] = useState<Role|null>(null);
  const [draftPerms, setDraftPerms] = useState<Set<string>>(new Set());

  const [editUser, setEditUser] = useState<UserRow|null>(null);
  const [draftRoles, setDraftRoles] = useState<Set<string>>(new Set());

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [u, r] = await Promise.all([api<any>('/users?page=1&limit=100'), api<Role[]>('/roles')]);
      setUsers(Array.isArray(u) ? u : (u.items ?? u.users ?? []));
      setRoles(r);
    } catch (e: any) { flash('Load failed: ' + e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const canManage = me?.permissions?.some(p => p === '*' || p === 'users.create' || p === 'roles.manage') ?? false;

  const createUser = async () => {
    if (!nf.fullName.trim() || !nf.email.trim()) { alert('Name and email are required.'); return; }
    if (nf.password.length < 8) { alert('Password must be at least 8 characters.'); return; }
    setBusy(true);
    try {
      const c = await api<{ id: string }>('/users', { method:'POST', body: JSON.stringify({ fullName: nf.fullName.trim(), email: nf.email.trim().toLowerCase(), password: nf.password }) });
      if (nf.roleId) await api(`/users/${c.id}/roles`, { method:'PUT', body: JSON.stringify({ roleIds: [nf.roleId] }) });
      setShowCreate(false); setNf({ fullName:'', email:'', password:'', roleId:'' }); flash(`✓ ${nf.fullName} created`); await load();
    } catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  };

  const saveUserRoles = async () => {
    if (!editUser) return; setBusy(true);
    try { await api(`/users/${editUser.id}/roles`, { method:'PUT', body: JSON.stringify({ roleIds: [...draftRoles] }) }); setEditUser(null); flash('✓ Roles updated'); await load(); }
    catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  };

  const saveRolePerms = async () => {
    if (!editRole) return; setBusy(true);
    try { await api(`/roles/${editRole.id}/permissions`, { method:'PUT', body: JSON.stringify({ permissions: [...draftPerms] }) }); setEditRole(null); flash(`✓ ${editRole.name} updated`); await load(); }
    catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  };

  const toggleActive = async (u: UserRow) => {
    const off = u.isActive !== false;
    if (off && !confirm(`Deactivate ${u.fullName}? They won't be able to sign in.`)) return;
    setBusy(true);
    try { await api(`/users/${u.id}`, { method:'PATCH', body: JSON.stringify({ isActive: !off }) }); flash(`✓ ${u.fullName} ${off ? 'deactivated' : 'activated'}`); await load(); }
    catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  };

  const resetPw = async (u: UserRow) => {
    const pw = prompt(`New password for ${u.fullName} (min 8 characters):`);
    if (!pw) return;
    if (pw.length < 8) { alert('Password must be at least 8 characters.'); return; }
    setBusy(true);
    try { await api(`/users/${u.id}`, { method:'PATCH', body: JSON.stringify({ password: pw }) }); flash(`✓ Password updated for ${u.fullName}`); }
    catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  };

  const applyPreset = (preset: typeof PRESETS[0]) => setDraftPerms(new Set(preset.codes));

  const totalPerms = (r: Role) => r.isAdmin ? 'All permissions' : `${r.permissions.length} permission${r.permissions.length !== 1 ? 's' : ''}`;

  if (loading) return <div style={{ padding:40, color:'#64748b', textAlign:'center' }}>Loading…</div>;

  return (
    <div style={{ padding:'20px 24px 80px', maxWidth:1100, margin:'0 auto', position:'relative' }}>
      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', top:16, right:20, zIndex:9999, background:'#1e293b', color:'#fff', padding:'10px 18px', borderRadius:10, fontSize:13, fontWeight:600, boxShadow:'0 4px 20px rgba(0,0,0,.2)', pointerEvents:'none' }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, color:'#0f172a', margin:0 }}>Users & Access</h1>
          <p style={{ fontSize:13, color:'#64748b', margin:'4px 0 0' }}>
            Manage who can sign in and what they can do. Roles bundle permissions so you assign a role, not individual permissions, to each user.
          </p>
        </div>
        {canManage && tab === 'users' && (
          <button onClick={() => setShowCreate(true)} style={{ ...S.btnP, height:38, flexShrink:0, marginLeft:16 }}>+ Add User</button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:2, marginBottom:20, borderBottom:'1px solid #e2e8f0' }}>
        {([['users','👤  Users'], ['roles','🔑  Roles & Permissions']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{ padding:'10px 18px', border:'none', background:'none', cursor:'pointer', fontSize:13, fontWeight:700, color: tab===t ? '#2563eb' : '#64748b', borderBottom: tab===t ? '2.5px solid #2563eb' : '2.5px solid transparent', marginBottom:-1 }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── USERS TAB ────────────────────────────────────────── */}
      {tab === 'users' && isPhone && (
        <div style={{ display:'grid', gap:M.gap }}>
          {users.filter(u => !u.isDeleted).map(u => {
            const rn = roleNames(u);
            const isMe = u.id === me?.id;
            const active = u.isActive !== false;
            return (
              <MCard key={u.id}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:16, fontWeight:800, color:M.color.ink }}>
                      {u.fullName}
                      {isMe && <span style={{ marginLeft:8, fontSize:10, background:'#e0e7ff', color:'#4338ca', padding:'2px 8px', borderRadius:20, fontWeight:700 }}>You</span>}
                    </div>
                    <div style={{ fontSize:M.text.meta, color:M.color.muted, marginTop:3, wordBreak:'break-all' }}>{u.email}</div>
                  </div>
                  <MPill tone={active ? 'good' : 'bad'}>{active ? 'Active' : 'Inactive'}</MPill>
                </div>

                <div style={{ marginTop:10 }}>
                  {rn.length === 0
                    ? <MPill tone="bad">⚠ No role — cannot use the app</MPill>
                    : rn.map(n => <span key={n} style={{ marginRight:6 }}><MPill tone={n === 'ADMIN' ? 'warn' : 'brand'}>{n}</MPill></span>)}
                </div>

                {canManage && (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:12 }}>
                    <MButton onClick={() => { setEditUser(u); setDraftRoles(new Set(roles.filter(r => rn.includes(r.name)).map(r => r.id))); }}>
                      Change Role
                    </MButton>
                    <MButton onClick={() => resetPw(u)}>Reset Password</MButton>
                    {!isMe && (
                      <MButton tone={active ? 'danger' : 'plain'} onClick={() => toggleActive(u)} disabled={busy}
                        style={{ gridColumn:'1 / -1' }}>
                        {active ? 'Deactivate' : 'Activate'}
                      </MButton>
                    )}
                  </div>
                )}
              </MCard>
            );
          })}
        </div>
      )}

      {tab === 'users' && !isPhone && (
        <div style={S.card}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'#f8fafc' }}>
                {['Name','Email','Role','Status',''].map((h, i) => (
                  <th key={i} style={{ padding:'11px 16px', textAlign:'left', fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.05em', borderBottom:'1px solid #e2e8f0', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.filter(u => !u.isDeleted).map(u => {
                const rn = roleNames(u);
                const isMe = u.id === me?.id;
                const active = u.isActive !== false;
                return (
                  <tr key={u.id} style={{ borderBottom:'1px solid #f1f5f9' }}>
                    <td style={{ padding:'12px 16px', fontWeight:700, color:'#0f172a' }}>
                      {u.fullName}
                      {isMe && <span style={{ marginLeft:8, fontSize:10, background:'#e0e7ff', color:'#4338ca', padding:'2px 8px', borderRadius:20, fontWeight:700 }}>You</span>}
                    </td>
                    <td style={{ padding:'12px 16px', color:'#475569' }}>{u.email}</td>
                    <td style={{ padding:'12px 16px' }}>
                      {rn.length === 0
                        ? <span style={{ color:'#dc2626', fontSize:12, fontWeight:600, background:'#fef2f2', padding:'3px 9px', borderRadius:20, border:'1px solid #fecaca' }}>⚠ No role — cannot use the app</span>
                        : rn.map(n => (
                            <span key={n} style={{ display:'inline-flex', alignItems:'center', gap:4, marginRight:6, fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20, background: n==='ADMIN'?'#fef3c7':'#e0f2fe', color: n==='ADMIN'?'#92400e':'#0369a1' }}>
                              {n==='ADMIN' && '👑 '}{n}
                            </span>
                          ))}
                    </td>
                    <td style={{ padding:'12px 16px' }}>
                      <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background: active?'#dcfce7':'#fee2e2', color: active?'#15803d':'#dc2626' }}>
                        {active ? '● Active' : '○ Inactive'}
                      </span>
                    </td>
                    <td style={{ padding:'8px 16px', textAlign:'right', whiteSpace:'nowrap' }}>
                      {canManage && (
                        <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                          <button onClick={() => { setEditUser(u); setDraftRoles(new Set(roles.filter(r => rn.includes(r.name)).map(r => r.id))); }}
                            style={{ ...S.btn, height:30, padding:'0 11px', fontSize:12 }}>
                            Change Role
                          </button>
                          <button onClick={() => resetPw(u)} style={{ ...S.btn, height:30, padding:'0 11px', fontSize:12 }}>
                            Reset Password
                          </button>
                          {!isMe && (
                            <button onClick={() => toggleActive(u)} disabled={busy}
                              style={{ ...S.btn, height:30, padding:'0 11px', fontSize:12, color: active?'#dc2626':'#16a34a', borderColor: active?'#fecaca':'#bbf7d0' }}>
                              {active ? 'Deactivate' : 'Activate'}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── ROLES TAB ────────────────────────────────────────── */}
      {tab === 'roles' && (
        <div style={{ display:'grid', gap:14 }}>
          <div style={{ ...S.card, padding:'14px 18px', background:'#f0f9ff', border:'1px solid #bae6fd' }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#0c4a6e', marginBottom:4 }}>💡 How Roles Work</div>
            <div style={{ fontSize:12, color:'#0369a1', lineHeight:1.6 }}>
              A <b>role</b> is a bundle of permissions. You assign a role to a user, and they get all the permissions in that role.
              The <b>ADMIN</b> role has full access and cannot be changed. Create custom roles for your staff based on what they need to do.
            </div>
          </div>

          {roles.map(r => (
            <div key={r.id} style={{ ...S.card, overflow:'hidden' }}>
              <div style={{ padding:'16px 20px', borderBottom: r.permissions.length ? '1px solid #f1f5f9' : 'none', display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16 }}>
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
                    <span style={{ fontSize:16, fontWeight:800, color:'#0f172a' }}>{r.name}</span>
                    {r.isAdmin && <span style={{ fontSize:11, background:'#fef3c7', color:'#92400e', padding:'2px 10px', borderRadius:20, fontWeight:700 }}>👑 Full Access</span>}
                    <span style={{ fontSize:11, background:'#f1f5f9', color:'#64748b', padding:'2px 10px', borderRadius:20 }}>{r.userCount} user{r.userCount !== 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ fontSize:12, color:'#64748b' }}>
                    {r.description ? <span>{r.description} · </span> : null}
                    {totalPerms(r)}
                    {!r.isAdmin && r.permissions.length === 0 && (
                      <span style={{ color:'#dc2626', fontWeight:600 }}> — anyone with this role cannot use the app</span>
                    )}
                  </div>
                </div>
                {canManage && !r.isAdmin && (
                  <button onClick={() => { setEditRole(r); setDraftPerms(new Set(r.permissions)); }}
                    style={{ ...S.btn, flexShrink:0, background:'#2563eb', color:'#fff', border:'none', height:34 }}>
                    Edit Permissions
                  </button>
                )}
              </div>
              {!r.isAdmin && r.permissions.length > 0 && (
                <div style={{ padding:'12px 20px', display:'flex', flexWrap:'wrap', gap:6 }}>
                  {r.permissions.map(code => {
                    const meta = PERM_META[code];
                    return (
                      <span key={code} title={meta?.desc || code} style={{ fontSize:11, background:'#f1f5f9', color:'#334155', padding:'4px 10px', borderRadius:8, fontWeight:500, cursor:'help' }}>
                        {meta?.label || code}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Create User Modal ───────────────────────────────── */}
      {showCreate && (
        <Modal title="Add New User" onClose={() => setShowCreate(false)}>
          <div style={{ display:'grid', gap:16 }}>
            <div>
              <label style={S.lbl}>Full Name</label>
              <input value={nf.fullName} onChange={e => setNf(v => ({...v, fullName: e.target.value}))} placeholder="e.g. Ekta Sharma" style={S.inp} autoFocus />
            </div>
            <div>
              <label style={S.lbl}>Email Address (used to sign in)</label>
              <input value={nf.email} onChange={e => setNf(v => ({...v, email: e.target.value}))} placeholder="ekta@itecharena.com" style={S.inp} />
            </div>
            <div>
              <label style={S.lbl}>Password</label>
              <input value={nf.password} onChange={e => setNf(v => ({...v, password: e.target.value}))} placeholder="Minimum 8 characters" style={S.inp} />
              <div style={{ fontSize:11, color:'#94a3b8', marginTop:5 }}>Share this directly with the staff member. They can change it later from their profile.</div>
            </div>
            <div>
              <label style={S.lbl}>Assign a Role</label>
              <select value={nf.roleId} onChange={e => setNf(v => ({...v, roleId: e.target.value}))} style={{ ...S.inp, background:'#fff' }}>
                <option value="">No role — user won't have access to anything</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}{r.isAdmin ? ' (Full Access)' : ` — ${r.permissions.length} permissions`}</option>)}
              </select>
              {nf.roleId && (() => {
                const r = roles.find(r => r.id === nf.roleId);
                return r && !r.isAdmin && (
                  <div style={{ marginTop:10, padding:'10px 14px', background:'#f8fafc', borderRadius:8, border:'1px solid #e2e8f0' }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#475569', marginBottom:6 }}>This role allows:</div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                      {r.permissions.map(code => (
                        <span key={code} title={PERM_META[code]?.desc} style={{ fontSize:11, background:'#e0f2fe', color:'#0369a1', padding:'2px 8px', borderRadius:6, cursor:'help' }}>
                          {PERM_META[code]?.label || code}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', paddingTop:4 }}>
              <button onClick={() => setShowCreate(false)} style={S.btn}>Cancel</button>
              <button onClick={createUser} disabled={busy} style={{ ...S.btnP, opacity: busy ? .6 : 1 }}>
                {busy ? 'Creating…' : 'Create User'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Assign Role to User ─────────────────────────────── */}
      {editUser && (
        <Modal title={`Assign Role — ${editUser.fullName}`} onClose={() => setEditUser(null)}>
          <div style={{ display:'grid', gap:10 }}>
            <p style={{ fontSize:13, color:'#64748b', margin:'0 0 4px' }}>
              Select the role for this user. A role determines what they can see and do in the ERP.
            </p>
            {roles.map(r => {
              const on = draftRoles.has(r.id);
              return (
                <label key={r.id} style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:'10px 14px', padding:'14px 16px', border:`1.5px solid ${on ? '#2563eb' : '#e2e8f0'}`, borderRadius:10, background: on ? '#eff6ff' : '#fff', cursor:'pointer', alignItems:'start' }}>
                  <input type="checkbox" checked={on} style={{ marginTop:3 }}
                    onChange={() => setDraftRoles(s => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} />
                  <div>
                    <div style={{ fontSize:14, fontWeight:700, color:'#0f172a', marginBottom:3 }}>
                      {r.name}
                      {r.isAdmin && <span style={{ marginLeft:8, fontSize:11, background:'#fef3c7', color:'#92400e', padding:'1px 8px', borderRadius:20 }}>Full Access</span>}
                    </div>
                    <div style={{ fontSize:12, color:'#64748b', marginBottom: !r.isAdmin && r.permissions.length ? 8 : 0 }}>
                      {r.isAdmin ? 'Can do everything in the system — assign with care' : `${r.permissions.length} permission${r.permissions.length !== 1 ? 's' : ''}`}
                    </div>
                    {!r.isAdmin && r.permissions.length > 0 && (
                      <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                        {r.permissions.map(code => (
                          <span key={code} title={PERM_META[code]?.desc} style={{ fontSize:11, background: on ? '#bfdbfe' : '#f1f5f9', color: on ? '#1e40af' : '#475569', padding:'2px 7px', borderRadius:6, cursor:'help' }}>
                            {PERM_META[code]?.label || code}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </label>
              );
            })}
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:8 }}>
              <button onClick={() => setEditUser(null)} style={S.btn}>Cancel</button>
              <button onClick={saveUserRoles} disabled={busy} style={{ ...S.btnP, opacity: busy ? .6 : 1 }}>
                {busy ? 'Saving…' : 'Save Role'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Edit Role Permissions ────────────────────────────── */}
      {editRole && (
        <Modal title={`Edit Permissions — ${editRole.name}`} onClose={() => setEditRole(null)} wide>
          <div>
            {/* Presets */}
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#475569', marginBottom:8, textTransform:'uppercase', letterSpacing:'.05em' }}>Quick Presets</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {PRESETS.map(p => (
                  <button key={p.name} onClick={() => applyPreset(p)} title={p.desc}
                    style={{ ...S.btn, height:32, fontSize:12, background:'#f8fafc', borderColor:'#cbd5e1' }}>
                    {p.name}
                  </button>
                ))}
                <button onClick={() => setDraftPerms(new Set())} style={{ ...S.btn, height:32, fontSize:12, color:'#dc2626', borderColor:'#fecaca' }}>
                  Clear All
                </button>
              </div>
              <div style={{ fontSize:11, color:'#94a3b8', marginTop:6 }}>Presets replace your current selection. You can still adjust individual permissions after applying one.</div>
            </div>

            {/* Permission groups */}
            <div style={{ display:'grid', gap:16, maxHeight:'52vh', overflowY:'auto', paddingRight:4 }}>
              {GROUPS.map(g => {
                const groupCodes = g.codes.filter(c => PERM_META[c]);
                const allOn = groupCodes.every(c => draftPerms.has(c));
                return (
                  <div key={g.title} style={{ border:'1px solid #e2e8f0', borderRadius:10, overflow:'hidden' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
                      <span style={{ fontSize:13, fontWeight:800, color:'#0f172a' }}>{g.icon} {g.title}</span>
                      <button onClick={() => setDraftPerms(s => { const n = new Set(s); groupCodes.forEach(c => allOn ? n.delete(c) : n.add(c)); return n; })}
                        style={{ ...S.btn, height:26, padding:'0 10px', fontSize:11 }}>
                        {allOn ? 'Remove All' : 'Select All'}
                      </button>
                    </div>
                    <div style={{ padding:4 }}>
                      {groupCodes.map(code => {
                        const meta = PERM_META[code]!;
                        const on = draftPerms.has(code);
                        return (
                          <label key={code} style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:'8px 12px', padding:'10px 12px', borderRadius:8, background: on ? '#eff6ff' : 'transparent', cursor:'pointer', margin:2, alignItems:'start' }}>
                            <input type="checkbox" checked={on} style={{ marginTop:2 }}
                              onChange={() => setDraftPerms(s => { const n = new Set(s); n.has(code) ? n.delete(code) : n.add(code); return n; })} />
                            <div>
                              <div style={{ fontSize:13, fontWeight:600, color: on ? '#1e40af' : '#0f172a' }}>{meta.label}</div>
                              <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>{meta.desc}</div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display:'flex', alignItems:'center', gap:8, justifyContent:'flex-end', marginTop:16, paddingTop:14, borderTop:'1px solid #e2e8f0' }}>
              <span style={{ flex:1, fontSize:12, color:'#64748b' }}>{draftPerms.size} permission{draftPerms.size !== 1 ? 's' : ''} selected</span>
              <button onClick={() => setEditRole(null)} style={S.btn}>Cancel</button>
              <button onClick={saveRolePerms} disabled={busy} style={{ ...S.btnP, opacity: busy ? .6 : 1 }}>
                {busy ? 'Saving…' : 'Save Permissions'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ position:'absolute', inset:0, background:'rgba(15,23,42,.45)', backdropFilter:'blur(2px)' }} onClick={onClose} />
      <div style={{ position:'relative', zIndex:1, background:'#fff', borderRadius:16, boxShadow:'0 20px 60px rgba(0,0,0,.22)', padding:'24px 26px', width: wide ? 780 : 460, maxWidth:'95%', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <h2 style={{ fontSize:17, fontWeight:800, color:'#0f172a', margin:0 }}>{title}</h2>
          <button onClick={onClose} style={{ border:'none', background:'none', fontSize:24, lineHeight:1, color:'#94a3b8', cursor:'pointer', padding:2 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
