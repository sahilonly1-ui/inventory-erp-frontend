import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useIsPhone } from '../mobile/ui';

/*
 * Specifications — a customer-facing spec sheet of everything in stock, one
 * category at a time (Smartphones by default), grouped by brand and sorted by
 * price. Specs are fetched once per model/variant by the server and kept; this
 * page only shows them, polls while new ones are being fetched, lets a missing
 * model be fetched from a link, and prints on A4.
 */

type Field = { key: string; label: string };
type Row = {
  productId: string; ean: string; brand: string; model: string; key: string; qty: number;
  price: number; priceEdited: boolean; costPrice: number; mrp: number;
  status: 'PENDING' | 'FETCHING' | 'OK' | 'NOT_FOUND' | 'ERROR' | 'NO_AI';
  specs: Record<string, string>; sources: string[]; error: string | null; sourceUrl: string | null; manual: boolean;
};
type Sheet = { category: { id: string; name: string }; fields: Field[]; rows: Row[]; aiEnabled: boolean };
type Cat = { id: string; name: string; count: number };

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const esc = (t: string) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const busy = (s: Row['status']) => s === 'PENDING' || s === 'FETCHING';

export default function Specs() {
  const isPhone = useIsPhone();
  const { user } = useAuth();
  const canEdit = (user?.permissions ?? []).some(p => p === '*' || p === 'products.update');

  const [cats, setCats] = useState<Cat[]>([]);
  const [catId, setCatId] = useState('');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [editPrice, setEditPrice] = useState<{ id: string; v: string } | null>(null);
  const [editRow, setEditRow] = useState<{ key: string; v: Record<string, string> } | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const timer = useRef<number | null>(null);

  const say = (t: string) => { setToast(t); window.setTimeout(() => setToast(''), 3500); };

  // Categories with stock; default to Smartphones.
  useEffect(() => {
    api<Cat[]>('/specs/categories').then(c => {
      setCats(c);
      const def = c.find(x => /smart\s*phone/i.test(x.name)) ?? c.find(x => /phone|mobile/i.test(x.name)) ?? c[0];
      if (def) setCatId(def.id);
    }).catch(e => setErr(e.message || 'Could not load categories'));
  }, []);

  const load = useCallback(async (quiet = false) => {
    if (!catId) return;
    if (!quiet) setLoading(true);
    try { setSheet(await api<Sheet>(`/specs?categoryId=${catId}`)); setErr(''); }
    catch (e: any) { if (!quiet) setErr(e.message || 'Could not load specifications'); }
    finally { if (!quiet) setLoading(false); }
  }, [catId]);
  useEffect(() => { setSheet(null); load(); }, [load]);

  // While specs are still being fetched, check back every few seconds.
  const pending = sheet?.rows.filter(r => busy(r.status)).length ?? 0;
  const noAi = sheet?.rows.filter(r => r.status === 'NO_AI').length ?? 0;
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (pending > 0) timer.current = window.setTimeout(() => load(true), 6000);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [sheet, pending, load]);

  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of sheet?.rows ?? []) m.set(r.brand, [...(m.get(r.brand) ?? []), r]);
    return [...m.entries()];
  }, [sheet]);
  const models = new Set(sheet?.rows.map(r => r.key)).size;
  const ready = new Set(sheet?.rows.filter(r => r.status === 'OK').map(r => r.key)).size;

  const savePrice = async (r: Row, raw: string) => {
    const v = raw.trim() === '' ? null : Number(raw);
    if (v !== null && !(v > 0)) { say('Enter a price above 0, or leave it empty to use the cost price'); return; }
    try {
      await api(`/specs/price/${r.productId}`, { method: 'PUT', body: JSON.stringify({ price: v }) });
      setEditPrice(null); load(true);
    } catch (e: any) { say(e.message || 'Could not save the price'); }
  };

  const saveSpecs = async () => {
    if (!editRow) return;
    try {
      await api('/specs/entry', { method: 'PUT', body: JSON.stringify({ key: editRow.key, specs: editRow.v }) });
      setEditRow(null); say('Specifications saved'); load(true);
    } catch (e: any) { say(e.message || 'Could not save the specifications'); }
  };

  const refetch = async (r: Row, withLink: boolean) => {
    const url = (links[r.key] ?? '').trim();
    if (withLink && !/^https?:\/\/\S+\.\S+/.test(url)) { say('Paste the full website link, starting with https://'); return; }
    try {
      await api('/specs/refetch', { method: 'POST', body: JSON.stringify({ key: r.key, url: withLink ? url : null }) });
      say(withLink ? 'Fetching specifications from that link…' : 'Fetching specifications again…');
      load(true);
    } catch (e: any) { say(e.message || 'Could not start fetching'); }
  };

  // ── A4 print ────────────────────────────────────────────────────────────
  const handlePrint = () => {
    if (!sheet) return;
    const f = sheet.fields;
    const date = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const body = groups.map(([brand, rows]) => `
      <tr class="brand"><td colspan="${f.length + 2}">${esc(brand)}</td></tr>
      ${rows.map(r => `<tr>
        <td class="model">${esc(r.model)}</td>
        <td class="price">${inr(r.price)}</td>
        ${r.status === 'OK' || Object.keys(r.specs).length
          ? f.map(x => `<td>${esc(r.specs[x.key] || '—')}</td>`).join('')
          : `<td colspan="${f.length}" class="na">Specifications not available</td>`}
      </tr>`).join('')}`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(sheet.category.name)} specifications ${date}</title>
<style>
@page{size:A4 landscape;margin:8mm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Inter,'Segoe UI',Arial,sans-serif;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.hd{display:flex;align-items:baseline;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:2mm;margin-bottom:2mm}
.hd h1{font-size:17pt;font-weight:900;letter-spacing:.01em}
.hd .sub{font-size:8.5pt;color:#444;font-weight:600}
table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:7.4pt;line-height:1.3}
thead{display:table-header-group}
th{background:#1e293b;color:#fff;font-weight:700;text-align:left;padding:1.4mm 1.2mm;font-size:7.2pt}
td{border-bottom:.5pt solid #cbd5e1;padding:1.2mm;vertical-align:top;word-wrap:break-word}
tr{page-break-inside:avoid}
tr.brand td{background:#e2e8f0;font-weight:900;font-size:9.5pt;padding:1.6mm 1.2mm;border-bottom:1pt solid #1e293b}
td.model{font-weight:700}
td.price{font-weight:800;white-space:nowrap}
td.na{color:#888;font-style:italic}
.ft{margin-top:2mm;font-size:6.5pt;color:#666}
</style></head><body>
<div class="hd"><h1>${esc(sheet.category.name)} specifications</h1>
<div class="sub">iTechArena, in stock on ${date}</div></div>
<table><colgroup><col style="width:15%"><col style="width:6.5%">${f.map(() => `<col>`).join('')}</colgroup>
<thead><tr><th>Model &amp; Variant</th><th>Price</th>${f.map(x => `<th>${esc(x.label)}</th>`).join('')}</tr></thead>
<tbody>${body}</tbody></table>
<div class="ft">Specifications are from the manufacturer and authorised spec sources. Prices and availability may change.</div>
</body></html>`;
    const w = window.open('', '_blank');
    if (!w) { alert('Allow pop-ups to print'); return; }
    w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => { w.print(); w.close(); }, 350);
  };

  // ── UI ──────────────────────────────────────────────────────────────────
  const fields = sheet?.fields ?? [];
  const cell: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--bdr-s, #e5e7eb)', verticalAlign: 'top', fontSize: 12.5, lineHeight: 1.4 };
  const th: React.CSSProperties = { padding: '9px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#475569', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 1, whiteSpace: 'nowrap' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: isPhone ? '12px 14px' : '14px 20px', borderBottom: '1px solid #e5e7eb', flexWrap: 'wrap', background: '#fff', color: '#334155' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>Specifications</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            {sheet ? `${sheet.rows.length} items in stock, ${models} models` : 'Only items in stock are listed'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <select value={catId} onChange={e => setCatId(e.target.value)} aria-label="Category"
          style={{ width: 'auto', flex: '0 0 auto', height: 38, padding: '0 12px', border: '1.5px solid #c7d2fe', borderRadius: 10, fontSize: 14, fontWeight: 700, color: '#1e3a8a', background: '#eef2ff', minWidth: 200 }}>
          {cats.map(c => <option key={c.id} value={c.id}>{c.name} ({c.count})</option>)}
        </select>
        <button onClick={() => load()} style={{ height: 38, padding: '0 14px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', color: '#334155', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Refresh</button>
        <button onClick={handlePrint} disabled={!sheet?.rows.length}
          style={{ height: 38, padding: '0 16px', border: 'none', borderRadius: 10, background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Print A4</button>
        </div>
      </div>

      {sheet && pending > 0 && (
        <div style={{ padding: '8px 20px', fontSize: 12.5, fontWeight: 600, background: '#eff6ff', color: '#1d4ed8', borderBottom: '1px solid #e5e7eb' }}>
          Fetching specifications for new models: {ready} of {models} ready. This page updates by itself.
        </div>
      )}
      {sheet && pending === 0 && noAi > 0 && (
        <div style={{ padding: '8px 20px', fontSize: 12.5, fontWeight: 600, background: '#fff7ed', color: '#9a3412', borderBottom: '1px solid #e5e7eb' }}>
          Automatic fetching for {sheet.category.name} is not switched on yet. Specs can be typed in for now.
        </div>
      )}

      {err && <div style={{ margin: 16, padding: 12, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, fontWeight: 600 }}>{err}</div>}
      {toast && <div style={{ position: 'fixed', bottom: 20, right: 20, background: '#0f172a', color: '#fff', padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 50 }}>{toast}</div>}

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#fff', color: '#334155' }}>
        {loading && !sheet && <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading…</div>}
        {sheet && sheet.rows.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Nothing in stock in {sheet.category.name}. Pick another category.</div>
        )}
        {sheet && sheet.rows.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 300 + fields.length * 150 }}>
            <thead><tr>
              <th style={{ ...th, minWidth: 220 }}>Model &amp; Variant</th>
              <th style={{ ...th, minWidth: 90 }}>Price</th>
              {fields.map(f => <th key={f.key} style={{ ...th, minWidth: 150 }}>{f.label}</th>)}
            </tr></thead>
            <tbody>
              {groups.map(([brand, rows]) => [
                <tr key={`b-${brand}`}><td colSpan={fields.length + 2}
                  style={{ background: '#1e293b', color: '#fff', fontWeight: 800, fontSize: 14, padding: '8px 12px' }}>{brand}
                  <span style={{ fontWeight: 500, fontSize: 12, color: '#cbd5e1', marginLeft: 8 }}>{rows.length}</span></td></tr>,
                ...rows.map(r => {
                  const editingThis = editRow?.key === r.key;
                  const hasSpecs = Object.keys(r.specs).length > 0;
                  return (
                    <tr key={r.productId}>
                      <td style={{ ...cell, fontWeight: 600, color: '#0f172a' }}>
                        {r.model}
                        <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, marginTop: 2 }}>
                          {r.qty} in stock
                          {canEdit && (r.status === 'OK' || hasSpecs) && !editingThis && (
                            <button onClick={() => setEditRow({ key: r.key, v: { ...r.specs } })}
                              style={{ marginLeft: 8, border: 'none', background: 'none', color: '#2563eb', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}>Edit specs</button>
                          )}
                          {r.manual && <span style={{ marginLeft: 8, color: '#a16207' }}>edited by hand</span>}
                        </div>
                      </td>
                      <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                        {editPrice?.id === r.productId ? (
                          <div>
                            <input autoFocus type="number" min="1" value={editPrice.v} onChange={e => setEditPrice({ id: r.productId, v: e.target.value })}
                              onKeyDown={e => { if (e.key === 'Enter') savePrice(r, editPrice.v); if (e.key === 'Escape') setEditPrice(null); }}
                              placeholder={String(Math.round(r.costPrice))}
                              style={{ width: 90, height: 28, padding: '0 6px', border: '1.5px solid #2563eb', borderRadius: 6, fontSize: 13 }} />
                            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                              <button onClick={() => savePrice(r, editPrice.v)} style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: '#2563eb', border: 'none', borderRadius: 5, padding: '3px 8px', cursor: 'pointer' }}>Save</button>
                              <button onClick={() => setEditPrice(null)} style={{ fontSize: 11, border: '1px solid #e2e8f0', background: '#fff', color: '#334155', borderRadius: 5, padding: '3px 8px', cursor: 'pointer' }}>Cancel</button>
                            </div>
                            {r.priceEdited && <button onClick={() => savePrice(r, '')} style={{ marginTop: 4, fontSize: 11, color: '#64748b', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>Use cost price</button>}
                          </div>
                        ) : (
                          <span onClick={() => canEdit && setEditPrice({ id: r.productId, v: String(Math.round(r.price)) })}
                            title={canEdit ? 'Click to change the price shown on this sheet (cost price is not changed)' : ''}
                            style={{ fontWeight: 800, fontSize: 13.5, color: '#0f172a', cursor: canEdit ? 'pointer' : 'default', borderBottom: canEdit ? '1px dashed #94a3b8' : 'none' }}>
                            {inr(r.price)}
                          </span>
                        )}
                      </td>
                      {editingThis ? (
                        <td colSpan={fields.length} style={cell}>
                          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isPhone ? 1 : Math.min(4, fields.length)}, 1fr)`, gap: 8 }}>
                            {fields.map(f => (
                              <label key={f.key} style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>{f.label}
                                <textarea value={editRow!.v[f.key] ?? ''} rows={2} onChange={e => setEditRow({ key: r.key, v: { ...editRow!.v, [f.key]: e.target.value } })}
                                  style={{ display: 'block', width: '100%', marginTop: 3, padding: 6, border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', resize: 'vertical' }} />
                              </label>
                            ))}
                          </div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <button onClick={saveSpecs} style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: '#2563eb', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}>Save specifications</button>
                            <button onClick={() => setEditRow(null)} style={{ fontSize: 12, border: '1px solid #e2e8f0', background: '#fff', color: '#334155', borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}>Cancel</button>
                          </div>
                        </td>
                      ) : busy(r.status) && !hasSpecs ? (
                        <td colSpan={fields.length} style={{ ...cell, color: '#2563eb', fontWeight: 600 }}>
                          {r.status === 'FETCHING' ? 'Fetching specifications…' : 'Waiting to fetch specifications…'}
                        </td>
                      ) : r.status === 'OK' || hasSpecs ? (
                        fields.map(f => <td key={f.key} style={cell}>{r.specs[f.key] || <span style={{ color: '#cbd5e1' }}>—</span>}</td>)
                      ) : (
                        <td colSpan={fields.length} style={{ ...cell, background: '#fffbeb' }}>
                          <div style={{ position: 'sticky', left: 0, maxWidth: 'min(860px, 72vw)' }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#92400e' }}>
                            {r.status === 'NO_AI' ? 'Automatic fetching is not switched on for this category yet.' : r.status === 'ERROR' ? 'Fetching the specifications did not work this time.' : 'Specifications for this exact model could not be found.'}
                            {' '}Provide a website link that has this model's specifications (brand site, GSMArena, 91mobiles…).
                          </div>
                          {r.error && r.status === 'ERROR' && <div style={{ fontSize: 11.5, color: '#b45309', marginTop: 2 }}>{r.error}</div>}
                          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                            <input value={links[r.key] ?? r.sourceUrl ?? ''} onChange={e => setLinks(l => ({ ...l, [r.key]: e.target.value }))}
                              placeholder="https://www.gsmarena.com/…"
                              style={{ flex: 1, minWidth: 220, height: 30, padding: '0 8px', border: '1px solid #fcd34d', borderRadius: 6, fontSize: 12.5, background: '#fff', color: '#334155' }} />
                            <button onClick={() => refetch(r, true)} style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: '#d97706', border: 'none', borderRadius: 6, padding: '0 12px', height: 30, cursor: 'pointer' }}>Fetch from this link</button>
                            <button onClick={() => refetch(r, false)} style={{ fontSize: 12, border: '1px solid #fcd34d', background: '#fff', color: '#334155', borderRadius: 6, padding: '0 10px', height: 30, cursor: 'pointer' }}>Try again</button>
                            {canEdit && <button onClick={() => setEditRow({ key: r.key, v: { ...r.specs } })} style={{ fontSize: 12, border: '1px solid #e2e8f0', background: '#fff', color: '#334155', borderRadius: 6, padding: '0 10px', height: 30, cursor: 'pointer' }}>Type them in</button>}
                          </div>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                }),
              ])}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
