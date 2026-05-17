/**
 * NOAA ENC Layer — Phase 7.
 *
 * Toggleable Electronic Navigational Chart overlay backed by NOAA's
 * public ArcGIS MapServer dynamic export endpoint (US waters only).
 *
 * Uses MapLibre's `type: 'image'` source updated on every `moveend` so the
 * export URL always reflects the current map bounds. The `/export` endpoint
 * renders a single image for the requested bbox — it is not a tile service
 * and does not support the `{z}/{y}/{x}` or `{bbox-epsg-3857}` patterns.
 */
import { useEffect } from 'react';
import type maplibregl from 'maplibre-gl';
import { useMap } from '../useMap';
import { boundsToCorners } from '../../../hooks/useCanvasSourceLayer';

const SOURCE_ID = 'noaa-enc-source';
const LAYER_ID = 'noaa-enc-layer';
const NOAA_BASE = 'https://gis.charttools.noaa.gov/arcgis/rest/services/MCS/ENCOnline/MapServer/export';

function buildNoaaUrl(map: maplibregl.Map): string {
  const b = map.getBounds();
  return `${NOAA_BASE}?bbox=${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}` +
    `&bboxSR=4326&size=1024,1024&imageSR=3857&format=png32&transparent=true&f=image`;
}

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
      const b = map.getBounds();
      const coords = boundsToCorners(
        b.getWest(), b.getEast(), b.getSouth(), b.getNorth()
      );

      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: 'image',
          url: buildNoaaUrl(map),
          coordinates: coords,
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

    const handleMoveEnd = () => {
      const src = map.getSource(SOURCE_ID) as maplibregl.ImageSource | undefined;
      if (!src) return;
      const b = map.getBounds();
      src.updateImage({
        url: buildNoaaUrl(map),
        coordinates: boundsToCorners(b.getWest(), b.getEast(), b.getSouth(), b.getNorth()),
      });
    };

    if (map.isStyleLoaded()) addLayer();
    else map.once('styledata', addLayer);

    map.on('moveend', handleMoveEnd);

    return () => {
      map.off('styledata', addLayer);
      map.off('moveend', handleMoveEnd);
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
