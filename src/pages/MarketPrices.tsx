import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useIsPhone, M, MCard, MPill, MEmpty, mInput } from '../mobile/ui';

// ── Types (mirror /price-watch/items) ──────────────────────────────────────
type StoreKey = 'amazon' | 'flipkart' | 'reliance' | 'croma' | 'official';
const STORES: { key: StoreKey; label: string; color: string }[] = [
  { key: 'amazon', label: 'Amazon', color: '#ff9900' },
  { key: 'flipkart', label: 'Flipkart', color: '#2874f0' },
  { key: 'reliance', label: 'Reliance Digital', color: '#e42529' },
  { key: 'croma', label: 'Croma', color: '#12a29b' },
  { key: 'official', label: 'Brand site', color: '#475569' },
];
interface Offer { bank: string | null; cardType: string | null; offerType: string; mode: string | null; amount: number | null; percent: number | null; maxDiscount: number | null; minTxn: number | null; summary: string; evidence: string; value: number }
interface Snap { status: 'ok' | 'suspect' | 'unverified' | 'not_found' | 'blocked' | 'error'; price: number | null; mrp: number | null; inStock: boolean | null; title: string | null; offers: Offer[]; effectivePrice: number | null; bestOffer: string | null; priceText: string | null; notes: string | null; method: string | null; url: string; fetchedAt: string }
interface Link { url: string | null; lockedByUser: boolean; notListed: boolean; discoveredAt: string | null }
interface StoreState { link: Link | null; latest: Snap | null; lastGood: Snap | null }
interface Item { id: string; productId: string | null; name: string; brand: string | null; variant: string | null; source: 'auto' | 'manual'; active: boolean; priority: boolean; lastRefreshedAt: string | null; ean: string | null; ourPrice: number | null; category: string | null; stock: number; requested: boolean; stores: Record<StoreKey, StoreState> }
interface Status { lastAgentRun: string | null; requested: number; instantRun?: boolean }
interface RunStatus { configured: boolean; error?: string; run?: { number: number; status: string; conclusion: string | null; startedAt: string; updatedAt: string; url: string } | null }
interface Settings { autoSyncInStock: boolean; autoSyncCategories: string[]; autoSyncBrands: string[]; includeOutOfStock: boolean; options?: { brands: string[]; categories: string[] }; defaultIntervalMins: number; priorityIntervalMins: number; stores: StoreKey[]; batchSize: number }

// ── Helpers ─────────────────────────────────────────────────────────────────
const inr = (n: number | null | undefined) => (n == null ? '—' : '₹' + Math.round(n).toLocaleString('en-IN'));
function ago(s: string | null | undefined): string {
  if (!s) return 'never';
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}
const fmtStamp = (s: string) => new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** What a store cell should show: the latest result if usable, else the last good one. */
function view(st: StoreState | undefined) {
  if (!st) return { kind: 'none' as const };
  const l = st.latest;
  if (l && (l.status === 'ok' || l.status === 'suspect')) return { kind: 'price' as const, snap: l, stale: false };
  if (st.lastGood) return { kind: 'price' as const, snap: st.lastGood, stale: true, latest: l };
  if (st.link?.notListed) return { kind: 'notListed' as const };
  if (l) return { kind: 'failed' as const, snap: l };
  return { kind: 'none' as const };
}
const trusted = (v: ReturnType<typeof view>) => v.kind === 'price' && v.snap.status === 'ok';

function lowest(it: Item) {
  let best: { store: StoreKey; price: number; eff: number } | null = null;
  for (const s of STORES) {
    const v = view(it.stores[s.key]);
    if (!trusted(v) || v.kind !== 'price' || v.snap.price == null) continue;
    const eff = v.snap.effectivePrice ?? v.snap.price;
    if (!best || eff < best.eff) best = { store: s.key, price: v.snap.price, eff };
  }
  return best;
}

const btn = (primary = false): React.CSSProperties => ({
  height: 38, padding: '0 14px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  border: primary ? 'none' : `1px solid ${M.color.line}`, background: primary ? M.color.brand : '#fff', color: primary ? '#fff' : M.color.ink,
});

