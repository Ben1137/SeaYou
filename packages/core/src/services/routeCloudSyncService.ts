/**
 * Route Cloud Sync — Phase 6.
 *
 * Thin async layer above the existing localStorage `saveRoute` /
 * `getSavedRoutes` / `deleteRoute` helpers. When a Supabase session is
 * active the route set is mirrored to the `user_routes` table; when
 * anonymous or offline we silently fall back to localStorage so the
 * planner keeps working without any network at all.
 *
 * The cloud call path never throws into the UI. On any Supabase error
 * we log + swallow, and the local cache remains the source of truth —
 * this is important for flaky-connectivity at sea. On the next
 * successful sync the local cache is reconciled up to the cloud.
 *
 * Schema mapping (Route ↔ user_routes row):
 *
 *   Route.id            → user_routes.id            (uuid; we keep the
 *                                                    planner's string id
 *                                                    if it parses as uuid,
 *                                                    else server regen)
 *   Route.name          → user_routes.name
 *   Route.waypoints     → user_routes.waypoints     (jsonb)
 *   Route.totalDistance → user_routes.distance_nm
 *   Route.estimatedTime → user_routes.duration_min  (hours → minutes × 60)
 *   Route.averageSpeed  → user_routes.average_speed
 *   Route.createdAt     → user_routes.created_at
 *   (vessel settings — supplied by caller, optional)
 */
import type { Route } from '../types/navigation';
import { isSupabaseConfigured, getSupabaseClient } from './SupabaseService';
import {
  saveRoute as saveRouteLocal,
  getSavedRoutes as getSavedRoutesLocal,
  deleteRoute as deleteRouteLocal,
} from './routePlanningService';

const TABLE = 'user_routes';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getUserId(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supa = getSupabaseClient();
    const { data } = await supa.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

function rowToRoute(row: any): Route {
  return {
    id: row.id,
    name: row.name,
    waypoints: Array.isArray(row.waypoints) ? row.waypoints : [],
    totalDistance: Number(row.distance_nm ?? 0),
    // duration_min is stored in minutes for schema clarity; client Route
    // type stores hours. Convert.
    estimatedTime: Number(row.duration_min ?? 0) / 60,
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
    averageSpeed: Number(row.average_speed ?? 0),
  };
}

function routeToRow(
  route: Route,
  userId: string,
  vesselSettings?: Record<string, unknown>,
) {
  return {
    // If the client-generated id isn't a real uuid, let Postgres generate
    // one rather than blowing up the insert.
    id: UUID_RE.test(route.id) ? route.id : undefined,
    user_id: userId,
    name: route.name,
    waypoints: route.waypoints,
    vessel_settings: vesselSettings ?? {},
    distance_nm: route.totalDistance,
    duration_min: route.estimatedTime * 60,
    average_speed: route.averageSpeed,
    created_at: route.createdAt.toISOString(),
  };
}

/**
 * Save a route. When signed in: upserts into `user_routes` and mirrors
 * the canonical row (with its final uuid) to localStorage. When
 * anonymous: localStorage only.
 */
export async function saveRouteCloud(
  route: Route,
  vesselSettings?: Record<string, unknown>,
): Promise<Route> {
  const userId = await getUserId();
  if (!userId) {
    saveRouteLocal(route);
    return route;
  }

  try {
    const supa = getSupabaseClient();
    const { data, error } = await supa
      .from(TABLE)
      .upsert(routeToRow(route, userId, vesselSettings), {
        onConflict: 'id',
      })
      .select()
      .single();

    if (error || !data) {
      console.warn('[routeCloudSync] upsert failed, falling back local', error);
      saveRouteLocal(route);
      return route;
    }

    const canonical = rowToRoute(data);
    // Mirror canonical copy into local cache so offline reads stay fresh.
    const locals = getSavedRoutesLocal().filter(
      (r) => r.id !== route.id && r.id !== canonical.id,
    );
    locals.push(canonical);
    localStorage.setItem('savedRoutes', JSON.stringify(locals));
    return canonical;
  } catch (err) {
    console.warn('[routeCloudSync] save threw, falling back local', err);
    saveRouteLocal(route);
    return route;
  }
}

/**
 * Read the user's route set. When signed in: fetch from cloud, reconcile
 * with local cache (cloud wins). When anonymous: localStorage only.
 */
export async function getSavedRoutesCloud(): Promise<Route[]> {
  const userId = await getUserId();
  if (!userId) return getSavedRoutesLocal();

  try {
    const supa = getSupabaseClient();
    const { data, error } = await supa
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error || !data) {
      console.warn('[routeCloudSync] fetch failed, returning local', error);
      return getSavedRoutesLocal();
    }

    const cloudRoutes = data.map(rowToRoute);
    // Cloud-wins reconciliation: overwrite local cache so a sign-in on a
    // fresh device hydrates the full set.
    localStorage.setItem('savedRoutes', JSON.stringify(cloudRoutes));
    return cloudRoutes;
  } catch (err) {
    console.warn('[routeCloudSync] fetch threw, returning local', err);
    return getSavedRoutesLocal();
  }
}

/** Delete a route everywhere we might have it. */
export async function deleteRouteCloud(routeId: string): Promise<void> {
  const userId = await getUserId();
  // Always clear the local copy first — instant UI feedback.
  deleteRouteLocal(routeId);
  if (!userId) return;

  try {
    const supa = getSupabaseClient();
    const { error } = await supa
      .from(TABLE)
      .delete()
      .eq('id', routeId)
      .eq('user_id', userId);
    if (error) {
      console.warn('[routeCloudSync] delete failed', error);
    }
  } catch (err) {
    console.warn('[routeCloudSync] delete threw', err);
  }
}

/**
 * One-shot reconcile: push every local-only route up to the cloud on
 * login. Called by the auth listener when a session transitions from
 * anonymous → authenticated. Idempotent — relies on upsert by id.
 */
export async function reconcileLocalRoutesToCloud(
  vesselSettings?: Record<string, unknown>,
): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  const locals = getSavedRoutesLocal();
  if (locals.length === 0) return;
  try {
    const supa = getSupabaseClient();
    const rows = locals.map((r) => routeToRow(r, userId, vesselSettings));
    await supa.from(TABLE).upsert(rows, { onConflict: 'id' });
  } catch (err) {
    console.warn('[routeCloudSync] reconcile threw', err);
  }
}
