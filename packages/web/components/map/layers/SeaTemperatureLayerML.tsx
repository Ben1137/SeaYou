/**
 * SeaTemperatureLayerML - Canvas Source architecture for Sea Temperature
 *
 * Renders sea temperature data to an offscreen canvas via GenericHeatmapEngine,
 * then uses MapLibre's CanvasSource to drape it onto the globe.
 *
 * Data flow:
 *   First load  → updateData() + render() (hard set, nothing to blend from)
 *   Subsequent  → updateNextData() + rAF blend 0→1 over BLEND_DURATION_MS
 *                  → at blend=1 promote next→current via updateData()
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useMap } from '../useMap';
import { createGenericHeatmapEngine, type GenericHeatmapEngine } from '../../../webgl/GenericHeatmapEngine';
import { createOffscreenCanvas, type OffscreenCanvasHandle } from '../../../webgl/OffscreenCanvasManager';
import { useCanvasSourceLayer, boundsToCorners } from '../../../hooks/useCanvasSourceLayer';
import { TEMPERATURE_COLORS } from '../../../webgl/ColorRamps';
import { getMarineBeforeId } from '../../../utils/mapLayerUtils';
import type { MarineGridData } from '@seame/core';

export interface SeaTemperatureLayerMLProps {
  visible: boolean;
  opacity?: number;
  minTemp?: number;
  maxTemp?: number;
  sharedGridData?: MarineGridData | null;
  /** Optional instance ID to avoid source/layer collisions when multiple instances exist */
  instanceId?: string;
}

/** Duration of the cross-fade between consecutive data frames (ms). */
const BLEND_DURATION_MS = 2000;

