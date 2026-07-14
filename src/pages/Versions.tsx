import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

interface AuditEntry {
  id: string;
  action: 'CREATE'|'UPDATE'|'DELETE'|'RESTORE'|'LOGIN';
  entityName: string;
  entityId: string;
  oldValue: any;
  newValue: any;
  ipAddress: string | null;
  createdAt: string;
  userName: string;
  entity: { id: string; model: string; ean: string; isDeleted: boolean } | null;
}
interface Paged { items: AuditEntry[]; total: number; page: number; limit: number; totalPages: number; }

const S_LBL: Record<string,string> = { ACTIVE:'Active', INACTIVE:'Inactive', DISCONTINUED:'Discontinued', OPEN_BOX_ONLY:'Open Box', BLOCKED:'Blocked' };
const HIST_LABELS: Record<string,string> = {
  model:'Product Name', brand:'Brand', categoryId:'Category', status:'Status',
  costPrice:'Cost Price', sellingPrice:'MRP', ean:'EAN', minStock:'Min Stock',
  gstRate:'GST %', hsnCode:'HSN Code', vendorId:'Vendor', isDeleted:'Deleted state',
};
const fmt = (n: any) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
function histDisplay(key: string, val: any, ctx: any): string {
  if (val === null || val === undefined || val === '') return '—';
  if (key === 'costPrice' || key === 'sellingPrice') return fmt(val);
  if (key === 'status') return S_LBL[val] || String(val);
  if (key === 'categoryId') return ctx?.categoryName ?? (typeof val === 'string' && val.length > 12 ? '—' : String(val));
  if (key === 'isDeleted') return val ? 'Deleted' : 'Active';
  return String(val);
}
function formatLines(h: AuditEntry): string[] {
  const isBulkTxn = h.entityName === 'inventory_transactions' && (h.oldValue as any)?.bulk;
  if (isBulkTxn) {
    const products = (h.oldValue as any).products || {};
    return Object.entries(products).map(([m,q]) => `${m}: ${q} units`);
  }
  if (h.action === 'CREATE') {
    const nv = h.newValue || {};
    return [`Created — ${nv.model || h.entity?.model || 'product'}`];
  }
  if (h.action === 'DELETE') {
    const txnProduct = (h.oldValue as any)?.product;
    return [`Deleted — ${txnProduct || h.oldValue?.model || h.entity?.model || 'product'}`];
  }
  if (h.action === 'RESTORE') return ['Restored to a previous state'];
  const nv = h.newValue || {}; const ov = h.oldValue || {};
  if (nv.bulk) {
    const keys = Object.keys(nv).filter(k => k !== 'bulk' && k !== 'batchId' && k !== 'batchLabel');
    return keys.length ? [`Bulk update: ${keys.map(k => HIST_LABELS[k] || k).join(', ')}`] : ['Bulk update applied'];
  }
  const keys = Object.keys(nv).filter(k => !['categoryName','batchId','batchLabel'].includes(k));
  if (!keys.length) return ['Updated'];
  return keys.map(k => {
    const label = HIST_LABELS[k] || k;
    const before = histDisplay(k, ov[k], ov);
    const after = histDisplay(k, nv[k], nv);
    return before === after ? `${label} set to ${after}` : `${label}: ${before} → ${after}`;
  });
}

const ACTION_META: Record<string, { label: string; color: string; bg: string }> = {
  CREATE:  { label: 'Created',  color: 'var(--ok)',    bg: 'var(--ok-bg)' },
  UPDATE:  { label: 'Updated',  color: 'var(--brand)',  bg: '#eff6ff' },
  DELETE:  { label: 'Deleted',  color: 'var(--err)',    bg: 'var(--err-bg)' },
  RESTORE: { label: 'Restored', color: '#9333ea',       bg: '#f5f3ff' },
  LOGIN:   { label: 'Login',    color: 'var(--txt-3)',  bg: 'var(--surf-1)' },
};

// Format a date string into a readable day label for grouping
const dayLabel = (s: string) => {
  const d = new Date(s);
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate()-1);
  const day = new Date(d); day.setHours(0,0,0,0);
  if (day.getTime() === today.getTime()) return 'Today';
  if (day.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday:'long', day:'2-digit', month:'short', year:'numeric' });
};
const dayKey = (s: string) => new Date(s).toISOString().slice(0,10);
const fmtTime = (s: string) => new Date(s).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });

