import { ReactNode, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import OfflineBanner from '../native/OfflineBanner';

type NavItem = { to: string; label: string; short?: string; svg: string; perm?: string; primary?: boolean };

const NAV: NavItem[] = [
  { to: '/',          label: 'Dashboard', short: 'Home', primary: true, svg: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>' },
  { to: '/products',  label: 'Product Master', short: 'Products', svg: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>' },
  { to: '/opening-stock', label: 'Opening Stock', short: 'Opening', svg: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M3.27 6.96L12 12.01l8.73-5.05"/>' },
  { to: '/stock-in',  label: 'Stock In', short: 'Stock In', primary: true, svg: '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>' },
  { to: '/stock-out', label: 'Stock Out', short: 'Stock Out', primary: true, svg: '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>' },
  { to: '/imei',      label: 'IMEI Tracker', short: 'IMEI', primary: true, svg: '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>' },
  { to: '/suppliers', label: 'Supplier Master',  svg: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' },
  { to: '/stock-report', label: 'Stock Report', short: 'Report', svg: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/><rect x="13" y="13" width="2" height="5"/><rect x="7" y="11" width="2" height="7"/>' },
  { to: '/reports',   label: 'Reports',          svg: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>' },
  { to: '/versions',  label: 'Version History', short: 'History', svg: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>' },
  { to: '/users',     label: 'Users & Access',   svg: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 11l-3 3-1.5-1.5"/>', perm: 'users.read' },
];

function NavIcon({ svg, size = 15 }: { svg: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} dangerouslySetInnerHTML={{ __html: svg }} />
  );
}

// A phone gets a bottom tab bar; anything wider keeps the sidebar. The
// breakpoint is watched rather than read once, so rotating the device or
// resizing a window switches layouts straight away.
function useIsPhone() {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.innerWidth < 900);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 899px)');
    const onChange = () => setPhone(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return phone;
}

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const navigate = useNavigate();
  const isPhone = useIsPhone();
  const [drawer, setDrawer] = useState(false);

  const allowed = NAV.filter(n => !n.perm || (user?.permissions ?? []).some(p => p === '*' || p === n.perm));
  const isActive = (to: string) => (to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(to));

  // Close the drawer on navigation so it never lingers over the page just chosen.
  useEffect(() => { setDrawer(false); }, [loc.pathname]);

  if (isPhone) {
    // Four tabs plus "More" is the most that stays comfortably tappable.
    const tabs = allowed.filter(n => n.primary).slice(0, 4);

    return (
      <div style={{ minHeight: '100vh', background: '#f5f7fa', display: 'flex', flexDirection: 'column' }}>
        <header style={{
          position: 'sticky', top: 0, zIndex: 120, background: '#fff',
          borderBottom: '1px solid #e4e7ec', display: 'flex', alignItems: 'center',
          gap: 12, padding: '10px 14px', paddingTop: 'max(10px, env(safe-area-inset-top))',
        }}>
          <button onClick={() => setDrawer(true)} aria-label="Menu"
            style={{ border: 'none', background: 'none', padding: 6, cursor: 'pointer', color: '#475467', display: 'flex' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 }}>
            <div style={{ width: 30, height: 30, background: '#2563eb', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>iT</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#101828', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {allowed.find(n => isActive(n.to))?.label ?? 'iTechArena'}
            </div>
          </div>
          <div style={{ width: 30, height: 30, background: '#2563eb', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
            {user?.fullName?.charAt(0)?.toUpperCase() || 'A'}
          </div>
        </header>

        <OfflineBanner />

        {/* Bottom padding clears the tab bar and the floating scan button. */}
        <main style={{ flex: 1, minHeight: 0, paddingBottom: 78 }}>{children}</main>

        <nav style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 120,
          background: '#fff', borderTop: '1px solid #e4e7ec',
          display: 'grid', gridTemplateColumns: `repeat(${tabs.length + 1}, 1fr)`,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}>
          {tabs.map(n => {
            const active = isActive(n.to);
            return (
              <Link key={n.to} to={n.to} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 3, padding: '9px 2px 7px', textDecoration: 'none',
                color: active ? '#2563eb' : '#98a2b3', fontSize: 10.5, fontWeight: active ? 700 : 500,
              }}>
                <NavIcon svg={n.svg} size={21} />
                <span style={{ whiteSpace: 'nowrap' }}>{n.short ?? n.label}</span>
              </Link>
            );
          })}
          <button onClick={() => setDrawer(true)} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 3, padding: '9px 2px 7px', border: 'none', background: 'none',
            color: '#98a2b3', fontSize: 10.5, fontWeight: 500, cursor: 'pointer',
          }}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
            </svg>
            <span>More</span>
          </button>
        </nav>

        {drawer && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
            <div onClick={() => setDrawer(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.45)' }} />
            <div style={{
              position: 'absolute', top: 0, left: 0, bottom: 0, width: 268, maxWidth: '82%',
              background: '#fff', display: 'flex', flexDirection: 'column',
              boxShadow: '4px 0 24px rgba(0,0,0,.18)', paddingTop: 'env(safe-area-inset-top)',
            }}>
              <div style={{ padding: 16, borderBottom: '1px solid #f2f4f7', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, background: '#2563eb', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 800 }}>iT</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#101828' }}>iTechArena</div>
                  <div style={{ fontSize: 10, color: '#98a2b3', textTransform: 'uppercase', letterSpacing: '.08em' }}>ERP System</div>
                </div>
              </div>
              <nav style={{ flex: 1, padding: '8px 10px', overflowY: 'auto' }}>
                {allowed.map(n => {
                  const active = isActive(n.to);
                  return (
                    <Link key={n.to} to={n.to} style={{
                      display: 'flex', alignItems: 'center', gap: 11,
                      padding: 12, borderRadius: 9, marginBottom: 2,
                      textDecoration: 'none', fontSize: 14.5, fontWeight: active ? 700 : 500,
                      color: active ? '#2563eb' : '#475467', background: active ? '#eff6ff' : 'transparent',
                    }}>
                      <NavIcon svg={n.svg} size={19} />
                      <span>{n.label}</span>
                    </Link>
                  );
                })}
              </nav>
              <div style={{ padding: 12, borderTop: '1px solid #f2f4f7', paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px' }}>
                  <div style={{ width: 32, height: 32, background: '#2563eb', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700 }}>
                    {user?.fullName?.charAt(0)?.toUpperCase() || 'A'}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#101828', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.fullName || 'Administrator'}</div>
                    <div style={{ fontSize: 10, color: user?.roles?.length ? '#98a2b3' : '#dc2626', textTransform: 'uppercase' }}>{user?.roles?.[0] || 'No role assigned'}</div>
                  </div>
                </div>
                <button onClick={() => { logout(); navigate('/login'); }}
                  style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '11px 10px', borderRadius: 8, color: '#dc2626', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Sign out
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

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
          {allowed.map(n => {
            const active = isActive(n.to);
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
              <div style={{ fontSize: 10, color: user?.roles?.length ? '#98a2b3' : '#dc2626', textTransform: 'uppercase', letterSpacing: '.04em' }}>{user?.roles?.[0] || 'No role assigned'}</div>
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
        <OfflineBanner />
        {children}
      </main>
    </div>
  );
}
