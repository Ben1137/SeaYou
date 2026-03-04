/**
 * DeviceCapabilities.ts - Device detection and WebGL capability checking
 * Supports multiple fallback tiers:
 *   Tier 1: GPGPU with Float32 textures (OES_texture_float)
 *   Tier 2: GPGPU with Uint8 textures (R8G8B8A8 encoding)
 *   Tier 3: Canvas2D fallback (arrow rendering)
 */

export interface WebGLCapabilities {
  supported: boolean;
  floatTexturesSupported: boolean;
  floatLinearSupported: boolean;
  floatRenderTargetSupported: boolean;  // Can render TO float textures
  vertexTexturesSupported: boolean;
  maxVertexTextureUnits: number;
  maxTextureSize: number;
  renderer: string;
  vendor: string;
}

export type GPGPUTier = 'float' | 'uint8' | 'canvas' | 'none';

export interface DeviceProfile {
  isMobile: boolean;
  isLowEnd: boolean;
  gpgpuTier: GPGPUTier;
  recommendedParticleCount: number;
  recommendedParticleSize: number;
  webglCapabilities: WebGLCapabilities;
}

/**
 * Detect if device is mobile
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;

  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
  const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet/i;
  const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isSmallScreen = window.innerWidth <= 768;

  return mobileRegex.test(userAgent.toLowerCase()) || (hasTouchScreen && isSmallScreen);
}

/**
 * Detect if device is low-end
 */
export function isLowEndDevice(): boolean {
  if (typeof window === 'undefined') return false;

  const cores = navigator.hardwareConcurrency || 2;
  if (cores <= 2) return true;

  const deviceMemory = (navigator as any).deviceMemory;
  if (deviceMemory && deviceMemory <= 2) return true;

  const pixelRatio = window.devicePixelRatio || 1;
  if (pixelRatio < 1) return true;

  return false;
}

/**
 * Check WebGL capabilities with detailed float texture support testing
 */
export function checkWebGLCapabilities(): WebGLCapabilities {
  const defaultResult: WebGLCapabilities = {
    supported: false,
    floatTexturesSupported: false,
    floatLinearSupported: false,
    floatRenderTargetSupported: false,
    vertexTexturesSupported: false,
    maxVertexTextureUnits: 0,
    maxTextureSize: 0,
    renderer: 'Unknown',
    vendor: 'Unknown',
  };

  if (typeof document === 'undefined') return defaultResult;

  let canvas: HTMLCanvasElement | null = null;
  let gl: WebGLRenderingContext | null = null;

  try {
    canvas = document.createElement('canvas');
    gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;

    if (!gl) return defaultResult;

    // Check for float texture support
    const floatExt = gl.getExtension('OES_texture_float');
    const floatLinearExt = gl.getExtension('OES_texture_float_linear');

    // Check for vertex texture support
    const maxVertexTextureUnits = gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS);

    // Check if we can RENDER TO float textures (not just read from them)
    let floatRenderTargetSupported = false;
    if (floatExt) {
      try {
        const testTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, testTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, gl.FLOAT, null);

        const testFbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, testFbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, testTexture, 0);

        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        floatRenderTargetSupported = status === gl.FRAMEBUFFER_COMPLETE;

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteFramebuffer(testFbo);
        gl.deleteTexture(testTexture);
      } catch {
        floatRenderTargetSupported = false;
      }
    }

    // Get renderer info
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    let renderer = 'Unknown';
    let vendor = 'Unknown';
    if (debugInfo) {
      renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'Unknown';
      vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'Unknown';
    }

    return {
      supported: true,
      floatTexturesSupported: !!floatExt,
      floatLinearSupported: !!floatLinearExt,
      floatRenderTargetSupported,
      vertexTexturesSupported: maxVertexTextureUnits >= 1,
      maxVertexTextureUnits,
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      renderer,
      vendor,
    };
  } catch (error) {
    console.error('[DeviceCapabilities] WebGL check failed:', error);
    return defaultResult;
  } finally {
    // Clean up
    if (gl) {
      const loseContext = gl.getExtension('WEBGL_lose_context');
      if (loseContext) loseContext.loseContext();
    }
  }
}

/**
 * Determine the GPGPU tier for this device
 */
