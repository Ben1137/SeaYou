import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';

import {
  getSupabaseClient,
  isSupabaseConfigured,
  onAuthStateChange,
  getCurrentSession,
  signOut as authSignOut,
  signInWithOAuth,
  signInWithEmail,
  signUpWithEmail,
  signInWithMagicLink,
  type Session,
  type User,

  type AuthProvider as OAuthProvider,
} from '@seame/core';

// ─── Supabase credentials ───
// Hardcoded for now to bypass Vite .env path confusion between worktree and
// main checkout. These are the public anon key (safe — protected by RLS).
// TODO: restore import.meta.env.VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
//       once the worktree issue is resolved.
const SUPABASE_URL: string | undefined = 'https://mxuvijlowneokmzeompn.supabase.co';
const SUPABASE_ANON_KEY: string | undefined = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14dXZpamxvd25lb2ttemVvbXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NTI3NzEsImV4cCI6MjA5MTEyODc3MX0.dmgDNzmpvMIYMiPgjh-AQ9RX_qFUg-L1WVaPBB8ooyc';

// Initialize the client once at module load if credentials are present.
// If missing, Auth features are disabled gracefully (the app still runs
// in local-only mode).
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    getSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    console.warn('[AuthContext] Supabase client init failed:', e);
  }
} else {
  console.info(
    '[AuthContext] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY missing — auth disabled, running local-only.'
  );
}

interface AuthContextType {
  /** True if Supabase env is configured and the client is ready */
  isConfigured: boolean;
  /** True while the initial session is being restored */
  loading: boolean;
  /** Current authenticated user, or null if signed out */
  user: User | null;
  /** Current session, or null if signed out */
  session: Session | null;
  /** Last auth error shown to the user */
  error: string | null;

  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithEmailPassword: (email: string, password: string) => Promise<boolean>;
  signUpWithEmailPassword: (email: string, password: string) => Promise<boolean>;
  sendMagicLink: (email: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const isConfigured = isSupabaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isConfigured);
  const [error, setError] = useState<string | null>(null);

  // ─── Bootstrap session + subscribe to auth changes ───
  useEffect(() => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    (async () => {
      try {
        const current = await getCurrentSession();
        if (!isMounted) return;
        setSession(current);
        setUser(current?.user ?? null);
      } catch (e) {
        console.warn('[AuthContext] Failed to restore session:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    const unsubscribe = onAuthStateChange((event, newSession) => {
      if (!isMounted) return;
      console.log('[AuthContext] Auth state change:', event);
      setSession(newSession);
      setUser(newSession?.user ?? null);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [isConfigured]);

  // ─── OAuth helpers ───

  const doOAuth = useCallback(
    async (provider: OAuthProvider) => {
      if (!isConfigured) {
        setError('Sign-in is not configured. Missing Supabase credentials.');
        return;
      }
      setError(null);
      const { error: oauthError } = await signInWithOAuth(provider);
      if (oauthError) setError(oauthError);
    },
    [isConfigured]
  );

  const signInWithGoogle = useCallback(() => doOAuth('google'), [doOAuth]);
  const signInWithApple = useCallback(() => doOAuth('apple'), [doOAuth]);
  // Facebook SSO retired April 2026 — consolidated providers for mobile launch.

  // ─── Email / password ───

  const signInWithEmailPassword = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      if (!isConfigured) {
        setError('Sign-in is not configured.');
        return false;
      }
      setError(null);
      const res = await signInWithEmail(email, password);
      if (res.error) {
        setError(res.error);
        return false;
      }
      return true;
    },
    [isConfigured]
  );

  const signUpWithEmailPassword = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      if (!isConfigured) {
        setError('Sign-up is not configured.');
        return false;
      }
      setError(null);
      const res = await signUpWithEmail(email, password);
      if (res.error) {
        setError(res.error);
        return false;
      }
      return true;
    },
    [isConfigured]
  );

  const sendMagicLink = useCallback(
    async (email: string): Promise<boolean> => {
      if (!isConfigured) {
        setError('Sign-in is not configured.');
        return false;
      }
      setError(null);
      const { error: linkError } = await signInWithMagicLink(email);
      if (linkError) {
        setError(linkError);
        return false;
      }
      return true;
    },
    [isConfigured]
  );

  // ─── Sign out ───

  const doSignOut = useCallback(async () => {
    if (!isConfigured) return;
    setError(null);
    const { error: signOutError } = await authSignOut();
    if (signOutError) setError(signOutError);
  }, [isConfigured]);

  const clearError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider
      value={{
        isConfigured,
        loading,
        user,
        session,
        error,
        signInWithGoogle,
        signInWithApple,
        signInWithEmailPassword,
        signUpWithEmailPassword,
        sendMagicLink,
        signOut: doSignOut,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