export function SeaTemperatureLayerML({
  visible,
  opacity = 0.6,
  minTemp = -2,
  maxTemp = 35,
  sharedGridData,
  instanceId = 'sea-temp',
}: SeaTemperatureLayerMLProps) {
  const SOURCE_ID = `${instanceId}-canvas-src`;
  const LAYER_ID = `${instanceId}-canvas-layer`;
  const map = useMap();
  const mapRef = useRef(map);
  mapRef.current = map;
  const engineRef = useRef<GenericHeatmapEngine | null>(null);
  const canvasHandleRef = useRef<OffscreenCanvasHandle | null>(null);
  const isFirstLoadRef = useRef(true);
  const rafRef = useRef<number | null>(null);         // Blend animation rAF
  const renderRafRef = useRef<number | null>(null);   // Continuous render loop rAF
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);

  // Create engine + offscreen canvas on mount
  useEffect(() => {
    const handle = createOffscreenCanvas(instanceId, 1024, 1024);
    canvasHandleRef.current = handle;

    const engine = createGenericHeatmapEngine({
      logPrefix: '[SeaTemperature]',
      colorRamp: TEMPERATURE_COLORS,
      normalization: 'range',
      minValue: minTemp,
      maxValue: maxTemp,
      validRange: [-2, 40],
      opacity: 1.0, // Full internal alpha — raster-opacity controls visible opacity
      useLandMask: false,
    });
    engine.init(handle.canvas);
    engineRef.current = engine;
    setCanvasElement(handle.canvas); // Trigger re-render so useCanvasSourceLayer hook sees the canvas

    console.log('[SeaTemperatureLayerML] Engine + offscreen canvas created');

    // Continuous render loop — ensures MapLibre captures the canvas after CanvasSource attaches
    let destroyed = false;
    const animate = () => {
      if (destroyed) return;
      if (engineRef.current) {
        engineRef.current.render();
        mapRef.current?.triggerRepaint();
      }
      renderRafRef.current = requestAnimationFrame(animate);
    };
    renderRafRef.current = requestAnimationFrame(animate);

    return () => {
      destroyed = true;
      if (renderRafRef.current !== null) {
        cancelAnimationFrame(renderRafRef.current);
        renderRafRef.current = null;
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      isFirstLoadRef.current = true;
      // Destroy immediately — free the WebGL context before a new layer can mount
      engineRef.current?.destroy();
      engineRef.current = null;
      canvasHandleRef.current?.destroy();
      canvasHandleRef.current = null;
    };
  }, []);

  // Register CanvasSource + raster layer via hook
  const beforeId = map ? getMarineBeforeId(map) : undefined;
  const { updateCoordinates } = useCanvasSourceLayer({
    map,
    sourceId: SOURCE_ID,
    layerId: LAYER_ID,
    canvas: canvasElement,
    beforeId,
    opacity,
    visible,
  });

  // Process grid data and update the engine
  const processGridData = useCallback((gridData: MarineGridData) => {
    if (!gridData?.points?.length) return;
    if (!engineRef.current) return;

    const lats = [...new Set(gridData.points.map(p => p.lat))].sort((a, b) => a - b);
    const lons = [...new Set(gridData.points.map(p => p.lng))].sort((a, b) => a - b);

    const gridHeight = lats.length;
    const gridWidth = lons.length;

    const tempMap = new Map<string, number>();
    gridData.points.forEach(point => {
      const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
      tempMap.set(key, point.isOcean ? (point.seaTemperature ?? NaN) : NaN);
    });

    const grid: number[][] = [];
    for (let latIdx = 0; latIdx < gridHeight; latIdx++) {
      const row: number[] = [];
      for (let lonIdx = 0; lonIdx < gridWidth; lonIdx++) {
        const key = `${lats[latIdx].toFixed(4)},${lons[lonIdx].toFixed(4)}`;
        row.push(tempMap.get(key) ?? NaN);
      }
      grid.push(row);
    }

    const actualMinLon = lons[0];
    const actualMaxLon = lons[lons.length - 1];
    const actualMinLat = lats[0];
    const actualMaxLat = lats[lats.length - 1];

    // Update CanvasSource coordinates
    const newCorners = boundsToCorners(actualMinLon, actualMaxLon, actualMinLat, actualMaxLat);
    updateCoordinates(newCorners);

    const engine = engineRef.current;

    if (isFirstLoadRef.current) {
      // First load — hard set, no blend animation
      engine.updateData(grid, actualMinLon, actualMaxLon, actualMinLat, actualMaxLat);
      engine.render();
      map?.triggerRepaint();
      isFirstLoadRef.current = false;
    } else {
      // Subsequent loads — animate blend 0→1
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      engine.updateNextData(grid, actualMinLon, actualMaxLon, actualMinLat, actualMaxLat);
      engine.setBlend(0);
      engine.render();
      map?.triggerRepaint();

      const start = performance.now();
      const animate = (now: number) => {
        const progress = Math.min((now - start) / BLEND_DURATION_MS, 1.0);
        engine.setBlend(progress);
        engine.render();
        map?.triggerRepaint();
        if (progress < 1.0) {
          rafRef.current = requestAnimationFrame(animate);
        } else {
          // Promote next → current
          engine.updateData(grid, actualMinLon, actualMaxLon, actualMinLat, actualMaxLat);
          engine.setBlend(0);
          engine.render();
          map?.triggerRepaint();
          rafRef.current = null;
        }
      };
      rafRef.current = requestAnimationFrame(animate);
    }

    console.log('[SeaTemperatureLayerML] Data updated:', {
      gridWidth,
      gridHeight,
      bounds: { actualMinLon, actualMaxLon, actualMinLat, actualMaxLat },
    });
  }, [updateCoordinates]);

  // Opacity is controlled by raster-opacity in useCanvasSourceLayer — no engine update needed

  // Process shared grid data when it arrives or changes
  useEffect(() => {
    if (!visible || !sharedGridData) return;
    processGridData(sharedGridData);
  }, [visible, sharedGridData, processGridData]);

  return null;
}

export default SeaTemperatureLayerML;
