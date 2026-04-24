/**
 * useVoyageAutoSave — Phase 6.
 *
 * Subscribes to the `navigationStopped` event emitted by the
 * `offlineNavigation` singleton and persists a `voyage_logs` row for
 * every completed session. The core service's event payload carries
 * the final route + track snapshot so we don't have to race against
 * the singleton's own cleanup path.
 *
 * Trips with fewer than 2 points (user tapped Stop before a fix came
 * in) are ignored — the log would be meaningless.
 */
import { useEffect } from 'react';
import {
  offlineNavigation,
  saveVoyageLog,
  type Route,
} from '@seame/core';

interface StopPayload {
  route?: Route | null;
  history?: Array<{
    lat: number;
    lon: number;
    timestamp: Date | string;
    speed: number;
  }>;
}

export function useVoyageAutoSave() {
  useEffect(() => {
    const handler = (payload: StopPayload) => {
      const history = payload?.history ?? [];
      if (history.length < 2) return;
      const points = history.map((p) => ({
        lat: p.lat,
        lon: p.lon,
        timestamp:
          p.timestamp instanceof Date ? p.timestamp : new Date(p.timestamp),
        speed: p.speed,
      }));
      void saveVoyageLog(points, { route: payload?.route ?? null });
    };
    offlineNavigation.on('navigationStopped', handler);
    return () => offlineNavigation.off('navigationStopped', handler);
  }, []);
}
