import { useCallback } from 'react';
import { useMapContext } from './MapProvider';
import type maplibregl from 'maplibre-gl';

export function useMap(): maplibregl.Map | null {
  const { map } = useMapContext();
  return map;
}

export function useMapReady(): boolean {
  const { isReady } = useMapContext();
  return isReady;
}

export function useMapInstance() {
  const { map, isReady } = useMapContext();

  const setLayerVisibility = useCallback(
    (layerId: string, visible: boolean) => {
      if (!map) return;
      try {
        map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      } catch (e) {
        // Layer might not exist yet
        console.warn(`Layer ${layerId} not found`);
      }
    },
    [map]
  );

  const flyTo = useCallback(
    (center: [number, number], zoom?: number) => {
      if (!map) return;
      map.flyTo({ center, zoom: zoom ?? map.getZoom(), duration: 1500 });
    },
    [map]
  );

  const easeTo = useCallback(
    (center: [number, number], zoom?: number) => {
      if (!map) return;
      map.easeTo({ center, zoom: zoom ?? map.getZoom(), duration: 1000 });
    },
    [map]
  );

  return { map, isReady, setLayerVisibility, flyTo, easeTo };
}
