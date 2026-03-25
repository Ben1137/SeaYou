/**
 * SeaTemperatureLayerML - React component wrapper for WebGL Sea Temperature
 * Phase 5 → Phase 6A: Migrated to GenericHeatmapEngine
 */

import { useEffect, useRef, useCallback } from 'react';
import { useMap } from '../useMap';
import { createGenericHeatmapLayer, type GenericHeatmapLayer } from '../../../webgl/GenericHeatmapEngine';
import { TEMPERATURE_COLORS } from '../../../webgl/ColorRamps';
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
  const mapRef = useRef(map);
  mapRef.current = map;
  const layerRef = useRef<GenericHeatmapLayer | null>(null);
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
        const tempLayer = createGenericHeatmapLayer('sea-temperature-webgl', {
          logPrefix: '[SeaTemperature]',
          colorRamp: TEMPERATURE_COLORS,
          normalization: 'range',
          minValue: minTemp,
          maxValue: maxTemp,
          validRange: [-2, 40],  // Matches original shader guard: discard temp < -2 || temp > 40
          opacity,
          useLandMask: true,
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

  // Force data upload + double-tap repaint on visibility or data change.
  // When switching between layers that share the same cached gridData, React won't
  // re-trigger if the reference is identical. Re-running processGridData explicitly
  // on every visible=true ensures the WebGL texture is always populated.
  useEffect(() => {
    if (!visible || !sharedGridData || !layerRef.current) return;

    // 1. Force data upload even if gridData reference hasn't changed
    processGridData(sharedGridData);

    // 2. Double-tap repaint — guarantees MapLibre catches the painted texture
    const t1 = setTimeout(() => {
      mapRef.current?.triggerRepaint();
    }, 50);
    const t2 = setTimeout(() => {
      mapRef.current?.triggerRepaint();
    }, 150);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [visible, sharedGridData, processGridData]);

  return null;
}

export default SeaTemperatureLayerML;
