import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';

// This page is written for Claude in Chrome to read and operate: plain words,
// one card per product, real links, one box + one Save button per card. A
// person can use it too. Results go to POST /price-watch/agent/results/:id,
// where the server checks them before anything shows on Market Prices.

interface JobStore { store: string; label: string; url: string | null; searchUrl: string | null; officialSite?: string | null }
interface Job { itemId: string; name: string; brand: string | null; variant: string | null; ean: string | null; stores: JobStore[] }

const EXAMPLE = (stores: JobStore[]) => JSON.stringify({
  results: stores.map((s, i) => i === 0
    ? { store: s.store, url: 'https://… exact product page URL …', status: 'ok', price: 29999, mrp: 39999, inStock: true, title: 'page title', priceText: '₹29,999',
        offers: [{ bank: 'HDFC Bank', cardType: 'Credit Card', offerType: 'instant_discount', mode: 'EMI & Full swipe', amount: null, percent: 10, maxDiscount: 1500, minTxn: 5000, summary: '10% instant discount up to ₹1,500 on HDFC credit cards, min ₹5,000' }] }
    : i === 1 ? { store: s.store, status: 'not_listed' } : { store: s.store, '…': 'same as above' }),
}, null, 1);

function parseLoose(text: string): any {
  const t = text.trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error('Not valid JSON');
}

