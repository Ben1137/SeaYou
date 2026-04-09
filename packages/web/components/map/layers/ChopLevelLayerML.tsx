/**
 * ChopLevelLayerML - Wind-wave chop index heatmap
 *
 * Visualizes the ratio of wind-wave height to total wave energy.
 * 0 = pure clean swell (blue), 1 = pure wind chop (red).
 * Helps surfers distinguish clean swell from messy chop.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useMap } from '../useMap';
import { createGenericHeatmapEngine, type GenericHeatmapEngine } from '../../../webgl/GenericHeatmapEngine';
import { createOffscreenCanvas, type OffscreenCanvasHandle } from '../../../webgl/OffscreenCanvasManager';
import { useCanvasSourceLayer, boundsToCorners } from '../../../hooks/useCanvasSourceLayer';
import { CHOP_LEVEL_COLORS } from '../../../webgl/ColorRamps';
import { getMarineBeforeId } from '../../../utils/mapLayerUtils';
import type { MarineGridData } from '@seame/core';

export interface ChopLevelLayerMLProps {
  visible: boolean;
  opacity?: number;
  sharedGridData?: MarineGridData | null;
  instanceId?: string;
}

const BLEND_DURATION_MS = 2000;

export function ChopLevelLayerML({
  visible,
  opacity = 0.55,
  sharedGridData,
  instanceId = 'chop-level',
}: ChopLevelLayerMLProps) {
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
      logPrefix: '[ChopLevel]',
      colorRamp: CHOP_LEVEL_COLORS,
      normalization: 'range',
      minValue: 0,
      maxValue: 1,
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

    const chopMap = new Map<string, number>();
    gridData.points.forEach(point => {
      const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
      if (!point.isOcean) { chopMap.set(key, NaN); return; }
      const windWaveH = point.windWaveHeight || 0;
      const swellH = point.swellHeight || 0;
      const total = windWaveH + swellH;
      chopMap.set(key, total > 0 ? windWaveH / total : 0);
    });

    const grid: number[][] = [];
    for (let latIdx = 0; latIdx < lats.length; latIdx++) {
      const row: number[] = [];
      for (let lonIdx = 0; lonIdx < lons.length; lonIdx++) {
        const key = `${lats[latIdx].toFixed(4)},${lons[lonIdx].toFixed(4)}`;
        row.push(chopMap.get(key) ?? NaN);
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

export default ChopLevelLayerML;
