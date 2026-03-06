/**
 * PrecipitationLayerML - WebGL heatmap for precipitation intensity
 * Phase 6B: Forecast layers using GenericHeatmapEngine
 *
 * Data source: Open-Meteo Forecast API — precipitation (mm/h)
 * Range: 0 (dry) → 15 mm/h (extreme rain)
 * Normalization: 'max-value' (maxValue = 15)
 * Discard: < 0.05 mm/h (dry cells fully transparent)
 * Fade range: 0.2 mm/h smoothstep to fade in drizzle gently
 * Land mask: OFF — precipitation falls everywhere
 */

import { useEffect, useRef, useCallback } from 'react';
import { useMap } from '../useMap';
import { createGenericHeatmapLayer, type GenericHeatmapLayer } from '../../../webgl/GenericHeatmapEngine';
import { PRECIPITATION_COLORS } from '../../../webgl/ColorRamps';
import { getSafeBeforeId } from '../../../utils/mapLayerUtils';
import type { ForecastGridData } from '@seame/core';

export interface PrecipitationLayerMLProps {
  visible: boolean;
  opacity?: number;
  maxPrecip?: number;   // Default: 15 mm/h (normalisation ceiling)
  sharedGridData?: ForecastGridData | null;
}

export function PrecipitationLayerML({
  visible,
  opacity = 0.7,
  maxPrecip = 15,
  sharedGridData,
}: PrecipitationLayerMLProps) {
  const map = useMap();
  const layerRef = useRef<GenericHeatmapLayer | null>(null);
  const layerAddedRef = useRef(false);

  const processGridData = useCallback((gridData: ForecastGridData) => {
    if (!gridData?.points?.length || !layerRef.current) return;

    const lats = [...new Set(gridData.points.map(p => p.lat))].sort((a, b) => a - b);
    const lons = [...new Set(gridData.points.map(p => p.lng))].sort((a, b) => a - b);

    if (lats.length < 2 || lons.length < 2) return;

    const precipMap = new Map<string, number>();
    gridData.points.forEach(point => {
      const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
      precipMap.set(key, point.precipitation !== undefined ? point.precipitation : NaN);
    });

    const grid: number[][] = [];
    for (let latIdx = 0; latIdx < lats.length; latIdx++) {
      const row: number[] = [];
      for (let lonIdx = 0; lonIdx < lons.length; lonIdx++) {
        const key = `${lats[latIdx].toFixed(4)},${lons[lonIdx].toFixed(4)}`;
        row.push(precipMap.get(key) ?? NaN);
      }
      grid.push(row);
    }

    layerRef.current.updateData(
      grid,
      lons[0], lons[lons.length - 1],
      lats[0], lats[lats.length - 1]
    );

    console.log('[PrecipitationLayerML] Data updated:', {
      gridSize: `${lons.length}x${lats.length}`,
    });
  }, []);

  // Initialize layer
  useEffect(() => {
    if (!map) return;

    const setupLayer = () => {
      if (layerAddedRef.current) return;

      try {
        const layer = createGenericHeatmapLayer('precipitation-webgl', {
          logPrefix: '[Precipitation]',
          colorRamp: PRECIPITATION_COLORS,
          normalization: 'max-value',
          maxValue: maxPrecip,
          opacity,
          useLandMask: false,
          discardBelow: 0.05,   // Hide dry cells (< 0.05 mm/h)
          fadeRange: 0.2,       // Gentle fade-in for drizzle
        });

        layerRef.current = layer;

        const beforeId = getSafeBeforeId(map);
        const safeBeforeId = beforeId && map.getLayer(beforeId) ? beforeId : undefined;

        if (!map.getLayer('precipitation-webgl')) {
          map.addLayer(layer, safeBeforeId);
        }
        layerAddedRef.current = true;

        console.log('[PrecipitationLayerML] Layer added', safeBeforeId ? `before "${safeBeforeId}"` : '(top)');
      } catch (error) {
        console.error('[PrecipitationLayerML] Failed to add layer:', error);
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
          if (map.getLayer('precipitation-webgl')) {
            map.removeLayer('precipitation-webgl');
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

export default PrecipitationLayerML;