// ── Page ────────────────────────────────────────────────────────────────────
export default function MarketPrices() {
  const { user } = useAuth();
  const isAdmin = (user?.permissions ?? []).includes('*');
  const isPhone = useIsPhone();
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'stock' | 'starred' | 'custom' | 'paused'>('all');
  const [cat, setCat] = useState('');
  const [brand, setBrand] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [run, setRun] = useState<RunStatus | null>(null);
  const running = !!run?.run && run.run.status !== 'completed';
  const busy = (status?.requested ?? 0) + (running ? 1 : 0);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [d, r] = await Promise.all([
        api<{ items: Item[]; status: Status }>('/price-watch/items'),
        api<RunStatus>('/price-watch/run-status').catch(() => null),
      ]);
      setItems(d.items); setStatus(d.status); setRun(r); setErr('');
    } catch (e: any) { if (!silent) setErr(e?.message || 'Could not load'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  // The agent saves in another tab — poll so results appear here as they land.
  const busyRef = useRef(busy); busyRef.current = busy;
  useEffect(() => {
    if (!isAdmin) return;
    let t: ReturnType<typeof setTimeout>;
    const loop = () => { t = setTimeout(async () => { await load(true); loop(); }, busyRef.current ? 8000 : 60000); };
    loop();
    return () => clearTimeout(t);
  }, [isAdmin, load]);

  const act = async (path: string, init: RequestInit = { method: 'POST', body: '{}' }) => {
    try { await api(path, init); await load(true); } catch (e: any) { alert(e?.message || 'Failed'); }
  };

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items.filter(i => {
      if (filter === 'paused' ? i.active : !i.active) return false;
      if (filter === 'stock' && i.stock <= 0) return false;
      if (filter === 'starred' && !i.priority) return false;
      if (filter === 'custom' && i.productId) return false;
      if (cat && (i.category ?? 'Not stocked') !== cat) return false;
      if (brand && (i.brand ?? '').toLowerCase() !== brand.toLowerCase()) return false;
      return !t || `${i.name} ${i.brand ?? ''} ${i.ean ?? ''} ${i.category ?? ''}`.toLowerCase().includes(t);
    });
  }, [items, q, filter, cat, brand]);

  // Dropdown options come from what is actually being watched.
  const catOptions = useMemo(() => [...new Set(items.map(i => i.category ?? 'Not stocked'))].sort(), [items]);
  const brandOptions = useMemo(() => {
    const m = new Map<string, string>();
    items.forEach(i => { if (i.brand) m.set(i.brand.toLowerCase(), i.brand); });
    return [...m.values()].sort((a, b) => a.localeCompare(b));
  }, [items]);
  const checkable = shown.filter(i => i.active);

  const [notice, setNotice] = useState('');
  /** Refresh prices for exactly the products on screen (or one product). */
  const refresh = async (ids: string[], replace: boolean) => {
    if (!ids.length) return;
    try {
      const r = await api<{ queued: number; dispatched: boolean }>('/price-watch/agent/request', { method: 'POST', body: JSON.stringify({ ids, replace }) });
      const mins = Math.max(2, Math.ceil(r.queued / 12) + 2);
      setNotice(r.dispatched
        ? `Refreshing ${r.queued} product(s) — prices update here in about ${mins} minute(s). You can keep working.`
        : `${r.queued} product(s) queued for the next automatic run. To refresh instantly from here, the GitHub token still needs to be added on Render (GITHUB_DISPATCH_TOKEN).`);
      await load(true);
    } catch (e: any) { alert(e?.message || 'Could not start the refresh'); }
  };
  const runCheck = () => refresh(checkable.map(i => i.id), true);


  if (!isAdmin) return <MEmpty icon="🔒" title="Admins only" hint="Market prices are visible to administrators only." />;

  return (
    <div style={{ padding: isPhone ? 12 : '20px 24px', maxWidth: 1500, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ flex: '1 1 260px' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: M.color.ink }}>Market Prices</div>
          <div style={{ fontSize: 13, color: M.color.muted, marginTop: 2 }}>
            Live prices & bank offers on Amazon, Flipkart, Reliance Digital, Croma and brand sites
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {running && <MPill tone="brand">⟳ Scraper running…</MPill>}
          <button style={btn()} disabled={!checkable.length} title="Check prices for the products currently shown"
            onClick={runCheck}>⟳ Refresh prices{checkable.length ? ` (${checkable.length})` : ''}</button>
          <button style={btn()} onClick={() => setShowSettings(true)}>⚙ Settings</button>
          <button style={btn(true)} onClick={() => setShowAdd(true)}>+ Add product</button>
        </div>
      </div>

      {status && (
        <div style={{ fontSize: 12.5, color: M.color.muted, marginBottom: 12 }}>
          {status.lastAgentRun
            ? <>Last price update: <b>{ago(status.lastAgentRun)}</b> ({fmtStamp(status.lastAgentRun)}) · automatic 5× a day</>
            : <>No prices collected yet — the scraper runs automatically 5× a day, or press “Refresh prices”.</>}
          {run?.run && <> · Scraper run #{run.run.number}: <b style={{ color: running ? M.color.brand : run.run.conclusion === 'success' ? M.color.good : M.color.bad }}>
            {running ? `running (started ${ago(run.run.startedAt)})` : run.run.conclusion === 'success' ? `finished ${ago(run.run.updatedAt)}` : `${run.run.conclusion || run.run.status} ${ago(run.run.updatedAt)}`}</b>
            {' '}<a href={run.run.url} target="_blank" rel="noreferrer" style={{ color: M.color.brand }}>details ↗</a></>}
          {run && !run.configured && <> · <span style={{ color: M.color.warn }}>instant refresh not set up</span></>}
        </div>
      )}
      {notice && <div style={{ padding: '10px 14px', borderRadius: 10, background: M.color.brandBg, border: '1px solid #bfdbfe', color: '#1e40af', fontSize: 13, marginBottom: 12, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ flex: 1 }}>{notice}</span>
        <button onClick={() => setNotice('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1e40af', fontSize: 16 }}>×</button>
      </div>}
      {err && <Banner tone="bad">{err}</Banner>}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search product, brand, EAN…" style={{ ...mInput, flex: '1 1 240px', height: 40 }} />
        <select value={cat} onChange={e => setCat(e.target.value)} style={{ ...mInput, height: 40, flex: '0 1 190px' }}>
          <option value="">All categories</option>
          {catOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={brand} onChange={e => setBrand(e.target.value)} style={{ ...mInput, height: 40, flex: '0 1 170px' }}>
          <option value="">All brands</option>
          {brandOptions.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        {([['all', 'All'], ['stock', 'In stock'], ['starred', '★ Starred'], ['custom', 'Not stocked'], ['paused', 'Paused']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)}
            style={{ ...btn(), height: 40, background: filter === k ? M.color.ink : '#fff', color: filter === k ? '#fff' : M.color.ink }}>{l}</button>
        ))}
      </div>

      {!loading && items.length > 0 && (
        <div style={{ fontSize: 12.5, color: M.color.muted, margin: '-4px 0 10px' }}>
          Showing {shown.length} of {items.length} products
          {(cat || brand || q || filter !== 'all') && <button onClick={() => { setCat(''); setBrand(''); setQ(''); setFilter('all'); }}
            style={{ marginLeft: 8, background: 'none', border: 'none', color: M.color.brand, cursor: 'pointer', fontWeight: 600 }}>Clear filters</button>}
          {checkable.length > 0 && <> · “Refresh prices” refreshes these {checkable.length}</>}
        </div>
      )}

      {loading ? <MEmpty icon="⏳" title="Loading…" /> : !shown.length ? (
        <MEmpty icon="🏷️" title={items.length ? 'Nothing matches' : 'No products being watched yet'}
          hint={items.length ? undefined : 'In-stock products are added automatically within the hour — or add one now.'} />
      ) : isPhone ? (
        <div style={{ display: 'grid', gap: M.gap }}>
          {shown.map(it => <ItemCard key={it.id} it={it} open={open === it.id} onToggle={() => setOpen(open === it.id ? null : it.id)} act={act} />)}
        </div>
      ) : (
        <div style={{ background: '#fff', border: `1px solid ${M.color.line}`, borderRadius: 12, overflow: 'auto', maxHeight: 'calc(100vh - 210px)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1100 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Product', 'MRP (ERP)', ...STORES.map(s => s.label), 'Best deal', ''].map(h => (
                  <th key={h} style={{ position: 'sticky', top: 0, zIndex: 2, background: '#f8fafc', boxShadow: `inset 0 -1px 0 ${M.color.line}`, padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: M.color.muted, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: `1px solid ${M.color.line}`, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map(it => <ItemRow key={it.id} it={it} open={open === it.id} onToggle={() => setOpen(open === it.id ? null : it.id)} act={act} />)}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ fontSize: 11.5, color: M.color.faint, marginTop: 12, lineHeight: 1.6 }}>
        Prices are read from the live store pages by the price scraper, then sanity-checked before they are shown. <b style={{ color: M.color.good }}>Green</b> = cheapest verified.
        <span style={{ color: M.color.warn }}> ⚠</span> = check it (possible wrong variant or unusual price). Effective price = price minus the best instant bank discount/cashback.
        Offers can depend on card type, EMI tenure and cart value — confirm on the store before quoting a customer.
      </div>

      {showAdd && <AddDialog onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); load(true); }} />}
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} onSaved={() => { setShowSettings(false); load(true); }} />}
    </div>
  );
}

