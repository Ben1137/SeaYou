/**
 * NOAA ENC Layer — Phase 7.
 *
 * Toggleable Electronic Navigational Chart overlay backed by NOAA's
 * ArcGIS MapServer export endpoint using MapLibre's {bbox-epsg-3857} token.
 * MapLibre substitutes per-tile Web Mercator bounding boxes automatically,
 * requesting 256×256 chunks at the correct zoom level and scale.
 *
 * Tile service: gis.charttools.noaa.gov/arcgis/rest/services/MCS/ENCOnline/MapServer/export
 * No API key required.
 */
import { useEffect, useRef } from 'react';
import { useMap } from '../useMap';

const SOURCE_ID = 'noaa-enc-source-v9';
const LAYER_ID = 'noaa-enc-layer-v9';
// Single-file Vercel edge function at /api/noaa (api/noaa.ts) hardcodes
// the upstream MaritimeChartService export URL and forwards every query
// string param to it.  This replaces the previous /api/noaa/[...path].ts
// catch-all which Vercel's edge router was 404-ing on multi-segment paths
// on this Vite-preset + Turbo monorepo deployment.
//
// NOAA's ArcGIS server returns no Access-Control-Allow-Origin header, so
// the server-side proxy is still required to bypass CORS.  The actual
// chart imagery is rendered by NOAA's MaritimeChartService extension
// (the parent /MapServer/export returns near-empty ~900 B PNGs because
// no ENC layers are mounted at that level).
//
// cb=v4 evicts any stale Vercel Edge CDN entries from the previous broken
// routing windows.  Drop in a follow-up PR once verified.
const NOAA_TILE_URL =
  '/api/noaa' +
  '?bbox={bbox-epsg-3857}&bboxSR=3857&size=256,256&imageSR=3857&format=png32&transparent=true&f=image&cb=v4';

export interface NOAAEncLayerMLProps {
  enabled: boolean;
  /** 0..1 — defaults to 0.85 so land contours from the basemap show through. */
  opacity?: number;
}

export const NOAAEncLayerML: React.FC<NOAAEncLayerMLProps> = ({
  enabled,
  opacity = 0.85,
}) => {
  const map = useMap();
  const addedRef = useRef(false);

  // Add / remove the layer when `enabled` or `map` changes
  useEffect(() => {
    if (!map) return;

    const setupLayer = () => {
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: 'raster',
          tiles: [NOAA_TILE_URL],
          tileSize: 256,
          bounds: [-180, 10, -45, 75],
          minzoom: 5,
          maxzoom: 18,
          attribution:
            '<a href="https://nauticalcharts.noaa.gov/" target="_blank" rel="noopener">NOAA ENC</a>',
        });
      }
      if (!map.getLayer(LAYER_ID)) {
        map.addLayer({
          id: LAYER_ID,
          type: 'raster',
          source: SOURCE_ID,
          paint: { 'raster-opacity': opacity },
          layout: { visibility: 'visible' },
        });
      } else {
        map.setLayoutProperty(LAYER_ID, 'visibility', 'visible');
        map.setPaintProperty(LAYER_ID, 'raster-opacity', opacity);
      }
      addedRef.current = true;
    };

    const teardownLayer = () => {
      try {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch {
        /* style torn down already — safe to ignore */
      }
      addedRef.current = false;
    };

    if (enabled) {
      if (map.isStyleLoaded()) {
        setupLayer();
      } else {
        const onStyleLoad = () => {
          setupLayer();
          map.off('style.load', onStyleLoad);
        };
        map.on('style.load', onStyleLoad);
        return () => map.off('style.load', onStyleLoad);
      }
    } else if (addedRef.current) {
      teardownLayer();
    }

    return () => {
      if (addedRef.current) teardownLayer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, enabled]);

  // Update opacity in-place when it changes (without recreating the layer)
  useEffect(() => {
    if (!map || !enabled || !addedRef.current) return;
    try {
      if (map.getLayer(LAYER_ID)) {
        map.setPaintProperty(LAYER_ID, 'raster-opacity', opacity);
      }
    } catch {
      // Ignore — layer might be transitioning
    }
  }, [map, enabled, opacity]);

  return null;
};
