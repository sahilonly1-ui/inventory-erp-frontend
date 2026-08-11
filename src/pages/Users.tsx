import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';

interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  userCount: number;
  isAdmin: boolean;
}
interface UserRow {
  id: string;
  email: string;
  fullName: string;
  isActive?: boolean;
  isDeleted?: boolean;
  roles?: { id: string; name: string }[] | string[];
  createdAt?: string;
  lastLoginAt?: string | null;
}
interface PermGroup { label: string; permissions: string[] }

const CARD: React.CSSProperties = {
  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
  boxShadow: '0 1px 3px rgba(0,0,0,.04)',
};
const BTN: React.CSSProperties = {
  height: 36, padding: '0 14px', borderRadius: 8, fontSize: 13,
  fontWeight: 600, cursor: 'pointer', border: '1px solid #e2e8f0', background: '#fff', color: '#334155',
};
const BTN_PRIMARY: React.CSSProperties = {
  ...BTN, background: '#2563eb', color: '#fff', border: 'none',
};
const INPUT: React.CSSProperties = {
  width: '100%', height: 38, padding: '0 12px', border: '1.5px solid #d0d5dd',
  borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box',
};
const LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase',
  letterSpacing: '.05em', marginBottom: 5, display: 'block',
};

// Turns 'inventory.stock_in' into 'Stock in' for display.
const prettyPerm = (code: string) => {
  const tail = code.split('.').slice(1).join('.') || code;
  const words = tail.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const roleNames = (u: UserRow): string[] => {
  if (!u.roles) return [];
  return (u.roles as any[]).map(r => (typeof r === 'string' ? r : r.name));
};

export default function Users() {
  const { user: me } = useAuth();
  const [tab, setTab] = useState<'users' | 'roles'>('users');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permGroups, setPermGroups] = useState<PermGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Create-user drawer
  const [showCreate, setShowCreate] = useState(false);
  const [nf, setNf] = useState({ fullName: '', email: '', password: '', roleId: '' });

  // Role permission editor
  const [editRole, setEditRole] = useState<Role | null>(null);
  const [draftPerms, setDraftPerms] = useState<Set<string>>(new Set());

  // Per-user role assignment
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [draftRoles, setDraftRoles] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const [u, r, p] = await Promise.all([
        api<any>('/users?page=1&limit=100'),
        api<Role[]>('/roles'),
        api<{ groups: PermGroup[] }>('/roles/permissions'),
      ]);
      setUsers(Array.isArray(u) ? u : (u.items ?? u.users ?? []));
      setRoles(r);
      setPermGroups(p.groups);
    } catch (e: any) {
      setErr(e.message || 'Could not load users');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createUser = async () => {
    if (!nf.fullName.trim() || !nf.email.trim() || nf.password.length < 8) {
      alert('Name, email and a password of at least 8 characters are required.');
      return;
    }
    setBusy(true);
    try {
      const created = await api<{ id: string }>('/users', {
        method: 'POST',
        body: JSON.stringify({ fullName: nf.fullName.trim(), email: nf.email.trim().toLowerCase(), password: nf.password }),
      });
      if (nf.roleId) {
        await api(`/users/${created.id}/roles`, { method: 'PUT', body: JSON.stringify({ roleIds: [nf.roleId] }) });
      }
      setShowCreate(false);
      setNf({ fullName: '', email: '', password: '', roleId: '' });
      await load();
    } catch (e: any) { alert(`Could not create user\n\n${e.message}`); }
    finally { setBusy(false); }
  };

  const saveUserRoles = async () => {
    if (!editUser) return;
    setBusy(true);
    try {
      await api(`/users/${editUser.id}/roles`, { method: 'PUT', body: JSON.stringify({ roleIds: [...draftRoles] }) });
      setEditUser(null);
      await load();
    } catch (e: any) { alert(`Could not update roles\n\n${e.message}`); }
    finally { setBusy(false); }
  };

  const saveRolePerms = async () => {
    if (!editRole) return;
    setBusy(true);
    try {
      await api(`/roles/${editRole.id}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions: [...draftPerms] }) });
      setEditRole(null);
      await load();
    } catch (e: any) { alert(`Could not update permissions\n\n${e.message}`); }
    finally { setBusy(false); }
  };

  const toggleActive = async (u: UserRow) => {
    const turningOff = u.isActive !== false;
    if (turningOff && !confirm(`Deactivate ${u.fullName}?\n\nThey will not be able to sign in until reactivated.`)) return;
    setBusy(true);
    try {
      await api(`/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !turningOff }) });
      await load();
    } catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  };

  const resetPassword = async (u: UserRow) => {
    const pw = prompt(`New password for ${u.fullName} (minimum 8 characters):`);
    if (!pw) return;
    if (pw.length < 8) { alert('Password must be at least 8 characters.'); return; }
    setBusy(true);
    try {
      await api(`/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ password: pw }) });
      alert(`Password updated for ${u.fullName}.`);
    } catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  };

  const canManage = !!me?.permissions?.some(p => p === '*' || p === 'users.create' || p === 'roles.manage');

  if (loading) return <div style={{ padding: 40, color: '#64748b' }}>Loading…</div>;

  return (
    <div style={{ padding: '20px 24px 60px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>Users &amp; Permissions</h1>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            {users.length} user{users.length !== 1 ? 's' : ''} · {roles.length} role{roles.length !== 1 ? 's' : ''}
          </div>
        </div>
        {canManage && tab === 'users' && (
          <button onClick={() => setShowCreate(true)} style={BTN_PRIMARY}>+ Add User</button>
        )}
      </div>

      {err && (
        <div style={{ ...CARD, padding: 14, marginTop: 14, borderColor: '#fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 13 }}>
          {err}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, margin: '18px 0 16px', borderBottom: '1px solid #e2e8f0' }}>
        {(['users', 'roles'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '9px 16px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 700, textTransform: 'capitalize',
            color: tab === t ? '#2563eb' : '#64748b',
            borderBottom: tab === t ? '2px solid #2563eb' : '2px solid transparent',
            marginBottom: -1,
          }}>
            {t === 'users' ? '👤 Users' : '🔑 Roles & Permissions'}
          </button>
        ))}
      </div>

      {/* ── Users tab ─────────────────────────────────────────────── */}
      {tab === 'users' && (
        <div style={{ ...CARD, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Name', 'Email', 'Roles', 'Status', ''].map((h, i) => (
                  <th key={i} style={{
                    padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700,
                    color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em',
                    borderBottom: '1px solid #e2e8f0',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.filter(u => !u.isDeleted).map(u => {
                const rn = roleNames(u);
                const isMe = u.id === me?.id;
                const active = u.isActive !== false;
                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '11px 14px', fontWeight: 600, color: '#0f172a' }}>
                      {u.fullName}
                      {isMe && <span style={{ marginLeft: 7, fontSize: 10, background: '#e0e7ff', color: '#4338ca', padding: '2px 7px', borderRadius: 10, fontWeight: 700 }}>You</span>}
                    </td>
                    <td style={{ padding: '11px 14px', color: '#475569' }}>{u.email}</td>
                    <td style={{ padding: '11px 14px' }}>
                      {rn.length === 0
                        ? <span style={{ color: '#cbd5e1', fontSize: 12 }}>No role</span>
                        : rn.map(n => (
                            <span key={n} style={{
                              display: 'inline-block', marginRight: 5, fontSize: 11, fontWeight: 700,
                              padding: '2px 8px', borderRadius: 10,
                              background: n === 'ADMIN' ? '#fef3c7' : '#e0f2fe',
                              color: n === 'ADMIN' ? '#92400e' : '#0369a1',
                            }}>{n}</span>
                          ))}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 10,
                        background: active ? '#dcfce7' : '#fee2e2',
                        color: active ? '#15803d' : '#dc2626',
                      }}>{active ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {canManage && (
                        <>
                          <button
                            onClick={() => { setEditUser(u); setDraftRoles(new Set(roles.filter(r => rn.includes(r.name)).map(r => r.id))); }}
                            style={{ ...BTN, height: 30, padding: '0 10px', fontSize: 12, marginRight: 6 }}>
                            Roles
                          </button>
                          <button onClick={() => resetPassword(u)}
                            style={{ ...BTN, height: 30, padding: '0 10px', fontSize: 12, marginRight: 6 }}>
                            Password
                          </button>
                          {/* Locking yourself out would need another admin to undo */}
                          {!isMe && (
                            <button onClick={() => toggleActive(u)} disabled={busy}
                              style={{ ...BTN, height: 30, padding: '0 10px', fontSize: 12, color: active ? '#dc2626' : '#15803d', borderColor: active ? '#fecaca' : '#bbf7d0' }}>
                              {active ? 'Deactivate' : 'Activate'}
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Roles tab ─────────────────────────────────────────────── */}
      {tab === 'roles' && (
        <div style={{ display: 'grid', gap: 12 }}>
          {roles.map(r => (
            <div key={r.id} style={{ ...CARD, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{r.name}</span>
                    {r.isAdmin && (
                      <span style={{ fontSize: 10, background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>
                        FULL ACCESS
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
                    {r.userCount} user{r.userCount !== 1 ? 's' : ''} ·{' '}
                    {r.isAdmin ? 'every permission' : `${r.permissions.length} permission${r.permissions.length !== 1 ? 's' : ''}`}
                  </div>
                </div>
                {canManage && !r.isAdmin && (
                  <button onClick={() => { setEditRole(r); setDraftPerms(new Set(r.permissions)); }} style={BTN}>
                    Edit permissions
                  </button>
                )}
              </div>
              {!r.isAdmin && r.permissions.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {r.permissions.slice(0, 14).map(p => (
                    <span key={p} style={{ fontSize: 11, background: '#f1f5f9', color: '#475569', padding: '3px 8px', borderRadius: 6 }}>
                      {p}
                    </span>
                  ))}
                  {r.permissions.length > 14 && (
                    <span style={{ fontSize: 11, color: '#94a3b8', padding: '3px 4px' }}>+{r.permissions.length - 14} more</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Create user drawer ────────────────────────────────────── */}
      {showCreate && (
        <Modal title="Add User" onClose={() => setShowCreate(false)}>
          <div style={{ display: 'grid', gap: 13 }}>
            <div>
              <label style={LABEL}>Full name</label>
              <input value={nf.fullName} onChange={e => setNf(v => ({ ...v, fullName: e.target.value }))}
                placeholder="e.g. Ekta" style={INPUT} autoFocus />
            </div>
            <div>
              <label style={LABEL}>Email (used to sign in)</label>
              <input value={nf.email} onChange={e => setNf(v => ({ ...v, email: e.target.value }))}
                placeholder="ekta@itecharena.com" style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Password</label>
              <input value={nf.password} onChange={e => setNf(v => ({ ...v, password: e.target.value }))}
                placeholder="At least 8 characters" style={INPUT} />
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                Share this with them directly — they can change it later.
              </div>
            </div>
            <div>
              <label style={LABEL}>Role</label>
              <select value={nf.roleId} onChange={e => setNf(v => ({ ...v, roleId: e.target.value }))} style={INPUT}>
                <option value="">No role (no access)</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => setShowCreate(false)} style={BTN}>Cancel</button>
              <button onClick={createUser} disabled={busy} style={{ ...BTN_PRIMARY, opacity: busy ? .6 : 1 }}>
                {busy ? 'Creating…' : 'Create user'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Assign roles ──────────────────────────────────────────── */}
      {editUser && (
        <Modal title={`Roles — ${editUser.fullName}`} onClose={() => setEditUser(null)}>
          <div style={{ display: 'grid', gap: 8 }}>
            {roles.map(r => {
              const on = draftRoles.has(r.id);
              return (
                <label key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                  border: `1.5px solid ${on ? '#2563eb' : '#e2e8f0'}`, borderRadius: 9,
                  background: on ? '#eff6ff' : '#fff', cursor: 'pointer',
                }}>
                  <input type="checkbox" checked={on}
                    onChange={() => setDraftRoles(s => {
                      const n = new Set(s);
                      n.has(r.id) ? n.delete(r.id) : n.add(r.id);
                      return n;
                    })} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      {r.isAdmin ? 'Full access to everything' : `${r.permissions.length} permissions`}
                    </div>
                  </div>
                </label>
              );
            })}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
              <button onClick={() => setEditUser(null)} style={BTN}>Cancel</button>
              <button onClick={saveUserRoles} disabled={busy} style={{ ...BTN_PRIMARY, opacity: busy ? .6 : 1 }}>
                {busy ? 'Saving…' : 'Save roles'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Edit role permissions ─────────────────────────────────── */}
      {editRole && (
        <Modal title={`Permissions — ${editRole.name}`} onClose={() => setEditRole(null)} wide>
          <div style={{ display: 'grid', gap: 14, maxHeight: '55vh', overflowY: 'auto', paddingRight: 4 }}>
            {permGroups.map(g => {
              const allOn = g.permissions.every(p => draftPerms.has(p));
              return (
                <div key={g.label}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>{g.label}</span>
                    <button
                      onClick={() => setDraftPerms(s => {
                        const n = new Set(s);
                        g.permissions.forEach(p => allOn ? n.delete(p) : n.add(p));
                        return n;
                      })}
                      style={{ ...BTN, height: 26, padding: '0 9px', fontSize: 11 }}>
                      {allOn ? 'Clear all' : 'Select all'}
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 6 }}>
                    {g.permissions.map(p => {
                      const on = draftPerms.has(p);
                      return (
                        <label key={p} style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                          border: `1px solid ${on ? '#93c5fd' : '#e2e8f0'}`, borderRadius: 7,
                          background: on ? '#eff6ff' : '#fff', cursor: 'pointer', fontSize: 12,
                        }}>
                          <input type="checkbox" checked={on}
                            onChange={() => setDraftPerms(s => {
                              const n = new Set(s);
                              n.has(p) ? n.delete(p) : n.add(p);
                              return n;
                            })} />
                          <span style={{ color: '#334155' }}>{prettyPerm(p)}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
            <span style={{ flex: 1, fontSize: 12, color: '#64748b', alignSelf: 'center' }}>
              {draftPerms.size} permission{draftPerms.size !== 1 ? 's' : ''} selected
            </span>
            <button onClick={() => setEditRole(null)} style={BTN}>Cancel</button>
            <button onClick={saveRolePerms} disabled={busy} style={{ ...BTN_PRIMARY, opacity: busy ? .6 : 1 }}>
              {busy ? 'Saving…' : 'Save permissions'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.4)' }} onClick={onClose} />
      <div style={{
        position: 'relative', zIndex: 1, background: '#fff', borderRadius: 14,
        boxShadow: '0 12px 48px rgba(0,0,0,.2)', padding: '22px 24px',
        width: wide ? 760 : 420, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 22, lineHeight: 1, color: '#94a3b8', cursor: 'pointer' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
