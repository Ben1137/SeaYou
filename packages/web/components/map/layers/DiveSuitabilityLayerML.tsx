/**
 * DiveSuitabilityLayerML - Computed heatmap for diving/snorkeling suitability
 *
 * Combines wave height, current speed, and sea temperature into a single
 * dive suitability score (0-100) rendered as a heatmap.
 * Higher values = better diving conditions (calm, warm, low current).
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useMap } from '../useMap';
import { createGenericHeatmapEngine, type GenericHeatmapEngine } from '../../../webgl/GenericHeatmapEngine';
import { createOffscreenCanvas, type OffscreenCanvasHandle } from '../../../webgl/OffscreenCanvasManager';
import { useCanvasSourceLayer, boundsToCorners } from '../../../hooks/useCanvasSourceLayer';
import { DIVE_SUITABILITY_COLORS } from '../../../webgl/ColorRamps';
import { getMarineBeforeId } from '../../../utils/mapLayerUtils';
import type { MarineGridData } from '@seame/core';

export interface DiveSuitabilityLayerMLProps {
  visible: boolean;
  opacity?: number;
  sharedGridData?: MarineGridData | null;
  instanceId?: string;
}

const BLEND_DURATION_MS = 2000;

/** Compute dive suitability score 0-100 from marine conditions */
function computeDiveScore(waveH: number, currentSpd: number, seaTemp: number | undefined): number {
  // Wave penalty: 0m = 100, 0.8m = 50, 1.5m+ = 0
  const waveFactor = waveH <= 0 ? 100 : waveH >= 1.5 ? 0 : Math.max(0, 100 * (1 - waveH / 1.5));

  // Current penalty: 0 m/s = 100, 0.3 m/s = 70, 1.0 m/s = 0
  const currentFactor = currentSpd <= 0 ? 100 : currentSpd >= 1.0 ? 0 : Math.max(0, 100 * (1 - currentSpd / 1.0));

  // Temperature bonus: 22-28°C = 100, drops outside
  let tempFactor = 70; // default when unknown
  if (seaTemp !== undefined) {
    if (seaTemp >= 22 && seaTemp <= 28) tempFactor = 100;
    else if (seaTemp < 14 || seaTemp > 32) tempFactor = 20;
    else if (seaTemp < 22) tempFactor = 20 + 80 * ((seaTemp - 14) / 8);
    else tempFactor = 20 + 80 * ((32 - seaTemp) / 4);
  }

  return waveFactor * 0.40 + currentFactor * 0.35 + tempFactor * 0.25;
}

export function DiveSuitabilityLayerML({
  visible,
  opacity = 0.6,
  sharedGridData,
  instanceId = 'dive-suitability',
}: DiveSuitabilityLayerMLProps) {
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
      logPrefix: '[DiveSuitability]',
      colorRamp: DIVE_SUITABILITY_COLORS,
      normalization: 'range',
      minValue: 0,
      maxValue: 100,
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

    const scoreMap = new Map<string, number>();
    gridData.points.forEach(point => {
      const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
      if (!point.isOcean) { scoreMap.set(key, NaN); return; }
      scoreMap.set(key, computeDiveScore(
        point.waveHeight || 0,
        point.currentSpeed || 0,
        point.seaTemperature,
      ));
    });

    const grid: number[][] = [];
    for (let latIdx = 0; latIdx < lats.length; latIdx++) {
      const row: number[] = [];
      for (let lonIdx = 0; lonIdx < lons.length; lonIdx++) {
        const key = `${lats[latIdx].toFixed(4)},${lons[lonIdx].toFixed(4)}`;
        row.push(scoreMap.get(key) ?? NaN);
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

export default DiveSuitabilityLayerML;
