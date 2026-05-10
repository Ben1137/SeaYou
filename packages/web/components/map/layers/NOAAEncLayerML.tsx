/**
 * NOAA ENC Layer — Phase 7.
 *
 * Toggleable Electronic Navigational Chart overlay backed by NOAA's
 * public ArcGIS MapServer tiles (US waters only). Mounts when
 * `enabled` is true; tears itself down on unmount / toggle-off.
 *
 * Tile service: gis.charttools.noaa.gov/arcgis/rest/.../ENCOnline/MapServer
 * No API key required. Tiles are cached browser-side via HTTP.
 */
import { useEffect } from 'react';
import { useMap } from '../useMap';
import { getNOAAChartTileUrl } from '../../../services/noaaChartService';

const SOURCE_ID = 'noaa-enc-source';
const LAYER_ID = 'noaa-enc-layer';

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
          tiles: [getNOAAChartTileUrl('enc')],
          tileSize: 256,
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
    else map.once('style.load', addLayer);

    return () => {
      map.off('style.load', addLayer);
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
