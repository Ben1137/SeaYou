/**
 * OffscreenCanvasManager — Creates hidden DOM canvases with independent WebGL contexts.
 *
 * Used by the Canvas Source architecture: each WebGL layer renders to its own offscreen
 * canvas, which MapLibre's CanvasSource drapes over the globe. This eliminates GL state
 * sharing conflicts between our engines and MapLibre's internal rendering.
 */

export interface OffscreenCanvasHandle {
  /** The HTMLCanvasElement — pass to MapLibre's CanvasSource */
  canvas: HTMLCanvasElement;
  /** Independent WebGL context for this canvas */
  gl: WebGLRenderingContext | WebGL2RenderingContext;
  /** True if WebGL2 context was obtained */
  isWebGL2: boolean;
  /** True if float textures are supported (OES_texture_float or native WebGL2) */
  hasFloat: boolean;
  /** Check if the WebGL context has been lost (browser eviction or explicit destroy) */
  isContextLost(): boolean;
  /** Resize the canvas (also updates gl viewport) */
  resize(width: number, height: number): void;
  /** Remove canvas from DOM and release GL context */
  destroy(): void;
}

/** Hidden container element shared by all offscreen canvases */
let hiddenContainer: HTMLDivElement | null = null;

function getHiddenContainer(): HTMLDivElement {
  if (hiddenContainer && document.body.contains(hiddenContainer)) {
    return hiddenContainer;
  }
  hiddenContainer = document.createElement('div');
  hiddenContainer.id = 'seayou-offscreen-canvases';
  hiddenContainer.style.cssText =
    'position:fixed;left:-9999px;top:-9999px;width:0;height:0;overflow:hidden;pointer-events:none;';
  document.body.appendChild(hiddenContainer);
  return hiddenContainer;
}

/**
 * Create an offscreen canvas with its own WebGL context.
 *
 * @param id   Unique identifier (used as canvas id attribute)
 * @param width  Canvas width in pixels (default: 1024)
 * @param height Canvas height in pixels (default: 1024)
 */
export function createOffscreenCanvas(
  id: string,
  width = 1024,
  height = 1024
): OffscreenCanvasHandle {
  const container = getHiddenContainer();

  const canvas = document.createElement('canvas');
  canvas.id = `offscreen-${id}`;
  canvas.width = width;
  canvas.height = height;
  container.appendChild(canvas);

  // Try WebGL2 first, fallback to WebGL1
  const contextAttrs: WebGLContextAttributes = {
    alpha: true,
    premultipliedAlpha: false, // Straight alpha — MapLibre's raster layer handles compositing
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true, // Required for CanvasSource to read pixels
  };

  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  let isWebGL2 = false;

  gl = canvas.getContext('webgl2', contextAttrs) as WebGL2RenderingContext | null;
  if (gl) {
    isWebGL2 = true;
  } else {
    gl = canvas.getContext('webgl', contextAttrs) as WebGLRenderingContext | null;
  }

  if (!gl) {
    canvas.remove();
    throw new Error(`[OffscreenCanvas] Failed to create WebGL context for "${id}"`);
  }

  // Detect float texture support
  let hasFloat = false;
  if (isWebGL2) {
    // WebGL2 has native float textures, but need EXT_color_buffer_float for rendering to them
    const ext = gl.getExtension('EXT_color_buffer_float');
    hasFloat = !!ext;
    if (!hasFloat) {
      // Try the WebGL1 extension as fallback
      hasFloat = !!gl.getExtension('OES_texture_float');
    }
  } else {
    hasFloat = !!gl.getExtension('OES_texture_float');
  }

  // Also request linear filtering for float textures
  gl.getExtension('OES_texture_float_linear');

  let destroyed = false;
  let contextLost = false;

  // Detect WebGL context loss (happens when browser hits context limit)
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault(); // Signal that we may want restoration
    contextLost = true;
    // Only warn if this was NOT an intentional destroy — loseContext() during
    // destroy() also fires this event, which would flood the console.
    if (!destroyed) {
      console.warn(`[OffscreenCanvas] CONTEXT LOST for "${id}" — browser may have hit WebGL context limit`);
    }
  });
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    console.log(`[OffscreenCanvas] Context restored for "${id}"`);
  });

  return {
    canvas,
    gl,
    isWebGL2,
    hasFloat,

    isContextLost() {
      return destroyed || contextLost || gl!.isContextLost();
    },

    resize(w: number, h: number) {
      if (destroyed || contextLost) return;
      canvas.width = w;
      canvas.height = h;
      gl!.viewport(0, 0, w, h);
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      // Use the existing gl reference — don't try to re-acquire the context
      if (gl) {
        const ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
      }
      // Zero dimensions to force GPU resource release
      canvas.width = 0;
      canvas.height = 0;
      canvas.remove();
    },
  };
}
