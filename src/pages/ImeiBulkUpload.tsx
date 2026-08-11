import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../api/client';

interface BulkRow {
  imei: string;
  swiped?: boolean;
  swipedAt?: string;
  activated?: boolean;
  activatedAt?: string;
}
interface ResultRow { imei: string; status: 'ok' | 'not_found' | 'error'; msg?: string; }

const today = () => {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
};

// Generate and download an Excel template file
function downloadTemplate() {
  const headers = [
    'IMEI (Required)',
    'Swiped (yes/no)',
    'Date of Swipe (DD-MM-YYYY)',
    'Activated (yes/no)',
    'Date of Activation (DD-MM-YYYY)',
  ];
  const examples = [
    ['357998631622697', 'yes', today(), '', ''],
    ['357998631622696', 'yes', '15-07-2026', 'yes', '15-07-2026'],
    ['357998631622695', '', '', 'yes', today()],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
  ws['!cols'] = [{ wch: 20 }, { wch: 16 }, { wch: 22 }, { wch: 18 }, { wch: 26 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bulk Update');
  XLSX.writeFile(wb, 'IMEI_Bulk_Update_Template.xlsx');
}

// Parse uploaded Excel file → BulkRow[]
function parseExcel(file: File): Promise<BulkRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target!.result, { type: 'binary', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        if (range.e.r < 1) { reject(new Error('Template is empty — add at least one row')); return; }

        // Read a cell's RAW value (for IMEI / yes-no text — never goes through
        // date formatting, so no risk of number-format side effects)
        const cellRaw = (r: number, c: number): string => {
          const cell = ws[XLSX.utils.encode_cell({ r, c })];
          return cell ? String(cell.v ?? '').trim() : '';
        };

        // Read a cell's DISPLAYED TEXT exactly as Excel shows it (cell.w).
        // This is the fix: converting an Excel date serial back through a JS
        // Date object and re-extracting y/m/d is timezone-dependent and was
        // rolling every date back by one day. Reading the formatted text
        // Excel already computed sidesteps Date-object math entirely.
        const cellDisplayDate = (r: number, c: number): string => {
          const cell = ws[XLSX.utils.encode_cell({ r, c })];
          if (!cell) return '';
          const text = cell.w !== undefined ? String(cell.w).trim() : String(cell.v ?? '').trim();
          if (!text) return '';
          // DD-MM-YYYY or DD/MM/YYYY (what our template asks for)
          let m = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
          if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
          // Already ISO YYYY-MM-DD
          if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
          // Fallback: displayed text didn't match — reconstruct from the Date
          // object as a last resort (rare: only if number format is unusual)
          if (cell.v instanceof Date) {
            const yyyy = cell.v.getFullYear();
            const mm   = String(cell.v.getMonth() + 1).padStart(2, '0');
            const dd   = String(cell.v.getDate()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
          }
          return '';
        };

        const rows: BulkRow[] = [];
        for (let r = range.s.r + 1; r <= range.e.r; r++) {
          const imei = cellRaw(r, 0).replace(/\D/g, '');
          if (!imei) continue;

          const swipedRaw    = cellRaw(r, 1).toLowerCase();
          const swipedDate    = cellDisplayDate(r, 2);
          const activatedRaw = cellRaw(r, 3).toLowerCase();
          const activatedDate = cellDisplayDate(r, 4);

          // Anchor date-only values at local noon before converting to ISO —
          // sending a bare "YYYY-MM-DD" gets parsed by `new Date()` as UTC
          // midnight, which can roll back a day once displayed. Noon avoids
          // any rollover in any timezone.
          const toSafeISO = (ymd: string) => ymd ? new Date(ymd + 'T12:00:00').toISOString() : '';

          const row: BulkRow = { imei };
          if (swipedRaw)    { row.swiped    = swipedRaw    === 'yes' || swipedRaw    === '1' || swipedRaw    === 'true'; if (swipedDate)    row.swipedAt    = toSafeISO(swipedDate); }
          if (activatedRaw) { row.activated = activatedRaw === 'yes' || activatedRaw === '1' || activatedRaw === 'true'; if (activatedDate) row.activatedAt = toSafeISO(activatedDate); }
          if (row.swiped !== undefined || row.activated !== undefined) rows.push(row);
        }
        resolve(rows);
      } catch (e: any) { reject(new Error('Could not parse file: ' + e.message)); }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsBinaryString(file);
  });
}

export function ImeiBulkUpload({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [step, setStep]     = useState<'upload' | 'preview' | 'result'>('upload');
  const [rows, setRows]     = useState<BulkRow[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [summary, setSummary] = useState<{ ok: number; not_found: number; errors: number } | null>(null);
  const [busy, setBusy]     = useState(false);
  const [err, setErr]       = useState('');
  const fileRef             = useRef<HTMLInputElement>(null);

  const onFile = async (f: File) => {
    setErr('');
    try {
      const parsed = await parseExcel(f);
      if (!parsed.length) { setErr('No valid rows found. Check the file format.'); return; }
      setRows(parsed);
      setStep('preview');
    } catch (e: any) { setErr(e.message); }
  };

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      const res = await api<{ ok: number; not_found: number; errors: number; results: ResultRow[] }>(
        '/imei/bulk-update',
        { method: 'POST', body: JSON.stringify({ rows: rows.map(r => ({ imei1: r.imei, ...r })) }) }
      );
      setResults(res.results);
      setSummary({ ok: res.ok, not_found: res.not_found, errors: res.errors });
      setStep('result');
      if (res.ok > 0) onDone();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:620, maxHeight:'90vh', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 24px 64px rgba(0,0,0,.24)' }}>

        {/* Header */}
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:'#eff6ff', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          </div>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:'#0f172a' }}>Bulk Swipe / Activate IMEIs</div>
            <div style={{ fontSize:11, color:'#94a3b8' }}>Upload an Excel file to update multiple IMEIs at once</div>
          </div>
          <button onClick={onClose} style={{ marginLeft:'auto', width:32, height:32, border:'1px solid #e2e8f0', borderRadius:8, background:'none', cursor:'pointer', fontSize:16, color:'#94a3b8' }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:'auto', padding:20 }}>

          {/* ── STEP 1: Upload ── */}
          {step === 'upload' && (
            <div>
              {/* Template download */}
              <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:12, padding:'14px 16px', marginBottom:20 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#0369a1', marginBottom:6 }}>📥 Step 1 — Download Template</div>
                <div style={{ fontSize:12, color:'#0369a1', marginBottom:10, lineHeight:1.5 }}>
                  Fill in the Excel template with IMEIs and swipe/activation dates.
                  Leave a column blank to skip updating that field.
                </div>
                <button onClick={downloadTemplate} style={{
                  height:34, padding:'0 16px', border:'1.5px solid #0284c7', borderRadius:8,
                  background:'#fff', color:'#0284c7', fontSize:12, fontWeight:700, cursor:'pointer',
                  display:'flex', alignItems:'center', gap:6,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Download Template (.xlsx)
                </button>
              </div>

              {/* Column guide */}
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#374151', marginBottom:8 }}>Template Columns</div>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ background:'#f8fafc' }}>
                      {['Column', 'Format', 'Example'].map(h => (
                        <th key={h} style={{ padding:'7px 10px', textAlign:'left', fontSize:10, fontWeight:700, color:'#64748b', textTransform:'uppercase', borderBottom:'2px solid #e2e8f0' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['IMEI (Required)', '15-digit number', '357998631622697'],
                      ['Swiped', 'yes / no (blank = skip)', 'yes'],
                      ['Date of Swipe', 'DD-MM-YYYY (blank = today)', '15-07-2026'],
                      ['Activated', 'yes / no (blank = skip)', 'yes'],
                      ['Date of Activation', 'DD-MM-YYYY (blank = today)', '01-08-2026'],
                    ].map(([col, fmt, ex], i) => (
                      <tr key={i} style={{ borderBottom:'1px solid #f1f5f9' }}>
                        <td style={{ padding:'7px 10px', fontWeight:600, color:'#0f172a' }}>{col}</td>
                        <td style={{ padding:'7px 10px', color:'#64748b' }}>{fmt}</td>
                        <td style={{ padding:'7px 10px', fontFamily:'monospace', color:'#2563eb' }}>{ex}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Upload zone */}
              <div style={{ fontSize:12, fontWeight:700, color:'#374151', marginBottom:8 }}>📤 Step 2 — Upload Filled File</div>
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
                style={{
                  border:'2px dashed #c7d2fe', borderRadius:12, padding:'32px 20px',
                  textAlign:'center', cursor:'pointer', background:'#f5f3ff',
                  transition:'border-color .15s, background .15s',
                }}>
                <div style={{ fontSize:28, marginBottom:8 }}>📂</div>
                <div style={{ fontSize:13, fontWeight:600, color:'#4338ca', marginBottom:4 }}>Click to select or drag & drop</div>
                <div style={{ fontSize:11, color:'#818cf8' }}>.xlsx or .xls files only</div>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display:'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
              </div>
              {err && <div style={{ marginTop:12, padding:'10px 14px', background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8, fontSize:12, color:'#dc2626' }}>⚠ {err}</div>}
            </div>
          )}

          {/* ── STEP 2: Preview ── */}
          {step === 'preview' && (
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                <div style={{ fontSize:14, fontWeight:700, color:'#0f172a' }}>{rows.length} IMEIs ready to update</div>
                <button onClick={() => { setStep('upload'); setRows([]); }} style={{ marginLeft:'auto', height:28, padding:'0 10px', border:'1px solid #e2e8f0', borderRadius:6, background:'none', fontSize:11, color:'#64748b', cursor:'pointer' }}>← Back</button>
              </div>
              <div style={{ border:'1px solid #e2e8f0', borderRadius:10, overflow:'hidden', maxHeight:360, overflowY:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead style={{ position:'sticky', top:0 }}>
                    <tr style={{ background:'#f8fafc' }}>
                      {['#', 'IMEI', 'Swiped', 'Swipe Date', 'Activated', 'Activation Date'].map(h => (
                        <th key={h} style={{ padding:'8px 10px', textAlign:'left', fontSize:10, fontWeight:700, color:'#64748b', textTransform:'uppercase', borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} style={{ borderBottom:'1px solid #f1f5f9', background: i%2===0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding:'7px 10px', color:'#94a3b8' }}>{i+1}</td>
                        <td style={{ padding:'7px 10px', fontFamily:'monospace', fontWeight:600, color:'#0f172a' }}>{r.imei}</td>
                        <td style={{ padding:'7px 10px' }}>{r.swiped !== undefined ? (r.swiped ? <span style={{ color:'#16a34a', fontWeight:600 }}>✓ Yes</span> : <span style={{ color:'#dc2626' }}>✕ No</span>) : <span style={{ color:'#d1d5db' }}>—</span>}</td>
                        <td style={{ padding:'7px 10px', color:'#64748b' }}>{r.swipedAt ? new Date(r.swipedAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : <span style={{ color:'#d1d5db' }}>today</span>}</td>
                        <td style={{ padding:'7px 10px' }}>{r.activated !== undefined ? (r.activated ? <span style={{ color:'#7c3aed', fontWeight:600 }}>✓ Yes</span> : <span style={{ color:'#dc2626' }}>✕ No</span>) : <span style={{ color:'#d1d5db' }}>—</span>}</td>
                        <td style={{ padding:'7px 10px', color:'#64748b' }}>{r.activatedAt ? new Date(r.activatedAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : <span style={{ color:'#d1d5db' }}>today</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {err && <div style={{ marginTop:12, padding:'10px 14px', background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8, fontSize:12, color:'#dc2626' }}>⚠ {err}</div>}
            </div>
          )}

          {/* ── STEP 3: Results ── */}
          {step === 'result' && summary && (
            <div>
              {/* Summary cards */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12, marginBottom:20 }}>
                {[
                  { label:'Updated', val:summary.ok, bg:'#f0fdf4', color:'#16a34a', border:'#bbf7d0' },
                  { label:'Not In Stock', val:summary.not_found, bg:'#fffbeb', color:'#d97706', border:'#fde68a' },
                  { label:'Errors', val:summary.errors, bg:'#fef2f2', color:'#dc2626', border:'#fca5a5' },
                ].map(k => (
                  <div key={k.label} style={{ background:k.bg, border:`1.5px solid ${k.border}`, borderRadius:10, padding:'14px 12px', textAlign:'center' }}>
                    <div style={{ fontSize:28, fontWeight:800, color:k.color }}>{k.val}</div>
                    <div style={{ fontSize:11, fontWeight:600, color:k.color, opacity:.8 }}>{k.label}</div>
                  </div>
                ))}
              </div>
              {/* Per-IMEI results */}
              {results.filter(r => r.status !== 'ok').length > 0 && (
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:'#374151', marginBottom:8 }}>Issues to review:</div>
                  <div style={{ border:'1px solid #e2e8f0', borderRadius:10, overflow:'hidden', maxHeight:280, overflowY:'auto' }}>
                    {results.filter(r => r.status !== 'ok').map((r, i) => (
                      <div key={i} style={{ padding:'8px 12px', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', gap:10, fontSize:12 }}>
                        <span style={{ fontFamily:'monospace', color:'#374151', fontWeight:600 }}>{r.imei}</span>
                        <span style={{ color: r.status === 'not_found' ? '#d97706' : '#dc2626', background: r.status === 'not_found' ? '#fffbeb' : '#fef2f2', padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                          {r.status === 'not_found' ? '✕ Not in stock — cannot swipe/activate' : `Error: ${r.msg}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'14px 20px', borderTop:'1px solid #e2e8f0', display:'flex', gap:10, justifyContent:'flex-end' }}>
          {step === 'upload' && (
            <button onClick={onClose} style={{ height:36, padding:'0 18px', border:'1px solid #e2e8f0', borderRadius:8, background:'#fff', fontSize:13, color:'#64748b', cursor:'pointer', fontWeight:600 }}>Cancel</button>
          )}
          {step === 'preview' && (
            <>
              <button onClick={() => { setStep('upload'); setRows([]); }} style={{ height:36, padding:'0 18px', border:'1px solid #e2e8f0', borderRadius:8, background:'#fff', fontSize:13, color:'#64748b', cursor:'pointer', fontWeight:600 }}>Back</button>
              <button onClick={submit} disabled={busy} style={{
                height:36, padding:'0 24px', border:'none', borderRadius:8,
                background: busy ? '#94a3b8' : '#2563eb', color:'#fff',
                fontSize:13, fontWeight:700, cursor: busy ? 'not-allowed' : 'pointer',
                display:'flex', alignItems:'center', gap:8,
              }}>
                {busy ? <><div className="spinner" style={{ width:14, height:14 }} /> Uploading…</> : `✓ Update ${rows.length} IMEIs`}
              </button>
            </>
          )}
          {step === 'result' && (
            <button onClick={onClose} style={{ height:36, padding:'0 24px', border:'none', borderRadius:8, background:'#16a34a', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>Done</button>
          )}
        </div>
      </div>
    </div>
  );
}
export default ImeiBulkUpload;
