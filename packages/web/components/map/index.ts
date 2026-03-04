// MapLibre GL JS Components (WebGL Migration - Phase 0)
export { MapProvider, useMapContext, MapContext } from './MapProvider';
export { useMap, useMapReady, useMapInstance } from './useMap';
export { MapContainerML } from './MapContainerML';

// MapLibre Native Layers (WebGL Migration - Phase 1)
export { PortsLayerML, type PortFeature, type PortsLayerMLProps } from './layers/PortsLayerML';
export { ReefLayerML, type ReefFeature, type ReefLayerMLProps } from './layers/ReefLayerML';
export { BathymetryLayerML, type BathymetryLayerMLProps } from './layers/BathymetryLayerML';
export { RainRadarLayerML, type RainRadarLayerMLProps } from './layers/RainRadarLayerML';

// Custom WebGL Layers (WebGL Migration - Phase 2)
export { WaveHeatmapLayerML, type WaveHeatmapLayerMLProps } from './layers/WaveHeatmapLayerML';

// GPGPU Particle Layers (WebGL Migration - Phase 3 & 4)
export { WindParticleLayerML, type WindParticleLayerMLProps } from './layers/WindParticleLayerML';
export { CurrentParticleLayerML, type CurrentParticleLayerMLProps } from './layers/CurrentParticleLayerML';

// Sea Temperature Layer (WebGL Migration - Phase 5)
export { SeaTemperatureLayerML, type SeaTemperatureLayerMLProps } from './layers/SeaTemperatureLayerML';

// WebGL Fallback (Phase 5)
export { WebGLFallback, useWebGLSupport, type WebGLFallbackProps } from './WebGLFallback';

// UI Components
export { ColorScaleLegend, type ColorScaleLegendProps, type ColorScaleItem } from './ColorScaleLegend';
export { default as TimeSlider } from './TimeSlider';
