/**
 * BathymetryLayerML — Global bathymetry / "Depth Charts" raster overlay.
 *
 * Uses the public GEBCO (General Bathymetric Chart of the Oceans) WMS.
 * GEBCO is truly global, CORS-open, and free. EMODnet was replaced because
 * it only covers European waters — tiles outside that region are silent
 * transparent PNGs with no HTTP error, causing invisible layers worldwide.
 *
 * Reference:
 *   https://www.gebco.net/data_and_products/gebco_web_services/web_map_service/
 *   https://wms.gebco.net/mapserv?service=WMS&request=GetCapabilities
 */

import { useEffect } from 'react';
import { useMap } from '../useMap';

export interface BathymetryLayerMLProps {
  visible: boolean;
  opacity?: number;
}

const SOURCE_ID = 'bathymetry-gebco-wms';
const LAYER_ID = 'bathymetry-gebco-wms-layer';

// GEBCO WMS — globally CORS-open seafloor depth raster.
// GEBCO_2023 is the current Grid layer; GEBCO_LATEST always points to newest.
const GEBCO_WMS_TILE_URL =
  'https://wms.gebco.net/mapserv?' +
  'service=WMS&version=1.3.0&request=GetMap' +
  '&layers=GEBCO_LATEST' +
  '&styles=' +
  '&format=image/png' +
  '&transparent=true' +
  '&crs=EPSG:3857' +
  '&width=256&height=256' +
  '&bbox={bbox-epsg-3857}';

export function BathymetryLayerML({ visible, opacity = 0.75 }: BathymetryLayerMLProps) {
  const map = useMap();

  // Add / remove the WMS raster source + layer
  useEffect(() => {
    if (!map) return;

    const setup = () => {
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: 'raster',
          tiles: [GEBCO_WMS_TILE_URL],
          tileSize: 256,
          attribution:
            'Bathymetry: <a href="https://www.gebco.net" target="_blank" rel="noopener">GEBCO</a>',
        });
      }

      if (!map.getLayer(LAYER_ID)) {
        // Insert below the first symbol layer so labels stay on top
        const layers = map.getStyle()?.layers || [];
        let beforeId: string | undefined;
        for (const l of layers) {
          if (l.type === 'symbol') {
            beforeId = l.id;
            break;
          }
        }

        map.addLayer(
          {
            id: LAYER_ID,
            type: 'raster',
            source: SOURCE_ID,
            paint: {
              'raster-opacity': opacity,
            },
            layout: {
              visibility: visible ? 'visible' : 'none',
            },
          },
          beforeId,
        );
      }
    };

    if (map.isStyleLoaded()) {
      setup();
    } else {
      map.once('style.load', setup);
    }

    return () => {
      map.off('style.load', setup);
      if (!map || !map.getStyle()) return;
      try {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch {
        // ignore cleanup errors during hot reload / unmount races
      }
    };
  }, [map]);

  // Visibility toggle
  useEffect(() => {
    if (!map) return;
    try {
      if (map.getLayer(LAYER_ID)) {
        map.setLayoutProperty(LAYER_ID, 'visibility', visible ? 'visible' : 'none');
      }
    } catch {
      // ignore
    }
  }, [map, visible]);

  // Opacity updates
  useEffect(() => {
    if (!map) return;
    try {
      if (map.getLayer(LAYER_ID)) {
        map.setPaintProperty(LAYER_ID, 'raster-opacity', opacity);
      }
    } catch {
      // ignore
    }
  }, [map, opacity]);

  return null;
}

export default BathymetryLayerML;
