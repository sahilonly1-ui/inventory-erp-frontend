import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';

interface Category  { id: string; name: string; }
interface ReportRow {
  productId: string; ean: string; model: string; brand: string;
  category: string; categoryId: string; imeiRequired: boolean;
  totalQty: number; retail: number; activated: number;
}
interface ReportData { rows: ReportRow[]; categories: Category[]; brands: string[]; }

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });

// Multi-select dropdown component
function MultiSelect({
  label, options, selected, onChange, getKey, getLabel,
}: {
  label: string;
  options: any[];
  selected: Set<string>;
  onChange: (v: Set<string>) => void;
  getKey: (o: any) => string;
  getLabel: (o: any) => string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const toggle = (key: string) => {
    const next = new Set(selected);
    next.has(key) ? next.delete(key) : next.add(key);
    onChange(next);
  };
  const all  = () => onChange(new Set());
  const none = () => onChange(new Set(options.map(getKey)));

  const displayText = selected.size === 0
    ? `All ${label}`
    : selected.size === options.length
    ? `No ${label}`
    : `${selected.size} ${label} selected`;

  return (
    <div ref={ref} style={{ position:'relative', minWidth:160 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        height:34, padding:'0 12px', border:'1px solid #d0d5dd', borderRadius:8,
        background:'#fff', fontSize:12, color:'#374151', cursor:'pointer',
        display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap', minWidth:160,
      }}>
        <span style={{ flex:1, textAlign:'left' }}>{displayText}</span>
        <span style={{ color:'#94a3b8', fontSize:10 }}>▼</span>
      </button>
      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:200,
          background:'#fff', border:'1px solid #e2e8f0', borderRadius:10,
          boxShadow:'0 8px 24px rgba(0,0,0,.12)', minWidth:220, maxHeight:300, overflowY:'auto',
        }}>
          {/* Select all / none */}
          <div style={{ display:'flex', gap:0, borderBottom:'1px solid #f1f5f9' }}>
            <button onClick={all}  style={{ flex:1, padding:'8px 12px', border:'none', background:'none', fontSize:11, color:'#2563eb', cursor:'pointer', fontWeight:600 }}>✓ All</button>
            <button onClick={none} style={{ flex:1, padding:'8px 12px', border:'none', background:'none', fontSize:11, color:'#dc2626', cursor:'pointer', fontWeight:600 }}>✕ None</button>
          </div>
          {options.map(o => {
            const key = getKey(o);
            const checked = !selected.has(key); // selected = excluded set
            return (
              <label key={key} style={{
                display:'flex', alignItems:'center', gap:10, padding:'8px 14px',
                cursor:'pointer', fontSize:12, color:'#374151',
                background: checked ? '#f0f9ff' : '#fff',
                borderBottom:'1px solid #f8fafc',
              }}>
                <input type="checkbox" checked={checked} onChange={() => toggle(key)}
                  style={{ width:14, height:14, accentColor:'#2563eb', cursor:'pointer' }} />
                {getLabel(o)}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function StockReport() {
  const [data,        setData]        = useState<ReportData|null>(null);
  const [exCats,      setExCats]      = useState<Set<string>>(new Set()); // excluded categories
  const [exBrands,    setExBrands]    = useState<Set<string>>(new Set()); // excluded brands
  const [loading,     setLoading]     = useState(false);
  const [lastFetch,   setLastFetch]   = useState<Date|null>(null);
  const [imgLoading,  setImgLoading]  = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<ReportData>('/inventory/stock-report');
      setData(r);
      setLastFetch(new Date());
    } catch (e: any) { alert('Failed to load: ' + e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filtered rows — exclude unchecked cats/brands
  const rows = (data?.rows ?? []).filter(r => {
    if (exCats.size   > 0 && exCats.has(r.categoryId))   return false;
    if (exBrands.size > 0 && exBrands.has(r.brand))      return false;
    return true;
  });

  const byBrand: Record<string, ReportRow[]> = {};
  for (const r of rows) { if (!byBrand[r.brand]) byBrand[r.brand] = []; byBrand[r.brand].push(r); }
  const brandList = Object.keys(byBrand).sort();

  const grandTotal     = rows.reduce((s, r) => s + r.totalQty,   0);
  const grandRetail    = rows.reduce((s, r) => s + r.retail,     0);
  const grandActivated = rows.reduce((s, r) => s + r.activated,  0);

  const catName   = data?.categories.filter(c => !exCats.has(c.id)).map(c=>c.name).join(', ') || 'All Categories';
  const brandName = (data?.brands ?? []).filter(b => !exBrands.has(b)).join(', ') || 'All Brands';

  // Build print HTML — shrink to one page, full-width, 3-column grid
  const buildPrintHTML = () => {
    const brandSections = brandList.map(brand => {
      const bRows  = byBrand[brand];
      const bTotal = bRows.reduce((s,r)=>s+r.totalQty,0);
      const bRet   = bRows.reduce((s,r)=>s+r.retail,0);
      const bAcc   = bRows.reduce((s,r)=>s+r.activated,0);
      return `<div class="bb">
        <table>
          <thead>
            <tr><th colspan="4" class="bh">${brand}</th></tr>
            <tr class="ch"><th class="cn">Product Name</th><th class="cq">Qty</th><th class="cr">Retail</th><th class="ca">ACC</th></tr>
          </thead>
          <tbody>
            ${bRows.map(r=>`<tr><td class="cn">${r.model}</td><td class="cq">${r.totalQty}</td><td class="cr">${r.retail}</td><td class="ca">${r.activated||0}</td></tr>`).join('')}
          </tbody>
          <tfoot><tr class="bt"><td class="cn">Total — ${brand}</td><td class="cq">${bTotal}</td><td class="cr">${bRet}</td><td class="ca">${bAcc}</td></tr></tfoot>
        </table>
      </div>`;
    }).join('');

    return `<!DOCTYPE html><html><head><title>Stock Report ${fmtDate(new Date())}</title>
<style>
@page{size:A4 landscape;margin:5mm 5mm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:7.5pt;color:#000;
  transform-origin:top left;
  -webkit-print-color-adjust:exact;print-color-adjust:exact}
h1{font-size:11pt;font-weight:800;margin-bottom:1mm}
.meta{font-size:7pt;color:#444;margin-bottom:2mm;padding-bottom:1mm;border-bottom:1px solid #bbb}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm;align-items:start}
.bb{break-inside:avoid}
table{width:100%;border-collapse:collapse}
th,td{border:.4pt solid #999;padding:1.5pt 3pt}
.bh{background:#1e293b!important;color:#fff!important;font-size:8pt;font-weight:700;text-align:left;padding:2pt 4pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.ch th{background:#e8e8e8!important;font-size:7pt;font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.cn{text-align:left;font-size:7pt}
.cq,.cr,.ca{text-align:center;width:22pt;font-weight:700;font-size:7.5pt}
.bt td{background:#f0f0f0!important;font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.gt{margin-top:3mm;background:#1e293b!important;color:#fff!important;padding:3pt 8pt;font-size:8.5pt;font-weight:700;display:flex;gap:15mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}
</style></head><body>
<h1>📦 iTechArena ERP — Stock Report</h1>
<div class="meta">Date: ${fmtDate(new Date())} &nbsp;·&nbsp; Brands: ${brandList.join(', ')} &nbsp;·&nbsp; Total: ${grandTotal} units (Retail: ${grandRetail} | ACC: ${grandActivated})</div>
<div class="grid">${brandSections}</div>
<div class="gt"><span>GRAND TOTAL</span><span>Qty: ${grandTotal}</span><span>Retail: ${grandRetail}</span><span>ACC: ${grandActivated}</span></div>
</body></html>`;
  };

  const handlePrint = () => {
    const w = window.open('', '_blank');
    if (!w) { alert('Allow popups to print'); return; }
    w.document.write(buildPrintHTML());
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 500);
  };

  // Download as PNG image using html2canvas via CDN
  const handleImageDownload = async () => {
    if (rows.length === 0) return;
    setImgLoading(true);
    try {
      // Build an offscreen iframe with the report HTML, then use canvas
      const html = buildPrintHTML();

      // Use a blob URL and fetch approach with html2canvas
      // Since we can't load external scripts easily, use the print window + screenshot approach
      // Actually: open the print window, user can screenshot — but better: use canvas API
      
      // Create offscreen div with report content for canvas rendering
      const container = document.createElement('div');
      container.style.cssText = 'position:fixed;top:0;left:0;width:1122px;background:#fff;padding:12px;font-family:Arial,sans-serif;font-size:9px;z-index:-1;opacity:0';
      
      // Build the visual report in DOM
      const brandSectionsHTML = brandList.map(brand => {
        const bRows  = byBrand[brand];
        const bTotal = bRows.reduce((s,r)=>s+r.totalQty,0);
        const bRet   = bRows.reduce((s,r)=>s+r.retail,0);
        const bAcc   = bRows.reduce((s,r)=>s+r.activated,0);
        return `<div style="break-inside:avoid;border:1px solid #ccc;border-radius:6px;overflow:hidden;margin-bottom:8px">
          <div style="background:#1e293b;color:#fff;padding:4px 8px;font-size:9px;font-weight:800">${brand}</div>
          <table style="width:100%;border-collapse:collapse;font-size:8px">
            <tr style="background:#e8e8e8"><th style="padding:2px 6px;text-align:left;border:0.5px solid #aaa">Product Name</th><th style="padding:2px;text-align:center;width:32px;border:0.5px solid #aaa">Qty</th><th style="padding:2px;text-align:center;width:40px;border:0.5px solid #aaa;color:#16a34a">Retail</th><th style="padding:2px;text-align:center;width:30px;border:0.5px solid #aaa;color:#7c3aed">ACC</th></tr>
            ${bRows.map((r,i)=>`<tr style="background:${i%2===0?'#fff':'#fafafa'}"><td style="padding:2px 6px;border:0.5px solid #eee">${r.model}</td><td style="padding:2px;text-align:center;font-weight:700;border:0.5px solid #eee">${r.totalQty}</td><td style="padding:2px;text-align:center;font-weight:700;color:#16a34a;border:0.5px solid #eee">${r.retail}</td><td style="padding:2px;text-align:center;font-weight:700;color:${r.activated>0?'#7c3aed':'#ccc'};border:0.5px solid #eee">${r.activated||0}</td></tr>`).join('')}
            <tr style="background:#f0f0f0;font-weight:700"><td style="padding:2px 6px;border:0.5px solid #ccc">Total — ${brand}</td><td style="padding:2px;text-align:center;border:0.5px solid #ccc">${bTotal}</td><td style="padding:2px;text-align:center;color:#16a34a;border:0.5px solid #ccc">${bRet}</td><td style="padding:2px;text-align:center;color:#7c3aed;border:0.5px solid #ccc">${bAcc}</td></tr>
          </table>
        </div>`;
      }).join('');

      container.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
          <div style="font-size:16px;font-weight:800;color:#1e293b">📦 iTechArena ERP — Stock Report</div>
          <div style="font-size:10px;color:#64748b">${fmtDate(new Date())} · Total: ${grandTotal} units · Retail: ${grandRetail} · ACC: ${grandActivated}</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;align-items:start">
          ${brandSectionsHTML}
        </div>
        <div style="margin-top:8px;background:#1e293b;color:#fff;padding:6px 12px;border-radius:6px;display:flex;gap:24px;font-size:9px;font-weight:700">
          <span>GRAND TOTAL</span><span>Quantity: ${grandTotal}</span><span>Retail: ${grandRetail}</span><span>ACC (Activated): ${grandActivated}</span>
        </div>`;
      
      document.body.appendChild(container);
      container.style.opacity = '1';
      container.style.zIndex = '9999';

      // Load html2canvas dynamically
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      document.head.appendChild(script);
      
      await new Promise<void>((resolve, reject) => {
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load html2canvas'));
        setTimeout(resolve, 3000); // fallback
      });

      await new Promise(r => setTimeout(r, 200)); // let DOM render

      const canvas = await (window as any).html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: container.offsetWidth,
        height: container.offsetHeight,
      });

      document.body.removeChild(container);
      document.head.removeChild(script);

      // Download
      const link = document.createElement('a');
      link.download = `StockReport_${new Date().toISOString().slice(0,10)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e: any) {
      alert('Image download failed: ' + e.message + '\n\nTip: Use Print → Save as PDF instead.');
    } finally {
      setImgLoading(false);
    }
  };

  const thS: React.CSSProperties = { padding:'9px 10px', textAlign:'left', fontSize:10, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.06em', borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap', background:'#fff' };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'#f8fafc', overflow:'hidden' }}>

      {/* Header */}
      <div style={{ padding:'10px 16px', background:'#fff', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', gap:10, flexShrink:0, flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:15, fontWeight:800, color:'#0f172a' }}>Stock Report</div>
          <div style={{ fontSize:11, color:'#94a3b8' }}>Brand-wise · {lastFetch ? fmtDate(lastFetch) : 'Loading…'}</div>
        </div>
        <div style={{ flex:1 }} />

        {/* Multi-select: Categories */}
        <MultiSelect
          label="Categories"
          options={data?.categories ?? []}
          selected={exCats}
          onChange={setExCats}
          getKey={c => c.id}
          getLabel={c => c.name}
        />

        {/* Multi-select: Brands */}
        <MultiSelect
          label="Brands"
          options={(data?.brands ?? []).map(b => ({ id:b, name:b }))}
          selected={exBrands}
          onChange={setExBrands}
          getKey={b => b.id}
          getLabel={b => b.name}
        />

        {(exCats.size > 0 || exBrands.size > 0) && (
          <button onClick={() => { setExCats(new Set()); setExBrands(new Set()); }}
            style={{ height:34, padding:'0 12px', border:'1px solid #fca5a5', borderRadius:8, background:'#fef2f2', fontSize:12, color:'#dc2626', cursor:'pointer', fontWeight:600 }}>
            ✕ Reset
          </button>
        )}

        <button onClick={load} disabled={loading}
          style={{ height:34, padding:'0 12px', border:'1px solid #e2e8f0', borderRadius:8, background:'#fff', fontSize:12, color:'#64748b', cursor:'pointer' }}>
          🔄
        </button>

        <button onClick={handlePrint} disabled={loading || rows.length === 0}
          style={{ height:34, padding:'0 14px', border:'none', borderRadius:8, background:'#2563eb', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
          🖨️ Print
        </button>

        <button onClick={handleImageDownload} disabled={loading || imgLoading || rows.length === 0}
          style={{ height:34, padding:'0 14px', border:'none', borderRadius:8, background: imgLoading ? '#94a3b8' : '#16a34a', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
          {imgLoading ? '⏳ Generating…' : '🖼️ Download Image'}
        </button>
      </div>

      {/* Summary strip */}
      <div style={{ display:'flex', background:'#fff', borderBottom:'1px solid #e2e8f0', flexShrink:0 }}>
        {[
          { l:'Products',  v:rows.length,       c:'#374151' },
          { l:'Total Units',   v:grandTotal,    c:'#2563eb' },
          { l:'Retail',        v:grandRetail,   c:'#16a34a' },
          { l:'Activated/ACC', v:grandActivated,c:'#7c3aed' },
          { l:'Brands',        v:brandList.length,c:'#0891b2'},
        ].map(k => (
          <div key={k.l} style={{ padding:'8px 16px', borderRight:'1px solid #e2e8f0' }}>
            <div style={{ fontSize:20, fontWeight:800, color:k.c }}>{loading ? '…' : k.v.toLocaleString('en-IN')}</div>
            <div style={{ fontSize:10, color:'#94a3b8', fontWeight:600, textTransform:'uppercase', letterSpacing:'.05em' }}>{k.l}</div>
          </div>
        ))}
        <div style={{ padding:'8px 16px', flex:1, display:'flex', alignItems:'center' }}>
          <span style={{ fontSize:11, color:'#64748b' }}>
            {exCats.size > 0 ? `${(data?.categories??[]).filter(c=>!exCats.has(c.id)).length} categories` : 'All categories'}
            {' · '}
            {exBrands.size > 0 ? `${(data?.brands??[]).filter(b=>!exBrands.has(b)).length} brands` : 'All brands'}
          </span>
        </div>
      </div>

      {/* Report body */}
      {loading ? (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:12, color:'#64748b' }}>
          <div className="spinner" style={{ width:24, height:24 }} /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, color:'#94a3b8' }}>
          <div style={{ fontSize:36 }}>📊</div>
          <div style={{ fontSize:14, fontWeight:600 }}>No stock found</div>
          <div style={{ fontSize:12 }}>Uncheck some filters to show more data</div>
        </div>
      ) : (
        <div ref={reportRef} style={{ flex:1, overflowY:'auto', padding:'14px 16px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(340px,1fr))', gap:14 }}>
            {brandList.map(brand => {
              const bRows  = byBrand[brand];
              const bTotal = bRows.reduce((s,r)=>s+r.totalQty,0);
              const bRet   = bRows.reduce((s,r)=>s+r.retail,0);
              const bAcc   = bRows.reduce((s,r)=>s+r.activated,0);
              return (
                <div key={brand} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,.04)' }}>
                  <div style={{ background:'#1e293b', color:'#fff', padding:'7px 12px', fontSize:12, fontWeight:800 }}>{brand}</div>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                    <thead>
                      <tr>
                        <th style={{ ...thS, padding:'5px 10px', fontSize:9 }}>Product Name</th>
                        <th style={{ ...thS, padding:'5px 8px', fontSize:9, textAlign:'center', width:55 }}>Qty</th>
                        <th style={{ ...thS, padding:'5px 8px', fontSize:9, textAlign:'center', color:'#16a34a', width:55 }}>Retail</th>
                        <th style={{ ...thS, padding:'5px 8px', fontSize:9, textAlign:'center', color:'#7c3aed', width:45 }}>ACC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bRows.map((r,idx) => (
                        <tr key={r.productId} style={{ background:idx%2===0?'#fff':'#fafafa', borderBottom:'1px solid #f1f5f9' }}>
                          <td style={{ padding:'4px 10px', color:'#0f172a', fontSize:11 }}>{r.model}</td>
                          <td style={{ padding:'4px 8px', textAlign:'center', fontWeight:700, color:'#374151' }}>{r.totalQty}</td>
                          <td style={{ padding:'4px 8px', textAlign:'center', fontWeight:700, color:'#16a34a' }}>{r.retail}</td>
                          <td style={{ padding:'4px 8px', textAlign:'center', fontWeight:700, color:r.activated>0?'#7c3aed':'#cbd5e1' }}>{r.activated||0}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background:'#f1f5f9', borderTop:'2px solid #e2e8f0' }}>
                        <td style={{ padding:'5px 10px', fontWeight:700, fontSize:11 }}>Total — {brand}</td>
                        <td style={{ padding:'5px 8px', textAlign:'center', fontWeight:800 }}>{bTotal}</td>
                        <td style={{ padding:'5px 8px', textAlign:'center', fontWeight:800, color:'#16a34a' }}>{bRet}</td>
                        <td style={{ padding:'5px 8px', textAlign:'center', fontWeight:800, color:'#7c3aed' }}>{bAcc}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop:14, background:'#1e293b', borderRadius:10, padding:'10px 18px', display:'flex', gap:28, alignItems:'center' }}>
            <span style={{ color:'#fff', fontWeight:700, fontSize:13 }}>GRAND TOTAL</span>
            <span style={{ color:'#93c5fd', fontSize:12 }}>Quantity: <strong style={{ color:'#fff' }}>{grandTotal}</strong></span>
            <span style={{ color:'#86efac', fontSize:12 }}>Retail: <strong style={{ color:'#fff' }}>{grandRetail}</strong></span>
            <span style={{ color:'#c4b5fd', fontSize:12 }}>ACC: <strong style={{ color:'#fff' }}>{grandActivated}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}
export default StockReport;
