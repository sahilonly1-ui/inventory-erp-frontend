import { useState, useCallback } from 'react';
import { api } from '../api/client';
import { useIsPhone, M, MCard, MPill, MEmpty, mInput } from '../mobile/ui';

interface Movement {
  id: string;
  date: string;
  type: string;
  quantity: number;
  balanceAfter: number;
  counterparty: string | null;
  invoiceNo: string | null;
  warehouse: string | null;
  user: string | null;
  remarks: string | null;
  codes: string[];
  untracked: boolean;
  // How the codes were found: linked to the transaction, matched by time for
  // older entries, or read out of the remarks text where they were the only
  // record. Worth showing, because confidence differs.
  codeSource: 'linked' | 'matched' | 'remarks' | 'none';
}

interface History {
  product: { id: string; ean: string; model: string; brand: string };
  duplicateProducts: { id: string; model: string }[] | null;
  currentStock: number;
  byWarehouse: { warehouse: string; quantity: number }[];
  trackedUnits: number;
  totalIn: number;
  totalOut: number;
  movements: Movement[];
}

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fmtTime = (s: string) =>
  new Date(s).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

export default function ProductHistory() {
  const isPhone = useIsPhone();
  const [q, setQ] = useState('');
  const [data, setData] = useState<History | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [suggestions, setSuggestions] = useState<{ id: string; ean: string; model: string }[]>([]);

  const search = useCallback(async (term: string, productId?: string) => {
    const t = term.trim();
    if (!t && !productId) return;
    setLoading(true); setErr(''); setSuggestions([]);
    try {
      const qs = productId ? `productId=${encodeURIComponent(productId)}` : `ean=${encodeURIComponent(t)}`;
      const d = await api<History>(`/inventory/product-history?${qs}`);
      setData(d);
    } catch (e: any) {
      // Not an EAN — offer matching products by name so a model can be used too.
      setData(null);
      try {
        const res = await api<any>(`/products?search=${encodeURIComponent(t)}&limit=8`);
        const items = res?.items ?? res ?? [];
        if (items.length) { setSuggestions(items.map((p: any) => ({ id: p.id, ean: p.ean, model: p.model }))); setErr(''); }
        else setErr(`No product found for "${t}"`);
      } catch { setErr(e.message || 'Lookup failed'); }
    } finally { setLoading(false); }
  }, []);

  return (
    <div style={{ padding: isPhone ? 12 : '20px 24px 60px', maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>Product History</h1>
      <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 18px' }}>
        Every stock movement for one product, newest first, with the running balance after each one.
        Works for accessories and quantity-only entries too, not just units with an IMEI or serial.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') search(q); }}
          placeholder="Scan or type an EAN, or search by model name"
          style={{ ...mInput, flex: '1 1 260px', fontFamily: 'monospace' }}
          autoFocus
        />
        <button onClick={() => search(q)} disabled={loading}
          style={{ height: 46, padding: '0 20px', borderRadius: 10, border: 'none', background: '#2563eb', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          {loading ? 'Searching…' : 'Show history'}
        </button>
      </div>

      {err && (
        <div style={{ padding: 14, borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
          {err}
        </div>
      )}

      {suggestions.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>Did you mean:</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {suggestions.map(sug => (
              <button key={sug.id} onClick={() => { setQ(sug.ean); search(sug.ean, sug.id); }}
                style={{ textAlign: 'left', padding: '11px 14px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{sug.model}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace' }}>{sug.ean}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {data && (
        <>
          {/* Summary */}
          <MCard style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>{data.product.model}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace', marginTop: 3 }}>
              {data.product.brand} · {data.product.ean}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isPhone ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 10, marginTop: 14 }}>
              <Stat label="In stock now" value={data.currentStock} tone="#0f172a" />
              <Stat label="With IMEI / serial" value={data.trackedUnits} tone="#2563eb" />
              <Stat label="Total received" value={data.totalIn} tone="#16a34a" />
              <Stat label="Total dispatched" value={data.totalOut} tone="#dc2626" />
            </div>
            {data.duplicateProducts && (
              <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 12, color: '#b91c1c', lineHeight: 1.55 }}>
                <b>This barcode exists on {data.duplicateProducts.length} separate products.</b> Stock and history are
                split across them, which is why other screens can show different numbers. The totals here cover all of them:
                <div style={{ marginTop: 6 }}>
                  {data.duplicateProducts.map(p => <div key={p.id}>· {p.model}</div>)}
                </div>
                Merge or correct the duplicates in Product Master to stop the split.
              </div>
            )}
            {data.trackedUnits < data.currentStock && (
              <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a', fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
                {data.currentStock - data.trackedUnits} unit{data.currentStock - data.trackedUnits !== 1 ? 's have' : ' has'} no IMEI or serial recorded —
                received as a plain quantity. Look for the movements marked “no unit codes” below.
              </div>
            )}
          </MCard>

          {/* Movements */}
          {data.movements.length === 0 ? (
            <MEmpty icon="📭" title="No movements recorded for this product" />
          ) : isPhone ? (
            <div style={{ display: 'grid', gap: M.gap }}>
              {data.movements.map(m => <MovementCard key={m.id} m={m} />)}
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Date', 'Movement', 'Qty', 'Balance', 'Party', 'Invoice', 'By', 'Units'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.movements.map(m => (
                    <MovementRow key={m.id} m={m} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** One movement, expandable to reveal the units scanned in it. */
function MovementRow({ m }: { m: Movement }) {
  const [open, setOpen] = useState(false);
  const inbound = m.quantity > 0;
  const hasCodes = m.codes.length > 0;

  const td: React.CSSProperties = { padding: '11px 14px' };

  return (
    <>
      <tr
        onClick={() => hasCodes && setOpen(o => !o)}
        style={{
          borderBottom: open ? 'none' : '1px solid #f1f5f9',
          cursor: hasCodes ? 'pointer' : 'default',
          background: open ? '#f8fafc' : undefined,
        }}
      >
        <td style={{ ...td, whiteSpace: 'nowrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            {hasCodes && (
              <span style={{ color: '#94a3b8', fontSize: 11, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }}>▶</span>
            )}
            <div>
              <div style={{ fontWeight: 600, color: '#0f172a' }}>{fmtDate(m.date)}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{fmtTime(m.date)}</div>
            </div>
          </div>
        </td>
        <td style={td}><MPill tone={inbound ? 'good' : 'bad'}>{m.type.replace(/_/g, ' ')}</MPill></td>
        <td style={{ ...td, fontWeight: 800, color: inbound ? '#16a34a' : '#dc2626', whiteSpace: 'nowrap' }}>
          {inbound ? '+' : ''}{m.quantity}
        </td>
        <td style={{ ...td, fontWeight: 700, color: '#0f172a' }}>{m.balanceAfter}</td>
        <td style={{ ...td, color: '#475569' }}>{m.counterparty ?? '—'}</td>
        <td style={{ ...td, color: m.invoiceNo ? '#2563eb' : '#cbd5e1', fontWeight: m.invoiceNo ? 600 : 400 }}>
          {m.invoiceNo ?? '—'}
        </td>
        <td style={{ ...td, color: '#64748b', fontSize: 12 }}>{m.user ?? '—'}</td>
        <td style={td}>
          {hasCodes
            ? <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {m.codes.length} unit{m.codes.length !== 1 ? 's' : ''} · {open ? 'hide' : 'view'}
              </span>
            : <span style={{ fontSize: 11, color: '#b45309', background: '#fffbeb', padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>no unit codes</span>}
        </td>
      </tr>

      {open && (
        <tr style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <td colSpan={8} style={{ padding: '4px 14px 14px 34px' }}>
            <SourceNote source={m.codeSource} />
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
              gap: 6, marginTop: 8,
            }}>
              {m.codes.map((c, i) => (
                <div key={c} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: '#fff', border: '1px solid #e2e8f0',
                  borderRadius: 8, padding: '7px 10px',
                }}>
                  <span style={{ fontSize: 11, color: '#cbd5e1', minWidth: 16 }}>{i + 1}</span>
                  <span style={{ fontSize: 12.5, fontFamily: 'monospace', color: '#0f172a' }}>{c}</span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Says where the codes came from. A linked unit is certain; a time match or a
 * remarks string is a best effort on older data, and the operator should know
 * the difference before acting on it.
 */
function SourceNote({ source }: { source: Movement['codeSource'] }) {
  if (source === 'linked') return null;
  const text = source === 'matched'
    ? 'Matched by time — this entry predates per-unit linking, so these are the units received around then.'
    : 'Read from the entry notes — these serials were never stored as individual units.';
  return (
    <div style={{ fontSize: 11.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '7px 10px' }}>
      {text}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: tone, lineHeight: 1.15 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function CodeList({ codes }: { codes: string[] }) {
  const [open, setOpen] = useState(false);
  const shown = open ? codes : codes.slice(0, 2);
  return (
    <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#475569' }}>
      {shown.map(c => <div key={c}>{c}</div>)}
      {codes.length > 2 && (
        <button onClick={() => setOpen(o => !o)}
          style={{ border: 'none', background: 'none', padding: 0, color: '#2563eb', fontSize: 11, cursor: 'pointer' }}>
          {open ? 'show less' : `+${codes.length - 2} more`}
        </button>
      )}
    </div>
  );
}

function MovementCard({ m }: { m: Movement }) {
  const [open, setOpen] = useState(false);
  const inbound = m.quantity > 0;
  const hasCodes = m.codes.length > 0;
  return (
    <MCard tone={inbound ? 'good' : 'bad'} onClick={hasCodes ? () => setOpen(o => !o) : undefined}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{fmtDate(m.date)}</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>{fmtTime(m.date)} · {m.type.replace(/_/g, ' ')}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: inbound ? '#16a34a' : '#dc2626' }}>
            {inbound ? '+' : ''}{m.quantity}
          </div>
          <div style={{ fontSize: 11, color: '#64748b' }}>balance {m.balanceAfter}</div>
        </div>
      </div>
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #e6e9ef', fontSize: 12, color: '#475569', display: 'grid', gap: 4 }}>
        {m.counterparty && <div>Party: {m.counterparty}</div>}
        {m.invoiceNo && <div>Invoice: {m.invoiceNo}</div>}
        {m.user && <div>By: {m.user}</div>}
        {!hasCodes && <div style={{ color: '#b45309' }}>No unit codes recorded</div>}
        {hasCodes && !open && (
          <div style={{ color: '#2563eb', fontWeight: 600 }}>
            {m.codes.length} unit{m.codes.length !== 1 ? 's' : ''} · tap to view
          </div>
        )}
        {hasCodes && open && (
          <div style={{ display: 'grid', gap: 5, marginTop: 2 }}>
            <SourceNote source={m.codeSource} />
            {m.codes.map((c, i) => (
              <div key={c} style={{ display: 'flex', gap: 8, background: '#fff', border: '1px solid #e6e9ef', borderRadius: 8, padding: '7px 10px' }}>
                <span style={{ fontSize: 11, color: '#cbd5e1' }}>{i + 1}</span>
                <span style={{ fontSize: 12.5, fontFamily: 'monospace', color: '#0f172a' }}>{c}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </MCard>
  );
}
