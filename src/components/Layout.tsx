import { ReactNode, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import OfflineBanner from '../native/OfflineBanner';
import { useIsPhone } from '../mobile/ui';
import { biometricEnabled, disableBiometric } from '../native/biometric';
import { isNative } from '../native/scanner';

type Group = 'Operations' | 'Inventory' | 'Masters' | 'Analytics' | 'System';
type NavItem = { to: string; label: string; short?: string; svg: string; perm?: string; primary?: boolean; group: Group };

const NAV: NavItem[] = [
  { group: 'Operations', to: '/',          label: 'Dashboard', short: 'Home', primary: true, svg: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>' },
  { group: 'Inventory', to: '/products',  label: 'Product Master', short: 'Products', svg: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>' },
  { group: 'Operations', to: '/opening-stock', label: 'Opening Stock', short: 'Opening', svg: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M3.27 6.96L12 12.01l8.73-5.05"/>' },
  { group: 'Operations', to: '/stock-in',  label: 'Stock In', short: 'Stock In', primary: true, svg: '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>' },
  { group: 'Operations', to: '/stock-out', label: 'Stock Out', short: 'Stock Out', primary: true, svg: '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>' },
  { group: 'Inventory', to: '/product-history', label: 'Product History', short: 'History', svg: '<path d="M3 3v18h18"/><path d="M18 9l-5 5-3-3-4 4"/>' },
  { group: 'Inventory', to: '/imei',      label: 'IMEI Tracker', short: 'IMEI', primary: true, svg: '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>' },
  { group: 'Masters', to: '/suppliers', label: 'Supplier Master',  svg: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' },
  { group: 'Inventory', to: '/stock-report', label: 'Stock Report', short: 'Report', svg: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/><rect x="13" y="13" width="2" height="5"/><rect x="7" y="11" width="2" height="7"/>' },
  { group: 'Analytics', to: '/reports',   label: 'Reports',          svg: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>' },
  { group: 'System', to: '/versions',  label: 'Version History', short: 'History', svg: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>' },
  { group: 'System', to: '/users',     label: 'Users & Access',   svg: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 11l-3 3-1.5-1.5"/>', perm: 'users.read' },
];


const GROUPS: Group[] = ['Operations', 'Inventory', 'Masters', 'Analytics', 'System'];
// Order within a group follows the working day: dashboard, receive, dispatch.
const ORDER = ['/', '/stock-in', '/stock-out', '/opening-stock', '/products', '/imei', '/stock-report', '/product-history', '/suppliers', '/reports', '/versions', '/users'];

function NavIcon({ svg, size = 16 }: { svg: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} dangerouslySetInnerHTML={{ __html: svg }} />
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="nav-brand">
      <div className="nav-logo">iT</div>
      {!compact && (
        <div style={{ minWidth: 0 }}>
          <div className="nav-brand-name">iTechArena</div>
          <div className="nav-brand-sub">ERP system</div>
        </div>
      )}
    </div>
  );
}

/** Grouped navigation shared by the desktop sidebar and the phone drawer. */
function NavList({ items, isActive, size }: { items: NavItem[]; isActive: (to: string) => boolean; size: 'desk' | 'phone' }) {
  return (
    <nav className={`nav-list nav-${size}`}>
      {GROUPS.map(g => {
        const list = items.filter(n => n.group === g).sort((a, b) => ORDER.indexOf(a.to) - ORDER.indexOf(b.to));
        if (!list.length) return null;
        return (
          <div key={g} className="nav-group">
            <div className="nav-group-label">{g}</div>
            {list.map(n => (
              <Link key={n.to} to={n.to} className={`nav-link${isActive(n.to) ? ' active' : ''}`} aria-current={isActive(n.to) ? 'page' : undefined}>
                <NavIcon svg={n.svg} size={size === 'phone' ? 19 : 16} />
                <span>{n.label}</span>
              </Link>
            ))}
          </div>
        );
      })}
    </nav>
  );
}

function UserFooter({ onSignOut }: { onSignOut: () => void }) {
  const { user } = useAuth();
  const [bio, setBio] = useState(biometricEnabled());
  return (
    <div className="nav-footer">
      <div className="nav-user">
        <div className="nav-avatar">{user?.fullName?.charAt(0)?.toUpperCase() || 'A'}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="nav-user-name">{user?.fullName || 'Administrator'}</div>
          <div className="nav-user-role" style={{ color: user?.roles?.length ? undefined : '#dc2626' }}>{user?.roles?.[0] || 'No role assigned'}</div>
        </div>
      </div>
      {bio && (
        <button className="nav-signout" style={{ color: '#475467' }}
          onClick={async () => { if (confirm('Turn off fingerprint sign-in on this phone?')) { await disableBiometric(); setBio(false); } }}>
          Fingerprint sign-in: on · Turn off
        </button>
      )}
      <button className="nav-signout" onClick={onSignOut}>Sign out</button>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const navigate = useNavigate();
  const isPhone = useIsPhone();
  const [drawer, setDrawer] = useState(false);
  const edgeRef = useRef<{ x: number; y: number } | null>(null);
  const drawerRef = useRef(drawer);
  drawerRef.current = drawer;

  // Android back button: close the menu first, then go back a screen, and
  // only leave the app from the dashboard — the way other Android apps behave.
  useEffect(() => {
    if (!isNative()) return;
    let off: (() => void) | undefined;
    (async () => {
      const { App } = await import('@capacitor/app');
      const h = await App.addListener('backButton', () => {
        if (document.querySelector('[data-sheet-open]')) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return; }
        if (drawerRef.current) { setDrawer(false); return; }
        if (window.location.pathname !== '/' && window.location.pathname !== '/login') { navigate(-1); return; }
        App.exitApp();
      });
      off = () => { void h.remove(); };
    })();
    return () => off?.();
  }, [navigate]);

  const allowed = NAV.filter(n => !n.perm || (user?.permissions ?? []).some(p => p === '*' || p === n.perm));
  const isActive = (to: string) => (to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(to));
  const signOut = () => { logout(); navigate('/login'); };

  // Close the drawer on navigation so it never lingers over the page just chosen.
  useEffect(() => { setDrawer(false); }, [loc.pathname]);
  // Esc closes it too, and the page underneath must not scroll while it is open.
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [drawer]);

  if (isPhone) {
    // No bottom tab bar: every screen gets its full height, and the drawer
    // (hamburger or a swipe from the left edge) holds the whole menu.
    const current = allowed.find(n => isActive(n.to));
    return (
      <div className="m-shell">
        <header className="m-header" data-keep-row>
          <button className="m-icon-btn" onClick={() => setDrawer(true)} aria-label="Open menu">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="14" y2="17" />
            </svg>
          </button>
          <div className="m-title">{current?.label ?? 'iTechArena'}</div>
          <div className="nav-avatar" aria-hidden="true">{user?.fullName?.charAt(0)?.toUpperCase() || 'A'}</div>
        </header>
        <OfflineBanner />
        <main className="m-main"
          onTouchStart={e => { const t = e.touches[0]; edgeRef.current = t.clientX < 20 ? { x: t.clientX, y: t.clientY } : null; }}
          onTouchMove={e => {
            const st = edgeRef.current; if (!st) return;
            const t = e.touches[0];
            if (t.clientX - st.x > 60 && Math.abs(t.clientY - st.y) < 40) { edgeRef.current = null; setDrawer(true); }
          }}>
          {children}
        </main>
        {drawer && (
          <div className="m-drawer-wrap" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="m-backdrop" onClick={() => setDrawer(false)} />
            <aside className="m-drawer">
              <div className="m-drawer-head">
                <Brand />
                <button className="m-icon-btn" onClick={() => setDrawer(false)} aria-label="Close menu">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
                </button>
              </div>
              <NavList items={allowed} isActive={isActive} size="phone" />
              <UserFooter onSignOut={signOut} />
            </aside>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="d-shell">
      <aside className="d-sidebar">
        <div className="d-sidebar-head"><Brand /></div>
        <NavList items={allowed} isActive={isActive} size="desk" />
        <UserFooter onSignOut={signOut} />
      </aside>
      <main className="d-main">
        <OfflineBanner />
        {children}
      </main>
    </div>
  );
}
