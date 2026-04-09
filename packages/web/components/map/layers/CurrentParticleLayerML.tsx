/**
 * CurrentParticleLayerML - Canvas Source architecture for Current Particles
 *
 * Renders GPGPU current particles to an offscreen canvas, then uses MapLibre's
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
import { CURRENT_COLORS, MONOCHROME_COLORS } from '../../../webgl/ColorRamps';
import { getDeviceProfile, type GPGPUTier } from '../../../webgl/DeviceCapabilities';
import { getMarineBeforeId } from '../../../utils/mapLayerUtils';
import type { MarineGridData } from '@seame/core';

/** Attempt a smooth S-curve instead of a linear kink at z8. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const CURRENT_FADE_OPACITY = 0.992;    // Long trails — slow-moving currents need persistence
const CURRENT_SPEED_FACTOR = 1.5;      // Default — 1.5 m/s * 1.5 * 0.0003 = 0.000675/frame → realistic drift
const CURRENT_DROP_RATE = 0.002;       // Low recycling — keep particles alive longer
const CURRENT_DROP_RATE_BUMP = 0.001;  // Minimal speed-based recycling
const CURRENT_POINT_SIZE = 1.5;        // Hard-capped at 1.5 — clean, non-blobby

// Source/layer IDs are now derived from instanceId inside the component

export interface CurrentParticleLayerMLProps {
  visible: boolean;
  particleCount?: number;
  speedFactor?: number;
  pointSize?: number;
  /** When true, draws particles in neutral gray instead of the colorful current ramp.
   *  Use in compound layers so particles don't compete with the underlying heatmap. */
  monochrome?: boolean;
  sharedGridData?: MarineGridData | null;
  /** Optional instance ID to avoid source/layer collisions when multiple instances exist */
  instanceId?: string;
}

type LayerMode = 'gpgpu' | 'canvas' | 'none';

export function CurrentParticleLayerML({
  visible,
  particleCount = 181,
  monochrome = false,
  sharedGridData,
  instanceId = 'current-particles',
}: CurrentParticleLayerMLProps) {
  const SOURCE_ID = `${instanceId}-canvas-src`;
  const LAYER_ID = `${instanceId}-canvas-layer`;
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
      const handle = createOffscreenCanvas(instanceId, 1024, 1024);
      canvasHandleRef.current = handle;

      const profile = getDeviceProfile();
      const effectiveRes = gpgpuTier === 'uint8'
        ? Math.min(particleCount, profile.recommendedParticleCount || 96)
        : particleCount;

      const engine = createParticleEngine({
        id: instanceId,
        particleRes: effectiveRes,
        speedFactor: CURRENT_SPEED_FACTOR,
        fadeOpacity: CURRENT_FADE_OPACITY,
        dropRate: CURRENT_DROP_RATE,
        dropRateBump: CURRENT_DROP_RATE_BUMP,
        pointSize: Math.min(1.5, gpgpuTier === 'uint8' ? CURRENT_POINT_SIZE * 1.4 : CURRENT_POINT_SIZE * 1.1),
        colorRamp: monochrome ? MONOCHROME_COLORS : CURRENT_COLORS,
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
            const size = Math.min(1.5, CURRENT_POINT_SIZE * (0.6 + 0.5 * zoomFactor));
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

      console.log(`[CurrentParticleLayerML] GPGPU engine created (${engine.getMode()}) with ${effectiveRes * effectiveRes} particles`);

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
      console.warn('[CurrentParticleLayerML] GPGPU failed:', err);
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
        const beforeId = getMarineBeforeId(map);
        const safeBeforeId = beforeId && map.getLayer(beforeId) ? beforeId : undefined;
        const fallbackLayer = createCanvasVectorLayer({
          id: `${instanceId}-arrows-canvas`, type: 'current',
          arrowScale: 20, arrowSpacing: 50, maxSpeed: 2,
        });
        map.addLayer(fallbackLayer, safeBeforeId);
        fallbackLayerRef.current = fallbackLayer;
        fallbackAddedRef.current = true;
        setLayerMode('canvas');
      } catch (e) {
        console.error('[CurrentParticleLayerML] Canvas2D fallback failed:', e);
      }
    };

    if (map.isStyleLoaded()) setupFallback();
    else map.once('style.load', setupFallback);

    return () => {
      if (map && fallbackAddedRef.current) {
        const fallbackId = `${instanceId}-arrows-canvas`;
        try { if (map.getLayer(fallbackId)) map.removeLayer(fallbackId); } catch {}
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
    opacity: 0.90,
    visible,
  });

  const processGridData = useCallback((gridData: MarineGridData) => {
    if (!gridData?.points?.length) return;

    const lats = [...new Set(gridData.points.map(p => p.lat))].sort((a, b) => a - b);
    const lons = [...new Set(gridData.points.map(p => p.lng))].sort((a, b) => a - b);

    const currentMap = new Map<string, { u: number; v: number }>();
    gridData.points.forEach(point => {
      const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
      currentMap.set(key, {
        u: point.isOcean ? (point.currentU ?? NaN) : NaN,
        v: point.isOcean ? (point.currentV ?? NaN) : NaN,
      });
    });

    const uGrid: number[][] = [];
    const vGrid: number[][] = [];
    for (let latIdx = 0; latIdx < lats.length; latIdx++) {
      const uRow: number[] = [];
      const vRow: number[] = [];
      for (let lonIdx = 0; lonIdx < lons.length; lonIdx++) {
        const key = `${lats[latIdx].toFixed(4)},${lons[lonIdx].toFixed(4)}`;
        const current = currentMap.get(key);
        uRow.push(current?.u ?? NaN);
        vRow.push(current?.v ?? NaN);
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

      console.log('[CurrentParticleLayerML] Data updated:', {
        gridSize: `${lons.length}x${lats.length}`,
        maxSpeed: metadata.maxSpeed.toFixed(2),
      });
    } else if (fallbackLayerRef.current && layerMode === 'canvas') {
      const vectorPoints: VectorPoint[] = gridData.points.map(point => ({
        lat: point.lat, lng: point.lng,
        u: point.currentU ?? 0, v: point.currentV ?? 0,
        speed: point.currentSpeed ?? Math.sqrt((point.currentU ?? 0) ** 2 + (point.currentV ?? 0) ** 2),
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

export default CurrentParticleLayerML;
