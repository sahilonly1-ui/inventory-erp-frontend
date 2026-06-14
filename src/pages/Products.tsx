import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Paged, Product } from '../api/types';

const EMPTY = { ean: '', sku: '', model: '', brand: '', costPrice: '0', sellingPrice: '0', imeiRequired: false };

export function Products() {
  const [items, setItems] = useState<Product[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = () => api<Paged<Product>>('/products?limit=50').then((d) => setItems(d.items)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setMsg('');
    try {
      await api('/products', { method: 'POST', body: JSON.stringify({ ...form, costPrice: Number(form.costPrice), sellingPrice: Number(form.sellingPrice) }) });
      setMsg('Product created'); setForm(EMPTY); load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
  };

  return (
    <div>
      <h1>Products</h1>
      <div className="card">
        <h2>Add product</h2>
        <form className="grid-form" onSubmit={submit}>
          <label>EAN<input value={form.ean} onChange={(e) => setForm({ ...form, ean: e.target.value })} required /></label>
          <label>SKU<input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required /></label>
          <label>Model<input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} required /></label>
          <label>Brand<input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} required /></label>
          <label>Cost<input type="number" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} /></label>
          <label>Selling<input type="number" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} /></label>
          <label className="checkbox"><input type="checkbox" checked={form.imeiRequired} onChange={(e) => setForm({ ...form, imeiRequired: e.target.checked })} /> IMEI tracked (phones)</label>
          <button>Create</button>
        </form>
        {msg && <div className="success">{msg}</div>}
        {error && <div className="error">{error}</div>}
      </div>
      <div className="card">
        <h2>Catalog</h2>
        <table>
          <thead><tr><th>EAN</th><th>SKU</th><th>Model</th><th>Brand</th><th>IMEI</th><th>Price</th></tr></thead>
          <tbody>
            {items.map((p) => <tr key={p.id}><td>{p.ean}</td><td>{p.sku}</td><td>{p.model}</td><td>{p.brand}</td><td>{p.imeiRequired ? 'Yes' : 'No'}</td><td>{p.sellingPrice}</td></tr>)}
            {!items.length && <tr><td colSpan={6} className="muted">No products yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
