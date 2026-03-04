/**
 * WindParticleLayerML - React component wrapper for GPGPU Wind Particle Engine
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
import { WIND_COLORS } from '../../../webgl/ColorRamps';
import { getDeviceProfile, type GPGPUTier } from '../../../webgl/DeviceCapabilities';
import type { MarineGridData } from '@seame/core';

export interface WindParticleLayerMLProps {
  visible: boolean;
  particleCount?: number;
  speedFactor?: number;
  pointSize?: number;
  sharedGridData?: MarineGridData | null;
}

type LayerMode = 'gpgpu' | 'canvas' | 'none';

export function WindParticleLayerML({
  visible,
  particleCount = 256,
  speedFactor = 2.0,
  pointSize = 2.5,
  sharedGridData,
}: WindParticleLayerMLProps) {
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

    const windMap = new Map<string, { u: number; v: number }>();
    gridData.points.forEach(point => {
      const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
      windMap.set(key, {
        u: point.windU ?? 0,
        v: point.windV ?? 0,
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
        const wind = windMap.get(key);
        uRow.push(wind?.u ?? 0);
        vRow.push(wind?.v ?? 0);
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

      console.log(`[WindParticleLayerML] GPGPU data updated (${engineMode}): ${gridWidth}x${gridHeight}, maxSpeed=${metadata.maxSpeed.toFixed(1)}`);
    } else if (fallbackLayerRef.current && layerMode === 'canvas') {
      const vectorPoints: VectorPoint[] = gridData.points.map(point => ({
        lat: point.lat,
        lng: point.lng,
        u: point.windU ?? 0,
        v: point.windV ?? 0,
        speed: point.windSpeed ?? Math.sqrt((point.windU ?? 0) ** 2 + (point.windV ?? 0) ** 2),
      }));

      fallbackLayerRef.current.updateData(vectorPoints);
    }
  }, [layerMode]);

  // Check device capabilities on mount
  useEffect(() => {
    const profile = getDeviceProfile();
    setGpgpuTier(profile.gpgpuTier);
    console.log('[WindParticleLayerML] Device profile:', profile.gpgpuTier);
  }, []);

  // Initialize the layer
  useEffect(() => {
    if (!map || gpgpuTier === null) return;

    const setupLayer = () => {
      if (layerAddedRef.current) return;

      try {
        if (gpgpuTier === 'float' || gpgpuTier === 'uint8') {
          const profile = getDeviceProfile();
          const effectiveParticleCount = gpgpuTier === 'uint8'
            ? Math.min(particleCount, profile.recommendedParticleCount || 128)
            : particleCount;

          const particleLayer = createParticleLayer({
            id: 'wind-particles-webgl',
            particleRes: effectiveParticleCount,
            speedFactor,
            fadeOpacity: 0.9965,  // Slightly shorter trails = sharper, denser streams (Windy sweet spot)
            dropRate: 0.0015,     // Very low base drop → particles complete long, full streaks
            dropRateBump: 0.004,  // Gentle speed bump — fast wind gets slightly shorter trails
            pointSize: gpgpuTier === 'uint8' ? pointSize * 1.4 : pointSize * 1.1,
            colorRamp: WIND_COLORS,
            preferUint8: gpgpuTier === 'uint8',
          });

          map.addLayer(particleLayer);

          const mode = particleLayer.getMode();
          if (mode === 'disabled') {
            map.removeLayer('wind-particles-webgl');
            throw new Error('GPGPU initialization failed');
          }

          layerRef.current = particleLayer;
          setLayerMode('gpgpu');
          console.log(`[WindParticleLayerML] GPGPU layer (${mode}) added with ${effectiveParticleCount * effectiveParticleCount} particles`);
        } else {
          throw new Error('No GPGPU support');
        }
      } catch (gpgpuError) {
        console.warn('[WindParticleLayerML] GPGPU failed, trying Canvas2D:', gpgpuError);

        try {
          const fallbackLayer = createCanvasVectorLayer({
            id: 'wind-arrows-canvas',
            type: 'wind',
            arrowScale: 0.8,
            arrowSpacing: 50,
            maxSpeed: 50,
          });

          map.addLayer(fallbackLayer);
          fallbackLayerRef.current = fallbackLayer;
          setLayerMode('canvas');
          console.log('[WindParticleLayerML] Canvas2D fallback layer added');
        } catch (canvasError) {
          console.error('[WindParticleLayerML] All fallbacks failed:', canvasError);
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
          if (map.getLayer('wind-particles-webgl')) {
            map.removeLayer('wind-particles-webgl');
          }
          if (map.getLayer('wind-arrows-canvas')) {
            map.removeLayer('wind-arrows-canvas');
          }
        } catch {
          // Ignore cleanup errors
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

export default WindParticleLayerML;
