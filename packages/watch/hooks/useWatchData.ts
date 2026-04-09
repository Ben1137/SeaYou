import { useQuery } from '@tanstack/react-query';
import { fetchMarineWeather } from '@seame/core';
import type { MarineWeatherData } from '@seame/core';

const DEFAULT_LAT = 32.0853;
const DEFAULT_LNG = 34.7818;
const STALE_TIME = 5 * 60 * 1000;
const GC_TIME = 30 * 60 * 1000;

export function useWatchData(lat = DEFAULT_LAT, lng = DEFAULT_LNG) {
  return useQuery<MarineWeatherData>({
    queryKey: ['watchWeather', lat, lng],
    queryFn: () => fetchMarineWeather(lat, lng),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });
}
