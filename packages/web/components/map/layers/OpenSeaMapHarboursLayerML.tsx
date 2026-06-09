/**
 * OpenSeaMapHarboursLayerML — Interactive harbour vector overlay
 *
 * Fetches OpenStreetMap harbour/port nodes from the public Overpass API for
 * the current map viewport (debounced 400ms, min zoom 8) and adds an invisible
 * GeoJSON circle layer as a click target. Clicking a harbour opens a MapLibre
 * popup containing the port name and a native 7-day meteogram chart (Recharts +
 * Open-Meteo API) rendered via React createRoot inside the popup DOM node.
 *
 * Why this exists: The OpenSeaMap raster tiles are pre-rendered PNGs — MapLibre
 * sees them as pixels, not geographic features. An invisible vector overlay is
 * the only way to enable click interactions on harbour icons.
 *
 * Globe compatibility: GeoJSON sources use MapLibre's projectToSphere() vertex
 * shader natively. No Mercator toggle needed — harbours render correctly on
 * both globe and mercator without any drift.
 *
 * Overpass query:
 *   node["seamark:type"="harbour"]["name"](S,W,N,E)
 *   node["seamark:type"="port"]["name"](S,W,N,E)
 *   node["harbour"="yes"]["name"](S,W,N,E)
 * Endpoint: https://overpass-api.de/api/interpreter (CORS: *)
 *
 * Meteogram data: https://api.open-meteo.com/v1/forecast (hourly temp, wind, precip)
 *
 * Phase 8 — Pro Navigation Engine (ENC overlay)
 */

import { createRoot, Root } from 'react-dom/client';
import maplibregl from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { useMap } from '../useMap';
import { MeteogramChart } from '../../../src/components/charts/MeteogramChart';

// ─── Constants ───

const SOURCE_ID  = 'osm-harbours-source';
const LAYER_ID   = 'osm-harbours-circles';

/** Minimum zoom to fire Overpass — prevents 50k-node bbox queries at world view. */
const MIN_ZOOM = 8;

/** Debounce delay after moveend/zoomend before firing the Overpass query. */
const DEBOUNCE_MS = 400;

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const LOG = (...args: unknown[]) => console.log('[OSM Harbours]', ...args);

// ─── Helpers ───

function buildOverpassQuery(s: number, w: number, n: number, e: number): string {
  const bbox = `${s.toFixed(5)},${w.toFixed(5)},${n.toFixed(5)},${e.toFixed(5)}`;
  return (
    `[out:json][timeout:15];` +
    `(` +
    `node["seamark:type"="harbour"]["name"](${bbox});` +
    `node["seamark:type"="port"]["name"](${bbox});` +
    `node["harbour"="yes"]["name"](${bbox});` +
    `);out body;`
  );
}

