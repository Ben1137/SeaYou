/**
 * BathymetryLayerML — Global bathymetry / "Depth Charts" raster overlay.
 *
 * Uses the public EMODnet Bathymetry WMS as a raster tile source. EMODnet
 * serves `Access-Control-Allow-Origin: *` so tiles load directly in the
 * browser with no proxy — avoiding any Vercel-edge vendor lock-in.
 *
 * Reference:
 *   https://emodnet.ec.europa.eu/en/bathymetry
 *   https://ows.emodnet-bathymetry.eu/wms?service=WMS&request=GetCapabilities
 */

import { useEffect } from 'react';
import { useMap } from '../useMap';

export interface BathymetryLayerMLProps {
  visible: boolean;
  opacity?: number;
}

const SOURCE_ID = 'bathymetry-emodnet-wms';
const LAYER_ID = 'bathymetry-emodnet-wms-layer';

// EMODnet Bathymetry WMS — CORS-friendly global seafloor depth raster.
// `emodnet:mean` is the DTM mean depth layer with shaded relief.
const EMODNET_WMS_TILE_URL =
  'https://ows.emodnet-bathymetry.eu/wms?' +
  'service=WMS&version=1.3.0&request=GetMap' +
  '&layers=emodnet:mean' +
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
          tiles: [EMODNET_WMS_TILE_URL],
          tileSize: 256,
          attribution:
            'Bathymetry: <a href="https://emodnet.ec.europa.eu/en/bathymetry" target="_blank" rel="noopener">EMODnet Bathymetry</a>',
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
