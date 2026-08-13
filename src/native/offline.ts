import { api, NetworkError } from '../api/client';

/**
 * Offline support for the showroom floor.
 *
 * Signal drops in a shop are routine, and a scan session that dies with it
 * loses real work. Three pieces cover that:
 *
 *  1. A cache of EAN → product, so scanning still resolves names offline.
 *  2. A durable queue of saves, flushed automatically when signal returns.
 *  3. A live online/offline signal the UI can show.
 *
 * Storage goes through Capacitor Preferences on the phone and localStorage in
 * the browser, so the same code runs in both.
 */

// ── Storage shim ───────────────────────────────────────────────────────────
async function store(key: string, value: string): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.set({ key, value });
      return;
    }
  } catch { /* fall through to localStorage */ }
  try { localStorage.setItem(key, value); } catch { /* quota — nothing we can do */ }
}

async function load(key: string): Promise<string | null> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const { Preferences } = await import('@capacitor/preferences');
      const { value } = await Preferences.get({ key });
      return value ?? null;
    }
  } catch { /* fall through */ }
  try { return localStorage.getItem(key); } catch { return null; }
}

// ── Network status ─────────────────────────────────────────────────────────
type NetListener = (online: boolean) => void;
const listeners = new Set<NetListener>();
let online = typeof navigator === 'undefined' ? true : navigator.onLine;

export const isOnline = () => online;

function setOnline(next: boolean) {
  if (next === online) return;
  online = next;
  listeners.forEach(l => { try { l(next); } catch { /* listener errors are not ours */ } });
  // Coming back from a dead spot is exactly when queued work should go out.
  if (next) void flushQueue();
}

export function onNetworkChange(fn: NetListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function initNetworkWatch(): Promise<void> {
  window.addEventListener('online', () => setOnline(true));
  window.addEventListener('offline', () => setOnline(false));
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const { Network } = await import('@capacitor/network');
      const status = await Network.getStatus();
      setOnline(status.connected);
      // The native listener is more reliable than navigator.onLine, which on
      // Android reports "online" for a Wi-Fi link that has no route out.
      await Network.addListener('networkStatusChange', s => setOnline(s.connected));
    }
  } catch { /* browser events already cover the web build */ }
}

// ── Product cache (offline EAN lookup) ─────────────────────────────────────
const CACHE_KEY = 'erp_ean_cache_v1';

export interface CachedProduct {
  productId: string;
  model: string;
  brand: string;
  imeiRequired: boolean;
  srnoRequired: boolean;
}

let eanCache: Record<string, CachedProduct> = {};
let cacheLoaded = false;

async function ensureCacheLoaded(): Promise<void> {
  if (cacheLoaded) return;
  cacheLoaded = true;
  const raw = await load(CACHE_KEY);
  if (raw) { try { eanCache = JSON.parse(raw); } catch { eanCache = {}; } }
}

/** Remember a resolved lookup so the same EAN works without signal later. */
export async function rememberProduct(ean: string, p: CachedProduct): Promise<void> {
  await ensureCacheLoaded();
  if (eanCache[ean]) return;             // already known; skip the write
  eanCache[ean] = p;
  await store(CACHE_KEY, JSON.stringify(eanCache));
}

export async function lookupCachedProduct(ean: string): Promise<CachedProduct | null> {
  await ensureCacheLoaded();
  return eanCache[ean] ?? null;
}

export async function cachedProductCount(): Promise<number> {
  await ensureCacheLoaded();
  return Object.keys(eanCache).length;
}

// ── Pending save queue ─────────────────────────────────────────────────────
const QUEUE_KEY = 'erp_pending_queue_v1';

export interface QueuedRequest {
  id: string;
  path: string;
  method: string;
  body: string;
  label: string;       // shown to the operator, e.g. "Stock In — 14 units"
  queuedAt: string;
}

let queue: QueuedRequest[] = [];
let queueLoaded = false;
let flushing = false;

async function ensureQueueLoaded(): Promise<void> {
  if (queueLoaded) return;
  queueLoaded = true;
  const raw = await load(QUEUE_KEY);
  if (raw) { try { queue = JSON.parse(raw); } catch { queue = []; } }
}

async function persistQueue(): Promise<void> {
  await store(QUEUE_KEY, JSON.stringify(queue));
}

export async function queueSize(): Promise<number> {
  await ensureQueueLoaded();
  return queue.length;
}

export async function pendingItems(): Promise<QueuedRequest[]> {
  await ensureQueueLoaded();
  return [...queue];
}

/** Park a request until signal returns. */
export async function enqueue(path: string, method: string, body: unknown, label: string): Promise<void> {
  await ensureQueueLoaded();
  queue.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    path, method, body: JSON.stringify(body), label,
    queuedAt: new Date().toISOString(),
  });
  await persistQueue();
  notifyQueue();
}

type QueueListener = (size: number) => void;
const queueListeners = new Set<QueueListener>();
export function onQueueChange(fn: QueueListener): () => void {
  queueListeners.add(fn);
  return () => queueListeners.delete(fn);
}
function notifyQueue() {
  queueListeners.forEach(l => { try { l(queue.length); } catch { /* ignore */ } });
}

export interface FlushResult { sent: number; failed: number; remaining: number; }

/**
 * Send everything that has been waiting.
 *
 * Order is preserved and a network failure stops the run rather than skipping
 * ahead, so a later save can never land before an earlier one. A request the
 * server rejects outright is dropped with its reason surfaced — retrying it
 * forever would block the queue behind it.
 */
export async function flushQueue(): Promise<FlushResult> {
  await ensureQueueLoaded();
  const result: FlushResult = { sent: 0, failed: 0, remaining: queue.length };
  if (flushing || !queue.length || !online) return result;

  flushing = true;
  try {
    while (queue.length) {
      const item = queue[0];
      try {
        await api(item.path, { method: item.method, body: item.body });
        queue.shift();
        result.sent++;
        await persistQueue();
        notifyQueue();
      } catch (err) {
        if (err instanceof NetworkError) {
          // Still offline — stop and keep everything for the next attempt.
          break;
        }
        // The server understood and refused (duplicate IMEI, validation).
        // Retrying cannot help, so drop it and keep the queue moving.
        queue.shift();
        result.failed++;
        await persistQueue();
        notifyQueue();
        // eslint-disable-next-line no-console
        console.warn('Dropped queued request:', item.label, err);
      }
    }
  } finally {
    flushing = false;
    result.remaining = queue.length;
  }
  return result;
}

export async function clearQueue(): Promise<void> {
  await ensureQueueLoaded();
  queue = [];
  await persistQueue();
  notifyQueue();
}
