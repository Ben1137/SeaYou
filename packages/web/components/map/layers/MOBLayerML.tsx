/**
 * MOBLayerML — Phase 5.
 *
 * Renders the active Man-Overboard pin from `offlineNavigation` as a
 * pulsing red halo + inner dot on the map. Listens to `mobDropped`
 * and `mobCleared` events so the UI stays in sync even when the pin
 * is dropped from somewhere other than the overlay.
 */

import { useEffect } from 'react';
import type { GeoJSONSource } from 'maplibre-gl';
import { offlineNavigation } from '@seame/core';
import type { MOBPin } from '@seame/core';
import { useMap } from '../useMap';

export const MOB_SOURCE_ID = 'mob-pin-source';
export const MOB_HALO_LAYER_ID = 'mob-pin-halo';
export const MOB_DOT_LAYER_ID = 'mob-pin-dot';

function toGeoJSON(pin: MOBPin | null) {
  if (!pin) return { type: 'FeatureCollection' as const, features: [] };
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: { id: pin.id },
        geometry: {
          type: 'Point' as const,
          coordinates: [pin.lon, pin.lat],
        },
      },
    ],
  };
}

export const MOBLayerML: React.FC = () => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const ensureLayer = () => {
      if (map.getSource(MOB_SOURCE_ID)) return;
      map.addSource(MOB_SOURCE_ID, {
        type: 'geojson',
        data: toGeoJSON(offlineNavigation.getMOB()),
      });
      map.addLayer({
        id: MOB_HALO_LAYER_ID,
        type: 'circle',
        source: MOB_SOURCE_ID,
        paint: {
          'circle-radius': 22,
          'circle-color': '#ef4444',
          'circle-opacity': 0.25,
          'circle-stroke-color': '#ef4444',
          'circle-stroke-width': 2,
          'circle-stroke-opacity': 0.8,
        },
      });
      map.addLayer({
        id: MOB_DOT_LAYER_ID,
        type: 'circle',
        source: MOB_SOURCE_ID,
        paint: {
          'circle-radius': 8,
          'circle-color': '#ef4444',
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2,
        },
      });
    };

    if (map.isStyleLoaded()) ensureLayer();
    else map.once('styledata', ensureLayer);

    const refresh = () => {
      const src = map.getSource(MOB_SOURCE_ID) as GeoJSONSource | undefined;
      if (src) src.setData(toGeoJSON(offlineNavigation.getMOB()) as any);
    };

    offlineNavigation.on('mobDropped', refresh);
    offlineNavigation.on('mobCleared', refresh);

    return () => {
      offlineNavigation.off('mobDropped', refresh);
      offlineNavigation.off('mobCleared', refresh);
      for (const id of [MOB_DOT_LAYER_ID, MOB_HALO_LAYER_ID]) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      if (map.getSource(MOB_SOURCE_ID)) map.removeSource(MOB_SOURCE_ID);
    };
  }, [map]);

  return null;
};
