/**
 * AirTemperatureLayerML - WebGL heatmap for 2-metre air temperature
 * Phase 6B: Forecast layers using GenericHeatmapEngine
 *
 * Data source: Open-Meteo Forecast API — temperature_2m (°C)
 * Range: -20°C (arctic cold) → 50°C (extreme heat)
 * Normalization: 'range' (-20 to 50)
 * Land mask: OFF — air temperature is valid everywhere (land + ocean)
 */

import { useEffect, useRef, useCallback } from 'react';
import { useMap } from '../useMap';
import { createGenericHeatmapLayer, type GenericHeatmapLayer } from '../../../webgl/GenericHeatmapEngine';
import { AIR_TEMPERATURE_COLORS } from '../../../webgl/ColorRamps';
import { getSafeBeforeId } from '../../../utils/mapLayerUtils';
import type { ForecastGridData } from '@seame/core';

export interface AirTemperatureLayerMLProps {
  visible: boolean;
  opacity?: number;
  minTemp?: number;   // Default: -20°C
  maxTemp?: number;   // Default: 50°C
  sharedGridData?: ForecastGridData | null;
}

export function AirTemperatureLayerML({
  visible,
  opacity = 0.6,
  minTemp = -20,
  maxTemp = 50,
  sharedGridData,
}: AirTemperatureLayerMLProps) {
  const map = useMap();
  const layerRef = useRef<GenericHeatmapLayer | null>(null);
  const layerAddedRef = useRef(false);

  // Process grid data → 2D number[][] for the engine
  const processGridData = useCallback((gridData: ForecastGridData) => {
    if (!gridData?.points?.length || !layerRef.current) return;

    const lats = [...new Set(gridData.points.map(p => p.lat))].sort((a, b) => a - b);
    const lons = [...new Set(gridData.points.map(p => p.lng))].sort((a, b) => a - b);

    if (lats.length < 2 || lons.length < 2) return;

    const tempMap = new Map<string, number>();
    gridData.points.forEach(point => {
      const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
      // temperature2m is valid everywhere; NaN for missing data
      tempMap.set(key, point.temperature2m !== undefined ? point.temperature2m : NaN);
    });

    const grid: number[][] = [];
    for (let latIdx = 0; latIdx < lats.length; latIdx++) {
      const row: number[] = [];
      for (let lonIdx = 0; lonIdx < lons.length; lonIdx++) {
        const key = `${lats[latIdx].toFixed(4)},${lons[lonIdx].toFixed(4)}`;
        row.push(tempMap.get(key) ?? NaN);
      }
      grid.push(row);
    }

    layerRef.current.updateData(
      grid,
      lons[0], lons[lons.length - 1],
      lats[0], lats[lats.length - 1]
    );

    console.log('[AirTemperatureLayerML] Data updated:', {
      gridSize: `${lons.length}x${lats.length}`,
    });
  }, []);

  // Initialize layer
  useEffect(() => {
    if (!map) return;

    const setupLayer = () => {
      if (layerAddedRef.current) return;

      try {
        const layer = createGenericHeatmapLayer('air-temperature-webgl', {
          logPrefix: '[AirTemperature]',
          colorRamp: AIR_TEMPERATURE_COLORS,
          normalization: 'range',
          minValue: minTemp,
          maxValue: maxTemp,
          opacity,
          useLandMask: false, // Valid everywhere — no land mask needed
          discardBelow: 0,    // No threshold — even cold arctic temps shown
          fadeRange: 0,       // No smoothstep — hard cutoff at alpha=0
        });

        layerRef.current = layer;

        const beforeId = getSafeBeforeId(map);
        const safeBeforeId = beforeId && map.getLayer(beforeId) ? beforeId : undefined;

        if (!map.getLayer('air-temperature-webgl')) {
          map.addLayer(layer, safeBeforeId);
        }
        layerAddedRef.current = true;

        console.log('[AirTemperatureLayerML] Layer added', safeBeforeId ? `before "${safeBeforeId}"` : '(top)');
      } catch (error) {
        console.error('[AirTemperatureLayerML] Failed to add layer:', error);
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
          if (map.getLayer('air-temperature-webgl')) {
            map.removeLayer('air-temperature-webgl');
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

export default AirTemperatureLayerML;
