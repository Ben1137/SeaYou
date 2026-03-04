/**
 * RainRadarLayerML - MapLibre GL JS implementation of rain radar layer
 * Uses raster layers with animation support via RainViewer API
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useMap } from '../useMap';

// ------------------------------------------------------------------
// Types & Interfaces
// ------------------------------------------------------------------

export interface RainRadarLayerMLProps {
  visible: boolean;
  opacity?: number;
  animated?: boolean;
  animationSpeed?: number;
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

// ------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------

const RAINVIEWER_API = 'https://api.rainviewer.com/public/weather-maps.json';
const TILE_URL_TEMPLATE = 'https://tilecache.rainviewer.com{path}/512/{z}/{x}/{y}/2/1_1.png';
const REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes
const DEFAULT_ANIMATION_SPEED = 500;
const DEFAULT_OPACITY = 0.5;

const SOURCE_PREFIX = 'rainradar-source-';
const LAYER_PREFIX = 'rainradar-layer-';

// RainViewer color scheme
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

// ------------------------------------------------------------------
// Main Component
// ------------------------------------------------------------------

export function RainRadarLayerML({
  visible,
  opacity = DEFAULT_OPACITY,
  animated = false,
  animationSpeed = DEFAULT_ANIMATION_SPEED,
}: RainRadarLayerMLProps) {
  const map = useMap();
  const [frames, setFrames] = useState<RainViewerFrame[]>([]);
  const [pastFrameCount, setPastFrameCount] = useState(0);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(animated);

  const animationRef = useRef<number | null>(null);
  const currentSourceIdRef = useRef<string | null>(null);
  const currentLayerIdRef = useRef<string | null>(null);

  // Fetch available radar frames
  const fetchFrames = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(RAINVIEWER_API);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: RainViewerData = await response.json();
      const allFrames = [...data.radar.past, ...data.radar.nowcast];

      setFrames(allFrames);
      setPastFrameCount(data.radar.past.length);
      setCurrentFrameIndex(data.radar.past.length - 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch radar data';
      setError(message);
      console.error('[RainRadarLayerML] Error:', message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch and auto-refresh
  useEffect(() => {
    if (!visible) return;

    fetchFrames();
    const interval = setInterval(fetchFrames, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [fetchFrames, visible]);

  // Sync isPlaying with animated prop
  useEffect(() => {
    setIsPlaying(animated);
  }, [animated]);

  // Remove map sources/layers when layer is hidden to stop tile fetching
  useEffect(() => {
    if (visible || !map) return;
    try {
      if (currentLayerIdRef.current && map.getLayer(currentLayerIdRef.current)) {
        map.removeLayer(currentLayerIdRef.current);
      }
      if (currentSourceIdRef.current && map.getSource(currentSourceIdRef.current)) {
        map.removeSource(currentSourceIdRef.current);
      }
    } catch (e) {
      // Ignore errors from map being in transition
    }
    currentLayerIdRef.current = null;
    currentSourceIdRef.current = null;
  }, [visible, map]);

  // Handle frame display
  useEffect(() => {
    if (!map || frames.length === 0 || !visible) return;

    const frame = frames[currentFrameIndex];
    if (!frame) return;

    const sourceId = `${SOURCE_PREFIX}${currentFrameIndex}`;
    const layerId = `${LAYER_PREFIX}${currentFrameIndex}`;

    const setupLayer = () => {
      // Remove previous layer/source
      if (currentLayerIdRef.current && currentLayerIdRef.current !== layerId) {
        try {
          if (map.getLayer(currentLayerIdRef.current)) {
            map.removeLayer(currentLayerIdRef.current);
          }
        } catch (e) {
          // Ignore
        }
      }
      if (currentSourceIdRef.current && currentSourceIdRef.current !== sourceId) {
        try {
          if (map.getSource(currentSourceIdRef.current)) {
            map.removeSource(currentSourceIdRef.current);
          }
        } catch (e) {
          // Ignore
        }
      }

      // Add new source if not exists
      if (!map.getSource(sourceId)) {
        const tileUrl = TILE_URL_TEMPLATE.replace('{path}', frame.path);
        map.addSource(sourceId, {
          type: 'raster',
          tiles: [tileUrl],
          tileSize: 512,
          attribution: '&copy; <a href="https://rainviewer.com">RainViewer</a>',
        });
      }

      // Add new layer if not exists
      if (!map.getLayer(layerId)) {
        // Find a good position for the layer (above base map, below labels)
        const layers = map.getStyle()?.layers || [];
        let beforeId: string | undefined;
        for (const layer of layers) {
          if (layer.type === 'symbol') {
            beforeId = layer.id;
            break;
          }
        }

        map.addLayer({
          id: layerId,
          type: 'raster',
          source: sourceId,
          paint: {
            'raster-opacity': visible ? opacity : 0,
          },
          layout: {
            'visibility': visible ? 'visible' : 'none',
          },
        }, beforeId);
      } else {
        // Update existing layer
        map.setPaintProperty(layerId, 'raster-opacity', visible ? opacity : 0);
        map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }

      currentSourceIdRef.current = sourceId;
      currentLayerIdRef.current = layerId;
    };

    if (map.isStyleLoaded()) {
      setupLayer();
    } else {
      map.once('style.load', setupLayer);
    }
  }, [map, frames, currentFrameIndex, visible, opacity]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (!map || !map.getStyle()) return;

      try {
        if (currentLayerIdRef.current && map.getLayer(currentLayerIdRef.current)) {
          map.removeLayer(currentLayerIdRef.current);
        }
        if (currentSourceIdRef.current && map.getSource(currentSourceIdRef.current)) {
          map.removeSource(currentSourceIdRef.current);
        }
      } catch (e) {
        // Ignore
      }
    };
  }, [map]);

  // Handle animation playback
  useEffect(() => {
    if (!isPlaying || !visible || frames.length === 0) {
      if (animationRef.current) {
        clearInterval(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    animationRef.current = window.setInterval(() => {
      setCurrentFrameIndex((prev) => (prev + 1) % frames.length);
    }, animationSpeed);

    return () => {
      if (animationRef.current) {
        clearInterval(animationRef.current);
      }
    };
  }, [isPlaying, visible, frames.length, animationSpeed]);

  // Control functions
  const togglePlayPause = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const stepForward = useCallback(() => {
    setCurrentFrameIndex((prev) => (prev + 1) % frames.length);
  }, [frames.length]);

  const stepBackward = useCallback(() => {
    setCurrentFrameIndex((prev) => (prev - 1 + frames.length) % frames.length);
  }, [frames.length]);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentFrameIndex(parseInt(e.target.value, 10));
    setIsPlaying(false);
  }, []);

  // Get timestamp for current frame
  const currentFrame = frames[currentFrameIndex];
  const frameTime = currentFrame
    ? new Date(currentFrame.time * 1000).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const isForecast = currentFrameIndex >= pastFrameCount;

  if (!visible) return null;

  return (
    <div
      className="absolute z-[1000] bg-gray-900/90 backdrop-blur-sm rounded-lg shadow-lg p-3 text-white text-xs"
      style={{ bottom: '120px', right: '10px', minWidth: '180px' }}
    >
      {/* Header */}
      <div className="font-semibold mb-2 flex items-center gap-2">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2c-5.33 4.55-8 8.48-8 11.8 0 4.98 3.8 8.2 8 8.2s8-3.22 8-8.2c0-3.32-2.67-7.25-8-11.8zm0 18c-3.35 0-6-2.57-6-6.2 0-2.34 1.95-5.44 6-9.14 4.05 3.7 6 6.79 6 9.14 0 3.63-2.65 6.2-6 6.2z" />
        </svg>
        Rain Radar
      </div>

      {/* Animation Controls */}
      {frames.length > 0 && (
        <div className="mb-3 pb-2 border-b border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-gray-300">{frameTime || '--:--'}</span>
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded ${
                isForecast
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-cyan-500/20 text-cyan-400'
              }`}
            >
              {isForecast ? 'Forecast' : 'Radar'}
            </span>
          </div>

          {/* Playback controls */}
          <div className="flex items-center justify-center gap-1 mb-2">
            <button
              onClick={stepBackward}
              className="p-1 hover:bg-gray-700 rounded transition-colors"
              title="Previous frame"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
              </svg>
            </button>

            <button
              onClick={togglePlayPause}
              className="p-1.5 bg-cyan-600 hover:bg-cyan-500 rounded transition-colors"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            <button
              onClick={stepForward}
              className="p-1 hover:bg-gray-700 rounded transition-colors"
              title="Next frame"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </button>
          </div>

          {/* Timeline slider */}
          <div className="relative">
            <input
              type="range"
              min={0}
              max={Math.max(0, frames.length - 1)}
              value={currentFrameIndex}
              onChange={handleSliderChange}
              className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              style={{
                background:
                  frames.length > 1
                    ? `linear-gradient(to right,
                      #22d3ee 0%,
                      #22d3ee ${((pastFrameCount - 1) / (frames.length - 1)) * 100}%,
                      #f59e0b ${((pastFrameCount - 1) / (frames.length - 1)) * 100}%,
                      #f59e0b 100%)`
                    : '#22d3ee',
              }}
            />
            <div className="flex justify-between mt-1 text-[8px] text-gray-500">
              <span>Past</span>
              <span>Now</span>
              <span>Forecast</span>
            </div>
          </div>
        </div>
      )}

      {/* Color scale */}
      <div className="mb-1 text-[10px] text-gray-400">Precipitation (mm/h)</div>
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

      {/* Loading/Error states */}
      {isLoading && <div className="mt-2 text-gray-400 text-[10px]">Loading...</div>}
      {error && <div className="mt-2 text-red-400 text-[10px]">Error: {error}</div>}

      {/* Attribution */}
      <div className="mt-2 pt-2 border-t border-gray-700 text-[9px] text-gray-500">
        Data: RainViewer.com
      </div>
    </div>
  );
}

export default RainRadarLayerML;