function Banner({ tone, children }: { tone: 'warn' | 'bad'; children: React.ReactNode }) {
  const c = tone === 'bad' ? { bg: M.color.badBg, bd: '#fecaca', fg: M.color.bad } : { bg: M.color.warnBg, bd: '#fde68a', fg: '#92400e' };
  return <div style={{ padding: '10px 14px', borderRadius: 10, background: c.bg, border: `1px solid ${c.bd}`, color: c.fg, fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>{children}</div>;
}

// ── Cells ──────────────────────────────────────────────────────────────────
function PriceCell({ st, cheapest, running }: { st: StoreState; cheapest: boolean; running: boolean }) {
  const v = view(st);
  if (v.kind === 'none') return <span style={{ color: M.color.faint, fontSize: 12 }}>{running ? 'Queued' : '—'}</span>;
  if (v.kind === 'notListed') return <span style={{ color: M.color.faint, fontSize: 12 }}>Not listed</span>;
  if (v.kind === 'failed') return <span style={{ color: M.color.warn, fontSize: 12 }} title={v.snap.notes ?? ''}>{v.snap.status === 'blocked' ? 'Blocked' : v.snap.status === 'not_found' ? 'No price' : v.snap.status === 'unverified' ? 'Unverified' : 'Error'}</span>;
  const s = v.snap;
  const warn = s.status === 'suspect' || v.stale;
  return (
    <div style={{ lineHeight: 1.35, opacity: v.stale ? 0.7 : 1 }} title={[s.notes, v.stale ? `Latest attempt: ${v.latest?.status} — showing result from ${ago(s.fetchedAt)}` : ''].filter(Boolean).join('\n')}>
      <div style={{ fontWeight: 800, fontSize: 14.5, color: cheapest ? M.color.good : M.color.ink }}>
        {inr(s.price)}{warn && <span style={{ color: M.color.warn, fontSize: 12 }}> ⚠</span>}
        {s.inStock === false && <span style={{ fontSize: 10.5, color: M.color.bad, fontWeight: 700 }}> OOS</span>}
      </div>
      {s.mrp && s.mrp > (s.price ?? 0) && <div style={{ fontSize: 11, color: M.color.faint, textDecoration: 'line-through' }}>{inr(s.mrp)}</div>}
      {s.effectivePrice != null && (
        <div style={{ fontSize: 11.5, color: M.color.good, fontWeight: 700 }}>{inr(s.effectivePrice)} <span style={{ fontWeight: 500, color: M.color.muted }}>w/ {s.bestOffer?.split(' · ')[0]}</span></div>
      )}
      <div style={{ fontSize: 10.5, color: M.color.faint }}>{s.offers.length ? `${s.offers.length} offer${s.offers.length > 1 ? 's' : ''} · ` : ''}{ago(s.fetchedAt)}</div>
    </div>
  );
}

type Act = (path: string, init?: RequestInit) => Promise<void>;

function ItemTitle({ it }: { it: Item }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontWeight: 700, color: M.color.ink, display: 'flex', gap: 6, alignItems: 'center' }}>
        {it.priority && <span style={{ color: '#f59e0b' }}>★</span>}
        <span>{it.name}</span>
        {it.requested && <span title="Waiting for the next agent run" style={{ fontSize: 11, color: M.color.brand }}>⏳</span>}
      </div>
      <div style={{ fontSize: 11.5, color: M.color.faint, marginTop: 2 }}>
        {[it.brand, it.variant, it.category].filter(Boolean).join(' · ')}
        {!it.productId && <span style={{ color: '#7c3aed', fontWeight: 600 }}> · not stocked</span>}
      </div>
    </div>
  );
}

