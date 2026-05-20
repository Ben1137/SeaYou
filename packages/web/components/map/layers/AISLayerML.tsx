/**
 * AISLayerML — Phase 5 (hardened Task 6).
 *
 * Renders nearby AIS vessels as oriented triangles on the map. The
 * triangle rotation tracks each vessel's COG, and the fill color darkens
 * with vessel speed so fast movers pop against a fleet of anchored
 * boats. The layer automatically follows the viewport bbox so the
 * aisstream subscription re-scopes as the user pans.
 *
 * Security: API key is held server-side in the Supabase Edge Function relay.
 * The direct WebSocket path (VITE_AISSTREAM_API_KEY) remains available for
 * local development when no authenticated session exists.
 */
import React, { useEffect, useRef, useState } from 'react';
import type { GeoJSONSource } from 'maplibre-gl';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const map = useMap();
  const bboxTimer = useRef<number | null>(null);

  const [showDisclaimer, setShowDisclaimer] = useState(
    () => localStorage.getItem('ais_disclaimer_dismissed') !== 'true',
  );
  const [isZoomedOut, setIsZoomedOut] = useState(false);

  const dismissDisclaimer = () => {
    localStorage.setItem('ais_disclaimer_dismissed', 'true');
    setShowDisclaimer(false);
  };

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
      // 1500ms: long enough that a continuous pan-zoom gesture doesn't
      // spam new EventSource connections (AISStream free tier caps at 1
      // concurrent upstream WS, so spam-reconnecting can lock us out).
      bboxTimer.current = window.setTimeout(pushBBox, 1500);
    };

    // Initial sync + live updates.
    pushBBox();
    map.on('moveend', scheduleBBox);
    aisService.on('targets', refresh);
    aisService.on('zoomedOut', setIsZoomedOut);

    return () => {
      map.off('styledata', ensureLayer);
      aisService.off('targets', refresh);
      aisService.off('zoomedOut', setIsZoomedOut);
      if (bboxTimer.current) window.clearTimeout(bboxTimer.current);
      try {
        map.off('moveend', scheduleBBox);
        if (map && map.getLayer(AIS_LAYER_ID)) map.removeLayer(AIS_LAYER_ID);
        if (map && map.getSource(AIS_SOURCE_ID)) map.removeSource(AIS_SOURCE_ID);
      } catch (_e) {
        // map already destroyed
      }
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

  return (
    <>
      {showDisclaimer && visible && (
        <div className="absolute bottom-20 left-2 right-2 z-50 bg-slate-900/95 border border-amber-500/40 rounded-xl p-3 shadow-xl">
          <div className="flex items-start gap-2">
            <span className="text-amber-400 text-base mt-0.5" aria-hidden="true">
              &#9888;
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white/80 leading-snug">
                {t(
                  'ais.disclaimer',
                  'AIS positions are crowd-sourced and may be delayed, missing, or inaccurate. SeaYou is not a collision-avoidance system. Always keep a proper visual lookout.',
                )}
              </p>
            </div>
            <button
              onClick={dismissDisclaimer}
              className="text-white/50 hover:text-white shrink-0 text-lg leading-none"
              aria-label={t('ais.disclaimer_dismiss', 'Got it')}
            >
              &times;
            </button>
          </div>
        </div>
      )}
      {visible && isZoomedOut && !showDisclaimer && (
        <div className="absolute top-16 left-4 right-4 z-400 bg-amber-100 border border-amber-400 text-amber-900 px-3 py-2 rounded-lg text-sm pointer-events-none shadow rtl:left-auto rtl:right-4">
          {t('ais.zoomInPrompt', 'Zoom in to see live vessel positions')}
        </div>
      )}
    </>
  );
};
