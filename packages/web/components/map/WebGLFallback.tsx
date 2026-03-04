/**
 * WebGLFallback.tsx — Graceful fallback UI for devices without WebGL support
 * Phase 5: Error handling and graceful degradation
 */

import React from 'react';
import { AlertTriangle } from 'lucide-react';

export interface WebGLFallbackProps {
  feature: 'particles' | 'heatmap' | 'temperature' | 'webgl';
  className?: string;
}

const FEATURE_NAMES: Record<WebGLFallbackProps['feature'], string> = {
  particles: 'Wind/Current Particles',
  heatmap: 'Wave Heatmap',
  temperature: 'Sea Temperature',
  webgl: 'Advanced Visualizations',
};

const FEATURE_REASONS: Record<WebGLFallbackProps['feature'], string> = {
  particles: 'Float texture support is required for particle animation.',
  heatmap: 'WebGL shaders are required for wave visualization.',
  temperature: 'WebGL shaders are required for temperature visualization.',
  webgl: 'WebGL is not supported by your browser or device.',
};

export function WebGLFallback({ feature, className = '' }: WebGLFallbackProps) {
  return (
    <div
      className={`flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg ${className}`}
    >
      <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
      <div className="text-sm">
        <p className="font-medium text-amber-400">
          {FEATURE_NAMES[feature]} unavailable
        </p>
        <p className="text-amber-500/80 text-xs mt-1">
          {FEATURE_REASONS[feature]}
        </p>
      </div>
    </div>
  );
}

/**
 * Hook to check if WebGL particle visualization is supported
 */
export function useWebGLSupport(): {
  isSupported: boolean;
  supportsParticles: boolean;
  supportsHeatmap: boolean;
  errorMessage: string | null;
} {
  const [support, setSupport] = React.useState({
    isSupported: true,
    supportsParticles: true,
    supportsHeatmap: true,
    errorMessage: null as string | null,
  });

  React.useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

      if (!gl) {
        setSupport({
          isSupported: false,
          supportsParticles: false,
          supportsHeatmap: false,
          errorMessage: 'WebGL is not supported by your browser.',
        });
        return;
      }

      const webgl = gl as WebGLRenderingContext;

      // Check for float texture support (required for particles)
      const floatExt = webgl.getExtension('OES_texture_float');
      const maxVertexTextures = webgl.getParameter(webgl.MAX_VERTEX_TEXTURE_IMAGE_UNITS);

      const supportsParticles = !!floatExt && maxVertexTextures >= 1;

      setSupport({
        isSupported: true,
        supportsParticles,
        supportsHeatmap: true, // Basic heatmap works without float textures
        errorMessage: supportsParticles
          ? null
          : 'Float textures not supported - particle visualization disabled.',
      });
    } catch (error) {
      setSupport({
        isSupported: false,
        supportsParticles: false,
        supportsHeatmap: false,
        errorMessage: 'Failed to initialize WebGL.',
      });
    }
  }, []);

  return support;
}

export default WebGLFallback;
