import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Paged, Product, Warehouse, StockRow } from '../api/types';

export function Inventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [productId, setProductId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const loadStock = () => api<Paged<StockRow>>('/inventory/stock?limit=50').then((d) => setStock(d.items)).catch(() => {});
  useEffect(() => {
    api<Paged<Product>>('/products?limit=200&imeiRequired=false').then((d) => setProducts(d.items)).catch(() => {});
    api<Warehouse[]>('/warehouses').then(setWarehouses).catch(() => {});
    loadStock();
  }, []);

  const move = async (direction: 'stock-in' | 'stock-out') => {
    setError(''); setMsg('');
    try {
      const r = await api<{ newQuantity: number }>(`/inventory/${direction}`, {
        method: 'POST',
        body: JSON.stringify({ productId, warehouseId, quantity: Number(quantity) }),
      });
      setMsg(`${direction} ok — new quantity ${r.newQuantity}`);
      loadStock();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  return (
    <div>
      <h1>Inventory</h1>
      <div className="card">
        <h2>Stock movement <span className="muted">(non-IMEI products)</span></h2>
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
          <label>Quantity<input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label>
          <div className="btn-row">
            <button type="button" onClick={() => move('stock-in')} disabled={!productId || !warehouseId}>Stock In</button>
            <button type="button" className="ghost" onClick={() => move('stock-out')} disabled={!productId || !warehouseId}>Stock Out</button>
          </div>
        </div>
        {msg && <div className="success">{msg}</div>}
        {error && <div className="error">{error}</div>}
      </div>
      <div className="card">
        <h2>Current stock</h2>
        <table>
          <thead><tr><th>Product</th><th>Warehouse</th><th>Qty</th></tr></thead>
          <tbody>
            {stock.map((r, i) => <tr key={i}><td>{r.productId.slice(0, 8)}…</td><td>{r.warehouseName ?? r.warehouseId.slice(0, 8)}</td><td>{r.quantity}</td></tr>)}
            {!stock.length && <tr><td colSpan={3} className="muted">No stock yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
