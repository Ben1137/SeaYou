/**
 * SeaTemperatureLayerML - React component wrapper for WebGL Sea Temperature
 * Phase 5: Sea surface temperature visualization
 */

import { useEffect, useRef, useCallback } from 'react';
import { useMap } from '../useMap';
import { createSeaTemperatureLayer, type SeaTemperatureLayer } from '../../../webgl/SeaTemperatureEngine';
import { getSafeBeforeId } from '../../../utils/mapLayerUtils';
import type { MarineGridData } from '@seame/core';

export interface SeaTemperatureLayerMLProps {
  visible: boolean;
  opacity?: number;
  minTemp?: number;
  maxTemp?: number;
  sharedGridData?: MarineGridData | null;
}

export function SeaTemperatureLayerML({
  visible,
  opacity = 0.6,
  minTemp = 10,
  maxTemp = 30,
  sharedGridData,
}: SeaTemperatureLayerMLProps) {
  const map = useMap();
  const layerRef = useRef<SeaTemperatureLayer | null>(null);
  const layerAddedRef = useRef(false);

  // Process grid data and update the WebGL layer
  const processGridData = useCallback((gridData: MarineGridData) => {
    if (!gridData || !gridData.points || gridData.points.length === 0) return;
    if (!layerRef.current) return;

    const lats = [...new Set(gridData.points.map(p => p.lat))].sort((a, b) => a - b);
    const lons = [...new Set(gridData.points.map(p => p.lng))].sort((a, b) => a - b);

    const gridHeight = lats.length;
    const gridWidth = lons.length;

    const tempMap = new Map<string, number>();
    gridData.points.forEach(point => {
      const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
      // Use NaN for land points so the encoder sets alpha=0 and the shader discards them.
      // This prevents 0°C land values from slipping through the shader's temp range check.
      tempMap.set(key, point.isOcean ? (point.seaTemperature ?? NaN) : NaN);
    });

    const grid: number[][] = [];
    for (let latIdx = 0; latIdx < gridHeight; latIdx++) {
      const row: number[] = [];
      for (let lonIdx = 0; lonIdx < gridWidth; lonIdx++) {
        const lat = lats[latIdx];
        const lon = lons[lonIdx];
        const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
        row.push(tempMap.get(key) ?? NaN);
      }
      grid.push(row);
    }

    const actualMinLon = lons[0];
    const actualMaxLon = lons[lons.length - 1];
    const actualMinLat = lats[0];
    const actualMaxLat = lats[lats.length - 1];

    layerRef.current.updateData(grid, actualMinLon, actualMaxLon, actualMinLat, actualMaxLat);

    console.log('[SeaTemperatureLayerML] Data updated:', {
      gridWidth,
      gridHeight,
      bounds: { actualMinLon, actualMaxLon, actualMinLat, actualMaxLat },
    });
  }, []);

  // Initialize the layer
  useEffect(() => {
    if (!map) return;

    const setupLayer = () => {
      if (layerAddedRef.current) return;

      try {
        const tempLayer = createSeaTemperatureLayer('sea-temperature-webgl', {
          opacity,
          minTemp,
          maxTemp,
        });

        layerRef.current = tempLayer;
        // Insert BELOW the land layer so MapLibre's land polygons naturally clip the ocean heatmap.
        // Double-guard: getSafeBeforeId checks the style spec; map.getLayer() checks runtime existence.
        const beforeId = getSafeBeforeId(map);
        const safeBeforeId = beforeId && map.getLayer(beforeId) ? beforeId : undefined;
        if (!map.getLayer('sea-temperature-webgl')) {
          map.addLayer(tempLayer, safeBeforeId);
        }
        layerAddedRef.current = true;

        console.log('[SeaTemperatureLayerML] Layer added to map', safeBeforeId ? `before "${safeBeforeId}"` : '(top)');
      } catch (error) {
        console.error('[SeaTemperatureLayerML] Failed to add layer:', error);
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
          if (map.getLayer('sea-temperature-webgl')) {
            map.removeLayer('sea-temperature-webgl');
          }
        } catch (e) {
          // Ignore
        }
        layerAddedRef.current = false;
        layerRef.current = null;
      }
    };
  }, [map]);

  // Handle visibility changes
  useEffect(() => {
    if (!layerRef.current) return;
    layerRef.current.setVisibility(visible);
  }, [visible]);

  // Handle opacity changes
  useEffect(() => {
    if (layerRef.current) {
      layerRef.current.setOpacity(opacity);
    }
  }, [opacity]);

  // Process shared grid data when it arrives or changes
  useEffect(() => {
    if (!visible || !sharedGridData) return;
    processGridData(sharedGridData);
  }, [visible, sharedGridData, processGridData]);

  return null;
}

export default SeaTemperatureLayerML;
