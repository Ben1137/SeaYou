/**
 * AirTemperatureLayerML - Canvas Source architecture for Air Temperature
 *
 * Data source: Open-Meteo Forecast API — temperature_2m (°C)
 * Range: -20°C (arctic cold) → 50°C (extreme heat)
 * Normalization: 'range' (-20 to 50)
 * Land mask: OFF — air temperature is valid everywhere
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useMap } from '../useMap';
import { createGenericHeatmapEngine, type GenericHeatmapEngine } from '../../../webgl/GenericHeatmapEngine';
import { createOffscreenCanvas, type OffscreenCanvasHandle } from '../../../webgl/OffscreenCanvasManager';
import { useCanvasSourceLayer, boundsToCorners } from '../../../hooks/useCanvasSourceLayer';
import { AIR_TEMPERATURE_COLORS } from '../../../webgl/ColorRamps';
import { getAtmosphereBeforeId } from '../../../utils/mapLayerUtils';
import type { ForecastGridData } from '@seame/core';

export interface AirTemperatureLayerMLProps {
  visible: boolean;
  opacity?: number;
  minTemp?: number;
  maxTemp?: number;
  sharedGridData?: ForecastGridData | null;
}

const SOURCE_ID = 'air-temp-canvas-src';
const LAYER_ID = 'air-temp-canvas-layer';

export function AirTemperatureLayerML({
  visible,
  opacity = 0.6,
  minTemp = -20,
  maxTemp = 50,
  sharedGridData,
}: AirTemperatureLayerMLProps) {
  const map = useMap();
  const mapRef = useRef(map);
  mapRef.current = map;
  const engineRef = useRef<GenericHeatmapEngine | null>(null);
  const canvasHandleRef = useRef<OffscreenCanvasHandle | null>(null);
  const rafRef = useRef<number | null>(null);
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const handle = createOffscreenCanvas('air-temp', 1024, 1024);
    canvasHandleRef.current = handle;

    const engine = createGenericHeatmapEngine({
      logPrefix: '[AirTemperature]',
      colorRamp: AIR_TEMPERATURE_COLORS,
      normalization: 'range',
      minValue: minTemp,
      maxValue: maxTemp,
      opacity: 1.0, // Full internal alpha — raster-opacity controls visible opacity
      useLandMask: false,
      discardBelow: 0,
      fadeRange: 0,
    });
    engine.init(handle.canvas);
    engineRef.current = engine;
    setCanvasElement(handle.canvas);

    // Continuous render loop — ensures MapLibre captures the canvas after CanvasSource attaches
    let destroyed = false;
    const animate = () => {
      if (destroyed) return;
      if (engineRef.current) {
        engineRef.current.render();
        mapRef.current?.triggerRepaint();
      }
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      destroyed = true;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // Destroy immediately — free the WebGL context before a new layer can mount
      engineRef.current?.destroy();
      engineRef.current = null;
      canvasHandleRef.current?.destroy();
      canvasHandleRef.current = null;
    };
  }, []);

  const beforeId = map ? getAtmosphereBeforeId(map) : undefined;
  const { updateCoordinates } = useCanvasSourceLayer({
    map,
    sourceId: SOURCE_ID,
    layerId: LAYER_ID,
    canvas: canvasElement,
    beforeId,
    opacity,
    visible,
  });

  const processGridData = useCallback((gridData: ForecastGridData) => {
    if (!gridData?.points?.length || !engineRef.current) return;

    const lats = [...new Set(gridData.points.map(p => p.lat))].sort((a, b) => a - b);
    const lons = [...new Set(gridData.points.map(p => p.lng))].sort((a, b) => a - b);
    if (lats.length < 2 || lons.length < 2) return;

    const tempMap = new Map<string, number>();
    gridData.points.forEach(point => {
      const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
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

    const [minLon, maxLon] = [lons[0], lons[lons.length - 1]];
    const [minLat, maxLat] = [lats[0], lats[lats.length - 1]];

    const newCorners = boundsToCorners(minLon, maxLon, minLat, maxLat);
    updateCoordinates(newCorners);

    engineRef.current.updateData(grid, minLon, maxLon, minLat, maxLat);
    engineRef.current.render();
    map?.triggerRepaint();

    console.log('[AirTemperatureLayerML] Data updated:', {
      gridSize: `${lons.length}x${lats.length}`,
    });
  }, [updateCoordinates]);

  // Opacity is controlled by raster-opacity in useCanvasSourceLayer — no engine update needed

  useEffect(() => {
    if (!visible || !sharedGridData) return;
    processGridData(sharedGridData);
  }, [visible, sharedGridData, processGridData]);

  return null;
}

export default AirTemperatureLayerML;
