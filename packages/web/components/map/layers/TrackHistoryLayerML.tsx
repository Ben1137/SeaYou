/**
 * TrackHistoryLayerML — Phase 5.
 *
 * Listens to `offlineNavigation.on('trackUpdate', …)` and renders the
 * recorded navigation history as a faded white/cyan dashed polyline
 * behind the vessel icon. Source is always mounted; when there are
 * fewer than 2 points the layer simply draws nothing.
 */

import { useEffect, useRef } from 'react';
import type { GeoJSONSource } from 'maplibre-gl';
import { offlineNavigation } from '@seame/core';
import { useMap } from '../useMap';

export const TRACK_HISTORY_SOURCE_ID = 'nav-track-history-source';
export const TRACK_HISTORY_LAYER_ID = 'nav-track-history-line';

type TrackPoint = { lat: number; lon: number; timestamp: Date; speed: number };

function toGeoJSON(points: TrackPoint[]) {
  if (points.length < 2) {
    return {
      type: 'FeatureCollection' as const,
      features: [],
    };
  }
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'LineString' as const,
          coordinates: points.map((p) => [p.lon, p.lat]),
        },
      },
    ],
  };
}

interface Props {
  visible?: boolean;
}

export const TrackHistoryLayerML: React.FC<Props> = ({ visible = true }) => {
  const map = useMap();
  const lastTrackRef = useRef<TrackPoint[]>([]);

  useEffect(() => {
    if (!map) return;

    const ensureLayer = () => {
      if (!map.getSource(TRACK_HISTORY_SOURCE_ID)) {
        map.addSource(TRACK_HISTORY_SOURCE_ID, {
          type: 'geojson',
          data: toGeoJSON([]),
        });
      }
      if (!map.getLayer(TRACK_HISTORY_LAYER_ID)) {
        map.addLayer({
          id: TRACK_HISTORY_LAYER_ID,
          type: 'line',
          source: TRACK_HISTORY_SOURCE_ID,
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': '#e0f2fe',
            'line-width': 2.5,
            'line-opacity': 0.7,
            'line-dasharray': [2, 1.5],
          },
        });
      }
    };

    if (map.isStyleLoaded()) ensureLayer();
    else map.once('styledata', ensureLayer);

    const handleTrack = (points: TrackPoint[]) => {
      lastTrackRef.current = points;
      const src = map.getSource(TRACK_HISTORY_SOURCE_ID) as
        | GeoJSONSource
        | undefined;
      if (src) src.setData(toGeoJSON(points) as any);
    };

    const handleStop = () => {
      lastTrackRef.current = [];
      const src = map.getSource(TRACK_HISTORY_SOURCE_ID) as
        | GeoJSONSource
        | undefined;
      if (src) src.setData(toGeoJSON([]) as any);
    };

    offlineNavigation.on('trackUpdate', handleTrack);
    offlineNavigation.on('navigationStopped', handleStop);

    return () => {
      map.off('styledata', ensureLayer);
      offlineNavigation.off('trackUpdate', handleTrack);
      offlineNavigation.off('navigationStopped', handleStop);
      try {
        if (map && map.getLayer(TRACK_HISTORY_LAYER_ID)) {
          map.removeLayer(TRACK_HISTORY_LAYER_ID);
        }
        if (map && map.getSource(TRACK_HISTORY_SOURCE_ID)) {
          map.removeSource(TRACK_HISTORY_SOURCE_ID);
        }
      } catch (_e) {
        // map already destroyed
      }
    };
  }, [map]);

  useEffect(() => {
    if (!map) return;
    try {
      if (!map.getLayer(TRACK_HISTORY_LAYER_ID)) return;
      map.setLayoutProperty(
        TRACK_HISTORY_LAYER_ID,
        'visibility',
        visible ? 'visible' : 'none',
      );
    } catch (_e) {
      // map already destroyed
    }
  }, [map, visible]);

  return null;
};
