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
// DEV-ONLY: build-time gated (import.meta.env.DEV). Tree-shaken from prod — see mockAuth.ts.
import { DEV_MOCK_USER, DEV_MOCK_SESSION } from '../dev/mockAuth';

// ─── Supabase credentials ───
// Read from Vite env (publishable anon key — safe, protected by RLS).
// Set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY on the Vercel target.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
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
    // ─── DEV-ONLY mock-auth short-circuit (build-time gated) ───
    // `import.meta.env.DEV` is statically FALSE in the production build, so this
    // whole block is dead-code-eliminated and the mock import is tree-shaken out.
    // In prod this is byte-identical to before: control falls straight through to
    // the real `if (!isConfigured)` path below. Dev-only: seed a purely LOCAL fake
    // session so the dashboard renders for screenshots — NO Supabase, NO real
    // credential, NO network. Runs BEFORE the real path; never modifies it.
    if (import.meta.env.DEV) {
      setSession(DEV_MOCK_SESSION);
      setUser(DEV_MOCK_USER);
      setLoading(false);
      return; // skip real getCurrentSession()/onAuthStateChange under dev-mock
    }

    if (!isConfigured) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    // Debounce null transitions: Supabase occasionally fires SIGNED_OUT
    // immediately before SIGNED_IN during token rotation or PWA resume,
    // creating a brief user→null→user window. Without this guard that null
    // window re-triggers AlertContext's hydration effect, which re-fetches
    // prefs from cloud and can overwrite the seaYouTourCompleted gate.
    let userClearTimer: ReturnType<typeof setTimeout> | null = null;

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
      // TOKEN_REFRESHED only rotates the JWT — user identity is unchanged.
      // Calling setUser here creates a new object reference that causes
      // AlertContext's hydration effect to re-run unnecessarily.
      if (event === 'TOKEN_REFRESHED') {
        setSession(newSession);   // JWT rotated — must update
        return;
      }
      setSession(prev =>
        prev?.access_token === newSession?.access_token ? prev : newSession
      );
      const incoming = newSession?.user ?? null;
      if (incoming !== null) {
        // User present — cancel any pending null-clear and apply immediately.
        if (userClearTimer) { clearTimeout(userClearTimer); userClearTimer = null; }
        setUser(prev => (prev?.id === incoming.id ? prev : incoming));
      } else {
        // User went null — debounce 500ms so a rapid SIGNED_IN that follows
        // (auth bounce) can cancel this before AlertContext sees null.
        if (userClearTimer) clearTimeout(userClearTimer);
        userClearTimer = setTimeout(() => {
          userClearTimer = null;
          if (isMounted) setUser(null);
        }, 500);
      }
    });

    return () => {
      isMounted = false;
      if (userClearTimer) clearTimeout(userClearTimer);
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
      const res = await signUpWithEmail(email, password, window.location.origin);
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
      const { error: linkError } = await signInWithMagicLink(email, window.location.origin);
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
    if (signOutError) {
      setError(signOutError);
    } else {
      // Clear onboarding flag so a different user on the same browser starts fresh.
      try { localStorage.removeItem('seayou_onboarding_complete'); } catch { /* noop */ }
    }
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
