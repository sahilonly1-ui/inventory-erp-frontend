import { ReactNode, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getAccessToken } from '../api/client';
import { connectSocket, disconnectSocket } from '../realtime/socket';

const NAV = [
  { to: '/',         label: 'Dashboard',  icon: '▦'  },
  { to: '/products', label: 'Products',   icon: '⬡'  },
  { to: '/stock-in', label: 'Stock In',   icon: '📥'  },
  { to: '/stock-out',label: 'Stock Out',  icon: '📤'  },
  { to: '/imei',     label: 'IMEI',       icon: '⊕'  },
  { to: '/vendors',  label: 'Vendors',    icon: '🏢'  },
  { to: '/reports',  label: 'Reports',    icon: '📊'  },
  { to: '/versions', label: 'Versions',   icon: '🕓'  },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const navigate = useNavigate();
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const socket = connectSocket(token);
    socket.on('stock.changed', (e: { quantity: number; type: string }) => {
      const text = e.quantity > 0 ? `+${e.quantity} units received` : `${e.quantity} units dispatched`;
      setToasts(ts => [...ts, { id: Date.now(), text }]);
      setTimeout(() => setToasts(ts => ts.slice(1)), 4000);
    });
    return () => { disconnectSocket(); };
  }, []);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--surf-2)' }}>
      {/* Sidebar */}
      <aside className="sidebar">
        {/* Logo */}
        <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid var(--bdr)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: 'var(--brand)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700 }}>iT</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)', lineHeight: 1.2 }}>iTechArena</div>
              <div style={{ fontSize: 10, color: 'var(--txt-3)', letterSpacing: '.06em', textTransform: 'uppercase' }}>ERP System</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '8px 8px', overflowY: 'auto' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '.08em', padding: '10px 8px 6px' }}>Main Menu</div>
          {NAV.map(n => {
            const active = n.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.to);
            return (
              <Link key={n.to} to={n.to} className={`nav-link${active ? ' active' : ''}`}>
                <span style={{ fontSize: 14 }}>{n.icon}</span>
                <span>{n.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div style={{ padding: '10px 8px', borderTop: '1px solid var(--bdr)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', marginBottom: 4 }}>
            <div style={{ width: 28, height: 28, background: 'var(--brand)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
              {user?.fullName?.charAt(0)?.toUpperCase() || 'A'}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.fullName || 'Administrator'}</div>
              <div style={{ fontSize: 10, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{user?.roles?.[0] || 'ADMIN'}</div>
            </div>
          </div>
          <button className="btn-signout" onClick={() => { logout(); navigate('/login'); }}>Sign out</button>
        </div>
      </aside>

      {/* Content */}
      <main className="content">
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>{children}</div>
      </main>

      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div className="toasts">
          {toasts.map(t => <div key={t.id} className="toast">{t.text}</div>)}
        </div>
      )}
    </div>
  );
}