function RowRefresh({ it, act }: { it: Item; act: Act }) {
  return (
    <button title={it.requested ? 'Refreshing — prices update in a minute or two' : 'Refresh this product on all sites now'}
      disabled={it.requested}
      style={{ ...btn(), height: 32, padding: '0 10px', opacity: it.requested ? 0.6 : 1 }}
      onClick={() => checkNow(it.id, act)}>{it.requested ? '⏳' : '⟳'}</button>
  );
}

function ItemRow({ it, open, onToggle, act }: { it: Item; open: boolean; onToggle: () => void; act: Act }) {
  const low = lowest(it);
  const td: React.CSSProperties = { padding: '11px 12px', verticalAlign: 'top', borderBottom: open ? 'none' : '1px solid #f1f5f9' };
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: 'pointer', background: open ? '#f8fafc' : undefined }}>
        <td style={{ ...td, maxWidth: 280 }}><ItemTitle it={it} /></td>
        <td style={{ ...td, whiteSpace: 'nowrap' }}>
          <div style={{ fontWeight: 700 }} title="MRP from Product Master">{it.ourPrice ? inr(it.ourPrice) : '—'}</div>
          {it.productId && <div style={{ fontSize: 11, color: it.stock > 0 ? M.color.good : M.color.faint }}>Stock {it.stock}</div>}
        </td>
        {STORES.map(s => <td key={s.key} style={{ ...td, whiteSpace: 'nowrap' }}><PriceCell st={it.stores[s.key]} cheapest={low?.store === s.key} running={it.requested} /></td>)}
        <td style={{ ...td, whiteSpace: 'nowrap' }}>
          {low ? (
            <>
              <div style={{ fontWeight: 800, color: M.color.good }}>{inr(low.eff)}</div>
              <div style={{ fontSize: 11, color: M.color.muted }}>{STORES.find(s => s.key === low.store)?.label}</div>
              {it.ourPrice ? <Diff ours={it.ourPrice} market={low.eff} /> : null}
            </>
          ) : <span style={{ color: M.color.faint }}>—</span>}
        </td>
        <td style={{ ...td, whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
          <RowRefresh it={it} act={act} />
        </td>
      </tr>
      {open && (
        <tr><td colSpan={STORES.length + 4} style={{ padding: '4px 12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}><Detail it={it} act={act} /></td></tr>
      )}
    </>
  );
}

function Diff({ ours, market }: { ours: number; market: number }) {
  // "ours" is the MRP from Product Master, so show how far below MRP the market sells.
  const pct = Math.round(((ours - market) / ours) * 100);
  if (Math.abs(pct) < 1) return <div style={{ fontSize: 11, color: M.color.muted }}>at MRP</div>;
  return <div style={{ fontSize: 11, fontWeight: 700, color: pct > 0 ? M.color.good : M.color.bad }}>
    {pct > 0 ? `${pct}% below MRP` : `${-pct}% above MRP`}
  </div>;
}

function ItemCard({ it, open, onToggle, act }: { it: Item; open: boolean; onToggle: () => void; act: Act }) {
  const low = lowest(it);
  return (
    <MCard>
      <div onClick={onToggle} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <ItemTitle it={it} />
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: M.color.faint }}>Best</div>
            <div style={{ fontWeight: 800, color: M.color.good }}>{low ? inr(low.eff) : '—'}</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
          {STORES.map(s => (
            <div key={s.key} style={{ padding: 8, borderRadius: 9, border: `1px solid ${M.color.line}` }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: s.color, marginBottom: 2 }}>{s.label}</div>
              <PriceCell st={it.stores[s.key]} cheapest={low?.store === s.key} running={it.requested} />
            </div>
          ))}
          <div style={{ padding: 8, borderRadius: 9, background: '#f8fafc' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: M.color.muted }}>MRP (ERP)</div>
            <div style={{ fontWeight: 800 }}>{it.ourPrice ? inr(it.ourPrice) : '—'}</div>
            {it.ourPrice && low ? <Diff ours={it.ourPrice} market={low.eff} /> : null}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}><RowRefresh it={it} act={act} /></div>
      {open && <div style={{ marginTop: 12 }}><Detail it={it} act={act} /></div>}
    </MCard>
  );
}