export function getGPGPUTier(capabilities: WebGLCapabilities): GPGPUTier {
  if (!capabilities.supported) {
    return 'none';
  }

  if (!capabilities.vertexTexturesSupported) {
    // Can't do vertex texture fetching - must use Canvas2D
    return 'canvas';
  }

  if (capabilities.floatTexturesSupported && capabilities.floatRenderTargetSupported) {
    // Full float support - best quality
    return 'float';
  }

  // Can do vertex texture fetch but no float render target - use Uint8 encoding
  return 'uint8';
}

/**
 * Get device profile with recommended settings
 */
export function getDeviceProfile(): DeviceProfile {
  const mobile = isMobileDevice();
  const lowEnd = isLowEndDevice();
  const capabilities = checkWebGLCapabilities();
  const gpgpuTier = getGPGPUTier(capabilities);

  // Calculate recommended particle count based on tier and device
  let recommendedParticleCount: number;
  let recommendedParticleSize: number;

  if (gpgpuTier === 'none' || gpgpuTier === 'canvas') {
    recommendedParticleCount = 0;
    recommendedParticleSize = 0;
  } else if (gpgpuTier === 'uint8') {
    // Uint8 mode - reduce particle count for performance
    if (lowEnd) {
      recommendedParticleCount = 64;  // 4K particles
      recommendedParticleSize = 2.5;
    } else if (mobile) {
      recommendedParticleCount = 96;  // ~9K particles
      recommendedParticleSize = 2.0;
    } else {
      recommendedParticleCount = 128; // 16K particles
      recommendedParticleSize = 1.5;
    }
  } else {
    // Float mode - full quality
    if (lowEnd) {
      recommendedParticleCount = 64;
      recommendedParticleSize = 2.0;
    } else if (mobile) {
      recommendedParticleCount = 128;
      recommendedParticleSize = 1.5;
    } else {
      recommendedParticleCount = 256;
      recommendedParticleSize = 1.5;
    }
  }

  return {
    isMobile: mobile,
    isLowEnd: lowEnd,
    gpgpuTier,
    recommendedParticleCount,
    recommendedParticleSize,
    webglCapabilities: capabilities,
  };
}

/**
 * Legacy compatibility: check if GPGPU is supported (either float or uint8)
 */
export function supportsGPGPU(): boolean {
  const capabilities = checkWebGLCapabilities();
  const tier = getGPGPUTier(capabilities);
  return tier === 'float' || tier === 'uint8';
}

/**
 * Calculate adaptive particle count based on zoom level
 */
export function getAdaptiveParticleCount(
  baseCount: number,
  zoomLevel: number,
  isMobile: boolean = false
): number {
  const minZoom = 6;
  const maxZoom = 10;

  const clampedZoom = Math.max(minZoom, Math.min(maxZoom, zoomLevel));
  const zoomFactor = (clampedZoom - minZoom) / (maxZoom - minZoom);

  const minFactor = 0.25;
  const factor = minFactor + (1 - minFactor) * zoomFactor;
  const mobileFactor = isMobile ? 0.5 : 1.0;

  const rawCount = Math.round(baseCount * factor * mobileFactor);

  // Round to nearest power of 2
  const log2 = Math.log2(rawCount);
  const roundedLog2 = Math.round(log2);
  const finalCount = Math.pow(2, Math.max(5, Math.min(9, roundedLog2)));

  return finalCount;
}

/**
 * Log device capabilities for debugging
 */
export function logDeviceCapabilities(): void {
  const profile = getDeviceProfile();

  console.group('[DeviceCapabilities] Device Profile');
  console.log('Mobile:', profile.isMobile);
  console.log('Low-end:', profile.isLowEnd);
  console.log('GPGPU Tier:', profile.gpgpuTier);
  console.log('Recommended Particles:', profile.recommendedParticleCount);
  console.log('WebGL Capabilities:');
  console.log('  - Float Textures:', profile.webglCapabilities.floatTexturesSupported);
  console.log('  - Float Render Target:', profile.webglCapabilities.floatRenderTargetSupported);
  console.log('  - Vertex Textures:', profile.webglCapabilities.vertexTexturesSupported);
  console.log('  - Renderer:', profile.webglCapabilities.renderer);
  console.groupEnd();
}

export default {
  isMobileDevice,
  isLowEndDevice,
  checkWebGLCapabilities,
  getGPGPUTier,
  getDeviceProfile,
  supportsGPGPU,
  getAdaptiveParticleCount,
  logDeviceCapabilities,
};
