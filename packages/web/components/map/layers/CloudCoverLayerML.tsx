/**
 * CloudCoverLayerML - Canvas Source architecture for Cloud Cover
 *
 * Data source: Open-Meteo Forecast API — cloud_cover (0–100%)
 * Normalization: 'range' (0 to 100)
 * Discard: < 5% (clear sky invisible)
 * Fade range: 10% smoothstep
 * Land mask: OFF — clouds are valid everywhere
 *
 * Uses FBM (Fractal Brownian Motion) procedural noise in the GPU shader
 * to break up the flat grid data into realistic, fluffy cloud shapes.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useMap } from '../useMap';
import { createGenericHeatmapEngine, type GenericHeatmapEngine } from '../../../webgl/GenericHeatmapEngine';
import { createOffscreenCanvas, type OffscreenCanvasHandle } from '../../../webgl/OffscreenCanvasManager';
import { useCanvasSourceLayer, boundsToCorners } from '../../../hooks/useCanvasSourceLayer';
import { CLOUD_COVER_COLORS } from '../../../webgl/ColorRamps';
import { getAtmosphereBeforeId } from '../../../utils/mapLayerUtils';
import type { ForecastGridData } from '@seame/core';

export interface CloudCoverLayerMLProps {
  visible: boolean;
  opacity?: number;
  sharedGridData?: ForecastGridData | null;
}

const SOURCE_ID = 'cloud-cover-canvas-src';
const LAYER_ID = 'cloud-cover-canvas-layer';

export function CloudCoverLayerML({
  visible,
  opacity = 0.55,
  sharedGridData,
}: CloudCoverLayerMLProps) {
  const map = useMap();
  const mapRef = useRef(map);
  mapRef.current = map;
  const engineRef = useRef<GenericHeatmapEngine | null>(null);
  const canvasHandleRef = useRef<OffscreenCanvasHandle | null>(null);
  const rafRef = useRef<number | null>(null);
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const handle = createOffscreenCanvas('cloud-cover', 1024, 1024);
    canvasHandleRef.current = handle;

    const engine = createGenericHeatmapEngine({
      logPrefix: '[CloudCover]',
      colorRamp: CLOUD_COVER_COLORS,
      normalization: 'range',
      minValue: 0,
      maxValue: 100,
      opacity: 1.0, // Full internal alpha — raster-opacity controls visible opacity
      useLandMask: false,
      discardBelow: 5,
      fadeRange: 10,
    });
    engine.init(handle.canvas);
    engine.setCloudPattern(true); // Enable FBM noise for fluffy cloud shapes
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

    const cloudMap = new Map<string, number>();
    gridData.points.forEach(point => {
      const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
      cloudMap.set(key, point.cloudCover !== undefined ? point.cloudCover : NaN);
    });

    const grid: number[][] = [];
    for (let latIdx = 0; latIdx < lats.length; latIdx++) {
      const row: number[] = [];
      for (let lonIdx = 0; lonIdx < lons.length; lonIdx++) {
        const key = `${lats[latIdx].toFixed(4)},${lons[lonIdx].toFixed(4)}`;
        row.push(cloudMap.get(key) ?? NaN);
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

    console.log('[CloudCoverLayerML] Data updated:', {
      gridSize: `${lons.length}x${lats.length}`,
    });
  }, [updateCoordinates, map]);

  useEffect(() => {
    if (!visible || !sharedGridData) return;
    processGridData(sharedGridData);
  }, [visible, sharedGridData, processGridData]);

  return null;
}

export default CloudCoverLayerML;
