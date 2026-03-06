/**
 * WebGL Utilities and Engines
 * Phase 2+: Custom WebGL rendering for SeaYou
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
  saveGLState,
  restoreGLState,
  type GLState,
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

// Generic Heatmap Engine (Phase 6A — replaces WaveHeatmapEngine + SeaTemperatureEngine)
export {
  createGenericHeatmapLayer,
  type HeatmapLayerConfig,
  type GenericHeatmapLayer,
  type HeatmapMode,
  type NormalizationMode,
} from './GenericHeatmapEngine';

// Particle Engine (Phase 3)
export {
  createParticleLayer,
  type ParticleEngineConfig,
  type ParticleLayer,
} from './ParticleEngine';

// Device Capabilities (Phase 5)
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
