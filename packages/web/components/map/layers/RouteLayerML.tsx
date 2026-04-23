/**
 * RouteLayerML — renders the active Route from `RouteContext` as a
 * GeoJSON LineString (route) + a circle layer (waypoints) on the
 * MapLibre canvas.
 *
 * Follows the exact pattern used by PortsLayerML:
 *   1. Add source + layers once the style is loaded.
 *   2. On subsequent route changes, call `setData()` on the existing
 *      source rather than tearing the layer down.
 *   3. Remove source/layers in cleanup to avoid leaking state when the
 *      parent unmounts.
 *
 * Waypoint styling:
 *   - start       → green
 *   - destination → red
 *   - waypoint    → electric blue
 *   - selected    → yellow ring (feature state)
 *
 * Phase 1 renders only — drag/long-press/delete interactions live in
 * `MapContainerML` and mutate the shared context. Keeping the layer
 * dumb makes it trivial to reuse later for optimized / isochrone
 * polylines (Phase 3).
 */

import { useEffect, useRef } from 'react';
import type { GeoJSONSource } from 'maplibre-gl';
import { useMap } from '../useMap';
import { useRoute } from '../../../src/contexts/RouteContext';

export const ROUTE_SOURCE_ID = 'route-source';
export const ROUTE_LINE_LAYER_ID = 'route-line';
export const ROUTE_LINE_CASING_LAYER_ID = 'route-line-casing';
export const ROUTE_WAYPOINTS_SOURCE_ID = 'route-waypoints-source';
export const ROUTE_WAYPOINTS_CIRCLE_LAYER_ID = 'route-waypoints-circle';
export const ROUTE_WAYPOINTS_LABEL_LAYER_ID = 'route-waypoints-label';

interface RouteLayerMLProps {
  /** Hides the layer without unmounting — keeps source in sync while
   *  user is on a non-map view. */
  visible?: boolean;
}

const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

