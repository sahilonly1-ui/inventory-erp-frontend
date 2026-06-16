import { ReactNode, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getAccessToken } from '../api/client';
import { connectSocket, disconnectSocket } from '../realtime/socket';

const NAV = [
  { to: '/', label: 'Dashboard', icon: '▦' },
  { to: '/products', label: 'Products', icon: '⬡' },
  { to: '/inventory', label: 'Inventory', icon: '⊟' },
  { to: '/imei', label: 'IMEI', icon: '⊕' },
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
      const id = Date.now() + Math.random();
      setToasts(t => [...t, { id, text: `${e.type} → qty ${e.quantity}` }]);
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
    });
    return () => disconnectSocket();
  }, []);

  const initials = (user?.fullName || 'A').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo">iT</div>
          <div>
            <div className="sidebar-brand-name">iTechArena</div>
            <div className="sidebar-brand-sub">ERP System</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Main Menu</div>
          {NAV.map(n => (
            <Link key={n.to} to={n.to}
              className={`sidebar-link${loc.pathname === n.to ? ' active' : ''}`}>
              <span style={{ fontSize: 14, width: 16, textAlign: 'center', flexShrink: 0 }}>{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">{initials}</div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{user?.fullName || 'Administrator'}</div>
              <div className="sidebar-user-role">{user?.roles?.join(', ') || 'ADMIN'}</div>
            </div>
          </div>
          <button className="btn-signout" onClick={() => { logout(); navigate('/login'); }}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">{children}</main>
      <div className="toasts">
        {toasts.map(t => <div key={t.id} className="toast">{t.text}</div>)}
      </div>
    </div>
  );
}
