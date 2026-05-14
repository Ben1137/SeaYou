/**
 * CompoundWaveHeatmapParticlesML — Compound layer: Wave Heatmap + Wave Particles
 *
 * Mounts both engines simultaneously in a React Fragment. MapLibre's WebGL context
 * blends them using the Z-index sandwich:
 *
 *   Ocean background
 *   └── Wave heatmap    (purple/fuchsia scalar field)
 *   └── Wave particles  (white "whitecap" dots flowing along wave direction)
 *   └── Dark land polygon
 *
 * Both layers share the same sharedGridData prop so only ONE Open-Meteo request
 * is made for both. The marine grid service caches the response via TanStack Query.
 *
 * Usage in MapContainerML:
 *   <CompoundWaveHeatmapParticlesML
 *     visible={advancedLayer === 'WAVE_HEATMAP'}
 *     sharedGridData={sharedMarineData.gridData}
 *   />
 */

import React from 'react';
import { useMap } from '../useMap';
import { WaveHeatmapLayerML } from './WaveHeatmapLayerML';
import { WaveParticleLayerML } from './WaveParticleLayerML';
import type { MarineGridData } from '@seame/core';

export interface CompoundWaveHeatmapParticlesMLProps {
  /** When false, both sub-layers hide themselves. */
  visible: boolean;
  /** Heatmap opacity. Default 0.50 — lets wave particles read clearly on top. */
  heatmapOpacity?: number;
  /** Shared marine grid data — same fetch used by both sub-layers. */
  sharedGridData?: MarineGridData | null;
}

export function CompoundWaveHeatmapParticlesML({
  visible,
  heatmapOpacity = 0.50,
  sharedGridData,
}: CompoundWaveHeatmapParticlesMLProps) {
  const map = useMap();
  if (!map) return null;

  return (
    <>
      {/* Layer 1 (bottom): Wave height heatmap (purple → fuchsia → pink) */}
      <WaveHeatmapLayerML
        visible={visible}
        opacity={heatmapOpacity}
        sharedGridData={sharedGridData}
      />

      {/* Layer 2 (top): GPGPU wave particles — white "whitecap" dots over heatmap
           Uses WAVE_PARTICLE_COLORS (pure white varying alpha) for maximum contrast */}
      <WaveParticleLayerML
        visible={visible}
        particleCount={128}
        sharedGridData={sharedGridData}
      />
    </>
  );
}

export default CompoundWaveHeatmapParticlesML;
