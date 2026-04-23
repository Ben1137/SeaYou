/**
 * RouteContext — single source of truth for the user's currently-edited
 * route, shared between the `RoutePlanningView` form and the map layers
 * that render the route line + waypoints on top of `MapContainerML`.
 *
 * Why a context (not local state in RoutePlanningView):
 *   Phase 1 of the Route Planner 2.0 roadmap needs the route to be
 *   editable from two surfaces simultaneously — the form (typed coords,
 *   list editor) AND the live map (long-press to drop, drag to move,
 *   tap to delete). Both surfaces must mutate the *same* Route object.
 *
 * The context exposes minimal mutation helpers that internally call the
 * pure functions in `@seame/core/services/routePlanningService` so the
 * distance / ETA totals stay in sync automatically.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { Route } from '@seame/core';
import {
  addWaypoint as addWaypointPure,
  removeWaypoint as removeWaypointPure,
  moveWaypoint as moveWaypointPure,
} from '@seame/core';

interface RouteContextValue {
  route: Route | null;
  setRoute: (r: Route | null) => void;

  /** Append a waypoint just before the destination. */
  appendWaypoint: (wp: { lat: number; lon: number; name?: string }) => void;

  /** Move an existing waypoint (by index) to a new lat/lon. */
  moveWaypoint: (index: number, latLon: { lat: number; lon: number }) => void;

  /** Remove an intermediate waypoint (start/destination are protected). */
  removeWaypoint: (index: number) => void;
}

const RouteContext = createContext<RouteContextValue | undefined>(undefined);

export const RouteProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [route, setRoute] = useState<Route | null>(null);

  const appendWaypoint = useCallback(
    (wp: { lat: number; lon: number; name?: string }) => {
      setRoute((prev) =>
        prev
          ? addWaypointPure(prev, {
              lat: wp.lat,
              lon: wp.lon,
              name: wp.name || `WP ${prev.waypoints.length - 1}`,
            })
          : prev,
      );
    },
    [],
  );

  const moveWaypoint = useCallback(
    (index: number, latLon: { lat: number; lon: number }) => {
      setRoute((prev) => (prev ? moveWaypointPure(prev, index, latLon) : prev));
    },
    [],
  );

  const removeWaypoint = useCallback((index: number) => {
    setRoute((prev) => (prev ? removeWaypointPure(prev, index) : prev));
  }, []);

  const value = useMemo<RouteContextValue>(
    () => ({ route, setRoute, appendWaypoint, moveWaypoint, removeWaypoint }),
    [route, appendWaypoint, moveWaypoint, removeWaypoint],
  );

  return (
    <RouteContext.Provider value={value}>{children}</RouteContext.Provider>
  );
};

export function useRoute(): RouteContextValue {
  const ctx = useContext(RouteContext);
  if (!ctx) {
    throw new Error('useRoute must be used inside <RouteProvider>');
  }
  return ctx;
}
