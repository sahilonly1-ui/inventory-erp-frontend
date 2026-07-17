import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Category { id: string; name: string; }
interface Brand    { id: string; name: string; }

interface ReportRow {
  productId: string;
  ean: string;
  model: string;
  brand: string;
  category: string;
  totalQty: number;    // all IN_STOCK units
  retail: number;      // IN_STOCK & NOT swiped (available to sell)
  activated: number;   // IN_STOCK & swiped (demo/activated units)
}

interface ApiImeiUnit {
  productId: string; model: string; brand: string; category: string; ean: string;
  swiped: boolean; status: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

// ── Component ──────────────────────────────────────────────────────────────────
export function StockReport() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands,     setBrands]     = useState<Brand[]>([]);
  const [catFilter,  setCatFilter]  = useState<string>('');   // '' = all
  const [brandFilter,setBrandFilter]= useState<string>('');
  const [rows,       setRows]       = useState<ReportRow[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [lastFetch,  setLastFetch]  = useState<Date|null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // Load filter options
  useEffect(() => {
    api<{items:Category[]}>('/categories?limit=200').then(r => setCategories(r.items || [])).catch(()=>{});
    api<{items:Brand[]}   >('/brands?limit=200').then(r => setBrands(r.items || [])).catch(()=>{});
  }, []);

  // Fetch report data
  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all IN_STOCK IMEI units
      const params = new URLSearchParams({ status: 'IN_STOCK', limit: '2000' });
      if (catFilter)   params.set('categoryId', catFilter);
      if (brandFilter) params.set('brand', brandFilter);

      const data = await api<{ items: ApiImeiUnit[] }>(`/imei?${params}`);
      const units = data.items || [];

      // Group by product
      const map = new Map<string, ReportRow>();
      for (const u of units) {
        if (!map.has(u.productId)) {
          map.set(u.productId, {
            productId: u.productId, ean: u.ean,
            model: u.model, brand: u.brand, category: u.category,
            totalQty: 0, retail: 0, activated: 0,
          });
        }
        const row = map.get(u.productId)!;
        row.totalQty++;
        if (u.swiped) row.activated++;
        else          row.retail++;
      }

      // Also fetch non-IMEI products (stock levels for accessories etc.)
      // These don't have IMEI records — fetch from stock levels
      const stockParams = new URLSearchParams({ limit: '500', withStock: 'true' });
      if (catFilter)    stockParams.set('categoryId', catFilter);
      if (brandFilter)  stockParams.set('brand', brandFilter);
      const prodData = await api<{ items: any[] }>(`/products?${stockParams}`);
      for (const p of prodData.items || []) {
        // Skip if already captured via IMEI
        if (map.has(p.id)) continue;
        // Get total stock from stockLevels
        const totalQty = (p.stockLevels || []).reduce((s: number, sl: any) => s + (sl.quantity || 0), 0);
        if (totalQty <= 0) continue;
        map.set(p.id, {
          productId: p.id, ean: p.ean, model: p.model,
          brand: p.brand, category: p.categoryName || '',
          totalQty, retail: totalQty, activated: 0,
        });
      }

      const sorted = Array.from(map.values()).sort((a, b) =>
        a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model));
      setRows(sorted);
      setLastFetch(new Date());
    } catch (e: any) { alert('Failed to load: ' + e.message); }
    finally { setLoading(false); }
  }, [catFilter, brandFilter]);

  useEffect(() => { load(); }, [load]);

  // Group rows by brand
  const byBrand: Record<string, ReportRow[]> = {};
  for (const r of rows) {
    if (!byBrand[r.brand]) byBrand[r.brand] = [];
    byBrand[r.brand].push(r);
  }
  const brands_in_report = Object.keys(byBrand).sort();

  // Totals
  const grandTotal    = rows.reduce((s, r) => s + r.totalQty,  0);
  const grandRetail   = rows.reduce((s, r) => s + r.retail,    0);
  const grandActivated = rows.reduce((s, r) => s + r.activated, 0);

  // Print
  const handlePrint = () => {
    const style = `
      @page { size: A4 landscape; margin: 10mm 8mm; }
      body { font-family: Arial, sans-serif; font-size: 9pt; }
      .no-print { display: none !important; }
      .print-area { display: block !important; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #999; padding: 3px 5px; }
      th { background: #e8e8e8; font-weight: bold; }
      .brand-header { background: #333; color: #fff; font-weight: bold; font-size: 10pt; }
      .total-row { background: #f0f0f0; font-weight: bold; }
      .grand-total { background: #ddd; font-weight: bold; font-size: 10pt; }
      h1 { font-size: 13pt; margin: 0 0 2mm 0; }
      .report-meta { font-size: 8pt; color: #555; margin-bottom: 4mm; }
      .brand-section { margin-bottom: 4mm; }
    `;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><head><title>Stock Report</title>
      <style>${style}</style></head>
      <body>
        <h1>📦 iTechArena — Stock Report</h1>
        <div class="report-meta">
          Date: ${fmtDate(new Date())} &nbsp;|&nbsp;
          ${catFilter ? `Category: ${categories.find(c=>c.id===catFilter)?.name||catFilter}` : 'All Categories'}
          ${brandFilter ? ` | Brand: ${brandFilter}` : ''}
          &nbsp;|&nbsp; Total: ${grandTotal} units (Retail: ${grandRetail}, Activated: ${grandActivated})
        </div>
        ${brands_in_report.map(brand => {
          const brandRows = byBrand[brand];
          const bTotal = brandRows.reduce((s, r) => s + r.totalQty, 0);
          const bRetail = brandRows.reduce((s, r) => s + r.retail, 0);
          const bActivated = brandRows.reduce((s, r) => s + r.activated, 0);
          return `
            <div class="brand-section">
              <table>
                <thead>
                  <tr><th colspan="4" class="brand-header">${brand}</th></tr>
                  <tr>
                    <th style="width:60%">Product Name</th>
                    <th style="width:13%;text-align:center">Quantity</th>
                    <th style="width:13%;text-align:center">Retail</th>
                    <th style="width:14%;text-align:center">ACC</th>
                  </tr>
                </thead>
                <tbody>
                  ${brandRows.map(r => `
                    <tr>
                      <td>${r.model}</td>
                      <td style="text-align:center">${r.totalQty}</td>
                      <td style="text-align:center">${r.retail}</td>
                      <td style="text-align:center">${r.activated}</td>
                    </tr>
                  `).join('')}
                  <tr class="total-row">
                    <td>Total — ${brand}</td>
                    <td style="text-align:center">${bTotal}</td>
                    <td style="text-align:center">${bRetail}</td>
                    <td style="text-align:center">${bActivated}</td>
                  </tr>
                </tbody>
              </table>
            </div>`;
        }).join('')}
        <table><tr class="grand-total">
          <td style="width:60%">GRAND TOTAL</td>
          <td style="width:13%;text-align:center">${grandTotal}</td>
          <td style="width:13%;text-align:center">${grandRetail}</td>
          <td style="width:14%;text-align:center">${grandActivated}</td>
        </tr></table>
      </body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  const selectedCatName  = catFilter   ? categories.find(c => c.id === catFilter)?.name || '' : 'All Categories';
  const selectedBrandName = brandFilter || 'All Brands';

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'#f8fafc', overflow:'hidden' }}>

      {/* ── Header ── */}
      <div style={{ padding:'12px 20px', background:'#fff', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', gap:12, flexShrink:0, flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:16, fontWeight:800, color:'#0f172a' }}>Stock Report</div>
          <div style={{ fontSize:11, color:'#94a3b8', marginTop:2 }}>
            Brand-wise inventory · {lastFetch ? `Updated ${fmtDate(lastFetch)}` : 'Loading…'}
          </div>
        </div>
        <div style={{ flex:1 }} />

        {/* Filters */}
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          style={{ height:34, padding:'0 12px', border:'1px solid #d0d5dd', borderRadius:8, fontSize:12, background:'#fff', outline:'none', minWidth:160 }}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)}
          style={{ height:34, padding:'0 12px', border:'1px solid #d0d5dd', borderRadius:8, fontSize:12, background:'#fff', outline:'none', minWidth:140 }}>
          <option value="">All Brands</option>
          {brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
        </select>

        <button onClick={load} disabled={loading}
          style={{ height:34, padding:'0 14px', border:'1px solid #e2e8f0', borderRadius:8, background:'#fff', fontSize:12, color:'#64748b', cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
          🔄 Refresh
        </button>

        <button onClick={handlePrint} disabled={loading || rows.length === 0}
          style={{ height:34, padding:'0 16px', border:'none', borderRadius:8, background:'#2563eb', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
          🖨️ Print (A4 Landscape)
        </button>
      </div>

      {/* ── Summary strip ── */}
      <div style={{ display:'flex', gap:0, background:'#fff', borderBottom:'1px solid #e2e8f0', flexShrink:0 }}>
        {[
          { label:'Total Products', value:rows.length, color:'#374151' },
          { label:'Total Units',    value:grandTotal,   color:'#2563eb' },
          { label:'Retail (Unswiped)', value:grandRetail, color:'#16a34a' },
          { label:'Activated (Swiped)', value:grandActivated, color:'#7c3aed' },
          { label:'Brands', value:brands_in_report.length, color:'#0891b2' },
        ].map(k => (
          <div key={k.label} style={{ padding:'10px 20px', borderRight:'1px solid #e2e8f0' }}>
            <div style={{ fontSize:18, fontWeight:800, color:k.color }}>{loading ? '…' : k.value.toLocaleString('en-IN')}</div>
            <div style={{ fontSize:10, color:'#94a3b8', fontWeight:600, textTransform:'uppercase', letterSpacing:'.05em' }}>{k.label}</div>
          </div>
        ))}
        <div style={{ padding:'10px 20px', flex:1, display:'flex', alignItems:'center' }}>
          <span style={{ fontSize:11, color:'#64748b' }}>
            Filters: <strong>{selectedCatName}</strong> · <strong>{selectedBrandName}</strong>
            {catFilter || brandFilter ? (
              <button onClick={() => { setCatFilter(''); setBrandFilter(''); }}
                style={{ marginLeft:8, fontSize:11, color:'#dc2626', background:'none', border:'none', cursor:'pointer', textDecoration:'underline' }}>
                Clear filters
              </button>
            ) : null}
          </span>
        </div>
      </div>

      {/* ── Report Table ── */}
      {loading ? (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:12, color:'#64748b' }}>
          <div className="spinner" style={{ width:24, height:24 }} /> Loading stock data…
        </div>
      ) : rows.length === 0 ? (
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, color:'#94a3b8' }}>
          <span style={{ fontSize:32 }}>📊</span>
          <div style={{ fontSize:14, fontWeight:600 }}>No stock found</div>
          <div style={{ fontSize:12 }}>Try changing the category or brand filter</div>
        </div>
      ) : (
        <div style={{ flex:1, overflowY:'auto', padding:'16px 20px' }}>
          {/* Brand sections — same layout as your screenshot */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(380px, 1fr))', gap:16 }}>
            {brands_in_report.map(brand => {
              const brandRows = byBrand[brand];
              const bTotal = brandRows.reduce((s, r) => s + r.totalQty, 0);
              const bRetail = brandRows.reduce((s, r) => s + r.retail, 0);
              const bActivated = brandRows.reduce((s, r) => s + r.activated, 0);
              return (
                <div key={brand} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,.04)' }}>
                  {/* Brand header */}
                  <div style={{ background:'#1e293b', color:'#fff', padding:'8px 14px', fontSize:12, fontWeight:800, letterSpacing:'.02em' }}>
                    {brand}
                  </div>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                    <thead>
                      <tr style={{ background:'#f8fafc' }}>
                        <th style={{ padding:'6px 10px', textAlign:'left', fontWeight:700, color:'#374151', borderBottom:'1px solid #e2e8f0', fontSize:10 }}>Product Name</th>
                        <th style={{ padding:'6px 8px', textAlign:'center', fontWeight:700, color:'#374151', borderBottom:'1px solid #e2e8f0', fontSize:10, width:60 }}>Quantity</th>
                        <th style={{ padding:'6px 8px', textAlign:'center', fontWeight:700, color:'#16a34a', borderBottom:'1px solid #e2e8f0', fontSize:10, width:55 }}>Retail</th>
                        <th style={{ padding:'6px 8px', textAlign:'center', fontWeight:700, color:'#7c3aed', borderBottom:'1px solid #e2e8f0', fontSize:10, width:50 }}>ACC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {brandRows.map((r, idx) => (
                        <tr key={r.productId} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa', borderBottom:'1px solid #f1f5f9' }}>
                          <td style={{ padding:'5px 10px', color:'#0f172a', fontWeight:500 }}>{r.model}</td>
                          <td style={{ padding:'5px 8px', textAlign:'center', fontWeight:700, color:'#374151' }}>{r.totalQty}</td>
                          <td style={{ padding:'5px 8px', textAlign:'center', fontWeight:700, color:'#16a34a' }}>{r.retail}</td>
                          <td style={{ padding:'5px 8px', textAlign:'center', fontWeight:700, color:r.activated > 0 ? '#7c3aed' : '#cbd5e1' }}>{r.activated}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background:'#f1f5f9', borderTop:'2px solid #e2e8f0' }}>
                        <td style={{ padding:'6px 10px', fontWeight:700, color:'#374151', fontSize:11 }}>Total — {brand}</td>
                        <td style={{ padding:'6px 8px', textAlign:'center', fontWeight:800, color:'#374151' }}>{bTotal}</td>
                        <td style={{ padding:'6px 8px', textAlign:'center', fontWeight:800, color:'#16a34a' }}>{bRetail}</td>
                        <td style={{ padding:'6px 8px', textAlign:'center', fontWeight:800, color:'#7c3aed' }}>{bActivated}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })}
          </div>

          {/* Grand Total */}
          <div style={{ marginTop:16, background:'#1e293b', borderRadius:10, padding:'12px 20px', display:'flex', gap:40, alignItems:'center' }}>
            <span style={{ color:'#fff', fontWeight:700, fontSize:14 }}>GRAND TOTAL</span>
            <span style={{ color:'#fff', fontSize:13 }}>Quantity: <strong>{grandTotal}</strong></span>
            <span style={{ color:'#86efac', fontSize:13 }}>Retail: <strong>{grandRetail}</strong></span>
            <span style={{ color:'#c4b5fd', fontSize:13 }}>Activated (ACC): <strong>{grandActivated}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}
export default StockReport;
