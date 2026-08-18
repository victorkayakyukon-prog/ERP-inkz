import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, clearToken, getToken, setToken } from './api';
import type { CurrentUser, Permission } from './types';

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore the session on load; an invalid token resolves to signed-out.
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .get<CurrentUser>('/auth/me')
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.post<{ token: string; user: CurrentUser }>('/auth/login', { email, password });
    setToken(result.token);
    setUser(result.user);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    window.location.href = '/login';
  }, []);

  const can = useCallback(
    (permission: Permission) => !!user?.permissions.includes(permission),
    [user],
  );

  const value = useMemo(() => ({ user, loading, login, logout, can }), [user, loading, login, logout, can]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