export function RouteLayerML({ visible = true }: RouteLayerMLProps) {
  const map = useMap();
  const { route } = useRoute();
  const layersAddedRef = useRef(false);

  // Create sources + layers once the map style is ready.
  useEffect(() => {
    if (!map) return;

    const setup = () => {
      if (!map.getSource(ROUTE_SOURCE_ID)) {
        map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data: EMPTY_FC });
      }
      if (!map.getSource(ROUTE_WAYPOINTS_SOURCE_ID)) {
        map.addSource(ROUTE_WAYPOINTS_SOURCE_ID, {
          type: 'geojson',
          data: EMPTY_FC,
        });
      }

      // White casing underneath for contrast over any basemap.
      if (!map.getLayer(ROUTE_LINE_CASING_LAYER_ID)) {
        map.addLayer({
          id: ROUTE_LINE_CASING_LAYER_ID,
          type: 'line',
          source: ROUTE_SOURCE_ID,
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
            visibility: visible ? 'visible' : 'none',
          },
          paint: {
            'line-color': '#ffffff',
            'line-opacity': 0.85,
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4, 4,
              10, 8,
              16, 12,
            ],
          },
        });
      }

      if (!map.getLayer(ROUTE_LINE_LAYER_ID)) {
        map.addLayer({
          id: ROUTE_LINE_LAYER_ID,
          type: 'line',
          source: ROUTE_SOURCE_ID,
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
            visibility: visible ? 'visible' : 'none',
          },
          paint: {
            'line-color': '#2da8ff', // electric blue
            'line-opacity': 0.95,
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4, 2,
              10, 4,
              16, 6,
            ],
          },
        });
      }

      if (!map.getLayer(ROUTE_WAYPOINTS_CIRCLE_LAYER_ID)) {
        map.addLayer({
          id: ROUTE_WAYPOINTS_CIRCLE_LAYER_ID,
          type: 'circle',
          source: ROUTE_WAYPOINTS_SOURCE_ID,
          layout: { visibility: visible ? 'visible' : 'none' },
          paint: {
            'circle-radius': [
              'case',
              ['==', ['get', 'type'], 'start'], 9,
              ['==', ['get', 'type'], 'destination'], 9,
              7,
            ],
            'circle-color': [
              'case',
              ['==', ['get', 'type'], 'start'], '#22c55e',
              ['==', ['get', 'type'], 'destination'], '#ef4444',
              '#2da8ff',
            ],
            'circle-stroke-width': 3,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.95,
          },
        });
      }

      if (!map.getLayer(ROUTE_WAYPOINTS_LABEL_LAYER_ID)) {
        map.addLayer({
          id: ROUTE_WAYPOINTS_LABEL_LAYER_ID,
          type: 'symbol',
          source: ROUTE_WAYPOINTS_SOURCE_ID,
          layout: {
            'text-field': ['get', 'label'],
            'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
            'text-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              6, 0,
              9, 11,
              14, 13,
            ],
            'text-offset': [0, 1.3],
            'text-anchor': 'top',
            'text-optional': true,
            visibility: visible ? 'visible' : 'none',
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': '#0b1e33',
            'text-halo-width': 1.6,
          },
          minzoom: 6,
        });
      }

      layersAddedRef.current = true;
    };

    if (map.isStyleLoaded()) {
      setup();
    } else {
      map.once('style.load', setup);
    }

    return () => {
      if (!map || !map.getStyle()) return;
      try {
        for (const id of [
          ROUTE_WAYPOINTS_LABEL_LAYER_ID,
          ROUTE_WAYPOINTS_CIRCLE_LAYER_ID,
          ROUTE_LINE_LAYER_ID,
          ROUTE_LINE_CASING_LAYER_ID,
        ]) {
          if (map.getLayer(id)) map.removeLayer(id);
        }
        for (const id of [ROUTE_WAYPOINTS_SOURCE_ID, ROUTE_SOURCE_ID]) {
          if (map.getSource(id)) map.removeSource(id);
        }
      } catch {
        /* ignore */
      }
      layersAddedRef.current = false;
    };
  }, [map]);

  // Sync route data → sources whenever `route` changes.
  useEffect(() => {
    if (!map || !layersAddedRef.current) return;

    const lineSource = map.getSource(ROUTE_SOURCE_ID) as
      | GeoJSONSource
      | undefined;
    const wpSource = map.getSource(ROUTE_WAYPOINTS_SOURCE_ID) as
      | GeoJSONSource
      | undefined;

    if (!route || route.waypoints.length < 2) {
      lineSource?.setData(EMPTY_FC);
      wpSource?.setData(EMPTY_FC);
      return;
    }

    const coords = route.waypoints.map(
      (w) => [w.lon, w.lat] as [number, number],
    );

    lineSource?.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: { id: route.id, name: route.name },
        },
      ],
    });

    wpSource?.setData({
      type: 'FeatureCollection',
      features: route.waypoints.map((w, i) => ({
        type: 'Feature',
        id: i,
        geometry: { type: 'Point', coordinates: [w.lon, w.lat] },
        properties: {
          id: w.id,
          type: w.type,
          index: i,
          name: w.name,
          label: w.type === 'start'
            ? 'Start'
            : w.type === 'destination'
              ? 'Destination'
              : (w.name || `WP${i}`),
        },
      })),
    });
  }, [map, route]);

  // Visibility toggling (layout property) so we don't re-add on view switch.
  useEffect(() => {
    if (!map || !layersAddedRef.current) return;
    const vis = visible ? 'visible' : 'none';
    for (const id of [
      ROUTE_LINE_CASING_LAYER_ID,
      ROUTE_LINE_LAYER_ID,
      ROUTE_WAYPOINTS_CIRCLE_LAYER_ID,
      ROUTE_WAYPOINTS_LABEL_LAYER_ID,
    ]) {
      try {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, 'visibility', vis);
        }
      } catch {
        /* ignore */
      }
    }
  }, [map, visible]);

  return null;
}

export default RouteLayerML;
