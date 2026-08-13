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
/**
 * The server answered and refused.
 *
 * Carries the status so callers can tell apart cases that look identical in
 * the message alone — a missing product (404) and a missing permission (403)
 * both surfaced as "not found" before this existed.
 */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

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

// Several requests can hit a 401 at once mid-scan; without this they would
// each fire their own refresh and the later ones would present a token the
// server has already rotated away, ending the session.
let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async (): Promise<boolean> => {
    const rt = getRefreshToken();
    if (!rt) return false;

    // Render's free tier sleeps, so the first call after an idle spell can come
    // back 502/503 while the service wakes. Give it a couple of tries before
    // concluding anything about the session.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await rawFetch('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: rt }) }, false);

        if (res.ok) {
          const json = await res.json();
          setAccessToken(json.data.accessToken);
          setRefreshToken(json.data.refreshToken);
          return true;
        }

        // Only an explicit rejection means the session is genuinely over.
        // Treating any failure as "logged out" was ending scan sessions
        // whenever the backend hiccuped.
        if (res.status === 401 || res.status === 403) {
          setAccessToken(null);
          setRefreshToken(null);
          return false;
        }

        // 5xx or anything else: server-side trouble, not an auth decision.
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      } catch {
        // Network failure — keep the tokens; the user is offline, not signed out.
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      }
    }
    return false;
  })();

  try { return await refreshInFlight; }
  finally { refreshInFlight = null; }
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
    throw new ApiError(json?.error?.message || res.statusText || 'Request failed', res.status);
  }
  return json.data as T;
}
