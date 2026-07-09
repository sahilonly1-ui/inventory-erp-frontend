import { useState, useEffect, useRef, useCallback, KeyboardEvent } from 'react';
import { api } from '../api/client';

interface Warehouse { id: string; name: string; }
type CellName = 'ean' | 'qty' | 'imei' | 'party';
type RowStatus = 'empty' | 'found' | 'not_found' | 'awaiting_imei' | 'awaiting_qty' | 'saved' | 'err';
interface Row { id: string; ean: string; productId: string; model: string; brand: string; imeiRequired: boolean; qty: string; imei: string; party: string; status: RowStatus; errCell: CellName | ''; errMsg: string; }

const newRow = (): Row => ({ id: Math.random().toString(36).slice(2), ean: '', productId: '', model: '', brand: '', imeiRequired: false, qty: '1', imei: '', party: '', status: 'empty', errCell: '', errMsg: '' });
const genDoc = () => `SOUT-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(Math.random()*9000+1000)}`;
const COMMON_PARTIES = ['Amazon','Flipkart','JioMart','Prime','Meesho','Myntra','Walk In Customer','Service Center','Return'];

export function StockOut() {
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [activeRow, setActiveRow] = useState(0);
  const [activeCell, setActiveCell] = useState<CellName>('ean');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [docNumber] = useState(genDoc);
  const [partySearch, setPartySearch] = useState('');
  const [partyDrop, setPartyDrop] = useState(false);
  const [knownParties, setKnownParties] = useState<string[]>(COMMON_PARTIES);
  const [savingRow, setSavingRow] = useState(false);
  const [summaryTab, setSummaryTab] = useState<'live'|'party'>('live');
  const cellRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    api<Warehouse[]>('/warehouses').then(ws => { setWarehouses(ws); if (ws.length) setWarehouseId(ws[0].id); }).catch(() => {});
  }, []);

  useEffect(() => {
    const key = `${activeRow}-${activeCell}`;
    cellRefs.current[key]?.focus();
  }, [activeRow, activeCell]);

  const setRef = (idx: number, cell: CellName) => (el: HTMLInputElement | null) => { cellRefs.current[`${idx}-${cell}`] = el; };
  const updateRow = (idx: number, patch: Partial<Row>) => setRows(rs => rs.map((r, i) => i === idx ? { ...r, ...patch } : r));

  const handleEanEnter = useCallback(async (idx: number, ean: string) => {
    if (!ean.trim() || !warehouseId) return;
    try {
      const result = await api<{ product: any }>(`/inventory/lookup?ean=${encodeURIComponent(ean.trim())}`);
      const p = result.product;
      updateRow(idx, { productId: p.id, model: p.model, brand: p.brand, imeiRequired: p.imeiRequired, status: 'found', errCell: '', errMsg: '' });
      setActiveCell(p.imeiRequired ? 'imei' : 'qty');
      updateRow(idx, { status: p.imeiRequired ? 'awaiting_imei' : 'awaiting_qty' });
    } catch { updateRow(idx, { ean: ean.trim(), status: 'not_found', errMsg: `EAN not found` }); }
  }, [warehouseId]);

  const handleImeiEnter = useCallback(async (idx: number, imei: string) => {
    if (!imei.trim()) return;
    // Check imei exists and is IN_STOCK
    try {
      const data = await api<{ status: string }>(`/imei/${encodeURIComponent(imei.trim())}`);
      if ((data as any).status === 'SOLD') {
        updateRow(idx, { errCell: 'imei', errMsg: `IMEI ${imei} already SOLD!`, status: 'err' });
        return;
      }
    } catch {
      updateRow(idx, { errCell: 'imei', errMsg: `IMEI ${imei} not in system`, status: 'err' });
      return;
    }
    await saveRow(idx, imei.trim());
  }, []);

  const saveRow = useCallback(async (idx: number, imei?: string) => {
    const r = rows[idx];
    if (!r.productId || !warehouseId) return;
    setSavingRow(true);
    try {
      if (r.imeiRequired && imei) {
        await api('/imei/dispatch', { method: 'POST', body: JSON.stringify({ imeis: [imei], channel: 'STOCK_OUT', remarks: docNumber }) });
        updateRow(idx, { imei, qty: '1', status: 'saved', errCell: '', errMsg: '' });
      } else {
        const qty = parseInt(r.qty) || 1;
        await api('/inventory/stock-out', { method: 'POST', body: JSON.stringify({ productId: r.productId, warehouseId, quantity: qty, remarks: `${docNumber} → ${r.party}` }) });
        updateRow(idx, { status: 'saved', errCell: '', errMsg: '' });
      }
      if (idx === rows.length - 1) setRows(rs => [...rs, newRow()]);
      setActiveRow(idx + 1); setActiveCell('ean');
    } catch (e: any) { updateRow(idx, { errMsg: e.message, status: 'err' }); }
    finally { setSavingRow(false); }
  }, [rows, warehouseId, docNumber]);

  const filteredParties = knownParties.filter(p => p.toLowerCase().includes(partySearch.toLowerCase()));
  const exactParty = knownParties.find(p => p.toLowerCase() === partySearch.toLowerCase());

  const selectParty = (name: string, rowIdx: number) => {
    if (!knownParties.includes(name)) setKnownParties(ps => [...ps, name]);
    updateRow(rowIdx, { party: name }); setPartySearch(''); setPartyDrop(false);
    saveRow(rowIdx);
  };

  const onEanKey = (e: KeyboardEvent<HTMLInputElement>, idx: number) => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); handleEanEnter(idx, (e.target as HTMLInputElement).value); } };
  const onImeiKey = (e: KeyboardEvent<HTMLInputElement>, idx: number) => { if (e.key === 'Enter') { e.preventDefault(); handleImeiEnter(idx, (e.target as HTMLInputElement).value); } if (e.key === 'Escape') updateRow(idx, { errCell: '', errMsg: '' }); };
  const onQtyKey = (e: KeyboardEvent<HTMLInputElement>, idx: number) => { if (e.key === 'Enter') { e.preventDefault(); setActiveCell('party'); } };
  const onPartyKey = (e: KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key === 'Escape') { setPartyDrop(false); return; }
    if (e.key === 'Enter') { e.preventDefault(); const v = (e.target as HTMLInputElement).value.trim(); if (v) selectParty(v, idx); else saveRow(idx); }
  };

  const savedRows = rows.filter(r => r.status === 'saved');
  const summary = Object.values(savedRows.reduce((acc: any, r) => { const k = r.model || r.ean; if (!acc[k]) acc[k] = { model: k, qty: 0 }; acc[k].qty += parseInt(r.qty) || 1; return acc; }, {})) as any[];
  const grandTotal = summary.reduce((s, r) => s + r.qty, 0);
  const partyMap = savedRows.reduce((acc: any, r) => { const v = r.party || 'Unknown'; if (!acc[v]) acc[v] = {}; const k = r.model || r.ean; acc[v][k] = (acc[v][k] || 0) + (parseInt(r.qty) || 1); return acc; }, {});

  const COL_W = { num: 36, ean: 150, model: 220, qty: 60, imei: 180, party: 160 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)' }}>
      <div className="xg-toolbar">
        <span className="xg-doc" style={{ background: '#fff1f2', borderColor: '#fecdd3', color: '#dc2626' }}>{docNumber}</span>
        <span style={{ fontSize: 11, color: '#667085' }}>Date:</span>
        <input type="date" defaultValue={new Date().toISOString().slice(0,10)} style={{ width: 130 }} />
        <span style={{ fontSize: 11, color: '#667085' }}>Warehouse:</span>
        <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} style={{ width: 160 }}>
          {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#667085' }}>{savedRows.length} rows · {grandTotal} units dispatched</span>
        <button className="btn" style={{ height: 28, fontSize: 12, background: '#dc2626', color: '#fff', borderColor: '#dc2626' }} disabled={!savedRows.length}>
          ✓ Done ({savedRows.length})
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
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
                  <th className="xg-th" style={{ width: COL_W.party }}>Customer / Marketplace</th>
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
                      <td className={`xg-td ${isActive && activeCell === 'ean' ? 'xg-focus' : ''}`}>
                        <input ref={setRef(idx, 'ean')} value={row.ean} onChange={e => updateRow(idx, { ean: e.target.value })} onKeyDown={e => onEanKey(e, idx)} onFocus={() => { setActiveRow(idx); setActiveCell('ean'); }} placeholder={idx === 0 ? 'Scan EAN…' : ''} />
                      </td>
                      <td className="xg-td"><input value={row.model} readOnly tabIndex={-1} placeholder="Auto-filled" style={{ color: row.model ? '#101828' : '#98a2b3', fontWeight: row.model ? 500 : 400 }} /></td>
                      <td className={`xg-td ${isActive && activeCell === 'qty' ? 'xg-focus' : ''}`}>
                        <input ref={setRef(idx, 'qty')} type="number" min="1" value={row.qty} onChange={e => updateRow(idx, { qty: e.target.value })} onKeyDown={e => onQtyKey(e, idx)} onFocus={() => { setActiveRow(idx); setActiveCell('qty'); }} readOnly={row.imeiRequired} style={{ textAlign: 'center' }} />
                      </td>
                      <td className={`xg-td ${row.errCell === 'imei' ? 'cell-err' : ''} ${isActive && activeCell === 'imei' ? 'xg-focus' : ''}`}>
                        <input ref={setRef(idx, 'imei')} value={row.imei} onChange={e => updateRow(idx, { imei: e.target.value, errCell: '', errMsg: '' })} onKeyDown={e => onImeiKey(e, idx)} onFocus={() => { setActiveRow(idx); setActiveCell('imei'); }} readOnly={!row.imeiRequired} placeholder={row.imeiRequired ? 'Scan IMEI to dispatch…' : '—'} style={{ fontFamily: 'var(--mono)', fontSize: 12, color: row.errCell === 'imei' ? '#dc2626' : 'inherit' }} />
                      </td>
                      <td className={`xg-td ${isActive && activeCell === 'party' ? 'xg-focus' : ''}`} style={{ position: 'relative' }}>
                        <input ref={setRef(idx, 'party')} value={isActive && activeCell === 'party' ? partySearch : row.party} onChange={e => { setPartySearch(e.target.value); setPartyDrop(true); }} onKeyDown={e => onPartyKey(e, idx)} onFocus={() => { setActiveRow(idx); setActiveCell('party'); setPartySearch(row.party); setPartyDrop(true); }} onBlur={() => setTimeout(() => setPartyDrop(false), 180)} placeholder="Amazon, Walk In…" />
                        {isActive && activeCell === 'party' && partyDrop && (
                          <div className="xg-vendor-drop">
                            {filteredParties.slice(0, 8).map(p => <div key={p} className="xg-vendor-item" onMouseDown={() => selectParty(p, idx)}>{p}</div>)}
                            {partySearch && !exactParty && <div className="xg-vendor-item create" onMouseDown={() => selectParty(partySearch, idx)}>＋ Add "{partySearch}"</div>}
                          </div>
                        )}
                      </td>
                      <td className="xg-td" style={{ textAlign: 'center' }}>
                        {row.status === 'saved' && <span style={{ fontSize: 10, background: '#dcfce7', color: '#16a34a', padding: '2px 7px', borderRadius: 10, fontWeight: 700 }}>✓</span>}
                        {row.status === 'err' && <span style={{ fontSize: 10, background: '#fee2e2', color: '#dc2626', padding: '2px 7px', borderRadius: 10, fontWeight: 700, cursor: 'help' }} title={row.errMsg}>⚠ {row.errMsg.slice(0,20)}</span>}
                        {row.status === 'awaiting_imei' && <span style={{ fontSize: 10, background: '#fef9c3', color: '#854d0e', padding: '2px 7px', borderRadius: 10 }}>IMEI ↓</span>}
                        {savingRow && isActive && <div className="spinner" style={{ margin: '0 auto', width: 14, height: 14 }} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="xg-right">
          <div className="xg-right-tab">
            <button className={summaryTab === 'live' ? 'on' : ''} onClick={() => setSummaryTab('live')}>📊 Live</button>
            <button className={summaryTab === 'party' ? 'on' : ''} onClick={() => setSummaryTab('party')}>👤 Party-wise</button>
          </div>
          {summaryTab === 'live' && (
            <>
              <div style={{ padding: '8px 10px', borderBottom: '1px solid #e4e7ec', fontSize: 11, fontWeight: 600, color: '#667085', textTransform: 'uppercase', letterSpacing: '.05em' }}>DISPATCHED TODAY</div>
              <div className="xg-summary">
                {summary.length === 0 && <div style={{ color: '#98a2b3', fontSize: 12, textAlign: 'center', marginTop: 20 }}>Scan products to dispatch</div>}
                {summary.map((s: any) => <div key={s.model} className="xg-summary-row"><span className="xg-summary-model">{s.model}</span><span className="xg-summary-qty" style={{ color: '#dc2626' }}>-{s.qty}</span></div>)}
              </div>
              <div className="xg-total"><span>Grand Total</span><span style={{ color: '#dc2626' }}>-{grandTotal} units</span></div>
            </>
          )}
          {summaryTab === 'party' && (
            <>
              <div style={{ padding: '8px 10px', borderBottom: '1px solid #e4e7ec', fontSize: 11, fontWeight: 600, color: '#667085', textTransform: 'uppercase', letterSpacing: '.05em' }}>CUSTOMER-WISE</div>
              <div className="xg-summary" style={{ padding: '8px' }}>
                {Object.keys(partyMap).length === 0 && <div style={{ color: '#98a2b3', fontSize: 12, textAlign: 'center', marginTop: 20 }}>No data yet</div>}
                {Object.entries(partyMap).map(([party, products]: any) => {
                  const total = Object.values(products).reduce((s: any, v: any) => s + v, 0) as number;
                  return (
                    <div key={party} className="party-section">
                      <div className="party-hdr">{party}<span style={{ color: '#dc2626' }}>{total}</span></div>
                      <div style={{ padding: '4px 12px 8px' }}>{Object.entries(products).map(([model, qty]: any) => <div key={model} className="party-row"><span>{model}</span><span style={{ fontWeight: 600 }}>{qty}</span></div>)}</div>
                    </div>
                  );
                })}
              </div>
              <div className="xg-total"><span>Grand Total</span><span style={{ color: '#dc2626' }}>{grandTotal}</span></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
