/**
 * MapLibre GL JS Native Layers
 * Phase 1: Native layer implementations replacing Leaflet components
 */

export { PortsLayerML, type PortFeature, type PortsLayerMLProps } from './PortsLayerML';
export { ReefLayerML, type ReefFeature, type ReefLayerMLProps } from './ReefLayerML';
export { BathymetryLayerML, type BathymetryLayerMLProps } from './BathymetryLayerML';
export { RainRadarLayerML, type RainRadarLayerMLProps } from './RainRadarLayerML';
export { CoastlineLayerML, type CoastlineLayerMLProps } from './CoastlineLayerML';
export { MarineAreasLayerML, type MarineAreasLayerMLProps } from './MarineAreasLayerML';

/**
 * Custom WebGL Layers
 * Phase 2: Wave Heatmap with GPU-accelerated rendering
 */
export { WaveHeatmapLayerML, type WaveHeatmapLayerMLProps } from './WaveHeatmapLayerML';

/**
 * GPGPU Particle Layers
 * Phase 3: Wind Particles with GPU-accelerated animation
 */
export { WindParticleLayerML, type WindParticleLayerMLProps } from './WindParticleLayerML';

/**
 * GPGPU Particle Layers
 * Phase 4: Current Particles with GPU-accelerated animation
 */
export { CurrentParticleLayerML, type CurrentParticleLayerMLProps } from './CurrentParticleLayerML';

/**
 * Current Speed Heatmap
 * Premium layer — color-coded magnitude of ocean currents.
 */
export { CurrentHeatmapLayerML, type CurrentHeatmapLayerMLProps } from './CurrentHeatmapLayerML';

/**
 * Sea Temperature Layer
 * Phase 5: Sea surface temperature visualization
 */
export { SeaTemperatureLayerML, type SeaTemperatureLayerMLProps } from './SeaTemperatureLayerML';

/**
 * Atmospheric Forecast Layers
 * Phase 6B: Air temperature, precipitation, cloud cover using GenericHeatmapEngine
 */
export { AirTemperatureLayerML, type AirTemperatureLayerMLProps } from './AirTemperatureLayerML';
export { PrecipitationLayerML, type PrecipitationLayerMLProps } from './PrecipitationLayerML';
export { CloudCoverLayerML, type CloudCoverLayerMLProps } from './CloudCoverLayerML';