// ── Expanded detail: per-store offers, links, controls ─────────────────────
function Detail({ it, act }: { it: Item; act: Act }) {
  const isPhone = useIsPhone();
  const [variant, setVariant] = useState(it.variant ?? '');
  const patch = (b: object) => act(`/price-watch/items/${it.id}`, { method: 'PATCH', body: JSON.stringify(b) });
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '8px 0 12px' }}>
        <button style={btn()} onClick={() => patch({ priority: !it.priority })}>{it.priority ? '☆ Unstar' : '★ Star (checked first)'}</button>
        <button style={btn()} onClick={() => checkNow(it.id, act)} disabled={it.requested}>{it.requested ? '⏳ Refreshing…' : '⟳ Refresh now'}</button>
        <button style={btn()} onClick={() => act(`/price-watch/items/${it.id}/request`, { method: 'POST', body: JSON.stringify({ rediscover: true }) })}>🔎 Re-find pages</button>
        <button style={btn()} onClick={() => patch({ active: !it.active })}>{it.active ? '⏸ Pause' : '▶ Resume'}</button>
        <button style={{ ...btn(), color: M.color.bad }} onClick={() => { if (confirm('Stop watching this product?')) act(`/price-watch/items/${it.id}`, { method: 'DELETE' }); }}>Remove</button>
        <div style={{ display: 'flex', gap: 6, flex: '1 1 260px' }}>
          <input value={variant} onChange={e => setVariant(e.target.value)} placeholder="Variant (e.g. Black, 8GB/256GB)" style={{ ...mInput, height: 38, flex: 1 }} />
          {variant !== (it.variant ?? '') && <button style={btn(true)} onClick={() => patch({ variant })}>Save</button>}
        </div>
        <span style={{ fontSize: 11.5, color: M.color.faint }}>Updated {ago(it.lastRefreshedAt)}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
        {STORES.map(s => <StoreDetail key={s.key} itemId={it.id} store={s} st={it.stores[s.key]} act={act} />)}
      </div>
    </div>
  );
}

