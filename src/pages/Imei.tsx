import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Paged, Product, Warehouse, ImeiRow } from '../api/types';

export function Imei() {
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [rows, setRows] = useState<ImeiRow[]>([]);
  const [productId, setProductId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [imeisText, setImeisText] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = () => api<Paged<ImeiRow>>('/imei?limit=50').then((d) => setRows(d.items)).catch(() => {});
  useEffect(() => {
    api<Paged<Product>>('/products?limit=200&imeiRequired=true').then((d) => setProducts(d.items)).catch(() => {});
    api<Warehouse[]>('/warehouses').then(setWarehouses).catch(() => {});
    load();
  }, []);

  const receive = async () => {
    setError(''); setMsg('');
    const imeis = imeisText.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).map((imei1) => ({ imei1 }));
    if (!imeis.length) { setError('Enter at least one IMEI'); return; }
    try {
      const r = await api<{ received: number; newQuantity: number }>('/imei/receive', {
        method: 'POST',
        body: JSON.stringify({ productId, warehouseId, imeis }),
      });
      setMsg(`Received ${r.received} — stock now ${r.newQuantity}`);
      setImeisText(''); load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  return (
    <div>
      <h1>IMEI</h1>
      <div className="card">
        <h2>Receive IMEIs <span className="muted">(stock-in for phones)</span></h2>
        <div className="grid-form">
          <label>Product
            <select value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Select…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.model} ({p.ean})</option>)}
            </select>
          </label>
          <label>Warehouse
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">Select…</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>
          <label className="full">IMEIs <span className="muted">(space, comma or newline separated)</span>
            <textarea rows={4} value={imeisText} onChange={(e) => setImeisText(e.target.value)} placeholder="356938035643809&#10;356938035643810" />
          </label>
          <button type="button" onClick={receive} disabled={!productId || !warehouseId}>Receive</button>
        </div>
        {msg && <div className="success">{msg}</div>}
        {error && <div className="error">{error}</div>}
      </div>
      <div className="card">
        <h2>IMEI units</h2>
        <table>
          <thead><tr><th>IMEI</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((r) => <tr key={r.id}><td>{r.imei1}</td><td><span className={`badge ${r.status.toLowerCase()}`}>{r.status}</span></td></tr>)}
            {!rows.length && <tr><td colSpan={2} className="muted">No IMEI units yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
