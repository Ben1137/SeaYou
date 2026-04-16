/**
 * CurrentHeatmapLayerML — Ocean current SPEED visualized as a color-coded heatmap.
 *
 * Complements `CurrentParticleLayerML` (which shows *direction + motion* via GPGPU
 * particles) by showing *magnitude* as a continuous color field. Mariners use this
 * to see where strong currents are at a glance; divers use it to avoid drift zones.
 *
 * Premium layer — same paywall as Wave Heatmap / Sea Temp.
 *
 * Implementation mirrors DiveSuitabilityLayerML — builds a 2D lat×lon grid of
 * current-speed values, uploads it to a `GenericHeatmapEngine`, renders into an
 * offscreen canvas, and feeds that canvas into a MapLibre canvas source.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useMap } from '../useMap';
import { createGenericHeatmapEngine, type GenericHeatmapEngine } from '../../../webgl/GenericHeatmapEngine';
import { createOffscreenCanvas, type OffscreenCanvasHandle } from '../../../webgl/OffscreenCanvasManager';
import { useCanvasSourceLayer, boundsToCorners } from '../../../hooks/useCanvasSourceLayer';
import { CURRENT_COLORS } from '../../../webgl/ColorRamps';
import { getMarineBeforeId } from '../../../utils/mapLayerUtils';
import type { MarineGridData } from '@seame/core';

export interface CurrentHeatmapLayerMLProps {
  visible: boolean;
  opacity?: number;
  /** Max current speed (m/s) clamped at the top of the ramp. Default 2.0 covers almost all open-ocean currents. */
  maxSpeed?: number;
  sharedGridData?: MarineGridData | null;
  instanceId?: string;
}

const BLEND_DURATION_MS = 2000;

export function CurrentHeatmapLayerML({
  visible,
  opacity = 0.65,
  maxSpeed = 2.0,
  sharedGridData,
  instanceId = 'current-heatmap',
}: CurrentHeatmapLayerMLProps) {
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
      logPrefix: '[CurrentHeatmap]',
      colorRamp: CURRENT_COLORS,
      normalization: 'range',
      minValue: 0,
      maxValue: maxSpeed,
      opacity: 1.0,
      useLandMask: true, // Current speed only meaningful over ocean
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    const lats = [...new Set(gridData.points.map((p) => p.lat))].sort((a, b) => a - b);
    const lons = [...new Set(gridData.points.map((p) => p.lng))].sort((a, b) => a - b);

    const speedMap = new Map<string, number>();
    gridData.points.forEach((point) => {
      const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
      if (!point.isOcean) {
        speedMap.set(key, NaN);
        return;
      }
      speedMap.set(key, point.currentSpeed ?? 0);
    });

    const grid: number[][] = [];
    for (let latIdx = 0; latIdx < lats.length; latIdx++) {
      const row: number[] = [];
      for (let lonIdx = 0; lonIdx < lons.length; lonIdx++) {
        const key = `${lats[latIdx].toFixed(4)},${lons[lonIdx].toFixed(4)}`;
        row.push(speedMap.get(key) ?? NaN);
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
        if (progress < 1.0) {
          rafRef.current = requestAnimationFrame(blend);
        } else {
          engine.updateData(grid, minLon, maxLon, minLat, maxLat);
          engine.setBlend(0);
          engine.render();
          rafRef.current = null;
        }
      };
      rafRef.current = requestAnimationFrame(blend);
    }
  }, [updateCoordinates, map]);

  useEffect(() => {
    if (!visible || !sharedGridData) return;
    processGridData(sharedGridData);
  }, [visible, sharedGridData, processGridData]);

  return null;
}

export default CurrentHeatmapLayerML;
