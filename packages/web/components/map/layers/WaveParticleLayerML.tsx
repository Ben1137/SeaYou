/**
 * WaveParticleLayerML - React component wrapper for GPGPU Wave Particle Engine
 *
 * Visualises significant wave propagation as animated flow particles.
 * Data source: waveU / waveV fields from MarineGridPoint (wave_height ×
 * direction-to-UV conversion, FROM convention, same as wind).
 *
 * Supports the same 3-tier fallback as WindParticleLayerML:
 *   Tier 1: GPGPU with Float32 textures (best quality)
 *   Tier 2: GPGPU with Uint8 R8G8B8A8 encoding (universal WebGL support)
 *   Tier 3: Canvas2D arrow rendering (last resort)
 *
 * Key differences from WindParticleLayerML:
 *   - Reads waveU / waveV (0–5 m range) instead of windU / windV (0–20+ m/s)
 *   - Uses WAVE_PARTICLE_COLORS ramp (navy → cyan → white glow)
 *   - Slightly larger pointSize for chunkier, wave-energy look
 *   - Lower speedFactor because wave heights span a much narrower range
 *   - Layer IDs: 'wave-particles-webgl' / 'wave-arrows-canvas'
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useMap } from '../useMap';
import { createParticleLayer, type ParticleLayer } from '../../../webgl/ParticleEngine';
import { createCanvasVectorLayer, type CanvasVectorLayer, type VectorPoint } from '../../../webgl/CanvasVectorLayer';
import { encodeVelocityGrid, encodeVelocityGridUint8 } from '../../../webgl/DataEncoder';
import { WAVE_PARTICLE_COLORS } from '../../../webgl/ColorRamps';
import { getDeviceProfile, type GPGPUTier } from '../../../webgl/DeviceCapabilities';
import { getSafeBeforeId } from '../../../utils/mapLayerUtils';
import type { MarineGridData } from '@seame/core';

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
  particleCount = 256,
  speedFactor = 2.0,
  pointSize = 3.0,
  sharedGridData,
}: WaveParticleLayerMLProps) {
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

    const waveMap = new Map<string, { u: number; v: number }>();
    gridData.points.forEach(point => {
      const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
      // Use NaN for land points — encoder marks alpha=0, particle shader drops particles instantly
      waveMap.set(key, {
        u: point.isOcean ? (point.waveU ?? NaN) : NaN,
        v: point.isOcean ? (point.waveV ?? NaN) : NaN,
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
        const wave = waveMap.get(key);
        uRow.push(wave?.u ?? NaN);
        vRow.push(wave?.v ?? NaN);
      }
      uGrid.push(uRow);
      vGrid.push(vRow);
    }

    const actualMinLon = lons[0];
    const actualMaxLon = lons[lons.length - 1];
    const actualMinLat = lats[0];
    const actualMaxLat = lats[lats.length - 1];

    if (layerRef.current && layerMode === 'gpgpu') {
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

      console.log(`[WaveParticleLayerML] GPGPU data updated (${engineMode}): ${gridWidth}x${gridHeight}, maxSpeed=${metadata.maxSpeed.toFixed(2)}m`);
    } else if (fallbackLayerRef.current && layerMode === 'canvas') {
      const vectorPoints: VectorPoint[] = gridData.points.map(point => ({
        lat: point.lat,
        lng: point.lng,
        u: point.waveU ?? 0,
        v: point.waveV ?? 0,
        speed: point.waveHeight ?? Math.sqrt((point.waveU ?? 0) ** 2 + (point.waveV ?? 0) ** 2),
      }));

      fallbackLayerRef.current.updateData(vectorPoints);
    }
  }, [layerMode]);

  // Check device capabilities on mount
  useEffect(() => {
    const profile = getDeviceProfile();
    setGpgpuTier(profile.gpgpuTier);
    console.log('[WaveParticleLayerML] Device profile:', profile.gpgpuTier);
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
            ? Math.min(particleCount, profile.recommendedParticleCount || 128)
            : particleCount;

          const particleLayer = createParticleLayer({
            id: 'wave-particles-webgl',
            particleRes: effectiveParticleCount,
            speedFactor,
            fadeOpacity: 0.965,    // Slightly shorter trails than wind — wave fronts are wide/slow
            dropRate: 0.002,       // Standard base drop rate
            dropRateBump: 0.005,   // Mild speed bump for high-energy swells
            pointSize: gpgpuTier === 'uint8' ? pointSize * 1.4 : pointSize * 1.1,
            colorRamp: WAVE_PARTICLE_COLORS,
            preferUint8: gpgpuTier === 'uint8',
          });

          if (!map.getLayer('wave-particles-webgl')) {
            map.addLayer(particleLayer, safeBeforeId);
          }

          const mode = particleLayer.getMode();
          if (mode === 'disabled') {
            map.removeLayer('wave-particles-webgl');
            throw new Error('GPGPU initialization failed');
          }

          layerRef.current = particleLayer;
          setLayerMode('gpgpu');
          console.log(`[WaveParticleLayerML] GPGPU layer (${mode}) added with ${effectiveParticleCount * effectiveParticleCount} particles`);
        } else {
          throw new Error('No GPGPU support');
        }
      } catch (gpgpuError) {
        console.warn('[WaveParticleLayerML] GPGPU failed, trying Canvas2D:', gpgpuError);

        try {
          const fallbackLayer = createCanvasVectorLayer({
            id: 'wave-arrows-canvas',
            type: 'wind',     // reuses the arrow renderer — direction + magnitude
            arrowScale: 1.0,
            arrowSpacing: 50,
            maxSpeed: 5,      // wave heights are 0–5m
          });

          if (!map.getLayer('wave-arrows-canvas')) {
            map.addLayer(fallbackLayer, safeBeforeId);
          }
          fallbackLayerRef.current = fallbackLayer;
          setLayerMode('canvas');
          console.log('[WaveParticleLayerML] Canvas2D fallback layer added', safeBeforeId ? `before "${safeBeforeId}"` : '(top)');
        } catch (canvasError) {
          console.error('[WaveParticleLayerML] All fallbacks failed:', canvasError);
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
          if (map.getLayer('wave-particles-webgl')) {
            map.removeLayer('wave-particles-webgl');
          }
          if (map.getLayer('wave-arrows-canvas')) {
            map.removeLayer('wave-arrows-canvas');
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

export default WaveParticleLayerML;
