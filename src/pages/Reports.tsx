import { useState, useEffect } from 'react';
import { api } from '../api/client';

interface Warehouse { id: string; name: string; }

const REPORT_TYPES = [
  { value: 'stock_in',      label: 'Stock In Report',       icon: '📥', desc: 'All inbound stock movements' },
  { value: 'stock_out',     label: 'Stock Out Report',      icon: '📤', desc: 'All outbound dispatches' },
  { value: 'imei_summary',  label: 'IMEI Summary',          icon: '📱', desc: 'All IMEI inventory' },
  { value: 'product_summary', label: 'Product Summary',     icon: '📦', desc: 'Product-wise stock levels' },
  { value: 'vendor_summary',  label: 'Vendor Summary',      icon: '🏢', desc: 'Stock received per vendor' },
  { value: 'warehouse_summary', label: 'Warehouse Summary', icon: '🏭', desc: 'Stock by warehouse' },
  { value: 'audit_log',     label: 'Audit Log',             icon: '🔍', desc: 'All system changes' },
];

export function Reports() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [reportType, setReportType] = useState('stock_in');
  const [from, setFrom] = useState(() => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [warehouseId, setWarehouseId] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastRan, setLastRan] = useState<string | null>(null);

  useEffect(() => { api<Warehouse[]>('/warehouses').then(setWarehouses).catch(() => {}); }, []);

  const run = async () => {
    setLoading(true);
    try {
      const resp = await fetch(
        `${(import.meta.env.VITE_API_URL as string) ?? 'https://inventory-erp-backend-iplr.onrender.com/api/v1'}/reports/${reportType}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${(await import('../api/client')).getAccessToken()}` },
          body: JSON.stringify({ from: from ? new Date(from) : undefined, to: to ? new Date(to + 'T23:59:59Z') : undefined, warehouseId: warehouseId || undefined }),
        }
      );
      if (!resp.ok) { const j = await resp.json(); throw new Error(j?.error?.message || 'Failed'); }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const label = REPORT_TYPES.find(r => r.value === reportType)?.label ?? reportType;
      a.download = `${label.replace(/\s+/g, '_')}_${from}_to_${to}.xlsx`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setLastRan(new Date().toLocaleTimeString('en-IN'));
    } catch (e: any) { alert('Export failed: ' + e.message); }
    finally { setLoading(false); }
  };

  const selected = REPORT_TYPES.find(r => r.value === reportType);

  const inpS: React.CSSProperties = { height: 36, padding: '0 10px', border: '1px solid var(--bdr)', borderRadius: 'var(--r-md)', fontSize: 13, background: 'var(--surf-0)', color: 'var(--txt)', outline: 'none', width: '100%' };

  return (
    <>
      <div className="page-header">
        <div><div className="page-title">Reports</div><div className="page-subtitle">Export inventory data as XLSX</div></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>
        {/* Report type grid */}
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 16 }}>
            {REPORT_TYPES.map(r => (
              <div key={r.value} onClick={() => setReportType(r.value)}
                style={{ background: reportType === r.value ? 'var(--brand-l)' : 'var(--surf-0)', border: `1.5px solid ${reportType === r.value ? 'var(--brand)' : 'var(--bdr)'}`, borderRadius: 'var(--r-lg)', padding: '14px 16px', cursor: 'pointer', transition: 'all .12s' }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>{r.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: reportType === r.value ? 'var(--brand)' : 'var(--txt)' }}>{r.label}</div>
                <div style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 3 }}>{r.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Config panel */}
        <div className="grid-wrap" style={{ padding: '20px', alignSelf: 'start' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18 }}>
            <span style={{ fontSize: 24 }}>{selected?.icon}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{selected?.label}</div>
              <div style={{ fontSize: 11, color: 'var(--txt-3)' }}>{selected?.desc}</div>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-2)', display: 'block', marginBottom: 4 }}>From Date</label>
            <input type="date" style={inpS} value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-2)', display: 'block', marginBottom: 4 }}>To Date</label>
            <input type="date" style={inpS} value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-2)', display: 'block', marginBottom: 4 }}>Warehouse (optional)</label>
            <select style={inpS} value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
              <option value="">All warehouses</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>

          <button className="btn btn-primary" onClick={run} disabled={loading} style={{ width: '100%', height: 42, fontSize: 14 }}>
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Generating…
              </span>
            ) : '⬇ Download XLSX'}
          </button>

          {lastRan && (
            <div style={{ marginTop: 12, fontSize: 11, color: 'var(--ok)', textAlign: 'center' }}>✓ Last exported at {lastRan}</div>
          )}

          <div style={{ marginTop: 16, padding: '10px 12px', background: 'var(--surf-1)', borderRadius: 'var(--r-md)', fontSize: 11, color: 'var(--txt-3)' }}>
            <strong style={{ color: 'var(--txt-2)' }}>Quick ranges:</strong>
            {[['Today', 0], ['Last 7 days', 7], ['Last 30 days', 30], ['Last 90 days', 90]].map(([l, d]) => (
              <button key={l as string} onClick={() => { const now = new Date(); setTo(now.toISOString().slice(0, 10)); setFrom(new Date(now.getTime() - Number(d) * 86400000).toISOString().slice(0, 10)); }}
                style={{ display: 'block', background: 'none', border: 'none', color: 'var(--brand)', cursor: 'pointer', fontSize: 11, padding: '2px 0', textAlign: 'left' }}>{l as string}</button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
