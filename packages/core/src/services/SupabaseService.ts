/**
 * SupabaseService — lazy singleton client for @seame/core.
 *
 * The client is created once (on first call) using the URL and anon key
 * passed from the web caller. This indirection avoids reading `import.meta.env`
 * inside `@seame/core`, which is compiled by `tsc` (not Vite) — `import.meta.env`
 * silently resolves to `undefined` through the workspace symlink.
 *
 * The web layer (AuthContext / PreferencesSyncService consumers) should call
 * `getSupabaseClient(url, anonKey)` on startup with the values read from
 * `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Re-export the Supabase Session and User types so consumers (e.g. web's
// AuthContext) don't need to add @supabase/supabase-js as a direct dep.
export type { Session, User } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Initialize or retrieve the shared Supabase client.
 *
 * First call MUST supply `url` and `anonKey`. Subsequent calls may omit them
 * and will return the already-initialized client.
 *
 * @throws Error if called without credentials before the first initialization.
 */
export function getSupabaseClient(url?: string, anonKey?: string): SupabaseClient {
  if (client) return client;

  if (!url || !anonKey) {
    throw new Error(
      '[SupabaseService] Client not initialized. Call getSupabaseClient(url, anonKey) first ' +
        'with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
    );
  }

  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  });

  return client;
}

/**
 * Returns true if the client has been initialized. Use before calling
 * services that require an active client to avoid throwing in offline/
 * unconfigured environments.
 */
export function isSupabaseConfigured(): boolean {
  return client !== null;
}

/**
 * Reset the cached client. Primarily for testing — do not call in production
 * code paths.
 */
export function resetSupabaseClient(): void {
  client = null;
}
