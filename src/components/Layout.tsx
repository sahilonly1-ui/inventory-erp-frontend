import { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

type NavItem = { to: string; label: string; svg: string };

const NAV: NavItem[] = [
  { to: '/',          label: 'Dashboard',       svg: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>' },
  { to: '/products',  label: 'Product Master',  svg: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>' },
  { to: '/stock-in',  label: 'Stock In',        svg: '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>' },
  { to: '/stock-out', label: 'Stock Out',        svg: '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>' },
  { to: '/imei',      label: 'IMEI Tracker',    svg: '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>' },
  { to: '/suppliers', label: 'Supplier Master',  svg: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' },
  { to: '/reports',   label: 'Reports',          svg: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>' },
  { to: '/versions',  label: 'Version History',  svg: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>' },
];

function NavIcon({ svg }: { svg: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} dangerouslySetInnerHTML={{ __html: svg }} />
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f5f7fa' }}>
      {/* Sidebar */}
      <aside style={{
        width: 220, flexShrink: 0, background: '#fff',
        borderRight: '1px solid #e4e7ec', display: 'flex',
        flexDirection: 'column', position: 'fixed',
        top: 0, left: 0, height: '100vh', zIndex: 100, overflowY: 'auto',
      }}>
        {/* Logo */}
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #f2f4f7' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, background: '#2563eb',
              borderRadius: 8, display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 800,
              letterSpacing: '-.5px', flexShrink: 0,
            }}>iT</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#101828', lineHeight: 1.3 }}>iTechArena</div>
              <div style={{ fontSize: 10, color: '#98a2b3', textTransform: 'uppercase', letterSpacing: '.08em' }}>ERP System</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '8px 10px', overflowY: 'auto' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#98a2b3', textTransform: 'uppercase', letterSpacing: '.1em', padding: '10px 6px 6px' }}>Main Menu</div>
          {NAV.map(n => {
            const active = n.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.to);
            return (
              <Link key={n.to} to={n.to} style={{
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '7px 10px', borderRadius: 7, marginBottom: 1,
                textDecoration: 'none', fontSize: 13, fontWeight: active ? 600 : 500,
                color: active ? '#2563eb' : '#475467',
                background: active ? '#eff6ff' : 'transparent',
                transition: 'all .1s',
                whiteSpace: 'nowrap',
              }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = '#f9fafb'; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                <NavIcon svg={n.svg} />
                <span>{n.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div style={{ padding: '10px', borderTop: '1px solid #f2f4f7' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 8px', marginBottom: 4 }}>
            <div style={{
              width: 28, height: 28, background: '#2563eb', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0,
            }}>{user?.fullName?.charAt(0)?.toUpperCase() || 'A'}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#101828', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.fullName || 'Administrator'}</div>
              <div style={{ fontSize: 10, color: '#98a2b3', textTransform: 'uppercase', letterSpacing: '.04em' }}>{user?.roles?.[0] || 'ADMIN'}</div>
            </div>
          </div>
          <button onClick={() => { logout(); navigate('/login'); }}
            style={{ background: 'none', border: 'none', padding: '6px 8px', borderRadius: 6, color: '#98a2b3', fontSize: 12, width: '100%', textAlign: 'left', cursor: 'pointer', transition: 'all .1s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#fef2f2'; (e.currentTarget as HTMLElement).style.color = '#dc2626'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = '#98a2b3'; }}>
            Sign out
          </button>
        </div>
      </aside>

      {/* Content */}
      <main style={{ marginLeft: 220, flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh', overflow: 'hidden' }}>
        {children}
      </main>
    </div>
  );
}
