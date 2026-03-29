/**
 * PrecipitationLayerML - Precipitation radar using RainViewer raster tiles
 *
 * Replaces the WebGL grid heatmap with actual radar imagery from RainViewer API.
 * Uses the same tile infrastructure as RainRadarLayerML but as a simple
 * "latest frame" layer without animation controls.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useMap } from '../useMap';

export interface PrecipitationLayerMLProps {
  visible: boolean;
  opacity?: number;
  maxPrecip?: number;
  sharedGridData?: any;  // kept for API compat but unused
}

interface RainViewerFrame {
  time: number;
  path: string;
}

interface RainViewerData {
  generated: number;
  host: string;
  radar: {
    past: RainViewerFrame[];
    nowcast: RainViewerFrame[];
  };
}

const RAINVIEWER_API = 'https://api.rainviewer.com/public/weather-maps.json';
const TILE_URL_TEMPLATE = 'https://tilecache.rainviewer.com{path}/512/{z}/{x}/{y}/2/1_1.png';
const REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes

const SOURCE_ID = 'precip-radar-source';
const LAYER_ID = 'precip-radar-layer';

const PRECIPITATION_SCALE = [
  { color: '#78c5f5', label: '0.1', description: 'Light drizzle' },
  { color: '#3eb8fa', label: '0.5', description: 'Drizzle' },
  { color: '#1eb41e', label: '1', description: 'Light rain' },
  { color: '#f5f53c', label: '2', description: 'Moderate rain' },
  { color: '#f5a03c', label: '4', description: 'Heavy rain' },
  { color: '#f53c3c', label: '8', description: 'Very heavy rain' },
  { color: '#c81e1e', label: '16', description: 'Intense rain' },
  { color: '#a01ea0', label: '32', description: 'Extreme rain' },
] as const;

export function PrecipitationLayerML({
  visible,
  opacity = 0.7,
}: PrecipitationLayerMLProps) {
  const map = useMap();
  const [latestPath, setLatestPath] = useState<string | null>(null);
  const [frameTime, setFrameTime] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sourceAddedRef = useRef(false);

  // Fetch the latest radar frame from RainViewer
  const fetchLatestFrame = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(RAINVIEWER_API);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data: RainViewerData = await response.json();
      const pastFrames = data.radar.past;

      if (pastFrames.length > 0) {
        const latest = pastFrames[pastFrames.length - 1];
        setLatestPath(latest.path);
        setFrameTime(
          new Date(latest.time * 1000).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch radar data';
      setError(message);
      console.error('[PrecipitationLayerML] Error:', message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch frames when visible
  useEffect(() => {
    if (!visible) return;

    fetchLatestFrame();
    const interval = setInterval(fetchLatestFrame, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchLatestFrame, visible]);

  // Add/remove raster source and layer on map
  useEffect(() => {
    if (!map || !latestPath || !visible) return;

    const setupLayer = () => {
      const tileUrl = TILE_URL_TEMPLATE.replace('{path}', latestPath);

      // Remove old source/layer if present
      try {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch (_) { /* ignore */ }

      // Add raster source
      map.addSource(SOURCE_ID, {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 512,
        attribution: '&copy; <a href="https://rainviewer.com">RainViewer</a>',
      });

      // Find first symbol layer to insert below labels
      const layers = map.getStyle()?.layers || [];
      let beforeId: string | undefined;
      for (const layer of layers) {
        if (layer.type === 'symbol') {
          beforeId = layer.id;
          break;
        }
      }

      map.addLayer({
        id: LAYER_ID,
        type: 'raster',
        source: SOURCE_ID,
        paint: {
          'raster-opacity': opacity,
        },
        layout: {
          visibility: 'visible',
        },
      }, beforeId);

      sourceAddedRef.current = true;
      console.log('[PrecipitationLayerML] Radar tiles added');
    };

    if (map.isStyleLoaded()) {
      setupLayer();
    } else {
      map.once('style.load', setupLayer);
    }

    return () => {
      if (!map) return;
      try {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch (_) { /* ignore */ }
      sourceAddedRef.current = false;
    };
  }, [map, latestPath, visible]);

  // Update opacity
  useEffect(() => {
    if (!map || !sourceAddedRef.current) return;
    try {
      if (map.getLayer(LAYER_ID)) {
        map.setPaintProperty(LAYER_ID, 'raster-opacity', opacity);
      }
    } catch (_) { /* ignore */ }
  }, [map, opacity]);

  // Hide layer when not visible
  useEffect(() => {
    if (!map || !sourceAddedRef.current) return;
    try {
      if (map.getLayer(LAYER_ID)) {
        map.setLayoutProperty(LAYER_ID, 'visibility', visible ? 'visible' : 'none');
      }
    } catch (_) { /* ignore */ }
  }, [map, visible]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (!map || !map.getStyle()) return;
      try {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch (_) { /* ignore */ }
    };
  }, [map]);

  if (!visible) return null;

  return (
    <div
      className="absolute z-1000 bg-gray-900/90 backdrop-blur-sm rounded-lg shadow-lg p-3 text-white text-xs"
      style={{ bottom: '120px', left: '10px', minWidth: '160px' }}
    >
      {/* Header */}
      <div className="font-semibold mb-2 flex items-center gap-2">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2c-5.33 4.55-8 8.48-8 11.8 0 4.98 3.8 8.2 8 8.2s8-3.22 8-8.2c0-3.32-2.67-7.25-8-11.8zm0 18c-3.35 0-6-2.57-6-6.2 0-2.34 1.95-5.44 6-9.14 4.05 3.7 6 6.79 6 9.14 0 3.63-2.65 6.2-6 6.2z" />
        </svg>
        Precipitation Radar
      </div>

      {/* Timestamp */}
      {frameTime && (
        <div className="mb-2 text-[10px] text-gray-300">
          Updated: {frameTime}
        </div>
      )}

      {/* Color scale */}
      <div className="mb-1 text-[10px] text-gray-400">Intensity (mm/h)</div>
      <div className="flex flex-col gap-0.5">
        {PRECIPITATION_SCALE.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <div
              className="w-4 h-3 rounded-sm shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-[10px] w-6">{item.label}</span>
            <span className="text-[10px] text-gray-400 truncate">{item.description}</span>
          </div>
        ))}
      </div>

      {/* States */}
      {isLoading && <div className="mt-2 text-gray-400 text-[10px]">Loading...</div>}
      {error && <div className="mt-2 text-red-400 text-[10px]">Error: {error}</div>}

      {/* Attribution */}
      <div className="mt-2 pt-2 border-t border-gray-700 text-[9px] text-gray-500">
        Data: RainViewer.com
      </div>
    </div>
  );
}

export default PrecipitationLayerML;
