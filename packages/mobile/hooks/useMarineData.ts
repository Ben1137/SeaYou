
import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { fetchMarineWeather } from '@seame/core';
import { MarineWeatherData } from '@seame/core';

export const useMarineData = (
  lat: number,
  lon: number,
  options?: Omit<UseQueryOptions<MarineWeatherData, Error>, 'queryKey' | 'queryFn'>
) => {
  return useQuery<MarineWeatherData, Error>({
    queryKey: ['marineData', lat, lon],
    queryFn: () => fetchMarineWeather(lat, lon),
    enabled: !!(lat && lon),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    retry: 3,
    ...options,
  });
};
