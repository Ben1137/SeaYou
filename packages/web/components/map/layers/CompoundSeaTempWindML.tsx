/**
 * CompoundSeaTempWindML — Compound layer: Sea Surface Temperature + Wind Particles
 *
 * Mounts both engines simultaneously in a React Fragment. MapLibre's WebGL context
 * blends them using the Z-index sandwich:
 *
 *   Ocean background
 *   └── Sea Temp heatmap  (getMarineBeforeId → below land polygon)
 *   └── Wind particles    (getAtmosphereBeforeId → on top of heatmap)
 *   └── Dark land polygon (MVT vector tile — natural coastline clipping)
 *
 * Sea Temp uses MarineGridData (ocean-only), Wind uses ForecastGridData (global).
 * The compound layer receives BOTH data sources and passes them to the sub-layers.
 *
 * Usage in MapContainerML:
 *   <CompoundSeaTempWindML
 *     visible={advancedLayer === 'SEA_TEMP_WIND'}
 *     sharedGridData={sharedMarineData.gridData}
 *     sharedForecastData={sharedForecastData.gridData}
 *   />
 */

import React from 'react';
import { useMap } from '../useMap';
import { SeaTemperatureLayerML } from './SeaTemperatureLayerML';
import { WindParticleLayerML } from './WindParticleLayerML';
import type { MarineGridData, ForecastGridData } from '@seame/core';

export interface CompoundSeaTempWindMLProps {
  /** When false, both sub-layers hide themselves. */
  visible: boolean;
  /** Heatmap opacity. Default 0.55 — balanced: sea temp visible + wind particles readable. */
  tempOpacity?: number;
  /** Sea temp min/max range for colour normalisation. */
  minTemp?: number;
  maxTemp?: number;
  /** Shared marine grid data — for sea temperature heatmap (ocean-only). */
  sharedGridData?: MarineGridData | null;
  /** Shared forecast grid data — for wind particles (global coverage). */
  sharedForecastData?: ForecastGridData | null;
}

export function CompoundSeaTempWindML({
  visible,
  tempOpacity = 0.55,
  minTemp = -2,
  maxTemp = 35,
  sharedGridData,
  sharedForecastData,
}: CompoundSeaTempWindMLProps) {
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
        instanceId="compound-sea-temp-wind"
      />

      {/* Layer 2 (top): GPGPU wind particle system — renders above heatmap
           Uses forecast data for global land+sea coverage */}
      <WindParticleLayerML
        visible={visible}
        particleCount={128}
        monochrome
        sharedForecastData={sharedForecastData}
        sharedGridData={sharedGridData}
      />
    </>
  );
}

export default CompoundSeaTempWindML;
