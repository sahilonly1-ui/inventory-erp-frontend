// Tiny fetch wrapper that adds the bearer token, transparently refreshes it on
// 401 (rotation-aware), and unwraps the backend's { success, data } envelope.
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://inventory-erp-backend-iplr.onrender.com/api/v1';

/**
 * The request never reached the server — no signal, DNS failure, or timeout.
 *
 * Distinct from an ordinary Error because callers must treat it differently:
 * a network failure is worth queueing and retrying, whereas a rejection the
 * server issued (duplicate IMEI, validation) will fail identically forever.
 */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => { accessToken = t; };
export const getAccessToken = () => accessToken;

const REFRESH_KEY = 'erp_refresh_token';
export const setRefreshToken = (t: string | null) => {
  if (t) localStorage.setItem(REFRESH_KEY, t);
  else localStorage.removeItem(REFRESH_KEY);
};
export const getRefreshToken = () => localStorage.getItem(REFRESH_KEY);

// Default timeout — 45s is long enough for Render free-tier cold start (~30s).
const DEFAULT_TIMEOUT_MS = 45_000;

function rawFetch(path: string, init: RequestInit, withAuth: boolean, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (withAuth && accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  // AbortController gives us a proper timeout instead of hanging forever.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  return fetch(`${BASE}${path}`, { ...init, headers, signal: ctrl.signal })
    .finally(() => clearTimeout(timer));
}

async function tryRefresh(): Promise<boolean> {
  const rt = getRefreshToken();
  if (!rt) return false;
  try {
    const res = await rawFetch('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: rt }) }, false);
    if (!res.ok) { setAccessToken(null); setRefreshToken(null); return false; }
    const json = await res.json();
    setAccessToken(json.data.accessToken);
    setRefreshToken(json.data.refreshToken);
    return true;
  } catch { return false; }
}

export async function api<T = unknown>(path: string, init: RequestInit = {}, withAuth = true, timeoutMs?: number): Promise<T> {
  let res: Response;
  try {
    res = await rawFetch(path, init, withAuth, timeoutMs);
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new NetworkError('Request timed out — the server may be starting up, please try again in a moment.');
    }
    // fetch() rejects with a TypeError when the request could not be sent.
    if (err instanceof TypeError) {
      throw new NetworkError('No connection — check your network and try again.');
    }
    throw err;
  }

  if (res.status === 401 && withAuth && (await tryRefresh())) {
    res = await rawFetch(path, init, withAuth, timeoutMs);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(json?.error?.message || res.statusText || 'Request failed');
  }
  return json.data as T;
}
