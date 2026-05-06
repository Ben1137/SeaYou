/**
 * Sea Trial — Map Follow Mode (Waze-style camera).
 *
 * When `enabled`, subscribes to `offlineNavigation` `navigationUpdate`
 * events and `easeTo`s the map center to the vessel's current GPS
 * position, locking bearing to the heading so the map turns with you.
 *
 * Mounting this component is cheap — it idles when `enabled` is false
 * and unsubscribes on unmount. Works for real GPS and the simulator.
 */
import { useEffect, useRef } from 'react';
import { useMap } from './useMap';
import { offlineNavigation, type NavigationState } from '@seame/core';

export interface FollowModeControllerProps {
  enabled: boolean;
  /** Camera zoom while following — chart-style detail by default. */
  zoom?: number;
  /** Camera pitch (3D tilt) — 0 = top-down, 60 = forward-leaning. */
  pitch?: number;
  /** Throttle camera moves (ms) — at 1 Hz GPS / sim ticks this is just a guard. */
  minIntervalMs?: number;
}

export const FollowModeController: React.FC<FollowModeControllerProps> = ({
  enabled,
  zoom = 12,
  pitch = 45,
  minIntervalMs = 250,
}) => {
  const map = useMap();
  const lastMoveRef = useRef<number>(0);

  useEffect(() => {
    if (!map || !enabled) return;

    const onUpdate = (state: NavigationState) => {
      const now = Date.now();
      if (now - lastMoveRef.current < minIntervalMs) return;
      lastMoveRef.current = now;

      const { lat, lon } = state.currentPosition;
      // Heading falls back to bearing-to-next when GPS heading is missing
      // (can happen at low speed / DR mode).
      const bearing =
        Number.isFinite(state.heading) && state.heading > 0
          ? state.heading
          : state.bearingToNext ?? 0;

      map.easeTo({
        center: [lon, lat],
        bearing,
        zoom,
        pitch,
        duration: 800,
      });
    };

    offlineNavigation.on('navigationUpdate', onUpdate);
    return () => {
      offlineNavigation.off('navigationUpdate', onUpdate);
    };
  }, [map, enabled, zoom, pitch, minIntervalMs]);

  // When toggled OFF, restore a flat top-down view so the user can pan
  // freely again.
  useEffect(() => {
    if (!map || enabled) return;
    map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
  }, [map, enabled]);

  return null;
};
