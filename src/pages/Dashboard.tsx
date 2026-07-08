import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';

interface DashStats {
  products: number; activeProducts: number; vendors: number;
  categories: number; brands: number;
  today: { stockIn: number; stockOut: number; imeiScanned: number };
}
interface DailySummary {
  date: string;
  totals: { stockInUnits: number; stockOutUnits: number; stockInTxns: number; stockOutTxns: number; imeiIn: number; imeiOut: number };
  byProduct: { productId: string; ean: string; model: string; brand: string; inQty: number; outQty: number; vendors: string[] }[];
  recentTxns: { id: string; type: string; qty: number; product: string; vendor?: string; warehouse: string; createdAt: string }[];
}

const fmt = (n: number) => n.toLocaleString('en-IN');
const fmtT = (s: string) => new Date(s).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

export function Dashboard() {
  const [stats, setStats] = useState<DashStats | null>(null);
  const [daily, setDaily] = useState<DailySummary | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, d] = await Promise.all([
        api<DashStats>('/inventory/dashboard-stats'),
        api<DailySummary>(`/inventory/daily-summary?date=${date}`),
      ]);
      setStats(s); setDaily(d);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const kpis = stats ? [
    { ico: '📦', val: stats.products, lbl: 'Total Products', clr: '' },
    { ico: '✅', val: stats.activeProducts, lbl: 'Active Products', clr: 'var(--ok)' },
    { ico: '🏢', val: stats.vendors, lbl: 'Vendors', clr: '#7c3aed' },
    { ico: null, val: stats.brands, lbl: 'Brands', clr: '#2563eb' },
    { ico: '📂', val: stats.categories, lbl: 'Categories', clr: 'var(--info)' },
    { ico: '📱', val: stats.today.imeiScanned, lbl: 'IMEIs Today', clr: '#0891b2' },
  ] : [];

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">iTechArena Inventory ERP</div>
        </div>
        <div className="page-actions">
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ height: 32, padding: '0 10px', border: '1px solid var(--bdr)', borderRadius: 'var(--r-md)', fontSize: 12, background: 'var(--surf-0)', color: 'var(--txt)' }} />
          <button className="btn btn-secondary" onClick={load} style={{ fontSize: 12, height: 32 }}>↺ Refresh</button>
        </div>
      </div>

      {loading && <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" style={{ width: 28, height: 28 }} /></div>}

      {!loading && (
        <>
          {/* KPI grid */}
          <div className="kpi-grid">
            {kpis.map(k => (
              <div key={k.lbl} className="kpi-card">
                <div className="kpi-icon" style={{ background: '#f8fafc', fontSize: 15 }}>
                  {k.ico === null ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                      <path d="M12 8a4 4 0 1 0-4-4"/><path d="M4 13.5V7a2 2 0 0 1 2-2h6.5a2 2 0 0 1 1.41.59l8 8a2 2 0 0 1 0 2.82l-6.59 6.59a2 2 0 0 1-2.82 0l-8-8A2 2 0 0 1 4 13.5Z"/>
                      <circle cx="8.5" cy="8.5" r="1.25" fill="#2563eb" stroke="none"/>
                    </svg>
                  ) : k.ico}
                </div>
                <div className="kpi-value" style={k.clr ? { color: k.clr } : {}}>{fmt(k.val ?? 0)}</div>
                <div className="kpi-label">{k.lbl}</div>
              </div>
            ))}
          </div>

          {/* Today's movements */}
          {daily && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 'var(--r-lg)', padding: '16px 20px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Stock In — {date}</div>
                <div style={{ display: 'flex', gap: 24 }}>
                  <div><div style={{ fontSize: 28, fontWeight: 700, color: '#16a34a' }}>{fmt(daily.totals.stockInUnits)}</div><div style={{ fontSize: 11, color: '#4ade80' }}>Units received</div></div>
                  <div><div style={{ fontSize: 28, fontWeight: 700, color: '#16a34a' }}>{daily.totals.imeiIn}</div><div style={{ fontSize: 11, color: '#4ade80' }}>IMEIs in</div></div>
                  <div><div style={{ fontSize: 28, fontWeight: 700, color: '#16a34a' }}>{daily.totals.stockInTxns}</div><div style={{ fontSize: 11, color: '#4ade80' }}>Transactions</div></div>
                </div>
              </div>
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--r-lg)', padding: '16px 20px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Stock Out — {date}</div>
                <div style={{ display: 'flex', gap: 24 }}>
                  <div><div style={{ fontSize: 28, fontWeight: 700, color: '#dc2626' }}>{fmt(daily.totals.stockOutUnits)}</div><div style={{ fontSize: 11, color: '#f87171' }}>Units dispatched</div></div>
                  <div><div style={{ fontSize: 28, fontWeight: 700, color: '#dc2626' }}>{daily.totals.imeiOut}</div><div style={{ fontSize: 11, color: '#f87171' }}>IMEIs sold</div></div>
                  <div><div style={{ fontSize: 28, fontWeight: 700, color: '#dc2626' }}>{daily.totals.stockOutTxns}</div><div style={{ fontSize: 11, color: '#f87171' }}>Transactions</div></div>
                </div>
              </div>
            </div>
          )}

          {/* Daily product summary */}
          {daily && daily.byProduct.length > 0 && (
            <div className="grid-wrap" style={{ marginBottom: 16 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--bdr-s)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Product Movement — {date}</span>
                <span style={{ fontSize: 11, color: 'var(--txt-3)' }}>{daily.byProduct.length} products</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--surf-1)' }}>
                    {['EAN', 'Product', 'Brand', 'In ↑', 'Out ↓', 'Vendors'].map(h => (
                      <th key={h} style={{ padding: '7px 12px', textAlign: h === 'In ↑' || h === 'Out ↓' ? 'right' : 'left', fontWeight: 600, color: 'var(--txt-3)', fontSize: 10, textTransform: 'uppercase', borderBottom: '1px solid var(--bdr)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {daily.byProduct.map((r, i) => (
                    <tr key={r.productId} style={{ borderBottom: '1px solid var(--bdr-s)', background: i % 2 === 0 ? 'transparent' : 'var(--surf-1)' }}>
                      <td style={{ padding: '7px 12px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--txt-3)' }}>{r.ean}</td>
                      <td style={{ padding: '7px 12px', fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.model}</td>
                      <td style={{ padding: '7px 12px', color: 'var(--txt-2)' }}>{r.brand}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>{r.inQty > 0 ? `+${r.inQty}` : '—'}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>{r.outQty > 0 ? `-${r.outQty}` : '—'}</td>
                      <td style={{ padding: '7px 12px', color: 'var(--txt-3)', fontSize: 11 }}>{r.vendors.join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Recent transactions */}
          {daily && daily.recentTxns.length > 0 && (
            <div className="grid-wrap">
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--bdr-s)', fontSize: 13, fontWeight: 600 }}>Recent Transactions</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--surf-1)' }}>
                    {['Time', 'Type', 'Product', 'Qty', 'Warehouse', 'Vendor'].map(h => (
                      <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--txt-3)', fontSize: 10, textTransform: 'uppercase', borderBottom: '1px solid var(--bdr)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {daily.recentTxns.map((t, i) => (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--bdr-s)', background: i % 2 === 0 ? 'transparent' : 'var(--surf-1)' }}>
                      <td style={{ padding: '7px 12px', color: 'var(--txt-3)', fontSize: 11 }}>{fmtT(t.createdAt)}</td>
                      <td style={{ padding: '7px 12px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 'var(--r-full)', fontSize: 10, fontWeight: 700, background: t.qty > 0 ? '#f0fdf4' : '#fef2f2', color: t.qty > 0 ? '#16a34a' : '#dc2626' }}>{t.type.replace('_', ' ')}</span>
                      </td>
                      <td style={{ padding: '7px 12px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.product}</td>
                      <td style={{ padding: '7px 12px', fontWeight: 600, color: t.qty > 0 ? '#16a34a' : '#dc2626' }}>{t.qty > 0 ? `+${t.qty}` : t.qty}</td>
                      <td style={{ padding: '7px 12px', color: 'var(--txt-3)' }}>{t.warehouse}</td>
                      <td style={{ padding: '7px 12px', color: 'var(--txt-2)' }}>{t.vendor || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {daily && daily.byProduct.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--txt-3)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>No movements on {date}</div>
              <div style={{ fontSize: 12, marginTop: 6 }}>Use Stock In or Stock Out to record inventory movements</div>
            </div>
          )}
        </>
      )}
    </>
  );
}
