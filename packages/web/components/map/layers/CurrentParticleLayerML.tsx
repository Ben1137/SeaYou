/**
 * CurrentParticleLayerML - React component wrapper for GPGPU Current Particle Engine
 * Supports 3-tier fallback:
 *   Tier 1: GPGPU with Float32 textures (best quality)
 *   Tier 2: GPGPU with Uint8 R8G8B8A8 encoding (universal WebGL support)
 *   Tier 3: Canvas2D arrow rendering (last resort)
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useMap } from '../useMap';
import { createParticleLayer, type ParticleLayer, type ParticleMode } from '../../../webgl/ParticleEngine';
import { createCanvasVectorLayer, type CanvasVectorLayer, type VectorPoint } from '../../../webgl/CanvasVectorLayer';
import { encodeVelocityGrid, encodeVelocityGridUint8 } from '../../../webgl/DataEncoder';
import { CURRENT_COLORS } from '../../../webgl/ColorRamps';
import { getDeviceProfile, type GPGPUTier } from '../../../webgl/DeviceCapabilities';
import { getSafeBeforeId } from '../../../utils/mapLayerUtils';
import type { MarineGridData } from '@seame/core';

export interface CurrentParticleLayerMLProps {
  visible: boolean;
  particleCount?: number;
  speedFactor?: number;
  pointSize?: number;
  sharedGridData?: MarineGridData | null;
}

type LayerMode = 'gpgpu' | 'canvas' | 'none';

export function CurrentParticleLayerML({
  visible,
  particleCount = 192,
  speedFactor = 6.0,   // Currents are slow (0-2 m/s) — need higher factor to be visible
  pointSize = 2.5,
  sharedGridData,
}: CurrentParticleLayerMLProps) {
  const map = useMap();
  const layerRef = useRef<ParticleLayer | null>(null);
  const fallbackLayerRef = useRef<CanvasVectorLayer | null>(null);
  const layerAddedRef = useRef(false);
  const [layerMode, setLayerMode] = useState<LayerMode>('none');
  const [gpgpuTier, setGpgpuTier] = useState<GPGPUTier | null>(null);

  // Process grid data and update the WebGL engine
  const processGridData = useCallback((gridData: MarineGridData) => {
    if (!gridData || !gridData.points || gridData.points.length === 0) return;
    if (!layerRef.current && !fallbackLayerRef.current) return;

    const lats = [...new Set(gridData.points.map(p => p.lat))].sort((a, b) => a - b);
    const lons = [...new Set(gridData.points.map(p => p.lng))].sort((a, b) => a - b);

    const gridHeight = lats.length;
    const gridWidth = lons.length;

    const currentMap = new Map<string, { u: number; v: number }>();
    gridData.points.forEach(point => {
      const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
      // Use NaN for land points — encoder marks alpha=0, particle shader drops particles instantly
      currentMap.set(key, {
        u: point.isOcean ? (point.currentU ?? NaN) : NaN,
        v: point.isOcean ? (point.currentV ?? NaN) : NaN,
      });
    });

    const uGrid: number[][] = [];
    const vGrid: number[][] = [];

    for (let latIdx = 0; latIdx < gridHeight; latIdx++) {
      const uRow: number[] = [];
      const vRow: number[] = [];
      for (let lonIdx = 0; lonIdx < gridWidth; lonIdx++) {
        const lat = lats[latIdx];
        const lon = lons[lonIdx];
        const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
        const current = currentMap.get(key);
        uRow.push(current?.u ?? NaN);
        vRow.push(current?.v ?? NaN);
      }
      uGrid.push(uRow);
      vGrid.push(vRow);
    }

    const actualMinLon = lons[0];
    const actualMaxLon = lons[lons.length - 1];
    const actualMinLat = lats[0];
    const actualMaxLat = lats[lats.length - 1];

    if (layerRef.current && layerMode === 'gpgpu') {
      // Use the encoder matching the engine's actual mode to avoid double-conversion
      const engineMode = layerRef.current.getMode();
      const useUint8Encoder = engineMode === 'uint8';

      const { data, metadata } = useUint8Encoder
        ? encodeVelocityGridUint8(uGrid, vGrid, actualMinLon, actualMaxLon, actualMinLat, actualMaxLat)
        : encodeVelocityGrid(uGrid, vGrid, actualMinLon, actualMaxLon, actualMinLat, actualMaxLat);

      layerRef.current.updateVelocityData(
        data, metadata.width, metadata.height,
        actualMinLon, actualMinLat, actualMaxLon, actualMaxLat,
        metadata.maxSpeed
      );

      console.log(`[CurrentParticleLayerML] GPGPU (${engineMode}) data updated: ${gridWidth}x${gridHeight}, maxSpeed=${metadata.maxSpeed.toFixed(1)}`);
    } else if (fallbackLayerRef.current && layerMode === 'canvas') {
      const vectorPoints: VectorPoint[] = gridData.points.map(point => ({
        lat: point.lat,
        lng: point.lng,
        u: point.currentU ?? 0,
        v: point.currentV ?? 0,
        speed: point.currentSpeed ?? Math.sqrt((point.currentU ?? 0) ** 2 + (point.currentV ?? 0) ** 2),
      }));

      fallbackLayerRef.current.updateData(vectorPoints);
      console.log('[CurrentParticleLayerML] Canvas2D data updated:', { pointCount: vectorPoints.length });
    }
  }, [layerMode]);

  // Check device capabilities on mount
  useEffect(() => {
    const profile = getDeviceProfile();
    setGpgpuTier(profile.gpgpuTier);
    console.log('[CurrentParticleLayerML] Device profile:', profile.gpgpuTier);
  }, []);

  // Initialize the layer
  useEffect(() => {
    if (!map || gpgpuTier === null) return;

    const setupLayer = () => {
      if (layerAddedRef.current) return;

      // Determine insertion point — insert BELOW the land layer so land polygons clip the particles.
      // Double-guard: getSafeBeforeId checks the style spec; map.getLayer() checks runtime existence
      // (the target layer may be temporarily absent during fast zoom/pan tile-loading).
      const beforeId = getSafeBeforeId(map);
      const safeBeforeId = beforeId && map.getLayer(beforeId) ? beforeId : undefined;

      try {
        if (gpgpuTier === 'float' || gpgpuTier === 'uint8') {
          const profile = getDeviceProfile();
          const effectiveParticleCount = gpgpuTier === 'uint8'
            ? Math.min(particleCount, profile.recommendedParticleCount || 96)
            : particleCount;

          const particleLayer = createParticleLayer({
            id: 'current-particles-webgl',
            particleRes: effectiveParticleCount,
            speedFactor,
            fadeOpacity: 0.997,   // Longer trails than before — currents are slow so need more persistence
            dropRate: 0.0012,     // Very low drop rate — currents are persistent features
            dropRateBump: 0.002,  // Minimal bump — current speeds vary little
            pointSize: gpgpuTier === 'uint8' ? pointSize * 1.4 : pointSize * 1.1,
            colorRamp: CURRENT_COLORS,
            preferUint8: gpgpuTier === 'uint8',
          });

          if (!map.getLayer('current-particles-webgl')) {
            map.addLayer(particleLayer, safeBeforeId);
          }

          const mode = particleLayer.getMode();
          if (mode === 'disabled') {
            map.removeLayer('current-particles-webgl');
            throw new Error('GPGPU initialization failed');
          }

          layerRef.current = particleLayer;
          setLayerMode('gpgpu');
          console.log(`[CurrentParticleLayerML] GPGPU layer (${mode}) added with ${effectiveParticleCount * effectiveParticleCount} particles`);
        } else {
          throw new Error('No GPGPU support');
        }
      } catch (gpgpuError) {
        console.warn('[CurrentParticleLayerML] GPGPU failed, trying Canvas2D:', gpgpuError);

        try {
          const fallbackLayer = createCanvasVectorLayer({
            id: 'current-arrows-canvas',
            type: 'current',
            arrowScale: 20,
            arrowSpacing: 50,
            maxSpeed: 2,
          });

          if (!map.getLayer('current-arrows-canvas')) {
            map.addLayer(fallbackLayer, safeBeforeId);
          }
          fallbackLayerRef.current = fallbackLayer;
          setLayerMode('canvas');
          console.log('[CurrentParticleLayerML] Canvas2D fallback layer added', safeBeforeId ? `before "${safeBeforeId}"` : '(top)');
        } catch (canvasError) {
          console.error('[CurrentParticleLayerML] All fallbacks failed:', canvasError);
          setLayerMode('none');
        }
      }

      layerAddedRef.current = true;
    };

    if (map.isStyleLoaded()) {
      setupLayer();
    } else {
      map.once('style.load', setupLayer);
    }

    return () => {
      if (map && layerAddedRef.current) {
        try {
          if (map.getLayer('current-particles-webgl')) {
            map.removeLayer('current-particles-webgl');
          }
          if (map.getLayer('current-arrows-canvas')) {
            map.removeLayer('current-arrows-canvas');
          }
        } catch {
          // Ignore
        }
        layerAddedRef.current = false;
        layerRef.current = null;
        fallbackLayerRef.current = null;
      }
    };
  }, [map, gpgpuTier, particleCount, speedFactor, pointSize]);

  // Handle visibility changes
  useEffect(() => {
    if (layerRef.current) {
      layerRef.current.setVisibility(visible);
    }
    if (fallbackLayerRef.current) {
      fallbackLayerRef.current.setVisibility(visible);
    }
  }, [visible]);

  // Process shared grid data when it arrives or changes
  useEffect(() => {
    if (!visible || !sharedGridData) return;
    processGridData(sharedGridData);
  }, [visible, sharedGridData, processGridData]);

  return null;
}

export default CurrentParticleLayerML;
