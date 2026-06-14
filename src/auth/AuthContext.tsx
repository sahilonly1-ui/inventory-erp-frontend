import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, setAccessToken, setRefreshToken, getRefreshToken } from '../api/client';
import type { User } from '../api/types';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (getRefreshToken()) {
        try { setUser(await api<User>('/auth/me')); } catch { /* invalid session */ }
      }
      setLoading(false);
    })();
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
  };

  const logout = () => {
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}
