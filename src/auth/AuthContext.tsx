import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  api, setAccessToken, setRefreshToken, getRefreshToken, scheduleProactiveRefresh,
  cancelProactiveRefresh, warmUpServer, onAppResume,
} from '../api/client';
import type { User } from '../api/types';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);
export const useAuth = () => useContext(Ctx);

// The signed-in profile is kept alongside the tokens. Opening the app used to
// wait on /auth/me before showing anything — 20-40s whenever Render was
// asleep — and if that call timed out on a weak mobile signal the app showed
// the sign-in screen even though the session was perfectly valid. That was the
// "logs out after some time" on the phone and tablet app. Now the saved
// profile opens the app instantly and /auth/me only refreshes it quietly.
const USER_KEY = 'erp_user';
const readCachedUser = (): User | null => {
  try { const raw = localStorage.getItem(USER_KEY); return raw ? JSON.parse(raw) as User : null; } catch { return null; }
};
const cacheUser = (u: User | null) => {
  try { u ? localStorage.setItem(USER_KEY, JSON.stringify(u)) : localStorage.removeItem(USER_KEY); } catch { /* storage full or blocked */ }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const hasSession = !!getRefreshToken();
  const cached = hasSession ? readCachedUser() : null;
  const [user, setUserState] = useState<User | null>(cached);
  const [loading, setLoading] = useState(hasSession && !cached);

  const setUser = (u: User | null) => { setUserState(u); cacheUser(u); };

  useEffect(() => {
    warmUpServer();
    if (!getRefreshToken()) { setLoading(false); return; }

    let cancelled = false;
    (async () => {
      // Verify in the background (or, on the very first open after this
      // update, in the foreground). A few tries ride out a server that is
      // still waking up.
      for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
        try {
          const me = await api<User>('/auth/me');
          if (!cancelled) { setUser(me); scheduleProactiveRefresh(); }
          break;
        } catch {
          // Only a session the server has rejected ends it — tryRefresh clears
          // the tokens in exactly that case. Timeouts and dropped signal keep
          // the user signed in.
          if (!getRefreshToken()) { if (!cancelled) setUser(null); break; }
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Server-side session end (token revoked, password changed elsewhere).
  useEffect(() => {
    const ended = () => { cancelProactiveRefresh(); setUser(null); };
    window.addEventListener('erp-session-ended', ended);
    return () => window.removeEventListener('erp-session-ended', ended);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Coming back to the app: wake the server, renew the token if it lapsed
  // while Android had the app frozen.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') void onAppResume(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const login = async (email: string, password: string) => {
    const data = await api<{ user: User; accessToken: string; refreshToken: string }>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }) },
      false,
    );
    setAccessToken(data.accessToken);
    setRefreshToken(data.refreshToken);
    setUser(await api<User>('/auth/me'));
    scheduleProactiveRefresh();
  };

  const logout = () => {
    cancelProactiveRefresh();
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}
