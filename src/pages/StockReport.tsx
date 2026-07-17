import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Category  { id: string; name: string; }
interface ReportRow {
  productId: string; ean: string; model: string; brand: string;
  category: string; categoryId: string; imeiRequired: boolean;
  totalQty: number; retail: number; activated: number;
}
interface ReportData {
  rows: ReportRow[];
  categories: Category[];
  brands: string[];
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });

// ── Component ──────────────────────────────────────────────────────────────────
export function StockReport() {
  const [data,       setData]       = useState<ReportData|null>(null);
  const [catFilter,  setCatFilter]  = useState('');
  const [brandFilter,setBrandFilter]= useState('');
  const [loading,    setLoading]    = useState(false);
  const [lastFetch,  setLastFetch]  = useState<Date|null>(null);

  const load = useCallback(async (cat?: string, brand?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (cat   ?? catFilter)   params.set('categoryId', cat   ?? catFilter);
      if (brand ?? brandFilter) params.set('brand',      brand ?? brandFilter);
      const r = await api<ReportData>(`/inventory/stock-report${params.size ? '?'+params : ''}`);
      setData(r);
      setLastFetch(new Date());
    } catch (e: any) {
      alert('Failed to load: ' + e.message);
    } finally { setLoading(false); }
  }, [catFilter, brandFilter]);

  useEffect(() => { load(); }, []); // eslint-disable-line

  const handleCatChange = (v: string) => { setCatFilter(v); load(v, brandFilter); };
  const handleBrandChange = (v: string) => { setBrandFilter(v); load(catFilter, v); };
  const clearFilters = () => { setCatFilter(''); setBrandFilter(''); load('', ''); };

  const rows = data?.rows ?? [];

  // Group by brand
  const byBrand: Record<string, ReportRow[]> = {};
  for (const r of rows) {
    if (!byBrand[r.brand]) byBrand[r.brand] = [];
    byBrand[r.brand].push(r);
  }
  const brandList = Object.keys(byBrand).sort();

  const grandTotal     = rows.reduce((s, r) => s + r.totalQty,  0);
  const grandRetail    = rows.reduce((s, r) => s + r.retail,    0);
  const grandActivated = rows.reduce((s, r) => s + r.activated, 0);

  // Print — A4 Landscape, exact layout from screenshot
  const handlePrint = () => {
    const catName   = catFilter   ? data?.categories.find(c=>c.id===catFilter)?.name || catFilter : 'All Categories';
    const brandName = brandFilter || 'All Brands';

    const brandSections = brandList.map(brand => {
      const bRows     = byBrand[brand];
      const bTotal    = bRows.reduce((s,r) => s + r.totalQty,  0);
      const bRetail   = bRows.reduce((s,r) => s + r.retail,    0);
      const bAcc      = bRows.reduce((s,r) => s + r.activated, 0);
      return `
        <div class="brand-block">
          <table>
            <thead>
              <tr><th colspan="4" class="brand-hdr">${brand}</th></tr>
              <tr class="col-hdr">
                <th class="col-name">Product Name</th>
                <th class="col-num">Quantity</th>
                <th class="col-num">Retail</th>
                <th class="col-num">ACC</th>
              </tr>
            </thead>
            <tbody>
              ${bRows.map(r=>`
                <tr>
                  <td class="col-name">${r.model}</td>
                  <td class="col-num">${r.totalQty}</td>
                  <td class="col-num">${r.retail}</td>
                  <td class="col-num">${r.activated}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot>
              <tr class="brand-total">
                <td class="col-name">Total — ${brand}</td>
                <td class="col-num">${bTotal}</td>
                <td class="col-num">${bRetail}</td>
                <td class="col-num">${bAcc}</td>
              </tr>
            </tfoot>
          </table>
        </div>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><title>Stock Report — ${fmtDate(new Date())}</title>
<style>
  @page { size: A4 landscape; margin: 8mm 6mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 8pt; color: #000; }
  h1 { font-size: 12pt; font-weight: 800; margin-bottom: 1mm; }
  .meta { font-size: 7pt; color: #555; margin-bottom: 3mm; border-bottom: 1px solid #ccc; padding-bottom: 2mm; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
  .brand-block { break-inside: avoid; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 0.5pt solid #aaa; padding: 2pt 4pt; }
  .brand-hdr { background: #222; color: #fff; font-size: 9pt; font-weight: 700; text-align: left; padding: 3pt 4pt; }
  .col-hdr th { background: #e8e8e8; font-size: 7.5pt; font-weight: 700; }
  .col-name { text-align: left; font-size: 7.5pt; }
  .col-num  { text-align: center; width: 40pt; font-weight: 700; font-size: 8pt; }
  .brand-total td { background: #f0f0f0; font-weight: 700; }
  .grand { margin-top: 4mm; padding: 3pt 6pt; background: #222; color: #fff; font-weight: 700; font-size: 9pt; display: flex; gap: 20mm; }
</style></head><body>
<h1>📦 iTechArena ERP — Stock Report</h1>
<div class="meta">
  Date: ${fmtDate(new Date())} &nbsp;·&nbsp; ${catName} &nbsp;·&nbsp; ${brandName}
  &nbsp;·&nbsp; Total: ${grandTotal} units (Retail: ${grandRetail} | ACC: ${grandActivated})
</div>
<div class="grid">${brandSections}</div>
<div class="grand">
  <span>GRAND TOTAL</span>
  <span>Quantity: ${grandTotal}</span>
  <span>Retail: ${grandRetail}</span>
  <span>ACC (Activated): ${grandActivated}</span>
</div>
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) { alert('Allow popups to print'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 500);
  };

  const thS: React.CSSProperties = { padding:'10px 10px', textAlign:'left', fontSize:10, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.06em', borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap', background:'#fff' };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'#f8fafc', overflow:'hidden' }}>

      {/* Header */}
      <div style={{ padding:'12px 20px', background:'#fff', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', gap:12, flexShrink:0, flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:16, fontWeight:800, color:'#0f172a' }}>Stock Report</div>
          <div style={{ fontSize:11, color:'#94a3b8', marginTop:2 }}>Brand-wise inventory · {lastFetch ? `Updated ${fmtDate(lastFetch)}` : 'Loading…'}</div>
        </div>
        <div style={{ flex:1 }} />

        {/* Category filter */}
        <select value={catFilter} onChange={e => handleCatChange(e.target.value)}
          style={{ height:34, padding:'0 12px', border:'1px solid #d0d5dd', borderRadius:8, fontSize:12, background:'#fff', outline:'none', minWidth:170 }}>
          <option value="">All Categories</option>
          {(data?.categories ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        {/* Brand filter */}
        <select value={brandFilter} onChange={e => handleBrandChange(e.target.value)}
          style={{ height:34, padding:'0 12px', border:'1px solid #d0d5dd', borderRadius:8, fontSize:12, background:'#fff', outline:'none', minWidth:140 }}>
          <option value="">All Brands</option>
          {(data?.brands ?? []).map(b => <option key={b} value={b}>{b}</option>)}
        </select>

        {(catFilter || brandFilter) && (
          <button onClick={clearFilters} style={{ height:34, padding:'0 12px', border:'1px solid #fca5a5', borderRadius:8, background:'#fef2f2', fontSize:12, color:'#dc2626', cursor:'pointer' }}>
            ✕ Clear
          </button>
        )}

        <button onClick={() => load()} disabled={loading}
          style={{ height:34, padding:'0 14px', border:'1px solid #e2e8f0', borderRadius:8, background:'#fff', fontSize:12, color:'#64748b', cursor:'pointer' }}>
          🔄 Refresh
        </button>

        <button onClick={handlePrint} disabled={loading || rows.length === 0}
          style={{ height:34, padding:'0 16px', border:'none', borderRadius:8, background: rows.length===0 ? '#94a3b8' : '#2563eb', color:'#fff', fontSize:12, fontWeight:700, cursor: rows.length===0 ? 'not-allowed' : 'pointer' }}>
          🖨️ Print (A4 Landscape)
        </button>
      </div>

      {/* Summary strip */}
      <div style={{ display:'flex', background:'#fff', borderBottom:'1px solid #e2e8f0', flexShrink:0 }}>
        {[
          { l:'Total Products',      v:rows.length,      c:'#374151' },
          { l:'Total Units',         v:grandTotal,       c:'#2563eb' },
          { l:'Retail (Unswiped)',   v:grandRetail,      c:'#16a34a' },
          { l:'Activated (Swiped)', v:grandActivated,   c:'#7c3aed' },
          { l:'Brands',             v:brandList.length, c:'#0891b2' },
        ].map(k => (
          <div key={k.l} style={{ padding:'10px 20px', borderRight:'1px solid #e2e8f0' }}>
            <div style={{ fontSize:20, fontWeight:800, color:k.c }}>{loading ? '…' : k.v.toLocaleString('en-IN')}</div>
            <div style={{ fontSize:10, color:'#94a3b8', fontWeight:600, textTransform:'uppercase', letterSpacing:'.05em' }}>{k.l}</div>
          </div>
        ))}
        <div style={{ padding:'10px 20px', flex:1, display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:11, color:'#64748b' }}>
            <strong>{catFilter ? data?.categories.find(c=>c.id===catFilter)?.name : 'All Categories'}</strong>
            {' · '}
            <strong>{brandFilter || 'All Brands'}</strong>
          </span>
        </div>
      </div>

      {/* Report body */}
      {loading ? (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:12, color:'#64748b' }}>
          <div className="spinner" style={{ width:24, height:24 }} /> Loading stock data…
        </div>
      ) : rows.length === 0 ? (
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, color:'#94a3b8' }}>
          <div style={{ fontSize:36 }}>📊</div>
          <div style={{ fontSize:14, fontWeight:600 }}>No stock found</div>
          <div style={{ fontSize:12 }}>Try changing the category or brand filter</div>
        </div>
      ) : (
        <div style={{ flex:1, overflowY:'auto', padding:'16px 20px' }}>
          {/* Brand grid — 3 columns like your screenshot */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(360px, 1fr))', gap:16 }}>
            {brandList.map(brand => {
              const bRows     = byBrand[brand];
              const bTotal    = bRows.reduce((s,r) => s + r.totalQty,  0);
              const bRetail   = bRows.reduce((s,r) => s + r.retail,    0);
              const bActivated= bRows.reduce((s,r) => s + r.activated, 0);
              return (
                <div key={brand} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,.04)' }}>
                  <div style={{ background:'#1e293b', color:'#fff', padding:'7px 14px', fontSize:12, fontWeight:800 }}>{brand}</div>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                    <thead>
                      <tr style={{ background:'#f8fafc' }}>
                        <th style={{ ...thS, padding:'5px 10px', fontSize:9 }}>Product Name</th>
                        <th style={{ ...thS, padding:'5px 8px', fontSize:9, textAlign:'center', width:60 }}>Quantity</th>
                        <th style={{ ...thS, padding:'5px 8px', fontSize:9, textAlign:'center', color:'#16a34a', width:55 }}>Retail</th>
                        <th style={{ ...thS, padding:'5px 8px', fontSize:9, textAlign:'center', color:'#7c3aed', width:45 }}>ACC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bRows.map((r, idx) => (
                        <tr key={r.productId} style={{ background: idx%2===0?'#fff':'#fafafa', borderBottom:'1px solid #f1f5f9' }}>
                          <td style={{ padding:'4px 10px', color:'#0f172a', fontWeight:500, fontSize:11 }}>{r.model}</td>
                          <td style={{ padding:'4px 8px', textAlign:'center', fontWeight:700, color:'#374151' }}>{r.totalQty}</td>
                          <td style={{ padding:'4px 8px', textAlign:'center', fontWeight:700, color:'#16a34a' }}>{r.retail}</td>
                          <td style={{ padding:'4px 8px', textAlign:'center', fontWeight:700, color: r.activated>0?'#7c3aed':'#cbd5e1' }}>{r.activated}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background:'#f1f5f9', borderTop:'2px solid #e2e8f0' }}>
                        <td style={{ padding:'5px 10px', fontWeight:700, color:'#374151', fontSize:11 }}>Total — {brand}</td>
                        <td style={{ padding:'5px 8px', textAlign:'center', fontWeight:800, color:'#374151' }}>{bTotal}</td>
                        <td style={{ padding:'5px 8px', textAlign:'center', fontWeight:800, color:'#16a34a' }}>{bRetail}</td>
                        <td style={{ padding:'5px 8px', textAlign:'center', fontWeight:800, color:'#7c3aed' }}>{bActivated}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })}
          </div>

          {/* Grand Total */}
          <div style={{ marginTop:16, background:'#1e293b', borderRadius:10, padding:'12px 20px', display:'flex', gap:32, alignItems:'center' }}>
            <span style={{ color:'#fff', fontWeight:700, fontSize:14 }}>GRAND TOTAL</span>
            <span style={{ color:'#93c5fd', fontSize:13 }}>Quantity: <strong style={{ color:'#fff' }}>{grandTotal}</strong></span>
            <span style={{ color:'#86efac', fontSize:13 }}>Retail: <strong style={{ color:'#fff' }}>{grandRetail}</strong></span>
            <span style={{ color:'#c4b5fd', fontSize:13 }}>ACC (Activated): <strong style={{ color:'#fff' }}>{grandActivated}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}
export default StockReport;
