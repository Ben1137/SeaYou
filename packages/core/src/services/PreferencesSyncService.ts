/**
 * PreferencesSyncService — cloud sync for UserPreferences via Supabase.
 *
 * Expects a `user_preferences` table with Row Level Security:
 *
 *   create table user_preferences (
 *     user_id uuid primary key references auth.users(id) on delete cascade,
 *     preferences jsonb not null,
 *     updated_at timestamptz default now()
 *   );
 *
 *   -- RLS policies: users can only read/write their own row
 *   alter table user_preferences enable row level security;
 *   create policy "read own prefs"  on user_preferences for select using (auth.uid() = user_id);
 *   create policy "write own prefs" on user_preferences for insert with check (auth.uid() = user_id);
 *   create policy "update own prefs" on user_preferences for update using (auth.uid() = user_id);
 */
import { UserPreferences } from '../types/preferences';
import { getSupabaseClient } from './SupabaseService';

const TABLE = 'user_preferences';

export interface SyncResult {
  preferences: UserPreferences | null;
  error: string | null;
  updatedAt: string | null;
}

/**
 * Fetch the current user's cloud preferences. Returns `null` preferences
 * (no error) if the row doesn't exist yet — this is a normal state for
 * first-time sign-ins.
 */
export async function fetchPreferences(userId: string): Promise<SyncResult> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select('preferences, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      return { preferences: null, updatedAt: null, error: error.message };
    }
    return {
      preferences: (data?.preferences as UserPreferences) ?? null,
      updatedAt: data?.updated_at ?? null,
      error: null,
    };
  } catch (e) {
    return {
      preferences: null,
      updatedAt: null,
      error: e instanceof Error ? e.message : 'Unknown error fetching preferences',
    };
  }
}

/**
 * Upsert the user's preferences. Uses `user_id` as the conflict target so
 * the same user's row is updated on every save.
 *
 * IMPORTANT: `preferences` is written as a single JSONB blob. All user
 * settings (including push-registration fields such as `onesignal_player_id`,
 * `push_opt_in`, `home_lat`, and `home_lon`) live *inside* the JSONB object
 * — never as top-level columns on `user_preferences`. The schema only has
 * three columns: `user_id` (uuid), `preferences` (jsonb), `updated_at`
 * (timestamptz).
 */
export async function upsertPreferences(
  userId: string,
  preferences: UserPreferences
): Promise<{ error: string | null; updatedAt: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const payload = {
      user_id: userId,
      preferences,
      updated_at: new Date().toISOString(),
    };

    // Dev-time visibility — confirms the push-registration keys are
    // actually present *inside* the JSONB blob before the round-trip.
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[PreferencesSync] upsert payload', {
        userId,
        onesignal_player_id: preferences.onesignal_player_id,
        push_opt_in: preferences.push_opt_in,
        home_lat: preferences.home_lat,
        home_lon: preferences.home_lon,
      });
    }

    const { data, error } = await supabase
      .from(TABLE)
      .upsert(payload, { onConflict: 'user_id' })
      .select('updated_at')
      .single();

    // Raw network-layer visibility. Requested by the Phase-3 write-path
    // audit (April 2026): we need to see the exact PostgREST response —
    // both data and error — to catch RLS rejections that otherwise get
    // swallowed by branch-specific logs below.
    console.log('[PreferencesSync] Supabase Update Response:', { data, error });

    if (error) {
      // Surface the *full* PostgREST error shape — message alone elides
      // the RLS/constraint details that explain silent failures.
      console.error('[PreferencesSync] upsert failed', {
        userId,
        code: (error as { code?: string }).code,
        message: error.message,
        details: (error as { details?: string }).details,
        hint: (error as { hint?: string }).hint,
        raw: error,
      });
      return { error: error.message, updatedAt: null };
    }

    if (!data?.updated_at) {
      // No error but no row came back — typically means RLS let the write
      // through but blocks the post-upsert SELECT. Log so we can diagnose.
      console.warn('[PreferencesSync] upsert returned no row', { userId, data });
    }

    return { error: null, updatedAt: data?.updated_at ?? null };
  } catch (e) {
    console.error('[PreferencesSync] upsert threw', { userId, error: e });
    return {
      error: e instanceof Error ? e.message : 'Unknown error saving preferences',
      updatedAt: null,
    };
  }
}

/**
 * Subscribe to realtime updates on this user's preferences row.
 * Fires whenever the row is inserted, updated, or deleted from any device.
 *
 * Returns an unsubscribe function.
 */
export function subscribeToPreferences(
  userId: string,
  callback: (preferences: UserPreferences | null) => void
): () => void {
  const supabase = getSupabaseClient();
  const channel = supabase
    .channel(`user_preferences:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: TABLE,
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const row = payload.new as { preferences?: UserPreferences } | null;
        callback(row?.preferences ?? null);
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

// ─── Merge strategy ───

/**
 * Last-write-wins merge at the top level. If the cloud row has a newer
 * `updated_at` timestamp, cloud wins; otherwise, local wins. The caller
 * is responsible for tracking the local `updated_at`.
 *
 * For first-time sign-ins (cloud is null), local always wins so the user
 * doesn't lose any settings they configured before signing in.
 */
export function mergePreferences(
  local: UserPreferences,
  cloud: UserPreferences | null,
  localUpdatedAt: string | null,
  cloudUpdatedAt: string | null
): UserPreferences {
  if (!cloud) return local;
  if (!localUpdatedAt) return cloud;
  if (!cloudUpdatedAt) return local;

  const localTime = new Date(localUpdatedAt).getTime();
  const cloudTime = new Date(cloudUpdatedAt).getTime();
  const winner = cloudTime > localTime ? cloud : local;

  // Sea Trial fix — `hasCompletedTour` is monotonic: once true on ANY
  // device the tour must never replay. The blanket latest-write-wins
  // above caused the tour to flash on every fresh sign-in because the
  // local default `hasCompletedTour: false` (written at sign-in) carried
  // a newer timestamp than the cloud row that already had it set true.
  return {
    ...winner,
    hasCompletedTour: Boolean(local.hasCompletedTour || cloud.hasCompletedTour),
  };
}
