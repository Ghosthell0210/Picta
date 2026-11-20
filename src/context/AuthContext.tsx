import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  fetchMe,
  getStoredSession,
  loginPicta,
  onSessionChange,
  saveStoredSession,
} from '../lib/pictaClient';
import type { PictaAuthSession, PictaUser } from '../types/picta';

interface AuthContextValue {
  session: PictaAuthSession | null;
  user: PictaUser | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<PictaAuthSession | null>(() => getStoredSession());
  const [isInitializing, setIsInitializing] = useState<boolean>(false);

  useEffect(() => {
    onSessionChange((next) => {
      setSession(next);
    });

    const existing = getStoredSession();
    if (!existing) {
      setIsInitializing(false);
      return;
    }

    setIsInitializing(false);
    fetchMe()
      .then((user) => {
        const current = getStoredSession();
        if (current) {
          saveStoredSession({ ...current, user });
        }
      })
      .catch(() => {
        // Keep existing cached session if network temporarily unavailable
      });
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const newSession = await loginPicta(username, password);
    setSession(newSession);
  }, []);

  const logout = useCallback(() => {
    saveStoredSession(null);
    setSession(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const current = getStoredSession();
    if (!current) return;
    const user = await fetchMe();
    saveStoredSession({ ...current, user });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user || null,
        isAuthenticated: Boolean(session?.access_token),
        isInitializing,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
