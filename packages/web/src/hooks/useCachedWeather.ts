/**
 * Custom hook for fetching weather data with intelligent caching
 * 
 * Implements stale-while-revalidate pattern:
 * 1. Returns cached data immediately if available
 * 2. Fetches fresh data in background
 * 3. Updates UI when fresh data arrives
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchMarineWeather, cacheService } from '@seame/core';
import type { MarineWeatherData } from '@seame/core';

interface UseCachedWeatherOptions {
  lat: number;
  lon: number;
  enabled?: boolean;
  refetchInterval?: number; // milliseconds
}

interface UseCachedWeatherReturn {
  data: MarineWeatherData | null;
  isLoading: boolean;
  isStale: boolean;
  isOfflineFallback: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  lastUpdated: Date | null;
}

export function useCachedWeather({
  lat,
  lon,
  enabled = true,
  refetchInterval,
}: UseCachedWeatherOptions): UseCachedWeatherReturn {
  const [data, setData] = useState<MarineWeatherData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStale, setIsStale] = useState(false);
  const [isOfflineFallback, setIsOfflineFallback] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const dataRef = useRef<MarineWeatherData | null>(null);

  const fetchData = useCallback(async (showLoading = true) => {
    if (!enabled) return;

    try {
      if (showLoading) {
        setIsLoading(true);
      }
      setError(null);

      // Generate cache keys
      const marineKey = cacheService.getMarineKey(lat, lon);
      const currentKey = cacheService.getCurrentKey(lat, lon);

      // Try to get cached data first (stale-while-revalidate)
      const cachedMarine = await cacheService.get<any>(marineKey);
      const cachedCurrent = await cacheService.get<any>(currentKey);

      if (cachedMarine && cachedCurrent) {
        // We have cached data - show it immediately
        const cachedData = { ...cachedMarine, current: cachedCurrent };
        setData(cachedData);
        dataRef.current = cachedData;
        setIsStale(true); // Mark as potentially stale
        setIsLoading(false);
        setLastUpdated(new Date(cachedCurrent.timestamp || Date.now()));
      }

      // Fetch fresh data in background
      const freshData = await fetchMarineWeather(lat, lon);

      // Cache the fresh data
      await Promise.all([
        cacheService.set(
          marineKey,
          freshData,
          cacheService.getTTL('marine')
        ),
        cacheService.set(
          currentKey,
          { ...freshData.current, timestamp: Date.now() },
          cacheService.getTTL('current')
        ),
      ]);

      // Update UI with fresh data
      setData(freshData);
      dataRef.current = freshData;
      setIsStale(false);
      setIsOfflineFallback(false);
      setLastUpdated(new Date());
      setIsLoading(false);
    } catch (err) {
      console.error('Weather fetch error:', err);
      if (dataRef.current !== null) {
        // Cached data available — show offline banner instead of crashing
        setIsOfflineFallback(true);
        setIsLoading(false);
      } else {
        // No cache — surface the error so Dashboard shows <ErrorState>
        setError(err as Error);
        setIsLoading(false);
      }
    }
  }, [lat, lon, enabled]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refetch interval
  useEffect(() => {
    if (!refetchInterval || !enabled) return;

    const interval = setInterval(() => {
      fetchData(false); // Don't show loading spinner for background refresh
    }, refetchInterval);

    return () => clearInterval(interval);
  }, [refetchInterval, enabled, fetchData]);

  const refetch = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  return {
    data,
    isLoading,
    isStale,
    isOfflineFallback,
    error,
    refetch,
    lastUpdated,
  };
}

/**
 * Hook for cache statistics
 */
export function useCacheStats() {
  const [stats, setStats] = useState({
    totalSize: 0,
    itemCount: 0,
    hitRate: 0,
    oldestItem: 0,
  });

  useEffect(() => {
    const updateStats = async () => {
      const cacheStats = await cacheService.getStats();
      setStats(cacheStats);
    };

    updateStats();
    const interval = setInterval(updateStats, 10000); // Update every 10s

    return () => clearInterval(interval);
  }, []);

  return stats;
}

/**
 * Hook for cache management
 */
export function useCacheManagement() {
  const clearCache = useCallback(async () => {
    await cacheService.clearAll();
  }, []);

  const deleteExpired = useCallback(async () => {
    const deleted = await cacheService.deleteExpired();
    return deleted;
  }, []);

  const invalidatePattern = useCallback(async (pattern: string) => {
    await cacheService.invalidate(pattern);
  }, []);

  return {
    clearCache,
    deleteExpired,
    invalidatePattern,
  };
}
