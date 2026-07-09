import { useState, useEffect, useRef, useCallback, KeyboardEvent } from 'react';
import { api } from '../api/client';

interface Warehouse { id: string; name: string; }
interface Vendor { id: string; name: string; code: string; }
interface Product { id: string; ean: string; model: string; brand: string; category?: string; imeiRequired: boolean; costPrice?: number; }
type CellName = 'ean' | 'qty' | 'imei' | 'vendor';
type RowStatus = 'empty' | 'found' | 'not_found' | 'awaiting_imei' | 'awaiting_qty' | 'saved' | 'err';

interface Row {
  id: string;
  ean: string; productId: string; model: string; brand: string; imeiRequired: boolean;
  qty: string; imei: string; vendor: string; vendorId: string; unitCost: string;
  status: RowStatus; errCell: CellName | ''; errMsg: string;
}

const newRow = (): Row => ({
  id: Math.random().toString(36).slice(2), ean: '', productId: '', model: '', brand: '',
  imeiRequired: false, qty: '1', imei: '', vendor: '', vendorId: '', unitCost: '',
  status: 'empty', errCell: '', errMsg: '',
});

const genDoc = () => `SIN-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(Math.random()*9000+1000)}`;

export function StockIn() {
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [activeRow, setActiveRow] = useState(0);
  const [activeCell, setActiveCell] = useState<CellName>('ean');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [docNumber] = useState(genDoc);
  const [drawer, setDrawer] = useState<{ ean: string } | null>(null);
  const [drawerForm, setDrawerForm] = useState<any>({ ean:'',model:'',brand:'',categoryName:'',costPrice:'',sellingPrice:'',mrp:'',gstRate:'18',imeiRequired:false,hsnCode:'',vendorName:'' });
  const [vendorSearch, setVendorSearch] = useState('');
  const [vendorDrop, setVendorDrop] = useState(false);
  const [savingRow, setSavingRow] = useState(false);
  const [summaryTab, setSummaryTab] = useState<'live'|'party'>('live');
  const [drawerSaving, setDrawerSaving] = useState(false);
  const cellRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    api<Warehouse[]>('/warehouses').then(ws => { setWarehouses(ws); if (ws.length) setWarehouseId(ws[0].id); }).catch(() => {});
    api<Vendor[]>('/vendors').then(setVendors).catch(() => {});
  }, []);

  // Auto-focus logic
  useEffect(() => {
    const key = `${activeRow}-${activeCell}`;
    const el = cellRefs.current[key];
    if (el) { el.focus(); el.select(); }
  }, [activeRow, activeCell]);

  const setRef = (rowIdx: number, cell: CellName) => (el: HTMLInputElement | null) => {
    cellRefs.current[`${rowIdx}-${cell}`] = el;
  };

  const updateRow = (idx: number, patch: Partial<Row>) =>
    setRows(rs => rs.map((r, i) => i === idx ? { ...r, ...patch } : r));

  // ── EAN lookup ──────────────────────────────────────────────────────────────
  const handleEanEnter = useCallback(async (idx: number, ean: string) => {
    if (!ean.trim()) return;
    if (!warehouseId) { alert('Select a warehouse first'); return; }
    try {
      const result = await api<{ product: Product; total: number }>(`/inventory/lookup?ean=${encodeURIComponent(ean.trim())}`);
      const p = result.product;
      updateRow(idx, { productId: p.id, model: p.model, brand: p.brand, imeiRequired: p.imeiRequired, status: 'found', errCell: '', errMsg: '' });
      if (p.imeiRequired) {
        setActiveCell('imei');
        updateRow(idx, { status: 'awaiting_imei' });
      } else {
        updateRow(idx, { qty: '1', status: 'awaiting_qty' });
        setActiveCell('qty');
      }
    } catch {
      // EAN not found → open right drawer
      updateRow(idx, { ean: ean.trim(), status: 'not_found' });
      setDrawerForm((f: any) => ({ ...f, ean: ean.trim() }));
      setDrawer({ ean: ean.trim() });
    }
  }, [warehouseId]);

  // ── IMEI validation & row save ───────────────────────────────────────────────
  const handleImeiEnter = useCallback(async (idx: number, imei: string) => {
    if (!imei.trim()) return;
    // Quick duplicate check via lookup
    try {
      await api(`/imei/${encodeURIComponent(imei.trim())}`);
      // If found → duplicate
      updateRow(idx, { errCell: 'imei', errMsg: `IMEI ${imei} already in system!`, status: 'err' });
      setActiveCell('imei');
      // Error sound
      try { new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAA...').play(); } catch {}
      return;
    } catch {
      // 404 = not found = good, proceed
    }
    // Valid IMEI → save row
    await saveRow(idx, imei.trim());
  }, []);

  // ── Save a completed row ────────────────────────────────────────────────────
  const saveRow = useCallback(async (idx: number, imei?: string) => {
    const r = rows[idx];
    if (!r.productId || !warehouseId) return;
    setSavingRow(true);
    try {
      if (r.imeiRequired && imei) {
        await api('/imei/receive', {
          method: 'POST',
          body: JSON.stringify({ productId: r.productId, warehouseId, imeis: [{ imei1: imei }], remarks: docNumber }),
        });
        updateRow(idx, { imei, qty: '1', status: 'saved', errCell: '', errMsg: '' });
      } else {
        const qty = parseInt(r.qty) || 1;
        await api('/inventory/stock-in', {
          method: 'POST',
          body: JSON.stringify({ productId: r.productId, warehouseId, quantity: qty, vendorId: r.vendorId || undefined, remarks: docNumber }),
        });
        updateRow(idx, { status: 'saved', errCell: '', errMsg: '' });
      }
      // Add next row and move focus
      if (idx === rows.length - 1) setRows(rs => [...rs, newRow()]);
      setActiveRow(idx + 1);
      setActiveCell('ean');
    } catch (e: any) {
      updateRow(idx, { errMsg: e.message, status: 'err' });
    } finally { setSavingRow(false); }
  }, [rows, warehouseId, docNumber]);

  // ── Vendor autocomplete ─────────────────────────────────────────────────────
  const filteredVendors = vendors.filter(v => v.name.toLowerCase().includes(vendorSearch.toLowerCase()) || v.code.toLowerCase().includes(vendorSearch.toLowerCase()));
  const exactMatch = vendors.find(v => v.name.toLowerCase() === vendorSearch.toLowerCase());

  const selectVendor = useCallback((v: Vendor, rowIdx: number) => {
    updateRow(rowIdx, { vendor: v.name, vendorId: v.id });
    setVendorSearch(''); setVendorDrop(false);
    setActiveCell('ean');
    if (rowIdx === rows.length - 1) setRows(rs => [...rs, newRow()]);
    setActiveRow(rowIdx + 1);
  }, [rows.length]);

  const autoCreateVendor = useCallback(async (name: string, rowIdx: number) => {
    const code = name.replace(/\s+/g, '').toUpperCase().slice(0, 10) + Math.floor(Math.random() * 100);
    try {
      const v = await api<Vendor>('/vendors', { method: 'POST', body: JSON.stringify({ name, code }) });
      setVendors(vs => [...vs, v]);
      selectVendor(v, rowIdx);
    } catch { selectVendor({ id: '', name, code: '' }, rowIdx); }
  }, [selectVendor]);

  // ── Keyboard handlers ───────────────────────────────────────────────────────
  const onEanKey = (e: KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      handleEanEnter(idx, (e.target as HTMLInputElement).value);
    }
  };
  const onImeiKey = (e: KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      handleImeiEnter(idx, (e.target as HTMLInputElement).value);
    }
    if (e.key === 'Escape') { updateRow(idx, { errCell: '', errMsg: '' }); }
  };
  const onQtyKey = (e: KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); saveRow(idx); }
  };
  const onVendorKey = async (e: KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key === 'Escape') { setVendorDrop(false); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = (e.target as HTMLInputElement).value.trim();
      if (!val) { saveRow(idx); return; }
      if (exactMatch) { selectVendor(exactMatch, idx); }
      else { await autoCreateVendor(val, idx); }
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setVendorDrop(true); }
  };

  // ── Live summary ─────────────────────────────────────────────────────────────
  const savedRows = rows.filter(r => r.status === 'saved');
  const summary = Object.values(
    savedRows.reduce((acc: any, r) => {
      const k = r.model || r.ean;
      if (!acc[k]) acc[k] = { model: k, qty: 0, vendor: r.vendor };
      acc[k].qty += parseInt(r.qty) || 1;
      return acc;
    }, {})
  ) as { model: string; qty: number; vendor: string }[];
  const grandTotal = summary.reduce((s: number, r: any) => s + r.qty, 0);

  // ── Party summary ─────────────────────────────────────────────────────────────
  const partyMap = savedRows.reduce((acc: any, r) => {
    const v = r.vendor || '(No Vendor)';
    if (!acc[v]) acc[v] = {};
    const k = r.model || r.ean;
    acc[v][k] = (acc[v][k] || 0) + (parseInt(r.qty) || 1);
    return acc;
  }, {});

  // ── Drawer save ───────────────────────────────────────────────────────────────
  const saveDrawerProduct = async () => {
    if (!drawerForm.model) return;
    setDrawerSaving(true);
    try {
      const status = 'ACTIVE';
      await api('/products', {
        method: 'POST',
        body: JSON.stringify({
          ean: drawerForm.ean, model: drawerForm.model, brand: drawerForm.brand || '',
          categoryName: drawerForm.categoryName,
          costPrice: parseFloat(drawerForm.costPrice) || 0,
          sellingPrice: parseFloat(drawerForm.sellingPrice) || 0,
          imeiRequired: !!drawerForm.imeiRequired,
          gstRate: parseFloat(drawerForm.gstRate) || 18,
          status,
        }),
      });
      setDrawer(null);
      // Re-trigger EAN lookup for the row
      const idx = rows.findIndex(r => r.ean === drawerForm.ean && r.status === 'not_found');
      if (idx >= 0) { await handleEanEnter(idx, drawerForm.ean); }
    } catch (e: any) { alert(e.message); }
    finally { setDrawerSaving(false); }
  };

  const COL_W = { num: 36, ean: 150, model: 220, qty: 60, imei: 180, vendor: 160, cost: 90 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)' }}>
      {/* Toolbar */}
      <div className="xg-toolbar">
        <span className="xg-doc">{docNumber}</span>
        <span style={{ fontSize: 11, color: '#667085' }}>Date:</span>
        <input type="date" defaultValue={new Date().toISOString().slice(0,10)} style={{ width: 130 }} />
        <span style={{ fontSize: 11, color: '#667085' }}>Warehouse:</span>
        <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} style={{ width: 160 }}>
          {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#667085' }}>{savedRows.length} rows · {grandTotal} units</span>
        <button className="btn btn-primary" style={{ height: 28, fontSize: 12 }} disabled={!savedRows.length}>
          ✓ Done ({savedRows.length})
        </button>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Grid */}
        <div className="xg-wrap" style={{ flex: 1, margin: 0, borderRadius: 0, border: 'none', borderRight: '1px solid #d0d5dd' }}>
          <div className="xg-main">
            <table className="xg-table">
              <thead>
                <tr>
                  <th className="xg-th" style={{ width: COL_W.num }}>#</th>
                  <th className="xg-th" style={{ width: COL_W.ean }}>EAN / Barcode</th>
                  <th className="xg-th" style={{ width: COL_W.model }}>Product Name</th>
                  <th className="xg-th" style={{ width: COL_W.qty }}>Qty</th>
                  <th className="xg-th" style={{ width: COL_W.imei }}>IMEI / Sr.No</th>
                  <th className="xg-th" style={{ width: COL_W.vendor }}>Vendor</th>
                  <th className="xg-th" style={{ width: COL_W.cost }}>Cost ₹</th>
                  <th className="xg-th" style={{ width: 80 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const isActive = idx === activeRow;
                  const cls = `xg-row ${row.status === 'saved' ? 'saved' : ''} ${isActive ? 'active' : ''} ${row.status === 'err' ? 'error' : ''}`;
                  return (
                    <tr key={row.id} className={cls} onClick={() => { setActiveRow(idx); setActiveCell('ean'); }}>
                      <td className="xg-row-num">{idx + 1}</td>
                      {/* EAN */}
                      <td className={`xg-td ${isActive && activeCell === 'ean' ? 'xg-focus' : ''}`}>
                        <input ref={setRef(idx, 'ean')} value={row.ean}
                          onChange={e => updateRow(idx, { ean: e.target.value })}
                          onKeyDown={e => onEanKey(e, idx)}
                          onFocus={() => { setActiveRow(idx); setActiveCell('ean'); }}
                          placeholder={idx === 0 ? 'Scan EAN…' : ''} />
                      </td>
                      {/* Product Name */}
                      <td className="xg-td">
                        <input value={row.model} readOnly tabIndex={-1}
                          style={{ color: row.model ? '#101828' : '#98a2b3', fontWeight: row.model ? 500 : 400 }}
                          placeholder="Auto-filled" />
                      </td>
                      {/* Qty */}
                      <td className={`xg-td ${isActive && activeCell === 'qty' ? 'xg-focus' : ''}`}>
                        <input ref={setRef(idx, 'qty')} type="number" min="1" value={row.qty}
                          onChange={e => updateRow(idx, { qty: e.target.value })}
                          onKeyDown={e => onQtyKey(e, idx)}
                          onFocus={() => { setActiveRow(idx); setActiveCell('qty'); }}
                          readOnly={row.imeiRequired}
                          style={{ textAlign: 'center', color: row.imeiRequired ? '#98a2b3' : 'inherit' }} />
                      </td>
                      {/* IMEI */}
                      <td className={`xg-td ${row.errCell === 'imei' ? 'cell-err' : ''} ${isActive && activeCell === 'imei' ? 'xg-focus' : ''}`}>
                        <input ref={setRef(idx, 'imei')} value={row.imei}
                          onChange={e => updateRow(idx, { imei: e.target.value, errCell: '', errMsg: '' })}
                          onKeyDown={e => onImeiKey(e, idx)}
                          onFocus={() => { setActiveRow(idx); setActiveCell('imei'); }}
                          readOnly={!row.imeiRequired}
                          placeholder={row.imeiRequired ? 'Scan IMEI…' : '—'}
                          style={{ fontFamily: 'var(--mono)', fontSize: 12, color: row.errCell === 'imei' ? '#dc2626' : 'inherit' }} />
                      </td>
                      {/* Vendor */}
                      <td className={`xg-td ${isActive && activeCell === 'vendor' ? 'xg-focus' : ''}`} style={{ position: 'relative' }}>
                        <input ref={setRef(idx, 'vendor')} value={isActive && activeCell === 'vendor' ? vendorSearch : row.vendor}
                          onChange={e => { setVendorSearch(e.target.value); setVendorDrop(true); }}
                          onKeyDown={e => onVendorKey(e, idx)}
                          onFocus={() => { setActiveRow(idx); setActiveCell('vendor'); setVendorSearch(row.vendor); setVendorDrop(true); }}
                          onBlur={() => setTimeout(() => setVendorDrop(false), 180)}
                          placeholder="Type vendor…" />
                        {isActive && activeCell === 'vendor' && vendorDrop && (
                          <div className="xg-vendor-drop">
                            {filteredVendors.slice(0, 8).map(v => (
                              <div key={v.id} className="xg-vendor-item" onMouseDown={() => selectVendor(v, idx)}>
                                {v.name} <span style={{ fontSize: 10, color: '#98a2b3' }}>{v.code}</span>
                              </div>
                            ))}
                            {vendorSearch && !exactMatch && (
                              <div className="xg-vendor-item create" onMouseDown={() => autoCreateVendor(vendorSearch, idx)}>
                                ＋ Create "{vendorSearch}"
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      {/* Cost */}
                      <td className="xg-td">
                        <input type="number" value={row.unitCost}
                          onChange={e => updateRow(idx, { unitCost: e.target.value })}
                          onFocus={() => { setActiveRow(idx); setActiveCell('vendor'); }}
                          placeholder="0" style={{ textAlign: 'right' }} />
                      </td>
                      {/* Status badge */}
                      <td className="xg-td" style={{ textAlign: 'center' }}>
                        {row.status === 'saved' && <span style={{ fontSize: 10, background: '#dcfce7', color: '#16a34a', padding: '2px 7px', borderRadius: 10, fontWeight: 700 }}>✓ Saved</span>}
                        {row.status === 'err' && <span style={{ fontSize: 10, background: '#fee2e2', color: '#dc2626', padding: '2px 7px', borderRadius: 10, fontWeight: 700, cursor: 'help' }} title={row.errMsg}>⚠ Error</span>}
                        {row.status === 'awaiting_imei' && <span style={{ fontSize: 10, background: '#fef9c3', color: '#854d0e', padding: '2px 7px', borderRadius: 10 }}>IMEI ↓</span>}
                        {row.status === 'awaiting_qty' && <span style={{ fontSize: 10, background: '#dbeafe', color: '#1e40af', padding: '2px 7px', borderRadius: 10 }}>Qty ↓</span>}
                        {savingRow && isActive && <div className="spinner" style={{ margin: '0 auto', width: 14, height: 14 }} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right summary panel */}
        <div className="xg-right">
          <div className="xg-right-tab">
            <button className={summaryTab === 'live' ? 'on' : ''} onClick={() => setSummaryTab('live')}>📊 Live Summary</button>
            <button className={summaryTab === 'party' ? 'on' : ''} onClick={() => setSummaryTab('party')}>🏢 Party-wise</button>
          </div>

          {summaryTab === 'live' && (
            <>
              <div style={{ padding: '8px 10px', borderBottom: '1px solid #e4e7ec', fontSize: 11, fontWeight: 600, color: '#667085', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                STOCK RECEIVED TODAY
              </div>
              <div className="xg-summary">
                {summary.length === 0 && <div style={{ color: '#98a2b3', fontSize: 12, textAlign: 'center', marginTop: 20 }}>Scan products to see summary</div>}
                {summary.map((s: any) => (
                  <div key={s.model} className="xg-summary-row">
                    <span className="xg-summary-model">{s.model}</span>
                    <span className="xg-summary-qty">+{s.qty}</span>
                  </div>
                ))}
              </div>
              <div className="xg-total">
                <span>Grand Total</span>
                <span style={{ color: 'var(--ok)' }}>+{grandTotal} units</span>
              </div>
            </>
          )}

          {summaryTab === 'party' && (
            <>
              <div style={{ padding: '8px 10px', borderBottom: '1px solid #e4e7ec', fontSize: 11, fontWeight: 600, color: '#667085', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                VENDOR-WISE SUMMARY
              </div>
              <div className="xg-summary" style={{ padding: '8px' }}>
                {Object.keys(partyMap).length === 0 && <div style={{ color: '#98a2b3', fontSize: 12, textAlign: 'center', marginTop: 20 }}>No data yet</div>}
                {Object.entries(partyMap).map(([vendor, products]: any) => {
                  const total = Object.values(products).reduce((s: any, v: any) => s + v, 0) as number;
                  return (
                    <div key={vendor} className="party-section">
                      <div className="party-hdr">{vendor} <span style={{ color: 'var(--brand)' }}>{total}</span></div>
                      <div style={{ padding: '4px 12px 8px' }}>
                        {Object.entries(products).map(([model, qty]: any) => (
                          <div key={model} className="party-row"><span>{model}</span><span style={{ fontWeight: 600 }}>{qty}</span></div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="xg-total"><span>Grand Total</span><span style={{ color: 'var(--ok)' }}>{grandTotal}</span></div>
            </>
          )}
        </div>
      </div>

      {/* New Product Drawer */}
      <div className={`xg-drawer ${drawer ? 'open' : ''}`}>
        <div className="xg-drawer-hdr">
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#101828' }}>🆕 New Product</div>
            <div style={{ fontSize: 11, color: '#667085', marginTop: 2 }}>EAN: <strong>{drawer?.ean}</strong> not found in system</div>
          </div>
          <button onClick={() => setDrawer(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#667085' }}>✕</button>
        </div>
        <div className="xg-drawer-body">
          {[
            ['EAN', 'ean', 'text'], ['Product Name *', 'model', 'text'], ['Brand', 'brand', 'text'],
            ['Category', 'categoryName', 'text'], ['Cost Price ₹', 'costPrice', 'number'],
            ['MRP ₹', 'mrp', 'number'], ['Selling Price ₹', 'sellingPrice', 'number'],
            ['GST %', 'gstRate', 'number'], ['HSN Code', 'hsnCode', 'text'],
          ].map(([label, key, type]) => (
            <div key={key as string} className="xg-field">
              <label>{label as string}</label>
              <input type={type as string} value={drawerForm[key as string]} onChange={e => setDrawerForm((f: any) => ({ ...f, [key as string]: e.target.value }))} />
            </div>
          ))}
          <div className="xg-field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }}>
              <input type="checkbox" checked={drawerForm.imeiRequired} onChange={e => setDrawerForm((f: any) => ({ ...f, imeiRequired: e.target.checked }))} style={{ width: 'auto', height: 'auto' }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: '#344054' }}>IMEI Required (mobile/tablet)</span>
            </label>
          </div>
          <button className="btn btn-primary" style={{ width: '100%', height: 40, fontSize: 14, marginTop: 8 }}
            onClick={saveDrawerProduct} disabled={!drawerForm.model || drawerSaving}>
            {drawerSaving ? 'Saving…' : 'Save Product & Continue'}
          </button>
        </div>
      </div>
      {drawer && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.2)', zIndex: 199 }} onClick={() => setDrawer(null)} />}

      {/* Error toast */}
      {rows.some(r => r.errMsg) && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#dc2626', color: '#fff', padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 300 }}>
          ⚠ {rows.find(r => r.errMsg)?.errMsg}
        </div>
      )}
    </div>
  );
}
