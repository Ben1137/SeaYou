/**
 * OpenSeaMapSubLayerML — Generic raster sub-layer for OpenSeaMap tile overlays
 *
 * A parameterised wrapper for the monochrome OpenSeaMap tile services
 * (Marine Profile, Compass Rose, Depth Contours). All three services produce
 * black ink on a transparent PNG background. On a dark basemap the black lines
 * are invisible, so we apply raster-brightness-min/max = 1 to invert them to
 * white while keeping the transparent areas transparent.
 *
 * A single layer is all that is needed — no "white backing + black main" trick.
 * That dual-layer pattern only helps when tiles contain coloured symbols (red/
 * green buoys etc.). For purely monochrome tiles it causes the black main layer
 * to perfectly occlude the white backing layer, leaving invisible black lines.
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

      // Single layer — brightness forced to 1 turns black ink into white lines
      // while the transparent background remains fully transparent.
      if (!map.getLayer(layerId)) {
        map.addLayer({
          id: layerId,
          type: 'raster',
          source: sourceId,
          paint: {
            'raster-opacity': opacity,
            'raster-fade-duration': 0,
            'raster-brightness-min': 1,
            'raster-brightness-max': 1,
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
        if (map.getLayer(layerId))   map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
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
    } catch { /* transitioning */ }
  }, [map, visible, opacity, layerId]);

  return null;
}

export default OpenSeaMapSubLayerML;
