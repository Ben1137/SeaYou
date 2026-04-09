/**
 * WindParticleLayerML - Canvas Source architecture for Wind Particles
 *
 * Renders GPGPU wind particles to an offscreen canvas, then uses MapLibre's
 * CanvasSource to drape it onto the globe. Falls back to Canvas2D arrows.
 *
 * Animation loop: requestAnimationFrame drives engine.update() + engine.render()
 * every frame. MapLibre's CanvasSource (animate: true) reads the canvas pixels.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useMap } from '../useMap';
import { createParticleEngine, type ParticleEngine } from '../../../webgl/ParticleEngine';
import { createOffscreenCanvas, type OffscreenCanvasHandle } from '../../../webgl/OffscreenCanvasManager';
import { useCanvasSourceLayer, boundsToCorners } from '../../../hooks/useCanvasSourceLayer';
import { createCanvasVectorLayer, type CanvasVectorLayer, type VectorPoint } from '../../../webgl/CanvasVectorLayer';
import { encodeVelocityGrid, encodeVelocityGridUint8 } from '../../../webgl/DataEncoder';
import { WIND_COLORS, MONOCHROME_COLORS } from '../../../webgl/ColorRamps';
import { getDeviceProfile, type GPGPUTier } from '../../../webgl/DeviceCapabilities';
import { getAtmosphereBeforeId } from '../../../utils/mapLayerUtils';
import type { MarineGridData, ForecastGridData } from '@seame/core';

/** Attempt a smooth S-curve instead of a linear kink at z8. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// MapTiler-style wind: elegant, thin, wispy trails with moderate speed
const WIND_FADE_OPACITY = 0.992;     // Long trails (higher = longer)
const WIND_SPEED_FACTOR = 0.15;      // Slow, elegant movement
const WIND_DROP_RATE = 0.004;        // Moderate particle recycling
const WIND_DROP_RATE_BUMP = 0.003;   // Slight speed-based recycling
const WIND_POINT_SIZE = 1.2;         // Thin, wispy particles

const SOURCE_ID = 'wind-particles-canvas-src';
const LAYER_ID = 'wind-particles-canvas-layer';

export interface WindParticleLayerMLProps {
  visible: boolean;
  particleCount?: number;
  speedFactor?: number;
  pointSize?: number;
  /** When true, draws particles in neutral gray instead of the colorful wind ramp.
   *  Use in compound layers so particles don't compete with the underlying heatmap. */
  monochrome?: boolean;
  /** @deprecated Use sharedForecastData for global coverage (land + sea) */
  sharedGridData?: MarineGridData | null;
  /** Forecast grid data — covers entire globe (land + sea), no holes */
  sharedForecastData?: ForecastGridData | null;
}

type LayerMode = 'gpgpu' | 'canvas' | 'none';