interface OverpassElement {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

function overpassToGeoJSON(elements: OverpassElement[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: elements.map((el) => ({
      type: 'Feature',
      id: el.id,
      geometry: { type: 'Point', coordinates: [el.lon, el.lat] },
      properties: {
        name: el.tags.name ?? '',
        seamark_type: el.tags['seamark:type'] ?? el.tags.harbour ?? '',
        website: el.tags.website ?? el.tags['contact:website'] ?? '',
      },
    })),
  };
}

// ─── Component ───

export interface OpenSeaMapHarboursLayerMLProps {
  /** Should match the parent ENC toggle — harbours only shown when ENC raster is on. */
  visible: boolean;
}

export function OpenSeaMapHarboursLayerML({ visible }: OpenSeaMapHarboursLayerMLProps) {
  const map = useMap();

  // Refs held across renders without triggering re-renders
  const abortRef     = useRef<AbortController | null>(null);
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popupRef     = useRef<maplibregl.Popup | null>(null);
  const popupRootRef = useRef<Root | null>(null);
  const layerReadyRef = useRef(false);
  // Survives style.load cycles triggered by setProjection — re-applied after source recreation.
  const lastFcRef    = useRef<GeoJSON.FeatureCollection | null>(null);

  // ── GeoJSON source + circle layer lifecycle ──────────────────────────────
  useEffect(() => {
    if (!map) return;

    const setupLayer = () => {
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }

      if (!map.getLayer(LAYER_ID)) {
        map.addLayer({
          id: LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          paint: {
            'circle-radius': 15,
            'circle-color': 'rgba(0,0,0,0)',
          },
          minzoom: MIN_ZOOM,
        });
      }

      layerReadyRef.current = true;
      LOG('layer ready');
    };

    const teardownLayer = () => {
      try {
        if (map.getLayer(LAYER_ID))   map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch { /* disposed */ }
      layerReadyRef.current = false;
    };

    const onStyleLoad = () => {
      if (!visible) return;
      setupLayer();
      // Re-apply last known harbour data — setProjection fires style.load which
      // recreates the source as empty, wiping any data that arrived before the reload.
      if (lastFcRef.current) {
        const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
        if (src) src.setData(lastFcRef.current);
      }
    };

    if (visible) {
      if (map.getStyle()) {
        setupLayer();
      } else {
        map.on('style.load', onStyleLoad);
        return () => map.off('style.load', onStyleLoad);
      }
      map.on('style.load', onStyleLoad);
      return () => {
        map.off('style.load', onStyleLoad);
        if (layerReadyRef.current) teardownLayer();
      };
    } else if (layerReadyRef.current) {
      teardownLayer();
    }

    return () => {
      if (layerReadyRef.current) teardownLayer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, visible]);

  // ── Overpass fetch on viewport change ─────────────────────────────────────
  useEffect(() => {
    if (!map || !visible) return;

    const fetchHarbours = () => {
      if (map.getZoom() < MIN_ZOOM) {
        LOG(`zoom ${map.getZoom().toFixed(1)} < ${MIN_ZOOM} — skipping fetch`);
        return;
      }

      // Cancel previous in-flight request
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      const b = map.getBounds();
      const query = buildOverpassQuery(
        b.getSouth(), b.getWest(), b.getNorth(), b.getEast()
      );

      LOG(`fetching bbox [${b.getSouth().toFixed(2)},${b.getWest().toFixed(2)},${b.getNorth().toFixed(2)},${b.getEast().toFixed(2)}]`);

      const tryFetch = async (index: number): Promise<void> => {
        if (index >= OVERPASS_ENDPOINTS.length) {
          console.warn('[OSM Harbours] All Overpass endpoints failed.');
          return;
        }
        try {
          const reqController = new AbortController();
          const timeoutId = setTimeout(() => reqController.abort(), 6000);
          controller.signal.addEventListener('abort', () => reqController.abort());

          // POST avoids 406 rejections caused by long URL-encoded GET query strings
          // on Overpass CDN nodes. Body uses the standard x-www-form-urlencoded format.
          const res = await fetch(OVERPASS_ENDPOINTS[index], {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'Accept': 'application/json',
            },
            body: `data=${encodeURIComponent(query)}`,
            signal: reqController.signal,
          });

          clearTimeout(timeoutId);

          if (!res.ok) throw new Error(`Status ${res.status}`);
          const json = await res.json();
          const elements: OverpassElement[] = json.elements ?? [];
          LOG(`received ${elements.length} harbour nodes from ${OVERPASS_ENDPOINTS[index]}`);
          const fc = overpassToGeoJSON(elements);
          console.log('[OSM Harbours] GeoJSON generated with feature count:', fc.features.length);
          lastFcRef.current = fc;
          const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
          if (src) src.setData(fc);
        } catch (err: unknown) {
          if (controller.signal.aborted) return;
          LOG(`Endpoint ${OVERPASS_ENDPOINTS[index]} failed/timed out, trying next...`);
          await tryFetch(index + 1);
        }
      };

      tryFetch(0);
    };

    const handleViewChange = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(fetchHarbours, DEBOUNCE_MS);
    };

    // Fire immediately for current viewport, then on every move/zoom
    fetchHarbours();
    map.on('moveend', handleViewChange);
    map.on('zoomend', handleViewChange);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
      map.off('moveend', handleViewChange);
      map.off('zoomend', handleViewChange);
    };
  }, [map, visible]);

  // ── Click handler → Meteogramm popup ──────────────────────────────────────
  useEffect(() => {
    if (!map || !visible) return;

    const handleClick = (e: maplibregl.MapLayerMouseEvent) => {
      console.log('[OSM Harbours] Click detected!', e.features);
      const feature = e.features?.[0];
      if (!feature || feature.geometry.type !== 'Point') return;

      const [lon, lat] = feature.geometry.coordinates as [number, number];
      const name = (feature.properties?.name as string) || 'Harbour';

      // Unmount any previous React root and close previous popup
      if (popupRootRef.current) {
        popupRootRef.current.unmount();
        popupRootRef.current = null;
      }
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }

      const container = document.createElement('div');
      container.style.cssText = 'min-width:280px;';

      const nameEl = document.createElement('div');
      nameEl.className = 'seayou-harbour-name';
      nameEl.textContent = name;
      container.appendChild(nameEl);

      const coordEl = document.createElement('div');
      coordEl.className = 'seayou-harbour-coords';
      coordEl.textContent = `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
      container.appendChild(coordEl);

      const chartContainer = document.createElement('div');
      container.appendChild(chartContainer);

      const root = createRoot(chartContainer);
      root.render(<MeteogramChart lat={lat} lon={lon} name={name} />);
      popupRootRef.current = root;

      const popup = new maplibregl.Popup({
        maxWidth: '320px',
        closeButton: true,
        className: 'seayou-harbour-popup-container',
      })
        .setLngLat([lon, lat])
        .setDOMContent(container)
        .addTo(map);

      popup.on('close', () => {
        popupRootRef.current?.unmount();
        popupRootRef.current = null;
        popupRef.current = null;
      });
      popupRef.current = popup;
    };

    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('click', LAYER_ID, handleClick);
    map.on('mouseenter', LAYER_ID, handleMouseEnter);
    map.on('mouseleave', LAYER_ID, handleMouseLeave);

    return () => {
      map.off('click', LAYER_ID, handleClick);
      map.off('mouseenter', LAYER_ID, handleMouseEnter);
      map.off('mouseleave', LAYER_ID, handleMouseLeave);
      popupRootRef.current?.unmount();
      popupRootRef.current = null;
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
    };
  }, [map, visible]);

  return null;
}

export default OpenSeaMapHarboursLayerML;
