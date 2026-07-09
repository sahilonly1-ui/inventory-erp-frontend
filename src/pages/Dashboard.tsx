import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';

interface DashStats { products: number; activeProducts: number; vendors: number; categories: number; brands: number; today: { stockIn: number; stockOut: number; imeiScanned: number; }; }
interface DailySummary { totals: { stockInUnits: number; stockOutUnits: number; imeiIn: number; imeiOut: number; stockInTxns: number; stockOutTxns: number }; byProduct: { productId: string; ean: string; model: string; brand: string; inQty: number; outQty: number; vendors: string[] }[]; recentTxns: { id: string; type: string; qty: number; product: string; vendor?: string; warehouse: string; createdAt: string }[]; }

const fmt = (n: number) => n?.toLocaleString('en-IN') ?? '0';
const fmtT = (s: string) => new Date(s).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

export function Dashboard() {
  const [stats, setStats] = useState<DashStats | null>(null);
  const [daily, setDaily] = useState<DailySummary | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'in'|'out'|'movement'>('in');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, d] = await Promise.all([
        api<DashStats>('/inventory/dashboard-stats'),
        api<DailySummary>(`/inventory/daily-summary?date=${date}`),
      ]);
      setStats(s); setDaily(d);
    } catch {}
    finally { setLoading(false); }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const stockInProducts = daily?.byProduct.filter(p => p.inQty > 0) ?? [];
  const stockOutProducts = daily?.byProduct.filter(p => p.outQty > 0) ?? [];

  // Group stock-in by vendor (from transactions)
  const vendorGroups = (daily?.recentTxns ?? [])
    .filter(t => t.qty > 0)
    .reduce((acc: any, t) => { const v = t.vendor || 'No Vendor'; if (!acc[v]) acc[v] = []; acc[v].push(t); return acc; }, {});

  const customerGroups = (daily?.recentTxns ?? [])
    .filter(t => t.qty < 0)
    .reduce((acc: any, t) => { const v = t.vendor || 'Customer'; if (!acc[v]) acc[v] = []; acc[v].push(t); return acc; }, {});

  return (
    <div style={{ height: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Compact header */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #e4e7ec', background: '#fff', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#101828' }}>Operational Dashboard</div>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ height: 28, padding: '0 8px', border: '1px solid #d0d5dd', borderRadius: 6, fontSize: 12, background: '#fff', color: '#344054', marginLeft: 'auto' }} />
        <button onClick={load} style={{ height: 28, padding: '0 12px', border: '1px solid #d0d5dd', borderRadius: 6, background: '#fff', fontSize: 12, cursor: 'pointer', color: '#344054' }}>↺</button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}><div className="spinner" style={{ width: 28, height: 28 }} /></div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
          {/* KPI strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 14 }}>
            {[
              { l: 'Total Products', v: stats?.products, c: '#344054' },
              { l: 'Active', v: stats?.activeProducts, c: '#16a34a' },
              { l: 'Brands', v: stats?.brands, c: '#2563eb' },
              { l: 'Categories', v: stats?.categories, c: '#7c3aed' },
              { l: 'Vendors', v: stats?.vendors, c: '#0891b2' },
              { l: `Stock In (${date.slice(5)})`, v: daily?.totals.stockInUnits, c: '#16a34a' },
              { l: `Stock Out (${date.slice(5)})`, v: daily?.totals.stockOutUnits, c: '#dc2626' },
            ].map(k => (
              <div key={k.l} style={{ background: '#fff', border: '1px solid #e4e7ec', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: k.c, lineHeight: 1.2 }}>{fmt(k.v ?? 0)}</div>
                <div style={{ fontSize: 10, color: '#667085', marginTop: 2, lineHeight: 1.3 }}>{k.l}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid #e4e7ec', marginBottom: 12 }}>
            {([['in','📥 Stock In Today'],['out','📤 Stock Out Today'],['movement','📊 Product Movement']] as const).map(([t, l]) => (
              <button key={t} onClick={() => setTab(t)} style={{ padding: '7px 16px', fontSize: 12, fontWeight: tab === t ? 700 : 500, color: tab === t ? '#2563eb' : '#667085', background: 'none', border: 'none', borderBottom: `2px solid ${tab === t ? '#2563eb' : 'transparent'}`, cursor: 'pointer', transition: 'all .1s' }}>{l}</button>
            ))}
          </div>

          {/* Tab: Stock In — grouped by vendor */}
          {tab === 'in' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>RECEIVED — By Vendor</div>
                {Object.keys(vendorGroups).length === 0 && <div style={{ color: '#98a2b3', fontSize: 13 }}>No stock received on {date}</div>}
                {Object.entries(vendorGroups).map(([vendor, txns]: any) => {
                  const total = txns.reduce((s: number, t: any) => s + t.qty, 0);
                  const products = txns.reduce((acc: any, t: any) => { const k = t.product.split('(')[0].trim(); acc[k] = (acc[k]||0)+t.qty; return acc; }, {});
                  return (
                    <div key={vendor} style={{ background: '#fff', border: '1px solid #e4e7ec', borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
                      <div style={{ padding: '8px 12px', background: '#f8fffe', borderBottom: '1px solid #e4e7ec', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 13 }}>
                        <span style={{ color: '#101828' }}>{vendor}</span>
                        <span style={{ color: '#16a34a' }}>+{total} units</span>
                      </div>
                      <div style={{ padding: '6px 0' }}>
                        {Object.entries(products).map(([model, qty]: any) => (
                          <div key={model} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 12px', fontSize: 12, color: '#344054' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{model}</span>
                            <span style={{ fontWeight: 600, color: '#16a34a' }}>+{qty}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>TOP RECEIVED PRODUCTS</div>
                <div style={{ background: '#fff', border: '1px solid #e4e7ec', borderRadius: 8, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead><tr style={{ background: '#f2f4f7' }}>
                      {['Product','Units In'].map(h => <th key={h} style={{ padding: '7px 10px', textAlign: h === 'Units In' ? 'right' : 'left', fontWeight: 600, color: '#475467', fontSize: 10, textTransform: 'uppercase', borderBottom: '1px solid #e4e7ec' }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {stockInProducts.sort((a,b) => b.inQty - a.inQty).slice(0,15).map((p,i) => (
                        <tr key={p.productId} style={{ borderBottom: '1px solid #f2f4f7', background: i%2===0?'transparent':'#fafafa' }}>
                          <td style={{ padding: '6px 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{p.model}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>+{p.inQty}</td>
                        </tr>
                      ))}
                      {stockInProducts.length === 0 && <tr><td colSpan={2} style={{ padding: '20px 10px', textAlign: 'center', color: '#98a2b3', fontSize: 12 }}>No inbound products today</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Tab: Stock Out — grouped by customer */}
          {tab === 'out' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>DISPATCHED — By Customer</div>
                {Object.keys(customerGroups).length === 0 && <div style={{ color: '#98a2b3', fontSize: 13 }}>No dispatches on {date}</div>}
                {Object.entries(customerGroups).map(([party, txns]: any) => {
                  const total = Math.abs(txns.reduce((s: number, t: any) => s + t.qty, 0));
                  const products = txns.reduce((acc: any, t: any) => { const k = t.product.split('(')[0].trim(); acc[k] = (acc[k]||0)+Math.abs(t.qty); return acc; }, {});
                  return (
                    <div key={party} style={{ background: '#fff', border: '1px solid #e4e7ec', borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
                      <div style={{ padding: '8px 12px', background: '#fff8f8', borderBottom: '1px solid #e4e7ec', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 13 }}>
                        <span>{party}</span><span style={{ color: '#dc2626' }}>-{total} units</span>
                      </div>
                      <div style={{ padding: '6px 0' }}>
                        {Object.entries(products).map(([model, qty]: any) => (
                          <div key={model} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 12px', fontSize: 12, color: '#344054' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{model}</span>
                            <span style={{ fontWeight: 600, color: '#dc2626' }}>-{qty}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>TOP DISPATCHED PRODUCTS</div>
                <div style={{ background: '#fff', border: '1px solid #e4e7ec', borderRadius: 8, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead><tr style={{ background: '#f2f4f7' }}>
                      {['Product','Units Out'].map(h => <th key={h} style={{ padding: '7px 10px', textAlign: h === 'Units Out' ? 'right' : 'left', fontWeight: 600, color: '#475467', fontSize: 10, textTransform: 'uppercase', borderBottom: '1px solid #e4e7ec' }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {stockOutProducts.sort((a,b) => b.outQty - a.outQty).slice(0,15).map((p,i) => (
                        <tr key={p.productId} style={{ borderBottom: '1px solid #f2f4f7', background: i%2===0?'transparent':'#fafafa' }}>
                          <td style={{ padding: '6px 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{p.model}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>-{p.outQty}</td>
                        </tr>
                      ))}
                      {stockOutProducts.length === 0 && <tr><td colSpan={2} style={{ padding: '20px 10px', textAlign: 'center', color: '#98a2b3', fontSize: 12 }}>No dispatches today</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Tab: Full movement */}
          {tab === 'movement' && (
            <div style={{ background: '#fff', border: '1px solid #e4e7ec', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ background: '#f2f4f7', position: 'sticky', top: 0 }}>
                  {['Time','Type','Product','Qty','Warehouse'].map(h => (
                    <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 600, color: '#475467', fontSize: 10, textTransform: 'uppercase', borderBottom: '1px solid #e4e7ec', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {(daily?.recentTxns ?? []).map((t, i) => (
                    <tr key={t.id} style={{ borderBottom: '1px solid #f2f4f7', background: i%2===0?'#fff':'#fafafa' }}>
                      <td style={{ padding: '6px 12px', color: '#667085', fontFamily: 'var(--mono)', fontSize: 11 }}>{fmtT(t.createdAt)}</td>
                      <td style={{ padding: '6px 12px' }}>
                        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 700, background: t.qty > 0 ? '#dcfce7' : '#fee2e2', color: t.qty > 0 ? '#16a34a' : '#dc2626' }}>{t.type.replace(/_/g,' ')}</span>
                      </td>
                      <td style={{ padding: '6px 12px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.product}</td>
                      <td style={{ padding: '6px 12px', fontWeight: 700, color: t.qty > 0 ? '#16a34a' : '#dc2626' }}>{t.qty > 0 ? `+${t.qty}` : t.qty}</td>
                      <td style={{ padding: '6px 12px', color: '#667085' }}>{t.warehouse}</td>
                    </tr>
                  ))}
                  {!daily?.recentTxns?.length && <tr><td colSpan={5} style={{ padding: '30px 0', textAlign: 'center', color: '#98a2b3', fontSize: 13 }}>No transactions on {date}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
