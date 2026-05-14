/**
 * CompoundSeaTempCurrentsML — Compound layer: Sea Surface Temperature + Ocean Currents
 *
 * Mounts both engines simultaneously in a React Fragment. MapLibre's WebGL context
 * blends them using the Z-index sandwich:
 *
 *   Ocean background
 *   └── Sea Temp heatmap  (getMarineBeforeId → below land polygon)
 *   └── Current particles (getMarineBeforeId → below land polygon, on top of heatmap)
 *   └── Dark land polygon (MVT vector tile — natural coastline clipping)
 *
 * Both layers share the same sharedGridData prop so only ONE Open-Meteo request
 * is made for both. The marine grid service caches the response via TanStack Query.
 *
 * Usage in MapContainerML:
 *   <CompoundSeaTempCurrentsML
 *     visible={advancedLayer === 'SEA_TEMP_CURRENTS'}
 *     sharedGridData={sharedMarineData.gridData}
 *   />
 */

import React from 'react';
import { useMap } from '../useMap';
import { SeaTemperatureLayerML } from './SeaTemperatureLayerML';
import { CurrentParticleLayerML } from './CurrentParticleLayerML';
import type { MarineGridData } from '@seame/core';

export interface CompoundSeaTempCurrentsMLProps {
  /** When false, both sub-layers hide themselves. */
  visible: boolean;
  /** Heatmap opacity. Default 0.6 — enough to read currents on top. */
  tempOpacity?: number;
  /** Sea temp min/max range for colour normalisation. */
  minTemp?: number;
  maxTemp?: number;
  /** Shared marine grid data — same fetch used by both sub-layers. */
  sharedGridData?: MarineGridData | null;
}

export function CompoundSeaTempCurrentsML({
  visible,
  tempOpacity = 0.6,
  minTemp = -2,
  maxTemp = 35,
  sharedGridData,
}: CompoundSeaTempCurrentsMLProps) {
  const map = useMap();
  if (!map) return null;

  return (
    <>
      {/* Layer 1 (bottom): Sea surface temperature heatmap
           Uses distinct instanceId to avoid collisions with standalone SeaTemperatureLayerML */}
      <SeaTemperatureLayerML
        visible={visible}
        opacity={tempOpacity}
        minTemp={minTemp}
        maxTemp={maxTemp}
        sharedGridData={sharedGridData}
        instanceId="compound-sea-temp"
      />

      {/* Layer 2 (top): GPGPU current particle system — renders above heatmap
           Uses distinct instanceId to avoid collisions with standalone CurrentParticleLayerML */}
      <CurrentParticleLayerML
        visible={visible}
        particleCount={128}
        monochrome
        sharedGridData={sharedGridData}
        instanceId="compound-current-particles"
      />
    </>
  );
}

export default CompoundSeaTempCurrentsML;
