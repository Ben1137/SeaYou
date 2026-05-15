/**
 * useSharedForecastGridData - Shared atmospheric data provider for forecast layers
 *
 * Fetches atmospheric grid data ONCE per viewport change and distributes to all consumers.
 * Uses the Open-Meteo Forecast API (not Marine API) for land+ocean variables:
 *   - temperature_2m (°C)
 *   - cloud_cover (0–100%)
 *   - precipitation (mm/h)
 *   - pressure_msl (hPa)
 *
 * Follows the same debounce + AbortController + bounds-tolerance pattern as
 * useSharedMarineData.ts to prevent 429 errors on rapid viewport changes.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchForecastGridData, type ForecastGridData, type BoundingBox, type GridResolution } from '@seame/core';
import type maplibregl from 'maplibre-gl';

export interface SharedForecastData {
  gridData: ForecastGridData | null;
  loading: boolean;
  error: Error | null;
  lastUpdated: number | null;
}

export function useSharedForecastGridData(
  map: maplibregl.Map | null,
  visible: boolean,
  refreshInterval: number = 5 * 60 * 1000
): SharedForecastData {
  const [state, setState] = useState<SharedForecastData>({
    gridData: null,
    loading: false,
    error: null,
    lastUpdated: null,
  });

  const lastFetchedBoundsRef = useRef<BoundingBox | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFetchTimeRef = useRef<number>(0);

  const BOUNDS_TOLERANCE = 0.5;
  // 10 s minimum gap between fetches — Forecast API has same rate limits as Marine API
  const MIN_FETCH_INTERVAL_MS = 10000;

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!map || !visible) return;

    // Enforce minimum inter-fetch interval
    const now = Date.now();
    if (!forceRefresh && now - lastFetchTimeRef.current < MIN_FETCH_INTERVAL_MS) return;

    const mapBounds = map.getBounds();
    const west = mapBounds.getWest();
    const east = mapBounds.getEast();
    const north = mapBounds.getNorth();
    const south = mapBounds.getSouth();

    // Return early if viewport still within cached padded bounds
    if (!forceRefresh && lastFetchedBoundsRef.current) {
      const cached = lastFetchedBoundsRef.current;
      const withinBounds =
        west >= cached.west + BOUNDS_TOLERANCE &&
        east <= cached.east - BOUNDS_TOLERANCE &&
        north <= cached.north - BOUNDS_TOLERANCE &&
        south >= cached.south + BOUNDS_TOLERANCE;
      if (withinBounds) return;
    }

    // Cancel in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Expand bounds by 30% for smoother panning
    const lonPadding = (east - west) * 0.3;
    const latPadding = (north - south) * 0.3;

    const bounds: BoundingBox = {
      west: west - lonPadding,
      east: east + lonPadding,
      south: south - latPadding,
      north: north + latPadding,
    };

    // Adaptive grid resolution: fewer points for large viewports to avoid rate limiting.
    // Viewport spans > 10° → 8x8 (64 pts), > 5° → 12x12 (144 pts), else 16x16 (256 pts).
    const viewportSpan = Math.max(east - west, north - south);
    const gridSize = viewportSpan > 10 ? 6 : viewportSpan > 5 ? 8 : 12;
    const resolution: GridResolution = {
      latPoints: gridSize,
      lngPoints: gridSize,
    };

    lastFetchTimeRef.current = Date.now();
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const gridData = await fetchForecastGridData(bounds, resolution);

      if (controller.signal.aborted) return;

      lastFetchedBoundsRef.current = bounds;
      setState({
        gridData,
        loading: false,
        error: null,
        lastUpdated: Date.now(),
      });
    } catch (err: any) {
      if (err.name === 'AbortError' || controller.signal.aborted) return;
      console.error('[useSharedForecastGridData] Fetch failed:', err.message);
      setState(prev => ({ ...prev, loading: false, error: err }));

      // Auto-retry after 15 s on transient timeout
      const isTimeout = err.message?.toLowerCase().includes('timeout') ||
                        err.message?.toLowerCase().includes('timed out');
      if (isTimeout) {
        console.log('[useSharedForecastGridData] Scheduling retry in 15 s after timeout...');
        setTimeout(() => fetchData(true), 15000);
      }
    }
  }, [map, visible]);

  // Fetch on mount / visibility change and schedule periodic refresh
  useEffect(() => {
    if (!map || !visible) return;

    fetchData();

    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    refreshTimerRef.current = setInterval(() => fetchData(true), refreshInterval);

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [map, visible, fetchData, refreshInterval]);

  // Re-fetch on map moveend (debounced 2 s)
  useEffect(() => {
    if (!map || !visible) return;

    const handleMoveEnd = () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => fetchData(), 2000);
    };

    map.on('moveend', handleMoveEnd);

    return () => {
      map.off('moveend', handleMoveEnd);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [map, visible, fetchData]);

  return state;
}
