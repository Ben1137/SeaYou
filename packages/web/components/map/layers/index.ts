/**
 * MapLibre GL JS Native Layers
 * Phase 1: Native layer implementations replacing Leaflet components
 */

export { PortsLayerML, type PortFeature, type PortsLayerMLProps } from './PortsLayerML';
export { ReefLayerML, type ReefFeature, type ReefLayerMLProps } from './ReefLayerML';
export { BathymetryLayerML, type BathymetryLayerMLProps } from './BathymetryLayerML';
export { RainRadarLayerML, type RainRadarLayerMLProps } from './RainRadarLayerML';

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
 * Sea Temperature Layer
 * Phase 5: Sea surface temperature visualization
 */
export { SeaTemperatureLayerML, type SeaTemperatureLayerMLProps } from './SeaTemperatureLayerML';