export default function PriceAgent() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<Record<string, string>>({});
  const [round, setRound] = useState(1);
  const isAdmin = (user?.permissions ?? []).includes('*');
  const queued = params.get('queued') === '1';
  const item = params.get('item');

  const fetchJobs = () => {
    const qs = item ? `?item=${encodeURIComponent(item)}` : queued ? '?queued=1&limit=5' : '';
    return api<Job[]>(`/price-watch/agent/jobs${qs}`);
  };
  useEffect(() => {
    if (!isAdmin) return;
    fetchJobs().then(setJobs).catch(e => setErr(e?.message || 'Could not load jobs'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, params]);

  if (!isAdmin) return <div style={{ padding: 30, fontFamily: 'system-ui' }}>Sign in to the ERP as an administrator first, then reload this page.</div>;

  const remaining = (jobs ?? []).filter(j => done[j.itemId] !== 'saved').length;
  const batchFinished = jobs !== null && jobs.length > 0 && remaining === 0;

  // A filtered run ("Check prices") can be bigger than one page: when this
  // batch is saved, pull the next queued products until none are left. This
  // works from the plain URL too (a shortcut's "Start from" page), so a queue
  // is always finished however the agent arrived here.
  const [continuing, setContinuing] = useState(false);
  useEffect(() => {
    if (item || !batchFinished) return;
    setContinuing(true);
    const t = setTimeout(() => {
      api<Job[]>('/price-watch/agent/jobs?queued=1&limit=5')
        .then(next => { setDone({}); setRound(r => r + 1); setJobs(next); setContinuing(false); window.scrollTo(0, 0); })
        .catch(e => setErr(e?.message || 'Could not load the next products'));
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, batchFinished]);

  const allDone = jobs !== null && (jobs.length === 0 || (batchFinished && !!item));

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px 80px', fontFamily: 'system-ui, sans-serif', color: '#0f172a', lineHeight: 1.5 }}>
      <h1 style={{ fontSize: 22, margin: '0 0 4px' }}>Price check task</h1>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>iTechArena · Market Prices · {new Date().toLocaleString('en-IN')}</div>

      {err && <div style={{ padding: 12, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, marginBottom: 12 }}>{err}</div>}

      {allDone ? (
        <div id="all-done" style={{ padding: 18, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, fontSize: 18, fontWeight: 700, color: '#166534' }}>
          ✅ All done. Nothing else to check right now — the task is complete. You can close this tab.
        </div>
      ) : (
        <section style={{ padding: 16, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, marginBottom: 18, fontSize: 14 }}>
          <b style={{ fontSize: 15 }}>Instructions for Claude (follow exactly)</b>
          <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            <li>Work on <b>one product card at a time</b>, from top to bottom. {jobs ? `${remaining} card(s) left on this page.` : 'Loading…'}
              {!item && <> When every card here is saved, <b>more products may load automatically</b> after a moment (batch {round}) — continue with them.</>}</li>
            <li>For every store listed in the card, open its link in a new tab.
              If the link is a <b>search page</b>, open the result that is <b>exactly this product</b> — same model name and number, same variant if one is given.
              Never pick an accessory, cover, combo, bundle, refurbished/renewed listing, or a different model (e.g. “PartyBox 110” is not “PartyBox 120”).
              If the exact product is not on that store, report <code>"status": "not_listed"</code>.</li>
            <li>On the product page, read: the <b>current selling price</b> (the main deal price — not the M.R.P., not a per-month EMI, not a price from “similar products”), the M.R.P., whether it is in stock, and the page title.</li>
            <li>Read <b>all bank / card offers</b>. Click buttons like “View all offers”, “Bank Offer”, “Offers”, “See more” or “T&amp;C” to expand them. For each offer note: bank, card type (credit / debit / both), offer type
              (<code>instant_discount</code>, <code>cashback</code>, <code>no_cost_emi</code>, <code>exchange</code>, <code>coupon</code>, <code>other</code>), EMI or full swipe, flat ₹ amount or %, the maximum (“up to ₹1,500”), and the minimum purchase if stated.</li>
            <li>Copy the exact page URL of the product page into <code>url</code>. If a page shows a captcha or “access denied”, use <code>"status": "blocked"</code>.</li>
            <li><b>Never guess.</b> Report only what you saw on the page. Leave a field <code>null</code> if it is not shown.</li>
            <li>Close the store tabs, come back here, type the results into that card’s box in the JSON format shown, and click <b>Save results</b>. Wait for “Saved ✓”. If an error appears, fix the JSON and save again.</li>
            <li>Move to the next card. Stop when this page shows “All done”.</li>
          </ol>
        </section>
      )}

      {continuing && <div style={{ padding: 14, background: '#eff6ff', borderRadius: 10, marginBottom: 12, fontWeight: 600 }}>⏳ Loading the next products…</div>}
      {(jobs ?? []).map((j, idx) => <JobCard key={j.itemId} idx={idx + 1} job={j} state={done[j.itemId]} onState={s => setDone(d => ({ ...d, [j.itemId]: s }))} />)}
    </div>
  );
}

function JobCard({ job, idx, state, onState }: { job: Job; idx: number; state?: string; onState: (s: string) => void }) {
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const saved = state === 'saved';

  const save = async () => {
    setSaving(true); setMsg('');
    try {
      const parsed = parseLoose(text);
      const results = Array.isArray(parsed) ? parsed : parsed.results;
      if (!Array.isArray(results) || !results.length) throw new Error('JSON must have a "results" list');
      const r = await api<{ saved: { store: string; status: string; notes: string[] }[] }>(`/price-watch/agent/results/${job.itemId}`, { method: 'POST', body: JSON.stringify({ results }) });
      onState('saved');
      setMsg('Saved ✓ ' + r.saved.map(s => `${s.store}: ${s.status}`).join(', '));
    } catch (e: any) {
      setMsg('Error: ' + (e?.message || 'could not save') + ' — fix and click Save results again.');
    } finally { setSaving(false); }
  };

  return (
    <section id={`product-${idx}`} style={{ border: `2px solid ${saved ? '#86efac' : '#e2e8f0'}`, background: saved ? '#f0fdf4' : '#fff', borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <h2 style={{ fontSize: 17, margin: 0 }}>Product {idx}: {job.name} {saved && '— Saved ✓'}</h2>
      <div style={{ fontSize: 13, color: '#475569', margin: '4px 0 10px' }}>
        Brand: {job.brand || '—'} · Variant: {job.variant || 'any variant'}{job.ean ? ` · EAN ${job.ean}` : ''}
      </div>
      {!saved && (
        <>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>Stores to check:</div>
          <ul style={{ margin: '0 0 12px', paddingLeft: 20, fontSize: 13.5 }}>
            {job.stores.map(s => (
              <li key={s.store} style={{ marginBottom: 4 }}>
                <b>{s.label}</b> (store key <code>{s.store}</code>) — {s.url
                  ? <>product page: <a href={s.url} target="_blank" rel="noreferrer">{s.url}</a></>
                  : s.searchUrl
                    ? <>search: <a href={s.searchUrl} target="_blank" rel="noreferrer">{s.searchUrl}</a>{s.officialSite ? ` (official site: ${s.officialSite})` : ''}</>
                    : 'search the store for the exact product'}
              </li>
            ))}
          </ul>
          <details style={{ fontSize: 12.5, marginBottom: 8 }}>
            <summary style={{ cursor: 'pointer', color: '#2563eb' }}>JSON format (example)</summary>
            <pre style={{ background: '#f8fafc', padding: 10, borderRadius: 8, overflow: 'auto', fontSize: 11.5 }}>{EXAMPLE(job.stores)}</pre>
          </details>
          <label htmlFor={`result-${idx}`} style={{ fontSize: 13.5, fontWeight: 700 }}>Results for product {idx} (JSON):</label>
          <textarea id={`result-${idx}`} value={text} onChange={e => setText(e.target.value)} rows={8}
            placeholder='{"results":[{"store":"amazon","url":"…","status":"ok","price":0,"mrp":null,"inStock":true,"title":"…","priceText":"…","offers":[]}]}'
            style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 12.5, padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', marginTop: 4 }} />
          <button onClick={save} disabled={saving || !text.trim()}
            style={{ marginTop: 8, height: 40, padding: '0 18px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
            {saving ? 'Saving…' : `Save results for product ${idx}`}
          </button>
        </>
      )}
      {msg && <div role="status" style={{ marginTop: 8, fontSize: 13.5, fontWeight: 600, color: msg.startsWith('Error') ? '#b91c1c' : '#166534' }}>{msg}</div>}
    </section>
  );
}
