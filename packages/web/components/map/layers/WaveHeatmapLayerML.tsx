/**
 * WaveHeatmapLayerML - Canvas Source architecture for Wave Heatmap
 *
 * Renders wave height data to an offscreen canvas via GenericHeatmapEngine,
 * then uses MapLibre's CanvasSource to drape it onto the globe.
 *
 * Data flow:
 *   First load  → updateData() + render() (hard set)
 *   Subsequent  → updateNextData() + rAF blend 0→1 over BLEND_DURATION_MS
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useMap } from '../useMap';
import { createGenericHeatmapEngine, type GenericHeatmapEngine } from '../../../webgl/GenericHeatmapEngine';
import { createOffscreenCanvas, type OffscreenCanvasHandle } from '../../../webgl/OffscreenCanvasManager';
import { useCanvasSourceLayer, boundsToCorners } from '../../../hooks/useCanvasSourceLayer';
import { WAVE_COLORS } from '../../../webgl/ColorRamps';
import { getMarineBeforeId } from '../../../utils/mapLayerUtils';
import type { MarineGridData } from '@seame/core';

export interface WaveHeatmapLayerMLProps {
  visible: boolean;
  opacity?: number;
  sharedGridData?: MarineGridData | null;
}

const BLEND_DURATION_MS = 2000;
const SOURCE_ID = 'wave-heatmap-canvas-src';
const LAYER_ID = 'wave-heatmap-canvas-layer';

export function WaveHeatmapLayerML({
  visible,
  opacity = 0.65,
  sharedGridData,
}: WaveHeatmapLayerMLProps) {
  const map = useMap();
  const mapRef = useRef(map);
  mapRef.current = map;
  const engineRef = useRef<GenericHeatmapEngine | null>(null);
  const canvasHandleRef = useRef<OffscreenCanvasHandle | null>(null);
  const isFirstLoadRef = useRef(true);
  const rafRef = useRef<number | null>(null);         // Blend animation rAF
  const renderRafRef = useRef<number | null>(null);   // Continuous render loop rAF
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);

  // Create engine + offscreen canvas
  useEffect(() => {
    const handle = createOffscreenCanvas('wave-heatmap', 1024, 1024);
    canvasHandleRef.current = handle;

    const engine = createGenericHeatmapEngine({
      logPrefix: '[WaveHeatmap]',
      colorRamp: WAVE_COLORS,
      normalization: 'max-value',
      maxValue: 8,            // 0-8m range — global ocean waves (Mediterranean ~0.2-1.5m, open ocean up to ~6-8m)
      discardBelow: 0.0,      // Show ALL wave data — calm seas visible via color ramp baseline
      fadeRange: 0.1,         // Tight fade for low-wave regions
      opacity: 1.0,           // Full internal alpha — raster-opacity controls visible opacity
      useLandMask: false,
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

    const waveMap = new Map<string, number>();
    gridData.points.forEach(point => {
      const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
      waveMap.set(key, point.isOcean ? (point.waveHeight ?? NaN) : NaN);
    });

    const grid: number[][] = [];
    for (let latIdx = 0; latIdx < lats.length; latIdx++) {
      const row: number[] = [];
      for (let lonIdx = 0; lonIdx < lons.length; lonIdx++) {
        const key = `${lats[latIdx].toFixed(4)},${lons[lonIdx].toFixed(4)}`;
        row.push(waveMap.get(key) ?? NaN);
      }
      grid.push(row);
    }

    const [minLon, maxLon] = [lons[0], lons[lons.length - 1]];
    const [minLat, maxLat] = [lats[0], lats[lats.length - 1]];

    const newCorners = boundsToCorners(minLon, maxLon, minLat, maxLat);
    updateCoordinates(newCorners);

    const engine = engineRef.current;

    if (isFirstLoadRef.current) {
      engine.updateData(grid, minLon, maxLon, minLat, maxLat);
      engine.render();
      map?.triggerRepaint();
      isFirstLoadRef.current = false;
    } else {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      engine.updateNextData(grid, minLon, maxLon, minLat, maxLat);
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
          engine.updateData(grid, minLon, maxLon, minLat, maxLat);
          engine.setBlend(0);
          engine.render();
          map?.triggerRepaint();
          rafRef.current = null;
        }
      };
      rafRef.current = requestAnimationFrame(animate);
    }

    console.log('[WaveHeatmapLayerML] Data updated:', {
      gridSize: `${lons.length}x${lats.length}`,
      bounds: { minLon, maxLon, minLat, maxLat },
    });
  }, [updateCoordinates]);

  // Opacity is controlled by raster-opacity in useCanvasSourceLayer — no engine update needed

  useEffect(() => {
    if (!visible || !sharedGridData) return;
    processGridData(sharedGridData);
  }, [visible, sharedGridData, processGridData]);

  return null;
}

export default WaveHeatmapLayerML;
