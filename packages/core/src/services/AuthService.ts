/**
 * AuthService — thin wrapper around Supabase Auth for email + OAuth flows.
 *
 * All functions rely on a previously initialized client from SupabaseService.
 * Callers (AuthContext) should ensure `getSupabaseClient(url, anonKey)` has
 * been called before invoking these.
 */
import type { Session, User, AuthChangeEvent, Provider } from '@supabase/supabase-js';
import { getSupabaseClient } from './SupabaseService';

export type AuthProvider = 'google' | 'apple' | 'facebook';

export interface AuthResult {
  user: User | null;
  session: Session | null;
  error: string | null;
}

// ─── Email / Password ───

export async function signUpWithEmail(email: string, password: string): Promise<AuthResult> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  return {
    user: data.user,
    session: data.session,
    error: error?.message ?? null,
  };
}

export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return {
    user: data.user,
    session: data.session,
    error: error?.message ?? null,
  };
}

/**
 * Send a magic link (passwordless sign-in) to the given email.
 * Useful as a lower-friction alternative to password entry.
 */
export async function signInWithMagicLink(email: string, redirectTo?: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
  });
  return { error: error?.message ?? null };
}

// ─── OAuth ───

/**
 * Begin an OAuth flow. The browser will be redirected to the provider;
 * this function does not resolve with a session — the session is picked up
 * on return via `onAuthStateChange` + `detectSessionInUrl`.
 */
export async function signInWithOAuth(
  provider: AuthProvider,
  redirectTo?: string
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: provider as Provider,
    options: {
      redirectTo: redirectTo ?? (typeof window !== 'undefined' ? window.location.origin : undefined),
    },
  });
  return { error: error?.message ?? null };
}

// ─── Session management ───

export async function signOut(): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  return { error: error?.message ?? null };
}

export async function getCurrentSession(): Promise<Session | null> {
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getCurrentUser(): Promise<User | null> {
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

/**
 * Subscribe to auth state changes (sign-in, sign-out, token refresh).
 * Returns an unsubscribe function.
 */
export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void
): () => void {
  const supabase = getSupabaseClient();
  const { data } = supabase.auth.onAuthStateChange(callback);
  return () => data.subscription.unsubscribe();
}
