/**
 * GustDeltaLayerML - Wind gust delta heatmap
 *
 * Visualizes the difference between wind gusts and sustained wind speed.
 * Higher delta = more gusty and unpredictable conditions.
 * Range: 0 km/h (steady) → 35+ km/h (extreme gusts).
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useMap } from '../useMap';
import { createGenericHeatmapEngine, type GenericHeatmapEngine } from '../../../webgl/GenericHeatmapEngine';
import { createOffscreenCanvas, type OffscreenCanvasHandle } from '../../../webgl/OffscreenCanvasManager';
import { useCanvasSourceLayer, boundsToCorners } from '../../../hooks/useCanvasSourceLayer';
import { GUST_DELTA_COLORS } from '../../../webgl/ColorRamps';
import { getMarineBeforeId } from '../../../utils/mapLayerUtils';
import type { MarineGridData } from '@seame/core';

export interface GustDeltaLayerMLProps {
  visible: boolean;
  opacity?: number;
  sharedGridData?: MarineGridData | null;
  instanceId?: string;
}

const BLEND_DURATION_MS = 2000;

export function GustDeltaLayerML({
  visible,
  opacity = 0.6,
  sharedGridData,
  instanceId = 'gust-delta',
}: GustDeltaLayerMLProps) {
  const SOURCE_ID = `${instanceId}-canvas-src`;
  const LAYER_ID = `${instanceId}-canvas-layer`;
  const map = useMap();
  const mapRef = useRef(map);
  mapRef.current = map;
  const engineRef = useRef<GenericHeatmapEngine | null>(null);
  const canvasHandleRef = useRef<OffscreenCanvasHandle | null>(null);
  const isFirstLoadRef = useRef(true);
  const rafRef = useRef<number | null>(null);
  const renderRafRef = useRef<number | null>(null);
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const handle = createOffscreenCanvas(instanceId, 1024, 1024);
    canvasHandleRef.current = handle;

    const engine = createGenericHeatmapEngine({
      logPrefix: '[GustDelta]',
      colorRamp: GUST_DELTA_COLORS,
      normalization: 'range',
      minValue: 0,
      maxValue: 35, // 0-35 km/h delta range
      discardBelow: 1.0, // Hide < 1 km/h delta (essentially no gusts)
      fadeRange: 2.0,
      opacity: 1.0,
      useLandMask: false,
    });
    engine.init(handle.canvas);
    engineRef.current = engine;
    setCanvasElement(handle.canvas);

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
      if (renderRafRef.current !== null) cancelAnimationFrame(renderRafRef.current);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      isFirstLoadRef.current = true;
      engineRef.current?.destroy();
      engineRef.current = null;
      canvasHandleRef.current?.destroy();
      canvasHandleRef.current = null;
    };
  }, []);

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

  const processGridData = useCallback((gridData: MarineGridData) => {
    if (!gridData?.points?.length || !engineRef.current) return;

    const lats = [...new Set(gridData.points.map(p => p.lat))].sort((a, b) => a - b);
    const lons = [...new Set(gridData.points.map(p => p.lng))].sort((a, b) => a - b);

    const gustMap = new Map<string, number>();
    gridData.points.forEach(point => {
      const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
      const gusts = point.windGusts || 0;
      const sustained = point.windSpeed || 0;
      // Convert m/s to km/h for the delta (grid data is in m/s)
      const deltaKmh = Math.max(0, (gusts - sustained) * 3.6);
      gustMap.set(key, deltaKmh);
    });

    const grid: number[][] = [];
    for (let latIdx = 0; latIdx < lats.length; latIdx++) {
      const row: number[] = [];
      for (let lonIdx = 0; lonIdx < lons.length; lonIdx++) {
        const key = `${lats[latIdx].toFixed(4)},${lons[lonIdx].toFixed(4)}`;
        row.push(gustMap.get(key) ?? NaN);
      }
      grid.push(row);
    }

    const [minLon, maxLon] = [lons[0], lons[lons.length - 1]];
    const [minLat, maxLat] = [lats[0], lats[lats.length - 1]];
    updateCoordinates(boundsToCorners(minLon, maxLon, minLat, maxLat));

    const engine = engineRef.current;
    if (isFirstLoadRef.current) {
      engine.updateData(grid, minLon, maxLon, minLat, maxLat);
      engine.render();
      map?.triggerRepaint();
      isFirstLoadRef.current = false;
    } else {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      engine.updateNextData(grid, minLon, maxLon, minLat, maxLat);
      engine.setBlend(0);
      engine.render();
      map?.triggerRepaint();
      const start = performance.now();
      const blend = (now: number) => {
        const progress = Math.min((now - start) / BLEND_DURATION_MS, 1.0);
        engine.setBlend(progress);
        engine.render();
        map?.triggerRepaint();
        if (progress < 1.0) { rafRef.current = requestAnimationFrame(blend); }
        else {
          engine.updateData(grid, minLon, maxLon, minLat, maxLat);
          engine.setBlend(0);
          engine.render();
          rafRef.current = null;
        }
      };
      rafRef.current = requestAnimationFrame(blend);
    }
  }, [updateCoordinates]);

  useEffect(() => {
    if (!visible || !sharedGridData) return;
    processGridData(sharedGridData);
  }, [visible, sharedGridData, processGridData]);

  return null;
}

export default GustDeltaLayerML;
