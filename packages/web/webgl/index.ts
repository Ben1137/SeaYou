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
} from './ColorRamps';

// Wave Heatmap Engine (Phase 2)
export {
  createWaveHeatmapLayer,
  type WaveHeatmapConfig,
  type WaveHeatmapLayer,
} from './WaveHeatmapEngine';

// Particle Engine (Phase 3)
export {
  createParticleLayer,
  type ParticleEngineConfig,
  type ParticleLayer,
} from './ParticleEngine';

// Sea Temperature Engine (Phase 5)
export {
  createSeaTemperatureLayer,
  type SeaTemperatureConfig,
  type SeaTemperatureLayer,
} from './SeaTemperatureEngine';

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