export function Versions() {
  const [data, setData] = useState<Paged | null>(null);
  const [page, setPage] = useState(1);
  const [actionF, setActionF] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [entityF, setEntityF] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const qp = new URLSearchParams({ page: String(page), limit: '50' });
      if (entityF) qp.set('entityName', entityF);
      if (actionF) qp.set('action', actionF);
      const d = await api<Paged>(`/audit?${qp.toString()}`);
      setData(d);
    } catch (e: any) { setError(e.message || 'Failed to load'); }
    finally { setLoading(false); }
  }, [page, actionF, entityF]);

  useEffect(() => { load(); }, [load]);

  const showToast = (text: string) => { setToast(text); setTimeout(() => setToast(''), 4000); };

  const restore = async (entry: AuditEntry) => {
    const isTransactionDelete = entry.action === 'DELETE' && entry.entityName === 'inventory_transactions';
    const isBulkTxn = isTransactionDelete && (entry.oldValue as any)?.bulk;
    const confirmMsg = isBulkTxn
      ? `Restore this entire supplier batch?\n\nSupplier: ${(entry.oldValue as any).vendor}\nTotal: ${(entry.oldValue as any).totalQty} units\n\nThis will recreate all transactions and restore stock levels.`
      : isTransactionDelete
      ? `Restore this deleted stock entry?\n\nProduct: ${(entry.oldValue as any)?.product ?? ''}\nQty: ${(entry.oldValue as any)?.quantity ?? ''}\n\nThis will recreate the transaction and restore the stock level.`
      : `Restore this change?\n\n${formatLines(entry).join('; ')}\n\nThis will revert the product to this earlier state.`;
    if (!window.confirm(confirmMsg)) return;
    setRestoringId(entry.id);
    try {
      if (isTransactionDelete) {
        await api(`/inventory/transactions/restore/${entry.id}`, { method: 'POST' });
        showToast('✓ Stock entry restored! Stock level corrected.');
      } else {
        await api(`/audit/${entry.id}/restore`, { method: 'POST' });
        showToast('✓ Restored successfully');
      }
      load();
    } catch (e: any) { showToast('Restore failed: ' + e.message); }
    finally { setRestoringId(null); }
  };

  const items = data?.items || [];

  // Group by date
  const grouped: { dateKey: string; label: string; entries: AuditEntry[] }[] = [];
  for (const h of items) {
    const dk = dayKey(h.createdAt);
    const last = grouped[grouped.length - 1];
    if (last && last.dateKey === dk) { last.entries.push(h); }
    else { grouped.push({ dateKey: dk, label: dayLabel(h.createdAt), entries: [h] }); }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Version History</div>
          <div className="page-subtitle">{data ? `${data.total.toLocaleString()} changes recorded` : 'Loading…'}</div>
        </div>
        <div className="page-actions">
          <select className="f-select" value={entityF} onChange={e => { setEntityF(e.target.value); setPage(1); }} style={{ width: 160 }}>
            <option value="">All entities</option>
            <option value="products">Products</option>
            <option value="inventory_transactions">Stock Movements</option>
            <option value="vendors">Suppliers</option>
          </select>
          <select className="f-select" value={actionF} onChange={e => { setActionF(e.target.value); setPage(1); }} style={{ width: 140 }}>
            <option value="">All actions</option>
            <option value="CREATE">Created</option>
            <option value="UPDATE">Updated</option>
            <option value="DELETE">Deleted</option>
            <option value="RESTORE">Restored</option>
          </select>
          <button className="btn btn-secondary" onClick={load} style={{ fontSize: 12, height: 32, padding: '0 12px' }}>🔄 Refresh</button>
        </div>
      </div>

      {error && <div className="alert alert-err">{error}<button onClick={load} style={{ marginLeft: 8, padding: '1px 8px', fontSize: 11, height: 'auto', background: 'none', color: 'var(--err)', border: '1px solid var(--err-bdr)', borderRadius: 4, cursor: 'pointer' }}>Retry</button></div>}

      <div className="grid-wrap" style={{ padding: 0 }}>
        {loading ? (
          <div className="empty" style={{ padding: '60px 24px' }}><div className="spinner" style={{ margin: '0 auto 14px' }} /><div className="empty-txt">Loading…</div></div>
        ) : items.length === 0 ? (
          <div className="empty"><div className="empty-ico">🕓</div><div className="empty-ttl">No changes recorded yet</div></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {grouped.map(({ dateKey, label, entries }) => (
              <div key={dateKey}>
                {/* Date separator */}
                <div style={{
                  padding: '8px 18px', fontSize: 11, fontWeight: 700, color: 'var(--txt-3)',
                  textTransform: 'uppercase', letterSpacing: '.08em',
                  background: 'var(--surf-1)', borderBottom: '1px solid var(--bdr-s)',
                  borderTop: '1px solid var(--bdr-s)', position: 'sticky', top: 0, zIndex: 2,
                }}>
                  {label}
                </div>
                {entries.map((h, i) => {
                  const meta = ACTION_META[h.action] || ACTION_META.UPDATE;
                  const isBulkTxn = h.entityName === 'inventory_transactions' && (h.oldValue as any)?.bulk;
                  const isTxnDelete = h.action === 'DELETE' && h.entityName === 'inventory_transactions';
                  const canRestore = isTxnDelete || (h.action !== 'CREATE' && h.action !== 'LOGIN' && h.entityName === 'products');
                  const lines = formatLines(h);

                  // Title: bulk txn deletions show supplier+summary; individual txns show product; products show model·ean
                  const title = isBulkTxn
                    ? `${(h.oldValue as any).vendor} — ${(h.oldValue as any).totalQty} units (${(h.oldValue as any).txnIds?.length ?? 1} transactions)`
                    : isTxnDelete
                    ? `Stock Entry — ${(h.oldValue as any)?.product ?? 'product'}`
                    : h.entity
                    ? `${h.entity.model} · ${h.entity.ean}`
                    : (h.oldValue?.model || h.newValue?.model || 'Product');

                  const batchLabel = h.newValue?.batchLabel;
                  return (
                    <div key={h.id} style={{
                      display: 'flex', gap: 12, padding: '12px 18px',
                      borderBottom: i < entries.length - 1 ? '1px solid var(--bdr-s)' : 'none',
                    }}>
                      <div style={{ flexShrink: 0, paddingTop: 2 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 'var(--r-full)',
                          background: meta.bg, color: meta.color, whiteSpace: 'nowrap',
                        }}>{meta.label}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{title}</span>
                          {batchLabel && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--txt-3)', background: 'var(--surf-1)', padding: '1px 7px', borderRadius: 'var(--r-full)' }}>{batchLabel}</span>}
                          {isBulkTxn && <span style={{ fontSize: 10, fontWeight: 600, color: '#7c3aed', background: '#f5f3ff', padding: '1px 7px', borderRadius: 'var(--r-full)' }}>Bulk Entry</span>}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 1 }}>
                          {fmtTime(h.createdAt)} · {h.userName}
                          {h.entityName === 'inventory_transactions' && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--txt-3)' }}>· Stock Movement</span>}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--txt-2)', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {lines.slice(0, 5).map((line, li) => <div key={li}>{line}</div>)}
                          {lines.length > 5 && <div style={{ color: 'var(--txt-3)', fontSize: 11 }}>+{lines.length - 5} more products…</div>}
                        </div>
                      </div>
                      {canRestore && (
                        <div style={{ flexShrink: 0 }}>
                          <button
                            disabled={restoringId === h.id}
                            onClick={() => restore(h)}
                            style={{
                              height: 28, padding: '0 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                              borderRadius: 'var(--r-md)', border: '1px solid var(--bdr)', background: 'var(--surf-0)', color: 'var(--brand)',
                            }}>
                            {restoringId === h.id ? 'Restoring…' : '↺ Restore'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {data && data.totalPages > 1 && (
        <div className="pg-btns" style={{ justifyContent: 'center', marginTop: 14 }}>
          <button className="pg-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>←</button>
          <span className="pg-info" style={{ margin: '0 8px' }}>Page {page} of {data.totalPages}</span>
          <button className="pg-btn" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}>→</button>
        </div>
      )}

      {toast && <div className="toasts"><div className="toast">{toast}</div></div>}
    </>
  );
}
export default Versions;
