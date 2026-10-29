'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useGetMeQuery, useLogoutMutation, useMigrateGuestMutation } from '@/store/api';
import type { AuthSessionResponse, AuthUser } from '@/types';
import AuthDialog, { type AuthMode } from './AuthDialog';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  guestScanPending: boolean;
  migrationError: boolean;
  openAuth: (mode?: AuthMode) => void;
  closeAuth: () => void;
  logout: () => Promise<boolean>;
  retryMigration: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useGetMeQuery();
  const [logoutMutation] = useLogoutMutation();
  const [migrateGuest] = useMigrateGuestMutation();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>('login');
  const [migrationError, setMigrationError] = useState(false);

  const openAuth = useCallback((nextMode: AuthMode = 'login') => {
    setMode(nextMode);
    setOpen(true);
  }, []);

  const closeAuth = useCallback(() => setOpen(false), []);

  const retryMigration = useCallback(async () => {
    setMigrationError(false);
    try {
      await migrateGuest().unwrap();
      return true;
    } catch {
      setMigrationError(true);
      return false;
    }
  }, [migrateGuest]);

  const logout = useCallback(async () => {
    try {
      await logoutMutation().unwrap();
      return true;
    } catch {
      return false;
    }
  }, [logoutMutation]);

  const onAuthenticated = useCallback(
    (result: AuthSessionResponse) => {
      setOpen(false);
      if (result.guestMigrationPending) void retryMigration();
    },
    [retryMigration],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user: data?.user ?? null,
      loading: isLoading,
      guestScanPending: data?.guestScanPending ?? false,
      migrationError,
      openAuth,
      closeAuth,
      logout,
      retryMigration,
    }),
    [data?.user, data?.guestScanPending, isLoading, migrationError, openAuth, closeAuth, logout, retryMigration],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {open && (
        <AuthDialog
          initialMode={mode}
          onClose={closeAuth}
          onAuthenticated={onAuthenticated}
        />
      )}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside an AuthProvider');
  return value;
}
