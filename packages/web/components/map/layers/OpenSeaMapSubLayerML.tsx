/**
 * OpenSeaMapSubLayerML — Generic raster sub-layer for OpenSeaMap tile overlays
 *
 * A parameterised wrapper for the monochrome OpenSeaMap tile services
 * (Marine Profile, Compass Rose, Depth Contours). All three services produce
 * black ink on a transparent PNG background.
 *
 * Layers render natively (no raster-brightness adjustments). Black/dark-blue ink
 * is readable because OpenSeaMapLayerML tints the basemap ocean to `#1a3a5c`
 * nautical blue while ENC is active — matching the light chart-paper background
 * these symbols were designed for.
 *
 * Note: raster-brightness-min/max = 1 must NOT be used on transparent PNGs —
 * MapLibre's GL shader forces all channels including alpha to max, compositing
 * the entire tile to transparent and making the layer invisible.
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
  /** Tile server max zoom — MapLibre overzooms above this level instead of requesting blank tiles */
  maxzoom?: number;
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
  maxzoom,
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
          ...(maxzoom !== undefined ? { maxzoom } : {}),
        });
      }

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
