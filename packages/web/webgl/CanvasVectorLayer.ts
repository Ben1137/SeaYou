/**
 * CanvasVectorLayer.ts - Canvas2D-based Wind/Current Arrow Layer
 * Software fallback for devices without WebGL GPGPU support
 * Renders wind or current vectors as arrows using Canvas2D
 *
 * FIXES:
 * - Proper canvas positioning within map container
 * - Updates on map move/zoom
 * - DPR (device pixel ratio) handling
 * - Proper cleanup
 */

import type maplibregl from 'maplibre-gl';

export interface VectorPoint {
  lat: number;
  lng: number;
  u: number;  // East-West velocity
  v: number;  // North-South velocity
  speed: number;
}

export interface CanvasVectorLayerConfig {
  id: string;
  type: 'wind' | 'current';
  arrowScale?: number;      // Scale factor for arrow length
  arrowSpacing?: number;    // Minimum spacing between arrows in pixels
  colorRamp?: string[];     // Colors from low to high speed
  maxSpeed?: number;        // Maximum speed for color scaling
}

const DEFAULT_WIND_COLORS = [
  '#b3d4f0', // Light blue - calm
  '#60a5fa', // Blue - light
  '#22d3ee', // Cyan - moderate
  '#4ade80', // Green - fresh
  '#facc15', // Yellow - strong
  '#f97316', // Orange - very strong
  '#ef4444', // Red - severe
];

const DEFAULT_CURRENT_COLORS = [
  '#a5f3fc', // Cyan-200
  '#22d3ee', // Cyan-400
  '#06b6d4', // Cyan-500
  '#0891b2', // Cyan-600
  '#0e7490', // Cyan-700
  '#155e75', // Cyan-800
];

export interface CanvasVectorLayer extends maplibregl.CustomLayerInterface {
  updateData: (points: VectorPoint[]) => void;
  setVisibility: (visible: boolean) => void;
}

export function createCanvasVectorLayer(config: CanvasVectorLayerConfig): CanvasVectorLayer {
  let map: maplibregl.Map;
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let points: VectorPoint[] = [];
  let isVisible = true;
  let initialized = false;
  let resizeObserver: ResizeObserver | null = null;
  let dpr = 1;

  const {
    id,
    type,
    arrowScale = type === 'wind' ? 4 : 20,
    arrowSpacing = 60,
    colorRamp = type === 'wind' ? DEFAULT_WIND_COLORS : DEFAULT_CURRENT_COLORS,
    maxSpeed = type === 'wind' ? 50 : 2,
  } = config;

  function getColorForSpeed(speed: number): string {
    const normalized = Math.min(speed / maxSpeed, 1);
    const index = Math.floor(normalized * (colorRamp.length - 1));
    return colorRamp[Math.min(index, colorRamp.length - 1)];
  }

  function drawArrow(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    u: number,
    v: number,
    speed: number,
    scale: number
  ): void {
    const color = getColorForSpeed(speed);
    const length = Math.min(speed * scale, 40) * dpr;

    if (length < 2 * dpr) return;

    const angle = Math.atan2(-v, u);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Draw arrow shaft
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 * dpr;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(length, 0);
    ctx.stroke();

    // Draw arrowhead
    const headLength = Math.min(length * 0.4, 8 * dpr);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(length, 0);
    ctx.lineTo(length - headLength, -headLength * 0.5);
    ctx.lineTo(length - headLength, headLength * 0.5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function syncCanvasSize(): void {
    if (!canvas || !map) return;

    const mapCanvas = map.getCanvas();
    const container = map.getContainer();

    // Get the container's actual display size
    const rect = container.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;

    // Set canvas CSS size to match container
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    // Set canvas buffer size accounting for DPR
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }

  function render(): void {
    if (!ctx || !canvas || !map || !isVisible || points.length === 0) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Get visible bounds
    const bounds = map.getBounds();
    const west = bounds.getWest();
    const east = bounds.getEast();
    const north = bounds.getNorth();
    const south = bounds.getSouth();

    // Track rendered positions to avoid overlap
    const rendered: { x: number; y: number }[] = [];
    const spacingDpr = arrowSpacing * dpr;

    for (const point of points) {
      // Skip points outside visible bounds (with some padding)
      if (
        point.lng < west - 1 ||
        point.lng > east + 1 ||
        point.lat < south - 1 ||
        point.lat > north + 1
      ) {
        continue;
      }

      // Convert to screen coordinates
      const projected = map.project([point.lng, point.lat]);
      const x = projected.x * dpr;
      const y = projected.y * dpr;

      // Check spacing
      let tooClose = false;
      for (const r of rendered) {
        const dx = r.x - x;
        const dy = r.y - y;
        if (dx * dx + dy * dy < spacingDpr * spacingDpr) {
          tooClose = true;
          break;
        }
      }

      if (tooClose) continue;

      // Draw the arrow
      drawArrow(ctx, x, y, point.u, point.v, point.speed, arrowScale);
      rendered.push({ x, y });
    }
  }

  const layer: CanvasVectorLayer = {
    id,
    type: 'custom' as const,
    renderingMode: '2d' as const,

    updateData(newPoints: VectorPoint[]) {
      points = newPoints;
      if (map && isVisible) {
        render();
        map.triggerRepaint();
      }
    },

    setVisibility(visible: boolean) {
      isVisible = visible;
      if (canvas) {
        canvas.style.display = visible ? 'block' : 'none';
      }
      if (map && visible) {
        render();
        map.triggerRepaint();
      }
    },

    onAdd(mapInstance: maplibregl.Map) {
      map = mapInstance;

      // Create canvas overlay
      canvas = document.createElement('canvas');
      canvas.id = `${id}-canvas`;
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.pointerEvents = 'none';
      canvas.style.zIndex = '1'; // Above map tiles, below UI

      ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) {
        console.error('[CanvasVectorLayer] Failed to get 2D context');
        return;
      }

      // Find the correct container - the map's canvas container
      const mapCanvas = map.getCanvas();
      const canvasContainer = mapCanvas.parentElement;

      if (canvasContainer) {
        canvasContainer.appendChild(canvas);
      } else {
        console.error('[CanvasVectorLayer] Could not find canvas container');
        return;
      }

      // Initial size sync
      syncCanvasSize();

      // Handle resize
      resizeObserver = new ResizeObserver(() => {
        syncCanvasSize();
        render();
      });
      resizeObserver.observe(map.getContainer());

      // Re-render on map move/zoom
      const handleMove = () => {
        if (isVisible) {
          render();
        }
      };

      map.on('move', handleMove);
      map.on('zoom', handleMove);
      map.on('resize', () => {
        syncCanvasSize();
        render();
      });

      initialized = true;
      console.log(`[CanvasVectorLayer] ${id} initialized (Canvas2D fallback)`);
    },

    render() {
      // This is called by MapLibre on each frame
      // We only need to render when data changes or map moves
      // The move handler already calls render()
      if (!initialized || !isVisible) return;

      // Defensive: ensure canvas is still properly positioned
      if (canvas && canvas.style.position !== 'absolute') {
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
      }
    },

    onRemove() {
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }

      if (canvas && canvas.parentElement) {
        canvas.parentElement.removeChild(canvas);
      }
      canvas = null;
      ctx = null;
      initialized = false;
      console.log(`[CanvasVectorLayer] ${id} removed`);
    },
  };

  return layer;
}
