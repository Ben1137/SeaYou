/**
 * OpenSeaMapHarboursLayerML — Interactive harbour vector overlay
 *
 * Fetches OpenStreetMap harbour/port nodes from the public Overpass API for
 * the current map viewport (debounced 400ms, min zoom 8) and adds an invisible
 * GeoJSON circle layer as a click target. Clicking a harbour opens a MapLibre
 * popup containing the port name and its 5-day Meteogramm weather image from
 * weather.openportguide.de (no API key required — pure lat/lon URL).
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
 * Meteogramm URL: https://weather.openportguide.de/meteogram.php?lat=X&lon=Y&lang=en
 *
 * Phase 8 — Pro Navigation Engine (ENC overlay)
 */

import maplibregl from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { useMap } from '../useMap';

// ─── Constants ───

const SOURCE_ID  = 'osm-harbours-source';
const LAYER_ID   = 'osm-harbours-circles';

/** Minimum zoom to fire Overpass — prevents 50k-node bbox queries at world view. */
const MIN_ZOOM = 8;

/** Debounce delay after moveend/zoomend before firing the Overpass query. */
const DEBOUNCE_MS = 400;

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

const LOG = (...args: unknown[]) => console.log('[OSM Harbours]', ...args);

// ─── Helpers ───

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
  const layerReadyRef = useRef(false);

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
            // Invisible but hittable — radius matches the rendered harbour icon size
            'circle-radius': 14,
            'circle-opacity': 0,
            'circle-stroke-width': 0,
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
      if (visible) setupLayer();
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

      fetch(OVERPASS_ENDPOINT, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        signal: controller.signal,
      })
        .then((r) => r.json())
        .then((json) => {
          const elements: OverpassElement[] = json.elements ?? [];
          LOG(`received ${elements.length} harbour nodes`);
          const fc = overpassToGeoJSON(elements);
          const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
          if (src) src.setData(fc);
        })
        .catch((err) => {
          if (err.name !== 'AbortError') {
            console.warn('[OSM Harbours] fetch error:', err);
          }
        });
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
      const feature = e.features?.[0];
      if (!feature || feature.geometry.type !== 'Point') return;

      const [lon, lat] = feature.geometry.coordinates as [number, number];
      const name = (feature.properties?.name as string) || 'Harbour';
      const imgUrl =
        `https://weather.openportguide.de/meteogram.php` +
        `?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&lang=en`;

      // Close any existing harbour popup
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }

      const html = `
        <div class="seayou-harbour-popup">
          <div class="seayou-harbour-name">${escapeHtml(name)}</div>
          <div class="seayou-harbour-coords">${lat.toFixed(4)}°, ${lon.toFixed(4)}°</div>
          <img
            src="${escapeHtml(imgUrl)}"
            loading="lazy"
            width="320"
            alt="5-day weather forecast for ${escapeHtml(name)}"
            style="display:block;border-radius:6px;margin-top:8px;max-width:100%;"
            onerror="this.style.display='none';this.nextElementSibling.style.display='block';"
          />
          <div style="display:none;padding:8px;color:#94a3b8;font-size:12px;">
            Weather data unavailable for this location.
          </div>
        </div>`;

      const popup = new maplibregl.Popup({
        maxWidth: '340px',
        closeButton: true,
        className: 'seayou-harbour-popup-container',
      })
        .setLngLat([lon, lat])
        .setHTML(html)
        .addTo(map);

      popup.on('close', () => { popupRef.current = null; });
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
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
    };
  }, [map, visible]);

  return null;
}

export default OpenSeaMapHarboursLayerML;