export function WindParticleLayerML({
  visible,
  particleCount = 181,
  monochrome = false,
  sharedGridData,
  sharedForecastData,
}: WindParticleLayerMLProps) {
  const map = useMap();
  const mapRef = useRef(map);
  mapRef.current = map; // Always-current ref for rAF closure
  const engineRef = useRef<ParticleEngine | null>(null);
  const canvasHandleRef = useRef<OffscreenCanvasHandle | null>(null);
  const fallbackLayerRef = useRef<CanvasVectorLayer | null>(null);
  const fallbackAddedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const visibleRef = useRef(visible);
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);
  const [layerMode, setLayerMode] = useState<LayerMode>('none');
  const [gpgpuTier, setGpgpuTier] = useState<GPGPUTier | null>(null);

  visibleRef.current = visible;

  useEffect(() => {
    const profile = getDeviceProfile();
    setGpgpuTier(profile.gpgpuTier);
  }, []);

  // Create engine + offscreen canvas + animation loop
  useEffect(() => {
    if (gpgpuTier === null) return;
    if (gpgpuTier !== 'float' && gpgpuTier !== 'uint8') return;

    try {
      const handle = createOffscreenCanvas('wind-particles', 1024, 1024);
      canvasHandleRef.current = handle;

      const profile = getDeviceProfile();
      const effectiveRes = gpgpuTier === 'uint8'
        ? Math.min(particleCount, profile.recommendedParticleCount || 128)
        : particleCount;

      const engine = createParticleEngine({
        id: 'wind-particles',
        particleRes: effectiveRes,
        speedFactor: WIND_SPEED_FACTOR,
        fadeOpacity: WIND_FADE_OPACITY,
        dropRate: WIND_DROP_RATE,
        dropRateBump: WIND_DROP_RATE_BUMP,
        pointSize: gpgpuTier === 'uint8' ? WIND_POINT_SIZE * 1.3 : WIND_POINT_SIZE,
        colorRamp: monochrome ? MONOCHROME_COLORS : WIND_COLORS,
        preferUint8: gpgpuTier === 'uint8',
      });
      engine.init(handle.canvas);

      if (engine.getMode() === 'disabled') {
        engine.destroy();
        handle.destroy();
        throw new Error('GPGPU init failed');
      }

      engineRef.current = engine;
      setCanvasElement(handle.canvas);
      setLayerMode('gpgpu');

      let destroyed = false;
      const animate = () => {
        if (destroyed) return;
        if (visibleRef.current && engineRef.current) {
          // Per-frame zoom adaptation — safely guarded against NaN/undefined
          const zoom = mapRef.current?.getZoom();
          if (typeof zoom === 'number' && Number.isFinite(zoom)) {
            const zoomFactor = smoothstep(1, 10, zoom);
            const fade = 0.988 + 0.006 * zoomFactor;
            const size = Math.min(1.5, WIND_POINT_SIZE * (0.6 + 0.5 * zoomFactor));
            engineRef.current.setFadeOpacity(fade);
            engineRef.current.setPointSize(size);
          }
          engineRef.current.update();
          engineRef.current.render();
          mapRef.current?.triggerRepaint();
        }
        rafRef.current = requestAnimationFrame(animate);
      };
      rafRef.current = requestAnimationFrame(animate);

      console.log(`[WindParticleLayerML] GPGPU engine created (${engine.getMode()}) with ${effectiveRes * effectiveRes} particles`);

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
    } catch (err) {
      console.warn('[WindParticleLayerML] GPGPU failed:', err);
      setLayerMode('none');
      return undefined;
    }
  }, [gpgpuTier, particleCount, monochrome]);

  // Reset trails on every zoom end — prevents stale giant trails after globe→city zoom
  useEffect(() => {
    if (!map) return;

    const handleZoomEnd = () => {
      if (engineRef.current) {
        engineRef.current.resetTrails();
        engineRef.current.resetParticles();
      }
    };

    map.on('zoomend', handleZoomEnd);
    return () => { map.off('zoomend', handleZoomEnd); };
  }, [map]);

  // Canvas2D fallback
  useEffect(() => {
    if (!map || layerMode !== 'none' || gpgpuTier === null) return;
    if (gpgpuTier === 'float' || gpgpuTier === 'uint8') return;

    const setupFallback = () => {
      if (fallbackAddedRef.current) return;
      try {
        const beforeId = getAtmosphereBeforeId(map);
        const safeBeforeId = beforeId && map.getLayer(beforeId) ? beforeId : undefined;
        const fallbackLayer = createCanvasVectorLayer({
          id: 'wind-arrows-canvas', type: 'wind',
          arrowScale: 0.8, arrowSpacing: 50, maxSpeed: 50,
        });
        map.addLayer(fallbackLayer, safeBeforeId);
        fallbackLayerRef.current = fallbackLayer;
        fallbackAddedRef.current = true;
        setLayerMode('canvas');
      } catch (e) {
        console.error('[WindParticleLayerML] Canvas2D fallback failed:', e);
      }
    };

    if (map.isStyleLoaded()) setupFallback();
    else map.once('style.load', setupFallback);

    return () => {
      if (map && fallbackAddedRef.current) {
        try { if (map.getLayer('wind-arrows-canvas')) map.removeLayer('wind-arrows-canvas'); } catch {}
        fallbackAddedRef.current = false;
        fallbackLayerRef.current = null;
      }
    };
  }, [map, layerMode, gpgpuTier]);

  // Register CanvasSource + raster layer
  const beforeId = map ? getAtmosphereBeforeId(map) : undefined;
  const { updateCoordinates } = useCanvasSourceLayer({
    map: layerMode === 'gpgpu' ? map : null,
    sourceId: SOURCE_ID,
    layerId: LAYER_ID,
    canvas: canvasElement,
    beforeId,
    opacity: 0.90,
    visible,
  });

  const processGridData = useCallback((gridData: MarineGridData) => {
    if (!gridData?.points?.length) return;

    const lats = [...new Set(gridData.points.map(p => p.lat))].sort((a, b) => a - b);
    const lons = [...new Set(gridData.points.map(p => p.lng))].sort((a, b) => a - b);

    const windMap = new Map<string, { u: number; v: number }>();
    gridData.points.forEach(point => {
      const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
      windMap.set(key, { u: point.windU ?? 0, v: point.windV ?? 0 });
    });

    const uGrid: number[][] = [];
    const vGrid: number[][] = [];
    for (let latIdx = 0; latIdx < lats.length; latIdx++) {
      const uRow: number[] = [];
      const vRow: number[] = [];
      for (let lonIdx = 0; lonIdx < lons.length; lonIdx++) {
        const key = `${lats[latIdx].toFixed(4)},${lons[lonIdx].toFixed(4)}`;
        const wind = windMap.get(key);
        uRow.push(wind?.u ?? 0);
        vRow.push(wind?.v ?? 0);
      }
      uGrid.push(uRow);
      vGrid.push(vRow);
    }

    const [minLon, maxLon] = [lons[0], lons[lons.length - 1]];
    const [minLat, maxLat] = [lats[0], lats[lats.length - 1]];

    // Use engineRef (sync ref) not layerMode (async state) to avoid race condition
    if (engineRef.current) {
      const engineMode = engineRef.current.getMode();
      const { data, metadata } = engineMode === 'uint8'
        ? encodeVelocityGridUint8(uGrid, vGrid, minLon, maxLon, minLat, maxLat)
        : encodeVelocityGrid(uGrid, vGrid, minLon, maxLon, minLat, maxLat);

      engineRef.current.updateVelocityData(
        data, metadata.width, metadata.height,
        minLon, minLat, maxLon, maxLat, metadata.maxSpeed
      );

      const newCorners = boundsToCorners(minLon, maxLon, minLat, maxLat);
      updateCoordinates(newCorners);

      console.log('[WindParticleLayerML] Data updated (marine):', {
        gridSize: `${lons.length}x${lats.length}`,
        maxSpeed: metadata.maxSpeed.toFixed(2),
      });
    } else if (fallbackLayerRef.current && layerMode === 'canvas') {
      const vectorPoints: VectorPoint[] = gridData.points.map(point => ({
        lat: point.lat, lng: point.lng,
        u: point.windU ?? 0, v: point.windV ?? 0,
        speed: point.windSpeed ?? Math.sqrt((point.windU ?? 0) ** 2 + (point.windV ?? 0) ** 2),
      }));
      fallbackLayerRef.current.updateData(vectorPoints);
    }
  }, [layerMode, updateCoordinates]);

  // Process forecast grid data (global coverage — land + sea, no holes)
  const processForecastData = useCallback((forecastData: ForecastGridData) => {
    if (!forecastData?.points?.length) return;

    const lats = [...new Set(forecastData.points.map(p => p.lat))].sort((a, b) => a - b);
    const lons = [...new Set(forecastData.points.map(p => p.lng))].sort((a, b) => a - b);

    const windMap = new Map<string, { u: number; v: number }>();
    forecastData.points.forEach(point => {
      const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
      windMap.set(key, { u: point.windU ?? 0, v: point.windV ?? 0 });
    });

    const uGrid: number[][] = [];
    const vGrid: number[][] = [];
    for (let latIdx = 0; latIdx < lats.length; latIdx++) {
      const uRow: number[] = [];
      const vRow: number[] = [];
      for (let lonIdx = 0; lonIdx < lons.length; lonIdx++) {
        const key = `${lats[latIdx].toFixed(4)},${lons[lonIdx].toFixed(4)}`;
        const wind = windMap.get(key);
        uRow.push(wind?.u ?? 0);
        vRow.push(wind?.v ?? 0);
      }
      uGrid.push(uRow);
      vGrid.push(vRow);
    }

    const [minLon, maxLon] = [lons[0], lons[lons.length - 1]];
    const [minLat, maxLat] = [lats[0], lats[lats.length - 1]];

    // Use engineRef (sync ref) not layerMode (async state) to avoid race condition
    if (engineRef.current) {
      const engineMode = engineRef.current.getMode();
      const { data, metadata } = engineMode === 'uint8'
        ? encodeVelocityGridUint8(uGrid, vGrid, minLon, maxLon, minLat, maxLat)
        : encodeVelocityGrid(uGrid, vGrid, minLon, maxLon, minLat, maxLat);

      engineRef.current.updateVelocityData(
        data, metadata.width, metadata.height,
        minLon, minLat, maxLon, maxLat, metadata.maxSpeed
      );

      const newCorners = boundsToCorners(minLon, maxLon, minLat, maxLat);
      updateCoordinates(newCorners);

      console.log('[WindParticleLayerML] Data updated (forecast):', {
        gridSize: `${lons.length}x${lats.length}`,
        maxSpeed: metadata.maxSpeed.toFixed(2),
      });
    } else if (fallbackLayerRef.current && layerMode === 'canvas') {
      const vectorPoints: VectorPoint[] = forecastData.points.map(point => ({
        lat: point.lat, lng: point.lng,
        u: point.windU ?? 0, v: point.windV ?? 0,
        speed: point.windSpeed ?? Math.sqrt((point.windU ?? 0) ** 2 + (point.windV ?? 0) ** 2),
      }));
      fallbackLayerRef.current.updateData(vectorPoints);
    }
  }, [layerMode, updateCoordinates]);

  useEffect(() => { fallbackLayerRef.current?.setVisibility(visible); }, [visible]);

  // Prefer forecast data (global coverage) over marine data (ocean-only)
  useEffect(() => {
    if (!visible) return;
    if (sharedForecastData) {
      processForecastData(sharedForecastData);
    } else if (sharedGridData) {
      processGridData(sharedGridData);
    }
  }, [visible, sharedForecastData, sharedGridData, processForecastData, processGridData]);

  return null;
}

export default WindParticleLayerML;
