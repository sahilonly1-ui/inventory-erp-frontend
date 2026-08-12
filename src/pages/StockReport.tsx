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
// ── Modern filter panel: shows all options as pill chips ─────────────────────
// Selected chips = solid colored, deselected = muted ghost pill.
// No dropdown, no checkbox confusion — everything visible at once.
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
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(''); }
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const toggle = (key: string) => {
    const next = new Set(selected);
    next.has(key) ? next.delete(key) : next.add(key);
    onChange(next);
  };

  const activeCount = options.length - selected.size;
  const isAll  = selected.size === 0;
  const isNone = selected.size === options.length;
  const visible = options.filter(o => getLabel(o).toLowerCase().includes(search.toLowerCase()));

  // Trigger button text + style
  const triggerLabel = isAll ? `All ${label}` : isNone ? `No ${label}` : `${activeCount} / ${options.length}`;
  const triggerStyle: React.CSSProperties = {
    height: 32, padding: '0 11px',
    border: isNone ? '1.5px solid #fca5a5' : isAll ? '1.5px solid #bbf7d0' : '1.5px solid #93c5fd',
    borderRadius: 20,
    background: isNone ? '#fff1f2' : isAll ? '#f0fdf4' : '#eff6ff',
    color: isNone ? '#dc2626' : isAll ? '#16a34a' : '#1d4ed8',
    fontSize: 12, fontWeight: 700, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Trigger pill */}
      <button onClick={() => setOpen(o => !o)} style={triggerStyle}>
        <span style={{ fontSize: 10, opacity: .7, letterSpacing: '.04em' }}>{label.toUpperCase()}</span>
        <span>{triggerLabel}</span>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
          style={{ opacity:.6, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 400,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14,
          boxShadow: '0 16px 48px rgba(0,0,0,.16)',
          width: 280, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Panel header */}
          <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#374151', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
              {label}
            </div>
            {/* Search bar */}
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <svg style={{ position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',pointerEvents:'none' }}
                width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}…`}
                style={{
                  width:'100%', height:30, padding:'0 10px 0 28px',
                  border:'1px solid #e2e8f0', borderRadius:8, fontSize:12,
                  outline:'none', background:'#fff', boxSizing:'border-box', color:'#374151',
                }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',border:'none',background:'none',cursor:'pointer',color:'#94a3b8',fontSize:14,lineHeight:1 }}>×</button>
              )}
            </div>
            {/* Quick actions */}
            <div style={{ display:'flex', gap:6 }}>
              <button onClick={() => onChange(new Set())} style={{
                flex:1, height:26, borderRadius:7,
                border:'1.5px solid #bbf7d0', background:'#f0fdf4',
                fontSize:11, fontWeight:700, color:'#16a34a', cursor:'pointer',
              }}>✓ All</button>
              <button onClick={() => onChange(new Set(options.map(getKey)))} style={{
                flex:1, height:26, borderRadius:7,
                border:'1.5px solid #fca5a5', background:'#fff1f2',
                fontSize:11, fontWeight:700, color:'#dc2626', cursor:'pointer',
              }}>✕ None</button>
            </div>
          </div>

          {/* Chip grid — all options as toggleable pills */}
          <div style={{ padding:'10px 12px', display:'flex', flexWrap:'wrap', gap:6, maxHeight:260, overflowY:'auto' }}>
            {visible.map(o => {
              const key = getKey(o);
              const active = !selected.has(key); // NOT in excluded set = active/visible
              return (
                <button
                  key={key}
                  onClick={() => toggle(key)}
                  style={{
                    height: 30, padding: '0 12px',
                    borderRadius: 20,
                    border: active ? '1.5px solid #2563eb' : '1.5px solid #e2e8f0',
                    background: active ? '#2563eb' : '#f8fafc',
                    color: active ? '#fff' : '#94a3b8',
                    fontSize: 12, fontWeight: active ? 600 : 400,
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 5,
                    transition: 'all .12s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {active && (
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="2 6 5 9 10 3"/>
                    </svg>
                  )}
                  {getLabel(o)}
                </button>
              );
            })}
            {visible.length === 0 && (
              <div style={{ fontSize:12, color:'#94a3b8', padding:'8px 4px' }}>No matches</div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding:'8px 14px', borderTop:'1px solid #f1f5f9', background:'#fafafa', fontSize:11, color:'#64748b', textAlign:'center' }}>
            {activeCount} of {options.length} selected · <span style={{ color:'#2563eb', cursor:'pointer', fontWeight:600 }} onClick={() => onChange(new Set())}>Reset</span>
          </div>
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

  const [defaultApplied, setDefaultApplied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<ReportData>('/inventory/stock-report');
      setData(r);
      setLastFetch(new Date());
      // On first load, default to showing only Smartphones + Tabs
      if (!defaultApplied) {
        setDefaultApplied(true);
        const nonDefault = r.categories
          .filter(c => {
            const n = c.name.toLowerCase();
            return !n.includes('smartphone') && !n.includes('tab');
          })
          .map(c => c.id);
        if (nonDefault.length > 0) setExCats(new Set(nonDefault));
      }
    } catch (e: any) { alert('Failed to load: ' + e.message); }
    finally { setLoading(false); }
  }, [defaultApplied]);

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

  // Distribute brand cards across N columns, balancing by estimated height.
  // CSS multi-column paginates unreliably when printing (it was producing a
  // blank first page), so columns are computed here and laid out with flex.
  const buildBalancedColumns = (colCount: number) => {
    const cards = brandList.map(brand => ({
      brand,
      // header + column-header + one line per product + total line
      weight: byBrand[brand].length + 3,
    }));
    const cols: { brands: string[]; weight: number }[] =
      Array.from({ length: colCount }, () => ({ brands: [], weight: 0 }));
    // Largest-first into the currently shortest column — keeps columns even.
    for (const c of [...cards].sort((a, b) => b.weight - a.weight)) {
      const target = cols.reduce((min, col) => (col.weight < min.weight ? col : min), cols[0]);
      target.brands.push(c.brand);
      target.weight += c.weight;
    }
    // Restore alphabetical order within each column
    for (const col of cols) col.brands.sort((a, b) => a.localeCompare(b));
    return cols;
  };

  // Build print HTML — auto-shrinks to fit exactly one A4 landscape page
  const buildPrintHTML = () => {
    const cardFor = (brand: string) => {
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
    };

    const columnsHTML = buildBalancedColumns(3)
      .map(col => `<div class="col">${col.brands.map(cardFor).join('')}</div>`)
      .join('');

    return `<!DOCTYPE html><html><head><title>Stock Report ${fmtDate(new Date())}</title>
<style>
@page{size:A4 landscape;margin:5mm 5mm}
*{box-sizing:border-box;margin:0;padding:0}
html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact;margin:0;padding:0;overflow:hidden}
/* One sheet only: never let a stray element open a second page. */
@media print{
  html,body{height:auto}
  /* Belt and braces: a single sheet is the whole point of this view, so the
     wrapper is not allowed to break, and nothing may follow it. */
  #wrap{page-break-after:avoid;page-break-inside:avoid;break-inside:avoid;break-after:avoid}
  #wrap *{break-after:avoid;page-break-after:avoid}
}
body{font-family:Arial,sans-serif;font-size:7.5pt;color:#000}
#wrap{transform-origin:top left;width:max-content}
h1{font-size:11pt;font-weight:800;margin-bottom:1mm}
.meta{font-size:7pt;color:#444;margin-bottom:2mm;padding-bottom:1mm;border-bottom:1px solid #bbb}
.cols{display:flex;gap:3mm;align-items:flex-start;width:max-content}
.col{flex:0 0 auto}
.bb{margin-bottom:3mm;break-inside:avoid;page-break-inside:avoid}
table{width:auto;border-collapse:collapse}
th,td{border:.4pt solid #999;padding:1.5pt 3pt}
.bh{background:#1e293b!important;color:#fff!important;font-size:8pt;font-weight:700;text-align:left;padding:2pt 4pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.ch th{background:#e8e8e8!important;font-size:7pt;font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.cn{text-align:left;font-size:7pt;white-space:nowrap}
.cq,.cr,.ca{text-align:center;width:22pt;font-weight:700;font-size:7.5pt}
.bt td{background:#f0f0f0!important;font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.gt{margin-top:2mm;background:#1e293b!important;color:#fff!important;padding:2.5pt 8pt;font-size:8pt;font-weight:700;display:flex;gap:15mm;break-inside:avoid;page-break-inside:avoid;break-before:avoid;page-break-before:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact}
</style></head><body>
<div id="wrap">
  <h1>📦 iTechArena ERP — Stock Report</h1>
  <div class="meta">Date: ${fmtDate(new Date())} &nbsp;·&nbsp; Brands: ${brandList.join(', ')} &nbsp;·&nbsp; Total: ${grandTotal} units (Retail: ${grandRetail} | ACC: ${grandActivated})</div>
  <div class="cols">${columnsHTML}</div>
  <div class="gt"><span>GRAND TOTAL</span><span>Qty: ${grandTotal}</span><span>Retail: ${grandRetail}</span><span>ACC: ${grandActivated}</span></div>
</div>
<script>
(function(){
  // Shrink the report until it fits one A4 landscape page.
  //
  // The zoom property is used rather than transform:scale on purpose: a
  // transform only changes what is painted, so the browser still paginates
  // against the original box and pushes the overflow onto a second sheet.
  // Zoom reflows the layout, so pagination sees the reduced size.
  var MM = 96 / 25.4;                 // px per mm at CSS 96dpi

  // Budget for margins we do not control. The @page rule asks for 5mm, but
  // Chrome's "Default" margin setting can override it with roughly 10mm per
  // side, and that extra loss is exactly what pushed the grand total onto a
  // second sheet. Assume the worst case so the fit holds either way.
  var MARGIN_MM = 12;                 // per side, worst case
  var availW = (297 - MARGIN_MM * 2) * MM;
  var availH = (210 - MARGIN_MM * 2) * MM;

  var wrap = document.getElementById('wrap');

  // The report now lays out at its natural width with product names on a
  // single line, so BOTH dimensions can be the binding constraint. Scale by
  // whichever runs out first — that fills the sheet and keeps the type as
  // large as it can be.
  var zoom = 1;
  for (var pass = 0; pass < 8; pass++) {
    wrap.style.zoom = zoom;
    var r = wrap.getBoundingClientRect();          // already includes zoom
    var fitW = availW / r.width;
    var fitH = availH / r.height;
    var fit = Math.min(fitW, fitH);
    if (fit >= 1 && fit < 1.02) break;             // close enough, stop
    // Undershoot a touch so borders never tip onto a second sheet.
    zoom = zoom * fit * 0.98;
    if (zoom < 0.2) { zoom = 0.2; wrap.style.zoom = zoom; break; }
    if (zoom > 3)   { zoom = 3;   wrap.style.zoom = zoom; break; }
  }
  window.__reportZoom = zoom;   // read by the caller before printing
  window.__reportReady = true;
})();
<\/script>
</body></html>`;
  };

  const handlePrint = () => {
    const w = window.open('', '_blank');
    if (!w) { alert('Allow popups to print'); return; }
    w.document.write(buildPrintHTML());
    w.document.close();
    w.focus();
    // Print only once the fit-to-one-page pass has run, otherwise the dialog
    // can open against the un-zoomed layout and paginate onto a second sheet.
    let waited = 0;
    const tick = () => {
      const done = (w as any).__reportReady === true;
      if (done || waited > 3000) { w.print(); w.close(); return; }
      waited += 100;
      setTimeout(tick, 100);
    };
    setTimeout(tick, 150);
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
      const cardHTML = (brand: string) => {
        const bRows  = byBrand[brand];
        const bTotal = bRows.reduce((s,r)=>s+r.totalQty,0);
        const bRet   = bRows.reduce((s,r)=>s+r.retail,0);
        const bAcc   = bRows.reduce((s,r)=>s+r.activated,0);
        return `<div style="border:1px solid #ccc;border-radius:6px;overflow:hidden;margin-bottom:8px">
          <div style="background:#1e293b;color:#fff;padding:4px 8px;font-size:9px;font-weight:800">${brand}</div>
          <table style="width:100%;border-collapse:collapse;font-size:8px">
            <tr style="background:#e8e8e8"><th style="padding:2px 6px;text-align:left;border:0.5px solid #aaa;white-space:nowrap">Product Name</th><th style="padding:2px;text-align:center;width:32px;border:0.5px solid #aaa">Qty</th><th style="padding:2px;text-align:center;width:40px;border:0.5px solid #aaa;color:#16a34a">Retail</th><th style="padding:2px;text-align:center;width:30px;border:0.5px solid #aaa;color:#7c3aed">ACC</th></tr>
            ${bRows.map((r,i)=>`<tr style="background:${i%2===0?'#fff':'#fafafa'}"><td style="padding:2px 6px;border:0.5px solid #eee;white-space:nowrap">${r.model}</td><td style="padding:2px;text-align:center;font-weight:700;border:0.5px solid #eee">${r.totalQty}</td><td style="padding:2px;text-align:center;font-weight:700;color:#16a34a;border:0.5px solid #eee">${r.retail}</td><td style="padding:2px;text-align:center;font-weight:700;color:${r.activated>0?'#7c3aed':'#ccc'};border:0.5px solid #eee">${r.activated||0}</td></tr>`).join('')}
            <tr style="background:#f0f0f0;font-weight:700"><td style="padding:2px 6px;border:0.5px solid #ccc">Total — ${brand}</td><td style="padding:2px;text-align:center;border:0.5px solid #ccc">${bTotal}</td><td style="padding:2px;text-align:center;color:#16a34a;border:0.5px solid #ccc">${bRet}</td><td style="padding:2px;text-align:center;color:#7c3aed;border:0.5px solid #ccc">${bAcc}</td></tr>
          </table>
        </div>`;
      };

      const brandSectionsHTML = buildBalancedColumns(3)
        .map(col => `<div style="flex:1 1 0;min-width:0">${col.brands.map(cardHTML).join('')}</div>`)
        .join('');

      container.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
          <div style="font-size:16px;font-weight:800;color:#1e293b">📦 iTechArena ERP — Stock Report</div>
          <div style="font-size:10px;color:#64748b">${fmtDate(new Date())} · Total: ${grandTotal} units · Retail: ${grandRetail} · ACC: ${grandActivated}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:flex-start">
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
          <div style={{ display:'flex', gap:14, alignItems:'flex-start' }}>
            {buildBalancedColumns(3).map((col, ci) => (
              <div key={ci} style={{ flex:'1 1 0', minWidth:0 }}>
                {col.brands.map(brand => {
                  const bRows  = byBrand[brand];
                  const bTotal = bRows.reduce((s,r)=>s+r.totalQty,0);
                  const bRet   = bRows.reduce((s,r)=>s+r.retail,0);
                  const bAcc   = bRows.reduce((s,r)=>s+r.activated,0);
                  return (
                <div key={brand} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,.04)', marginBottom:14 }}>
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
            ))}
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
