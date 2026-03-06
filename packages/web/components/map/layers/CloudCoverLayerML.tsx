/**
 * CloudCoverLayerML - WebGL heatmap for cloud cover fraction
 * Phase 6B: Forecast layers using GenericHeatmapEngine
 *
 * Data source: Open-Meteo Forecast API — cloud_cover (0–100%)
 * Range: 0 (clear sky) → 100 (full overcast)
 * Normalization: 'range' (0 to 100)
 * Discard: < 5% (completely clear pixels invisible)
 * Fade range: 10% smoothstep for gentle cloud edge transition
 * Land mask: OFF — clouds are valid everywhere
 */

import { useEffect, useRef, useCallback } from 'react';
import { useMap } from '../useMap';
import { createGenericHeatmapLayer, type GenericHeatmapLayer } from '../../../webgl/GenericHeatmapEngine';
import { CLOUD_COVER_COLORS } from '../../../webgl/ColorRamps';
import { getSafeBeforeId } from '../../../utils/mapLayerUtils';
import type { ForecastGridData } from '@seame/core';

export interface CloudCoverLayerMLProps {
  visible: boolean;
  opacity?: number;
  sharedGridData?: ForecastGridData | null;
}

export function CloudCoverLayerML({
  visible,
  opacity = 0.55,
  sharedGridData,
}: CloudCoverLayerMLProps) {
  const map = useMap();
  const layerRef = useRef<GenericHeatmapLayer | null>(null);
  const layerAddedRef = useRef(false);

  const processGridData = useCallback((gridData: ForecastGridData) => {
    if (!gridData?.points?.length || !layerRef.current) return;

    const lats = [...new Set(gridData.points.map(p => p.lat))].sort((a, b) => a - b);
    const lons = [...new Set(gridData.points.map(p => p.lng))].sort((a, b) => a - b);

    if (lats.length < 2 || lons.length < 2) return;

    const cloudMap = new Map<string, number>();
    gridData.points.forEach(point => {
      const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
      cloudMap.set(key, point.cloudCover !== undefined ? point.cloudCover : NaN);
    });

    const grid: number[][] = [];
    for (let latIdx = 0; latIdx < lats.length; latIdx++) {
      const row: number[] = [];
      for (let lonIdx = 0; lonIdx < lons.length; lonIdx++) {
        const key = `${lats[latIdx].toFixed(4)},${lons[lonIdx].toFixed(4)}`;
        row.push(cloudMap.get(key) ?? NaN);
      }
      grid.push(row);
    }

    layerRef.current.updateData(
      grid,
      lons[0], lons[lons.length - 1],
      lats[0], lats[lats.length - 1]
    );

    console.log('[CloudCoverLayerML] Data updated:', {
      gridSize: `${lons.length}x${lats.length}`,
    });
  }, []);

  // Initialize layer
  useEffect(() => {
    if (!map) return;

    const setupLayer = () => {
      if (layerAddedRef.current) return;

      try {
        const layer = createGenericHeatmapLayer('cloud-cover-webgl', {
          logPrefix: '[CloudCover]',
          colorRamp: CLOUD_COVER_COLORS,
          normalization: 'range',
          minValue: 0,
          maxValue: 100,
          opacity,
          useLandMask: false,
          discardBelow: 5,    // 5% threshold — fully clear sky stays transparent
          fadeRange: 10,      // Smooth fade from 5% → 15% cloud cover
        });

        layerRef.current = layer;

        const beforeId = getSafeBeforeId(map);
        const safeBeforeId = beforeId && map.getLayer(beforeId) ? beforeId : undefined;

        if (!map.getLayer('cloud-cover-webgl')) {
          map.addLayer(layer, safeBeforeId);
        }
        layerAddedRef.current = true;

        console.log('[CloudCoverLayerML] Layer added', safeBeforeId ? `before "${safeBeforeId}"` : '(top)');
      } catch (error) {
        console.error('[CloudCoverLayerML] Failed to add layer:', error);
      }
    };

    if (map.isStyleLoaded()) {
      setupLayer();
    } else {
      map.once('style.load', setupLayer);
    }

    return () => {
      if (map && layerAddedRef.current) {
        try {
          if (map.getLayer('cloud-cover-webgl')) {
            map.removeLayer('cloud-cover-webgl');
          }
        } catch (_) { /* ignore */ }
        layerAddedRef.current = false;
        layerRef.current = null;
      }
    };
  }, [map]);

  // Visibility
  useEffect(() => {
    layerRef.current?.setVisibility(visible);
  }, [visible]);

  // Opacity
  useEffect(() => {
    layerRef.current?.setOpacity(opacity);
  }, [opacity]);

  // Data updates
  useEffect(() => {
    if (!visible || !sharedGridData) return;
    processGridData(sharedGridData);
  }, [visible, sharedGridData, processGridData]);

  return null;
}

export default CloudCoverLayerML;
