/**
 * OpenSeaMapSubLayerML — Generic raster sub-layer for OpenSeaMap tile overlays
 *
 * A parameterized version of the OpenSeaMapLayerML dual-layer pattern for
 * additional OpenSeaMap tile services. Accepts a tile URL, source/layer IDs,
 * visibility, and opacity — handles the rest identically to the main ENC layer:
 *
 *   1. BACKING layer — brightness forced to max at 20% opacity (white glow on
 *      black ink for dark-mode legibility, transparent pixels stay transparent)
 *   2. MAIN layer — zero raster-* adjustments (native PNG colours preserved)
 *
 * This component does NOT manage projection. It is always mounted as a child
 * of the ENC toggle which already forced mercator via OpenSeaMapLayerML.
 * If visible independently of ENC, the caller is responsible for projection.
 *
 * Supported tile layers:
 *   Marine Profile  https://tiles.openseamap.org/marine_profile/{z}/{x}/{y}.png
 *   Compass Rose    https://tiles.openseamap.org/compass/{z}/{x}/{y}.png
 *   Depth Contours  https://tiles.openseamap.org/depth/{z}/{x}/{y}.png
 *
 * Phase 8 — Pro Navigation Engine (ENC overlay)
 */

import { useEffect, useRef } from 'react';
import { useMap } from '../useMap';

// ─── Types ───

export interface OpenSeaMapSubLayerMLProps {
  visible: boolean;
  opacity?: number;
  tileUrl: string;
  sourceId: string;
  layerId: string;
  backingLayerId: string;
  attribution?: string;
  tileSize?: 256 | 512;
}

// ─── Component ───

export function OpenSeaMapSubLayerML({
  visible,
  opacity = 0.85,
  tileUrl,
  sourceId,
  layerId,
  backingLayerId,
  attribution,
  tileSize = 256,
}: OpenSeaMapSubLayerMLProps) {
  const map = useMap();
  const addedRef = useRef(false);

  // ── Layer lifecycle ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!map) return;

    const setupLayer = () => {
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: 'raster',
          tiles: [tileUrl],
          tileSize,
          ...(attribution ? { attribution } : {}),
        });
      }

      // BACKING: white glow for dark-mode text legibility
      if (!map.getLayer(backingLayerId)) {
        map.addLayer({
          id: backingLayerId,
          type: 'raster',
          source: sourceId,
          paint: {
            'raster-opacity': 0.85,
            'raster-fade-duration': 0,
            'raster-brightness-min': 1,
            'raster-brightness-max': 1,
          },
          layout: { visibility: 'visible' },
        });
      } else {
        map.setLayoutProperty(backingLayerId, 'visibility', 'visible');
        map.setPaintProperty(backingLayerId, 'raster-opacity', 0.85);
      }

      // MAIN: native PNG colours, zero adjustments
      if (!map.getLayer(layerId)) {
        map.addLayer({
          id: layerId,
          type: 'raster',
          source: sourceId,
          paint: {
            'raster-opacity': opacity,
            'raster-fade-duration': 0,
          },
          layout: { visibility: 'visible' },
        });
      } else {
        map.setLayoutProperty(layerId, 'visibility', 'visible');
        map.setPaintProperty(layerId, 'raster-opacity', opacity);
      }

      addedRef.current = true;
    };

    const teardownLayer = () => {
      try {
        if (map.getLayer(backingLayerId)) map.removeLayer(backingLayerId);
        if (map.getLayer(layerId))        map.removeLayer(layerId);
        if (map.getSource(sourceId))      map.removeSource(sourceId);
      } catch {
        // Map disposed or in transition
      }
      addedRef.current = false;
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
        if (addedRef.current) teardownLayer();
      };
    } else if (addedRef.current) {
      teardownLayer();
    }

    return () => {
      if (addedRef.current) teardownLayer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, visible]);

  // ── Opacity sync ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!map || !visible || !addedRef.current) return;
    try {
      if (map.getLayer(layerId))
        map.setPaintProperty(layerId, 'raster-opacity', opacity);
      if (map.getLayer(backingLayerId))
        map.setPaintProperty(backingLayerId, 'raster-opacity', 0.85);
    } catch { /* transitioning */ }
  }, [map, visible, opacity, layerId, backingLayerId]);

  return null;
}

export default OpenSeaMapSubLayerML;
