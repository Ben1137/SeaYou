/**
 * SwellParticleLayerML - GPGPU particle layer for swell wave direction
 *
 * Renders animated particles flowing in the swell wave direction.
 * Uses swell height as speed (faster particles = bigger swell).
 * Data source: MarineGridData.swellHeight + swellDirection → U/V components.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useMap } from '../useMap';
import { createParticleEngine, type ParticleEngine } from '../../../webgl/ParticleEngine';
import { createOffscreenCanvas, type OffscreenCanvasHandle } from '../../../webgl/OffscreenCanvasManager';
import { useCanvasSourceLayer, boundsToCorners } from '../../../hooks/useCanvasSourceLayer';
import { encodeVelocityGrid, encodeVelocityGridUint8 } from '../../../webgl/DataEncoder';
import { SWELL_PARTICLE_COLORS } from '../../../webgl/ColorRamps';
import { getDeviceProfile, type GPGPUTier } from '../../../webgl/DeviceCapabilities';
import { getMarineBeforeId } from '../../../utils/mapLayerUtils';
import type { MarineGridData } from '@seame/core';

const SOURCE_ID = 'swell-particles-canvas-src';
const LAYER_ID = 'swell-particles-canvas-layer';

export interface SwellParticleLayerMLProps {
  visible: boolean;
  particleCount?: number;
  sharedGridData?: MarineGridData | null;
}

export function SwellParticleLayerML({
  visible,
  particleCount = 192,
  sharedGridData,
}: SwellParticleLayerMLProps) {
  const map = useMap();
  const mapRef = useRef(map);
  mapRef.current = map;
  const engineRef = useRef<ParticleEngine | null>(null);
  const canvasHandleRef = useRef<OffscreenCanvasHandle | null>(null);
  const rafRef = useRef<number | null>(null);
  const visibleRef = useRef(visible);
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);
  const [gpgpuTier, setGpgpuTier] = useState<GPGPUTier | null>(null);

  visibleRef.current = visible;

  useEffect(() => {
    setGpgpuTier(getDeviceProfile().gpgpuTier);
  }, []);

  useEffect(() => {
    if (gpgpuTier === null) return;
    if (gpgpuTier !== 'float' && gpgpuTier !== 'uint8') return;

    try {
      const handle = createOffscreenCanvas('swell-particles', 1024, 1024);
      canvasHandleRef.current = handle;

      const profile = getDeviceProfile();
      const effectiveRes = gpgpuTier === 'uint8'
        ? Math.min(particleCount, profile.recommendedParticleCount || 128)
        : particleCount;

      const engine = createParticleEngine({
        id: 'swell-particles',
        particleRes: effectiveRes,
        speedFactor: 3.0,
        fadeOpacity: 0.975,
        dropRate: 0.0015,
        dropRateBump: 0.004,
        pointSize: gpgpuTier === 'uint8' ? 1.8 : 1.4,
        colorRamp: SWELL_PARTICLE_COLORS,
        preferUint8: gpgpuTier === 'uint8',
      });
      engine.init(handle.canvas);

      if (engine.getMode() === 'disabled') {
        engine.destroy();
        handle.destroy();
        return;
      }

      engineRef.current = engine;
      setCanvasElement(handle.canvas);

      let destroyed = false;
      const animate = () => {
        if (destroyed) return;
        if (visibleRef.current && engineRef.current) {
          engineRef.current.update();
          engineRef.current.render();
          mapRef.current?.triggerRepaint();
        }
        rafRef.current = requestAnimationFrame(animate);
      };
      rafRef.current = requestAnimationFrame(animate);

      return () => {
        destroyed = true;
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        engineRef.current?.destroy();
        engineRef.current = null;
        canvasHandleRef.current?.destroy();
        canvasHandleRef.current = null;
      };
    } catch (err) {
      console.warn('[SwellParticleLayerML] GPGPU failed:', err);
      return undefined;
    }
  }, [gpgpuTier, particleCount]);

  useEffect(() => {
    if (!map) return;
    const handleZoomEnd = () => {
      engineRef.current?.resetTrails();
      engineRef.current?.resetParticles();
    };
    map.on('zoomend', handleZoomEnd);
    return () => { map.off('zoomend', handleZoomEnd); };
  }, [map]);

  const beforeId = map ? getMarineBeforeId(map) : undefined;
  const { updateCoordinates } = useCanvasSourceLayer({
    map: engineRef.current ? map : null,
    sourceId: SOURCE_ID,
    layerId: LAYER_ID,
    canvas: canvasElement,
    beforeId,
    opacity: 1.0,
    visible,
  });

  const processGridData = useCallback((gridData: MarineGridData) => {
    if (!gridData?.points?.length || !engineRef.current) return;

    const lats = [...new Set(gridData.points.map(p => p.lat))].sort((a, b) => a - b);
    const lons = [...new Set(gridData.points.map(p => p.lng))].sort((a, b) => a - b);

    // Convert swell height + direction → U/V velocity components
    const swellMap = new Map<string, { u: number; v: number }>();
    gridData.points.forEach(point => {
      const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
      if (!point.isOcean || point.swellHeight == null || point.swellDirection == null) {
        swellMap.set(key, { u: NaN, v: NaN });
        return;
      }
      const rad = (point.swellDirection * Math.PI) / 180;
      const speed = point.swellHeight; // Use height as proxy for speed
      swellMap.set(key, {
        u: speed * Math.sin(rad),
        v: speed * Math.cos(rad),
      });
    });

    const uGrid: number[][] = [];
    const vGrid: number[][] = [];
    for (let latIdx = 0; latIdx < lats.length; latIdx++) {
      const uRow: number[] = [];
      const vRow: number[] = [];
      for (let lonIdx = 0; lonIdx < lons.length; lonIdx++) {
        const key = `${lats[latIdx].toFixed(4)},${lons[lonIdx].toFixed(4)}`;
        const sv = swellMap.get(key);
        uRow.push(sv?.u ?? NaN);
        vRow.push(sv?.v ?? NaN);
      }
      uGrid.push(uRow);
      vGrid.push(vRow);
    }

    const [minLon, maxLon] = [lons[0], lons[lons.length - 1]];
    const [minLat, maxLat] = [lats[0], lats[lats.length - 1]];

    const engineMode = engineRef.current.getMode();
    const { data, metadata } = engineMode === 'uint8'
      ? encodeVelocityGridUint8(uGrid, vGrid, minLon, maxLon, minLat, maxLat)
      : encodeVelocityGrid(uGrid, vGrid, minLon, maxLon, minLat, maxLat);

    engineRef.current.updateVelocityData(
      data, metadata.width, metadata.height,
      minLon, minLat, maxLon, maxLat, metadata.maxSpeed
    );
    updateCoordinates(boundsToCorners(minLon, maxLon, minLat, maxLat));
  }, [updateCoordinates]);

  useEffect(() => {
    if (!visible || !sharedGridData) return;
    processGridData(sharedGridData);
  }, [visible, sharedGridData, processGridData]);

  return null;
}

export default SwellParticleLayerML;
