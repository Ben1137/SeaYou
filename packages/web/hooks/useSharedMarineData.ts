/**
 * useSharedMarineData - Single shared data provider for all map layers
 * Fetches marine grid data ONCE per viewport change and distributes to all consumers.
 * Eliminates 429 errors by reducing 8+ API calls to 2 (marine + forecast).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchMarineGridData, type MarineGridData, type BoundingBox, type GridResolution } from '@seame/core';
import type maplibregl from 'maplibre-gl';

export interface SharedMarineData {
  gridData: MarineGridData | null;
  loading: boolean;
  error: Error | null;
  lastUpdated: number | null;
}

export function useSharedMarineData(
  map: maplibregl.Map | null,
  visible: boolean,
  refreshInterval: number = 5 * 60 * 1000
): SharedMarineData {
  const [state, setState] = useState<SharedMarineData>({
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
  // Minimum gap between fetches (even after a pan) to prevent 429 on rapid viewport changes
  const MIN_FETCH_INTERVAL_MS = 10000; // 10 seconds

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!map || !visible) return;

    // Enforce minimum inter-fetch interval to prevent 429 on rapid panning
    const now = Date.now();
    if (!forceRefresh && now - lastFetchTimeRef.current < MIN_FETCH_INTERVAL_MS) return;

    const mapBounds = map.getBounds();
    const west = mapBounds.getWest();
    const east = mapBounds.getEast();
    const north = mapBounds.getNorth();
    const south = mapBounds.getSouth();

    // Check if viewport is still within cached bounds
    if (!forceRefresh && lastFetchedBoundsRef.current) {
      const cached = lastFetchedBoundsRef.current;
      const withinBounds =
        west >= cached.west + BOUNDS_TOLERANCE &&
        east <= cached.east - BOUNDS_TOLERANCE &&
        north <= cached.north - BOUNDS_TOLERANCE &&
        south >= cached.south + BOUNDS_TOLERANCE;
      if (withinBounds) return;
    }

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Expand bounds for smoother panning
    const lonPadding = (east - west) * 0.3;
    const latPadding = (north - south) * 0.3;

    const bounds: BoundingBox = {
      west: west - lonPadding,
      east: east + lonPadding,
      south: south - latPadding,
      north: north + latPadding,
    };

    // Scale resolution down for large viewports to avoid 429 on the free tier.
    // Open-Meteo free tier throttles large bulk-coordinate requests (256+ points).
    // Viewport spans > 10° use 8x8 (64 points), > 5° use 12x12 (144 points), else 16x16 (256).
    const viewportSpan = Math.max(east - west, north - south);
    const gridSize = viewportSpan > 10 ? 6 : viewportSpan > 5 ? 8 : 12;
    const resolution: GridResolution = {
      latPoints: gridSize,
      lngPoints: gridSize,
    };

    lastFetchTimeRef.current = Date.now();
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const gridData = await fetchMarineGridData(bounds, resolution);

      // Check if this request was cancelled while in-flight
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
      console.error('[useSharedMarineData] Fetch failed:', err.message);
      setState(prev => ({ ...prev, loading: false, error: err }));

      // Auto-retry after 15 s on timeout so the particle layers don't stay
      // empty for the full 5-minute refresh interval on a transient API failure.
      const isTimeout = err.message?.toLowerCase().includes('timeout') ||
                        err.message?.toLowerCase().includes('timed out');
      if (isTimeout) {
        console.log('[useSharedMarineData] Scheduling retry in 15 s after timeout...');
        setTimeout(() => fetchData(true), 15000);
      }
    }
  }, [map, visible]);

  // Fetch on mount and when visibility changes
  useEffect(() => {
    if (!map || !visible) return;

    fetchData();

    // Set up refresh timer
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    refreshTimerRef.current = setInterval(() => fetchData(true), refreshInterval);

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [map, visible, fetchData, refreshInterval]);

  // Update data when map moves (debounced)
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
