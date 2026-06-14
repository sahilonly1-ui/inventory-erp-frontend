// Tiny fetch wrapper that adds the bearer token, transparently refreshes it on
// 401 (rotation-aware), and unwraps the backend's { success, data } envelope.
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8080/api/v1';

let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => { accessToken = t; };
export const getAccessToken = () => accessToken;

const REFRESH_KEY = 'erp_refresh_token';
export const setRefreshToken = (t: string | null) => {
  if (t) localStorage.setItem(REFRESH_KEY, t);
  else localStorage.removeItem(REFRESH_KEY);
};
export const getRefreshToken = () => localStorage.getItem(REFRESH_KEY);

function rawFetch(path: string, init: RequestInit, withAuth: boolean): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (withAuth && accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  return fetch(`${BASE}${path}`, { ...init, headers });
}

async function tryRefresh(): Promise<boolean> {
  const rt = getRefreshToken();
  if (!rt) return false;
  const res = await rawFetch('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: rt }) }, false);
  if (!res.ok) { setAccessToken(null); setRefreshToken(null); return false; }
  const json = await res.json();
  setAccessToken(json.data.accessToken);
  setRefreshToken(json.data.refreshToken);
  return true;
}

export async function api<T = unknown>(path: string, init: RequestInit = {}, withAuth = true): Promise<T> {
  let res = await rawFetch(path, init, withAuth);
  if (res.status === 401 && withAuth && (await tryRefresh())) {
    res = await rawFetch(path, init, withAuth);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(json?.error?.message || res.statusText || 'Request failed');
  }
  return json.data as T;
}
