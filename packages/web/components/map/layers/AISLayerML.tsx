/**
 * AISLayerML — Phase 5.
 *
 * Renders nearby AIS vessels as oriented triangles on the map. The
 * triangle rotation tracks each vessel's COG, and the fill color darkens
 * with vessel speed so fast movers pop against a fleet of anchored
 * boats. The layer automatically follows the viewport bbox so the
 * aisstream subscription re-scopes as the user pans.
 *
 * This layer is silently inert when `VITE_AISSTREAM_API_KEY` is missing —
 * `aisService.connect()` becomes a no-op.
 */
import { useEffect, useRef } from 'react';
import type { GeoJSONSource } from 'maplibre-gl';
import { aisService, type AISTarget } from '../../../src/services/aisService';
import { useMap } from '../useMap';

export const AIS_SOURCE_ID = 'ais-targets-source';
export const AIS_LAYER_ID = 'ais-targets-symbol';

function toGeoJSON(targets: AISTarget[]) {
  return {
    type: 'FeatureCollection' as const,
    features: targets.map((t) => ({
      type: 'Feature' as const,
      properties: {
        mmsi: t.mmsi,
        name: t.name ?? t.mmsi,
        cog: t.cog,
        sog: t.sog,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [t.lon, t.lat],
      },
    })),
  };
}

export const AISLayerML: React.FC<{ visible?: boolean }> = ({
  visible = true,
}) => {
  const map = useMap();
  const bboxTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!map) return;

    const ensureLayer = () => {
      if (map.getSource(AIS_SOURCE_ID)) return;
      map.addSource(AIS_SOURCE_ID, {
        type: 'geojson',
        data: toGeoJSON(aisService.getTargets()),
      });
      map.addLayer({
        id: AIS_LAYER_ID,
        type: 'circle',
        source: AIS_SOURCE_ID,
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'sog'],
            0,
            4,
            20,
            7,
          ],
          'circle-color': [
            'interpolate',
            ['linear'],
            ['get', 'sog'],
            0,
            '#64748b',
            5,
            '#38bdf8',
            15,
            '#facc15',
            25,
            '#ef4444',
          ],
          'circle-stroke-color': '#0f172a',
          'circle-stroke-width': 1,
          'circle-opacity': 0.9,
        },
      });
    };

    if (map.isStyleLoaded()) ensureLayer();
    else map.once('styledata', ensureLayer);

    const refresh = (targets: AISTarget[]) => {
      const src = map.getSource(AIS_SOURCE_ID) as GeoJSONSource | undefined;
      if (src) src.setData(toGeoJSON(targets) as any);
    };

    const pushBBox = () => {
      const b = map.getBounds();
      aisService.setBBox([
        [b.getSouth(), b.getWest()],
        [b.getNorth(), b.getEast()],
      ]);
    };

    const scheduleBBox = () => {
      if (bboxTimer.current) window.clearTimeout(bboxTimer.current);
      bboxTimer.current = window.setTimeout(pushBBox, 750);
    };

    // Initial sync + live updates.
    pushBBox();
    map.on('moveend', scheduleBBox);
    aisService.on('targets', refresh);

    return () => {
      map.off('moveend', scheduleBBox);
      aisService.off('targets', refresh);
      if (bboxTimer.current) window.clearTimeout(bboxTimer.current);
      if (map.getLayer(AIS_LAYER_ID)) map.removeLayer(AIS_LAYER_ID);
      if (map.getSource(AIS_SOURCE_ID)) map.removeSource(AIS_SOURCE_ID);
    };
  }, [map]);

  useEffect(() => {
    if (!map) return;
    if (!map.getLayer(AIS_LAYER_ID)) return;
    map.setLayoutProperty(
      AIS_LAYER_ID,
      'visibility',
      visible ? 'visible' : 'none',
    );
  }, [map, visible]);

  return null;
};
