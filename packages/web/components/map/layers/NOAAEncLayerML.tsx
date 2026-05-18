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
import { useEffect } from 'react';
import { useMap } from '../useMap';

const SOURCE_ID = 'noaa-enc-source-v7';
const LAYER_ID = 'noaa-enc-layer-v7';
// Route through /api/noaa/ proxy to bypass CORS — NOAA's ArcGIS server returns
// no Access-Control-Allow-Origin header, so direct browser fetches are blocked.
// Vercel rewrites /api/noaa/* → gis.charttools.noaa.gov/arcgis/rest/services/*
//
// IMPORTANT: real ENC chart imagery is rendered by the MaritimeChartService
// extension, NOT by the parent MapServer. The parent /MapServer/export endpoint
// returns near-empty (~900 B) PNGs because no ENC layers are mounted at that
// level. The extension's /exts/MaritimeChartService/MapServer/export endpoint
// is the one that renders S-57/S-63 chart data — confirmed against
// gis.charttools.noaa.gov directly (~10–35 kB PNGs in US waters).
const NOAA_TILE_URL =
  '/api/noaa/MCS/ENCOnline/MapServer/exts/MaritimeChartService/MapServer/export' +
  '?bbox={bbox-epsg-3857}&bboxSR=3857&size=256,256&imageSR=3857&format=png32&transparent=true&f=image';

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

  useEffect(() => {
    if (!map || !enabled) return;

    const addLayer = () => {
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
        });
      } else {
        map.setPaintProperty(LAYER_ID, 'raster-opacity', opacity);
      }
    };

    if (map.isStyleLoaded()) addLayer();
    else map.once('styledata', addLayer);

    return () => {
      map.off('styledata', addLayer);
      try {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch {
        /* style torn down already — safe to ignore */
      }
    };
  }, [map, enabled, opacity]);

  return null;
};
