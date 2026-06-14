import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Paged, StockRow } from '../api/types';

export function Dashboard() {
  const [stock, setStock] = useState<StockRow[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Paged<StockRow>>('/inventory/stock?limit=20').then((d) => setStock(d.items)).catch((e) => setError(e.message));
  }, []);

  const totalUnits = stock.reduce((s, r) => s + r.quantity, 0);

  return (
    <div>
      <h1>Dashboard</h1>
      <div className="cards">
        <div className="card stat"><div className="stat-label">Stock rows</div><div className="stat-value">{stock.length}</div></div>
        <div className="card stat"><div className="stat-label">Units (top 20)</div><div className="stat-value">{totalUnits}</div></div>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="card">
        <h2>Recent stock levels</h2>
        <table>
          <thead><tr><th>Product</th><th>Warehouse</th><th>Qty</th></tr></thead>
          <tbody>
            {stock.map((r, i) => (
              <tr key={i}><td>{r.productId.slice(0, 8)}…</td><td>{r.warehouseName ?? r.warehouseId.slice(0, 8)}</td><td>{r.quantity}</td></tr>
            ))}
            {!stock.length && <tr><td colSpan={3} className="muted">No stock yet — add products and stock-in.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
