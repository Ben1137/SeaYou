/**
 * WaveParticleLayerML - Canvas Source architecture for Wave Particles
 *
 * Renders GPGPU wave particles to an offscreen canvas, then uses MapLibre's
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
import { WAVE_PARTICLE_COLORS } from '../../../webgl/ColorRamps';
import { getDeviceProfile, type GPGPUTier } from '../../../webgl/DeviceCapabilities';
import { getMarineBeforeId } from '../../../utils/mapLayerUtils';
import type { MarineGridData } from '@seame/core';

/** Attempt a smooth S-curve instead of a linear kink at z8. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const WAVE_FADE_OPACITY = 0.965;
const WAVE_SPEED_FACTOR = 2.0;
const WAVE_DROP_RATE = 0.002;
const WAVE_DROP_RATE_BUMP = 0.005;
const WAVE_POINT_SIZE = 1.5;

const SOURCE_ID = 'wave-particles-canvas-src';
const LAYER_ID = 'wave-particles-canvas-layer';

export interface WaveParticleLayerMLProps {
  visible: boolean;
  particleCount?: number;
  speedFactor?: number;
  pointSize?: number;
  sharedGridData?: MarineGridData | null;
}

type LayerMode = 'gpgpu' | 'canvas' | 'none';

export function WaveParticleLayerML({
  visible,
  particleCount = 181,
  sharedGridData,
}: WaveParticleLayerMLProps) {
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
      const handle = createOffscreenCanvas('wave-particles', 1024, 1024);
      canvasHandleRef.current = handle;

      const profile = getDeviceProfile();
      const effectiveRes = gpgpuTier === 'uint8'
        ? Math.min(particleCount, profile.recommendedParticleCount || 128)
        : particleCount;

      const engine = createParticleEngine({
        id: 'wave-particles',
        particleRes: effectiveRes,
        speedFactor: WAVE_SPEED_FACTOR,
        fadeOpacity: WAVE_FADE_OPACITY,
        dropRate: WAVE_DROP_RATE,
        dropRateBump: WAVE_DROP_RATE_BUMP,
        pointSize: Math.min(1.5, gpgpuTier === 'uint8' ? WAVE_POINT_SIZE * 1.4 : WAVE_POINT_SIZE * 1.1),
        colorRamp: WAVE_PARTICLE_COLORS,
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
            const fade = 0.960 + 0.020 * zoomFactor;
            const size = Math.min(1.5, WAVE_POINT_SIZE * (0.6 + 0.5 * zoomFactor));
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

      console.log(`[WaveParticleLayerML] GPGPU engine created (${engine.getMode()}) with ${effectiveRes * effectiveRes} particles`);

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
      console.warn('[WaveParticleLayerML] GPGPU failed:', err);
      setLayerMode('none');
      return undefined;
    }
  }, [gpgpuTier, particleCount]);

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
        const beforeId = getMarineBeforeId(map);
        const safeBeforeId = beforeId && map.getLayer(beforeId) ? beforeId : undefined;
        const fallbackLayer = createCanvasVectorLayer({
          id: 'wave-arrows-canvas', type: 'wind',
          arrowScale: 1.0, arrowSpacing: 50, maxSpeed: 5,
        });
        map.addLayer(fallbackLayer, safeBeforeId);
        fallbackLayerRef.current = fallbackLayer;
        fallbackAddedRef.current = true;
        setLayerMode('canvas');
      } catch (e) {
        console.error('[WaveParticleLayerML] Canvas2D fallback failed:', e);
      }
    };

    if (map.isStyleLoaded()) setupFallback();
    else map.once('style.load', setupFallback);

    return () => {
      if (map && fallbackAddedRef.current) {
        try { if (map.getLayer('wave-arrows-canvas')) map.removeLayer('wave-arrows-canvas'); } catch {}
        fallbackAddedRef.current = false;
        fallbackLayerRef.current = null;
      }
    };
  }, [map, layerMode, gpgpuTier]);

  // Register CanvasSource + raster layer
  const beforeId = map ? getMarineBeforeId(map) : undefined;
  const { updateCoordinates } = useCanvasSourceLayer({
    map: layerMode === 'gpgpu' ? map : null,
    sourceId: SOURCE_ID,
    layerId: LAYER_ID,
    canvas: canvasElement,
    beforeId,
    opacity: 1.0,
    visible,
  });

  const processGridData = useCallback((gridData: MarineGridData) => {
    if (!gridData?.points?.length) return;

    const lats = [...new Set(gridData.points.map(p => p.lat))].sort((a, b) => a - b);
    const lons = [...new Set(gridData.points.map(p => p.lng))].sort((a, b) => a - b);

    const waveMap = new Map<string, { u: number; v: number }>();
    gridData.points.forEach(point => {
      const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
      waveMap.set(key, {
        u: point.isOcean ? (point.waveU ?? NaN) : NaN,
        v: point.isOcean ? (point.waveV ?? NaN) : NaN,
      });
    });

    const uGrid: number[][] = [];
    const vGrid: number[][] = [];
    for (let latIdx = 0; latIdx < lats.length; latIdx++) {
      const uRow: number[] = [];
      const vRow: number[] = [];
      for (let lonIdx = 0; lonIdx < lons.length; lonIdx++) {
        const key = `${lats[latIdx].toFixed(4)},${lons[lonIdx].toFixed(4)}`;
        const wave = waveMap.get(key);
        uRow.push(wave?.u ?? NaN);
        vRow.push(wave?.v ?? NaN);
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

      console.log('[WaveParticleLayerML] Data updated:', {
        gridSize: `${lons.length}x${lats.length}`,
        maxSpeed: metadata.maxSpeed.toFixed(2),
      });
    } else if (fallbackLayerRef.current && layerMode === 'canvas') {
      const vectorPoints: VectorPoint[] = gridData.points.map(point => ({
        lat: point.lat, lng: point.lng,
        u: point.waveU ?? 0, v: point.waveV ?? 0,
        speed: point.waveHeight ?? Math.sqrt((point.waveU ?? 0) ** 2 + (point.waveV ?? 0) ** 2),
      }));
      fallbackLayerRef.current.updateData(vectorPoints);
    }
  }, [layerMode, updateCoordinates]);

  useEffect(() => { fallbackLayerRef.current?.setVisibility(visible); }, [visible]);

  useEffect(() => {
    if (!visible || !sharedGridData) return;
    processGridData(sharedGridData);
  }, [visible, sharedGridData, processGridData]);

  return null;
}

export default WaveParticleLayerML;
