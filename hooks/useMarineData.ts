import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { fetchMarineWeather } from '../services/weatherService';
import { MarineWeatherData } from '../types';

export const useMarineData = (
  lat: number,
  lon: number,
  options?: Omit<UseQueryOptions<MarineWeatherData, Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery<MarineWeatherData, Error>({
    queryKey: ['marineData', lat, lon],
    queryFn: () => fetchMarineWeather(lat, lon),
    enabled: !!(lat && lon), // Only run if coordinates exist
    staleTime: 5 * 60 * 1000, // Data fresh for 5 minutes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes (formerly cacheTime)
    refetchInterval: 10 * 60 * 1000, // Auto-refresh every 10 minutes
    refetchOnWindowFocus: true,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    ...options,
  });
};