function StoreDetail({ itemId, store, st, act }: { itemId: string; store: typeof STORES[number]; st: StoreState; act: Act }) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(st.link?.url ?? '');
  const v = view(st);
  const snap = v.kind === 'price' ? v.snap : v.kind === 'failed' ? v.snap : null;
  const save = (body: object) => { setEditing(false); act(`/price-watch/items/${itemId}/links/${store.key}`, { method: 'PUT', body: JSON.stringify(body) }); };

  return (
    <div style={{ background: '#fff', border: `1px solid ${M.color.line}`, borderTop: `3px solid ${store.color}`, borderRadius: 10, padding: 12, fontSize: 12.5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <b style={{ color: M.color.ink }}>{store.label}</b>
        {st.link?.url && <a href={st.link.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: M.color.brand, fontWeight: 600 }}>Open ↗</a>}
      </div>

      {snap && v.kind === 'price' && (
        <>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{inr(snap.price)} {snap.mrp && snap.mrp > (snap.price ?? 0) && <span style={{ fontSize: 12, color: M.color.faint, textDecoration: 'line-through', fontWeight: 500 }}>{inr(snap.mrp)}</span>}</div>
          {snap.title && <div style={{ color: M.color.muted, fontSize: 11.5, marginTop: 2 }}>{snap.title}</div>}
          {snap.offers.length > 0 ? (
            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
              {snap.offers.map((o, i) => (
                <div key={i} style={{ padding: '7px 9px', borderRadius: 8, background: o.value > 0 ? M.color.goodBg : '#f8fafc', border: `1px solid ${o.value > 0 ? '#bbf7d0' : M.color.line}` }}>
                  <div style={{ fontWeight: 700, color: M.color.ink }}>
                    {o.bank ?? 'Offer'}{o.value > 0 && <span style={{ color: M.color.good }}> · save {inr(o.value)}</span>}
                  </div>
                  <div style={{ color: M.color.muted, marginTop: 1 }}>{o.summary}</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                    {[o.cardType, o.mode, o.offerType.replace(/_/g, ' '), o.minTxn ? `min ${inr(o.minTxn)}` : null].filter(Boolean).map(t => (
                      <span key={t!} style={{ fontSize: 10.5, padding: '1px 6px', borderRadius: 5, background: '#eef2f7', color: '#475569' }}>{t}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : <div style={{ color: M.color.faint, marginTop: 6 }}>No bank offers shown on the page.</div>}
        </>
      )}
      {v.kind === 'notListed' && <div style={{ color: M.color.faint }}>Not found on this store.</div>}
      {v.kind === 'none' && <div style={{ color: M.color.faint }}>No data yet.</div>}
      {snap && (snap.notes || v.kind === 'failed' || (v.kind === 'price' && v.stale)) && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: snap.status === 'ok' && !(v.kind === 'price' && v.stale) ? M.color.muted : M.color.warn, lineHeight: 1.45 }}>
          {v.kind === 'price' && v.stale && <div>Latest attempt: {v.latest?.status}. Showing result from {fmtStamp(snap.fetchedAt)}.</div>}
          {v.kind === 'failed' && <div>Status: {snap.status}</div>}
          {snap.notes}
        </div>
      )}
      {snap && <div style={{ marginTop: 6, fontSize: 10.5, color: M.color.faint }}>Fetched {fmtStamp(snap.fetchedAt)} · {snap.method}</div>}

      <div style={{ marginTop: 10, borderTop: '1px dashed #e2e8f0', paddingTop: 8 }}>
        {editing ? (
          <div style={{ display: 'grid', gap: 6 }}>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder={`Paste the ${store.label} product URL`} style={{ ...mInput, height: 36, fontSize: 12 }} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button style={{ ...btn(true), height: 32 }} onClick={() => save({ url })} disabled={!url.trim()}>Save URL</button>
              <button style={{ ...btn(), height: 32 }} onClick={() => save({ notListed: true })}>Not sold here</button>
              <button style={{ ...btn(), height: 32 }} onClick={() => save({ url: null })}>Auto-find</button>
              <button style={{ ...btn(), height: 32 }} onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', padding: 0, color: M.color.brand, fontSize: 11.5, cursor: 'pointer', fontWeight: 600 }}>
            {st.link?.lockedByUser ? '🔒 URL set by you · change' : 'Wrong product? Set URL'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Dialogs ────────────────────────────────────────────────────────────────
function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 'min(560px, 100%)', maxHeight: '90vh', overflow: 'auto', padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <b style={{ fontSize: 17 }}>{title}</b>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: M.color.muted }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AddDialog({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [tab, setTab] = useState<'erp' | 'custom'>('erp');
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<{ id: string; model: string; brand: string; ean: string }[]>([]);
  const [name, setName] = useState(''); const [brand, setBrand] = useState(''); const [variant, setVariant] = useState('');
  const [priority, setPriority] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (tab !== 'erp' || term.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await api<any>(`/products?search=${encodeURIComponent(term.trim())}&limit=10`);
        setResults(Array.isArray(r) ? r : r?.items ?? r?.data ?? []);
      } catch { setResults([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [term, tab]);

  const add = async (body: object) => {
    setSaving(true);
    try { await api('/price-watch/items', { method: 'POST', body: JSON.stringify({ ...body, priority }) }); onAdded(); }
    catch (e: any) { alert(e?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog title="Watch a product" onClose={onClose}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button style={{ ...btn(tab === 'erp'), flex: 1 }} onClick={() => setTab('erp')}>From Product Master</button>
        <button style={{ ...btn(tab === 'custom'), flex: 1 }} onClick={() => setTab('custom')}>Not in my stock</button>
      </div>
      {tab === 'erp' ? (
        <>
          <input autoFocus value={term} onChange={e => setTerm(e.target.value)} placeholder="Model name or EAN" style={{ ...mInput, width: '100%' }} />
          <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
            {results.map(p => (
              <button key={p.id} disabled={saving} onClick={() => add({ productId: p.id })}
                style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 9, border: `1px solid ${M.color.line}`, background: '#fff', cursor: 'pointer' }}>
                <div style={{ fontWeight: 600 }}>{p.model}</div>
                <div style={{ fontSize: 11.5, color: M.color.faint }}>{p.brand} · {p.ean}</div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Product name, e.g. JBL PartyBox 320" style={mInput} />
          <input value={brand} onChange={e => setBrand(e.target.value)} placeholder="Brand, e.g. JBL" style={mInput} />
          <input value={variant} onChange={e => setVariant(e.target.value)} placeholder="Variant (optional) — colour, RAM/storage" style={mInput} />
          <button style={{ ...btn(true), height: 44 }} disabled={!name.trim() || saving} onClick={() => add({ name, brand, variant })}>{saving ? 'Adding…' : 'Add to watch list'}</button>
        </div>
      )}
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontSize: 13 }}>
        <input type="checkbox" checked={priority} onChange={e => setPriority(e.target.checked)} /> Star it — checked first on every run
      </label>
    </Dialog>
  );
}

function SettingsDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [extraB, setExtraB] = useState(''); const [extraC, setExtraC] = useState('');
  useEffect(() => { api<Settings>('/price-watch/settings').then(setS).catch(() => {}); }, []);
  if (!s) return <Dialog title="Settings" onClose={onClose}><MEmpty icon="⏳" title="Loading…" /></Dialog>;
  const set = (p: Partial<Settings>) => setS({ ...s, ...p });
  const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13.5 };
  const num = (v: number, k: keyof Settings) => <input type="number" value={v} onChange={e => set({ [k]: Number(e.target.value) } as any)} style={{ ...mInput, width: 90, height: 36 }} />;
  const has = (list: string[], v: string) => list.some(x => x.toLowerCase() === v.toLowerCase());
  const toggle = (list: string[], v: string) => has(list, v) ? list.filter(x => x.toLowerCase() !== v.toLowerCase()) : [...list, v];
  const chips = (all: string[], picked: string[], key: 'autoSyncBrands' | 'autoSyncCategories') => {
    const shown = [...new Map([...picked, ...all].map(v => [v.toLowerCase(), v])).values()].sort((a, b) => a.localeCompare(b));
    return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 170, overflow: 'auto' }}>
      {shown.map(v => { const on = has(picked, v); return <button key={v} onClick={() => set({ [key]: toggle(picked, v) } as any)} style={{ ...btn(on), height: 30, fontSize: 12 }}>{on ? '✓ ' : ''}{v}</button>; })}
    </div>;
  };
  const save = async () => {
    setSaving(true);
    try { await api('/price-watch/settings', { method: 'PUT', body: JSON.stringify(s) }); onSaved(); }
    catch (e: any) { alert(e?.message || 'Failed'); }
    finally { setSaving(false); }
  };
  const opts = s.options ?? { brands: [], categories: [] };
  return (
    <Dialog title="Price watch settings" onClose={onClose}>
      <div style={row}><span>Automatically watch products from Product Master</span><input type="checkbox" checked={s.autoSyncInStock} onChange={e => set({ autoSyncInStock: e.target.checked })} /></div>
      {s.autoSyncInStock && <>
        <div style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}><b>Brands</b> <span style={{ color: M.color.faint }}>({s.autoSyncBrands.length} selected · none = all brands)</span></div>
          {chips(opts.brands, s.autoSyncBrands, 'autoSyncBrands')}
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <input value={extraB} onChange={e => setExtraB(e.target.value)} placeholder="Add a brand" style={{ ...mInput, height: 32, flex: 1 }} />
            <button style={{ ...btn(), height: 32 }} onClick={() => { if (extraB.trim()) { set({ autoSyncBrands: toggle(s.autoSyncBrands.filter(x => x.toLowerCase() !== extraB.trim().toLowerCase()), extraB.trim()) }); setExtraB(''); } }}>Add</button>
          </div>
        </div>
        <div style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}><b>Categories</b> <span style={{ color: M.color.faint }}>({s.autoSyncCategories.length} selected · none = all)</span></div>
          {chips(opts.categories, s.autoSyncCategories, 'autoSyncCategories')}
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <input value={extraC} onChange={e => setExtraC(e.target.value)} placeholder="Add a category" style={{ ...mInput, height: 32, flex: 1 }} />
            <button style={{ ...btn(), height: 32 }} onClick={() => { if (extraC.trim()) { set({ autoSyncCategories: toggle(s.autoSyncCategories.filter(x => x.toLowerCase() !== extraC.trim().toLowerCase()), extraC.trim()) }); setExtraC(''); } }}>Add</button>
          </div>
        </div>
        <div style={row}><span>Also watch products with <b>no stock</b></span><input type="checkbox" checked={s.includeOutOfStock} onChange={e => set({ includeOutOfStock: e.target.checked })} /></div>
      </>}
      <div style={row}><span>Re-check normal items after (minutes)</span>{num(s.defaultIntervalMins, 'defaultIntervalMins')}</div>
      <div style={row}><span>Re-check ★ starred items after (minutes)</span>{num(s.priorityIntervalMins, 'priorityIntervalMins')}</div>
      <div style={{ padding: '10px 0' }}>
        <div style={{ fontSize: 13, marginBottom: 6 }}>Stores to compare</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {STORES.map(st => { const on = s.stores.includes(st.key); return <button key={st.key} onClick={() => set({ stores: on ? s.stores.filter(x => x !== st.key) : [...s.stores, st.key] })} style={{ ...btn(on), height: 32 }}>{st.label}</button>; })}
        </div>
      </div>
      <div style={{ fontSize: 12, color: M.color.muted, marginBottom: 8 }}>Products outside these brands/categories are paused (not deleted) and come back if you add them again. Products you added by hand or starred are never paused.</div>
      <button style={{ ...btn(true), width: '100%', height: 44 }} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
    </Dialog>
  );
}

/** Refresh one product on every site now (keeps anything already queued). */
async function checkNow(id: string, act: Act) {
  await act('/price-watch/agent/request', { method: 'POST', body: JSON.stringify({ ids: [id], replace: false }) });
}
