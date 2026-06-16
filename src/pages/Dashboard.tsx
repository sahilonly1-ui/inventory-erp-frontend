import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Paged, StockRow } from '../api/types';

export function Dashboard() {
  const [stock, setStock] = useState<StockRow[]>([]);
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Paged<StockRow>>('/inventory/stock?limit=20')
      .then(d => setStock(d.items))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const totalUnits = stock.reduce((s, r) => s + r.quantity, 0);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">Overview of your inventory</div>
        </div>
      </div>

      <div className="page-body">
        {/* KPI Cards */}
        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          <div className="kpi-card">
            <div className="kpi-icon" style={{ background: '#eff6ff' }}>📦</div>
            <div className="kpi-value">{stock.length}</div>
            <div className="kpi-label">Stock Entries</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon" style={{ background: '#f0fdf4' }}>🔢</div>
            <div className="kpi-value" style={{ color: 'var(--success)' }}>{totalUnits}</div>
            <div className="kpi-label">Total Units (top 20)</div>
          </div>
        </div>

        {error && (
          <div className="alert alert-error">{error}</div>
        )}

        {/* Stock Table */}
        <div className="grid-wrap">
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Recent Stock Levels</span>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Top 20 entries</span>
          </div>
          {loading ? (
            <div className="empty-state">
              <div className="spinner" style={{ margin: '0 auto 12px' }} />
              <div className="empty-text">Loading…</div>
            </div>
          ) : (
            <table className="grid-table">
              <thead className="grid-thead">
                <tr>
                  <th>Product ID</th>
                  <th>Warehouse</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                </tr>
              </thead>
              <tbody>
                {stock.length === 0 && (
                  <tr><td colSpan={3}>
                    <div className="empty-state" style={{ padding: '40px 24px' }}>
                      <div className="empty-icon">📭</div>
                      <div className="empty-title">No stock entries yet</div>
                      <div className="empty-text">Import products and run the warehouse mapping tool to see stock here.</div>
                    </div>
                  </td></tr>
                )}
                {stock.map((r, i) => (
                  <tr key={i} className="grid-row">
                    <td><span className="col-ean">{r.productId.slice(0, 10)}…</span></td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{r.warehouseName ?? 'Main Warehouse'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className={`stock-pill ${r.quantity === 0 ? 'out' : r.quantity <= 5 ? 'low' : 'in'}`}>{r.quantity}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
