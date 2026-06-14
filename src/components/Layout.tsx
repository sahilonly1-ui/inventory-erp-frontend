import { ReactNode, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getAccessToken } from '../api/client';
import { connectSocket, disconnectSocket } from '../realtime/socket';

const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/products', label: 'Products' },
  { to: '/inventory', label: 'Inventory' },
  { to: '/imei', label: 'IMEI' },
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
      setToasts((t) => [...t, { id, text: `${e.type} → qty ${e.quantity}` }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
    });
    return () => disconnectSocket();
  }, []);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">iTechArena <span>ERP</span></div>
        <nav>
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className={loc.pathname === n.to ? 'active' : ''}>{n.label}</Link>
          ))}
        </nav>
        <div className="user">
          <div className="name">{user?.fullName}</div>
          <div className="role">{user?.roles?.join(', ')}</div>
          <button onClick={() => { logout(); navigate('/login'); }}>Sign out</button>
        </div>
      </aside>
      <main className="content">{children}</main>
      <div className="toasts">{toasts.map((t) => <div key={t.id} className="toast">{t.text}</div>)}</div>
    </div>
  );
}
