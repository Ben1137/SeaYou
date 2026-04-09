/**
 * WebGL Utilities and Engines
 * Offscreen Canvas Source architecture — each engine owns its GL context
 */

// Core WebGL Utilities
export {
  createShader,
  createProgram,
  createDataTexture,
  createInterpolatedTexture,
  createFramebuffer,
  createQuadBuffer,
  createParticleIndexBuffer,
} from './GLUtils';

// Data Encoding
export {
  encodeScalarGrid,
  encodeVelocityGrid,
  arrayToGrid,
  type GridMetadata,
} from './DataEncoder';

// Color Ramps
export {
  createColorRampTexture,
  WAVE_COLORS,
  WIND_COLORS,
  CURRENT_COLORS,
  TEMPERATURE_COLORS,
  AIR_TEMPERATURE_COLORS,
  PRECIPITATION_COLORS,
  CLOUD_COVER_COLORS,
} from './ColorRamps';

// Generic Heatmap Engine (Offscreen Canvas)
export {
  createGenericHeatmapEngine,
  type HeatmapLayerConfig,
  type GenericHeatmapEngine,
  type HeatmapMode,
  type NormalizationMode,
} from './GenericHeatmapEngine';

// Particle Engine (Offscreen Canvas)
export {
  createParticleEngine,
  type ParticleEngineConfig,
  type ParticleEngine,
} from './ParticleEngine';

// Offscreen Canvas Manager
export {
  createOffscreenCanvas,
  type OffscreenCanvasHandle,
} from './OffscreenCanvasManager';

// Device Capabilities
export {
  isMobileDevice,
  isLowEndDevice,
  checkWebGLCapabilities,
  getDeviceProfile,
  getAdaptiveParticleCount,
  logDeviceCapabilities,
  type WebGLCapabilities,
  type DeviceProfile,
} from './DeviceCapabilities';
