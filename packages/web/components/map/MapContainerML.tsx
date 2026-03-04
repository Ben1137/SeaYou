import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useMapContext } from './MapProvider';
import { Coordinate, PointForecast, DetailedPointForecast, fetchPointForecast, fetchHourlyPointForecast, fetchBulkPointForecast } from '@seame/core';
import { Trash2, Navigation, MapPin, Wind, Layers, Waves, X, Clock, Activity, Droplets, ChevronDown, ChevronUp } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { ColorScaleLegend } from './ColorScaleLegend';
import { COLOR_SCALES } from '../../utils/colorScales';
import { DARK_MAP_CONFIG } from '../../utils/particleConfig';

// MapLibre Native Layers (Phase 1)
import { PortsLayerML } from './layers/PortsLayerML';
import { ReefLayerML } from './layers/ReefLayerML';
import { BathymetryLayerML } from './layers/BathymetryLayerML';
import { RainRadarLayerML } from './layers/RainRadarLayerML';

// Custom WebGL Layers (Phase 2)
import { WaveHeatmapLayerML } from './layers/WaveHeatmapLayerML';

// GPGPU Particle Layers (Phase 3 & 4)
import { WindParticleLayerML } from './layers/WindParticleLayerML';
import { CurrentParticleLayerML } from './layers/CurrentParticleLayerML';
import { WaveParticleLayerML } from './layers/WaveParticleLayerML';

// Sea Temperature Layer (Phase 5)
import { SeaTemperatureLayerML } from './layers/SeaTemperatureLayerML';

// Shared marine data hook (single fetch for all layers)
import { useSharedMarineData } from '../../hooks/useSharedMarineData';

// Types
type MapLayer = 'NONE' | 'WIND' | 'WAVE' | 'SWELL' | 'CURRENTS' | 'WIND_WAVE' | 'SIGNIFICANT_WAVE';
type AdvancedLayer = 'NONE' | 'WIND_PARTICLES' | 'CURRENT_PARTICLES' | 'WAVE_HEATMAP' | 'SEA_TEMP';

interface MapContainerMLProps {
  currentLocation: Coordinate;
}

interface RouteLeg {
  id: number;
  distance: number;
  bearing: number;
  startIdx: number;
  endIdx: number;
}

// Utility functions
const toRad = (deg: number) => deg * Math.PI / 180;
const toDeg = (rad: number) => rad * 180 / Math.PI;

const calculateBearing = (startLat: number, startLng: number, destLat: number, destLng: number) => {
  const startLatRad = toRad(startLat);
  const destLatRad = toRad(destLat);
  const dLng = toRad(destLng - startLng);

  const y = Math.sin(dLng) * Math.cos(destLatRad);
  const x = Math.cos(startLatRad) * Math.sin(destLatRad) -
            Math.sin(startLatRad) * Math.cos(destLatRad) * Math.cos(dLng);

  let brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
};

const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371000; // Earth radius in meters
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lng2 - lng1);

  const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
};

const getWindColor = (speed: number) => {
  if (speed < 10) return '#60a5fa';
  if (speed < 20) return '#22d3ee';
  if (speed < 30) return '#4ade80';
  if (speed < 50) return '#facc15';
  return '#f87171';
};

const getWaveColor = (height: number) => {
  if (height < 0.5) return '#93c5fd';
  if (height < 1.0) return '#3b82f6';
  if (height < 2.0) return '#34d399';
  if (height < 3.0) return '#facc15';
  return '#ef4444';
};

const getCurrentColor = (speed: number) => {
  if (speed < 0.2) return '#93c5fd';
  if (speed < 0.5) return '#22d3ee';
  if (speed < 1.0) return '#34d399';
  if (speed < 1.5) return '#facc15';
  return '#ef4444';
};

export function MapContainerML({ currentLocation }: MapContainerMLProps) {
  const { t } = useTranslation();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const { setMap } = useMapContext();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Route state
  const [waypoints, setWaypoints] = useState<{lng: number, lat: number}[]>([]);
  const [routeStats, setRouteStats] = useState({ count: 0, distance: 0 });
  const [legs, setLegs] = useState<RouteLeg[]>([]);
  const [speed, setSpeed] = useState<number>(15);
  const [waypointForecasts, setWaypointForecasts] = useState<Record<number, PointForecast>>({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Layer state
  const [activeLayer, setActiveLayer] = useState<MapLayer>('NONE');
  const [advancedLayer, setAdvancedLayer] = useState<AdvancedLayer>('NONE');
  const [isLayersPanelExpanded, setIsLayersPanelExpanded] = useState(false);
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [loadingAdvancedLayer, setLoadingAdvancedLayer] = useState(false);
  const [gridForecasts, setGridForecasts] = useState<PointForecast[]>([]);

  // Shared marine data - single fetch for all advanced layers
  const isAdvancedLayerActive = advancedLayer !== 'NONE';
  const sharedMarineData = useSharedMarineData(mapRef.current, isAdvancedLayerActive);

  // GeoJSON overlay state
  const [geoJSONLayers, setGeoJSONLayers] = useState({
    coastline: false,
    bathymetry: false,
    reefs: false,
    ports: false,
    marineAreas: false,
    radar: false,
  });

  // Detail view state
  const [selectedPointDetail, setSelectedPointDetail] = useState<DetailedPointForecast | null>(null);
  const [isDetailSidebarOpen, setIsDetailSidebarOpen] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Marker refs for cleanup
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const currentLocationMarkerRef = useRef<maplibregl.Marker | null>(null);
  const gridMarkersRef = useRef<maplibregl.Marker[]>([]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [currentLocation.lng, currentLocation.lat],
      zoom: 8,
      attributionControl: { compact: true },
    });

    // Debug: Log map events to help diagnose issues
    map.on('error', (e) => {
      console.error('[MapContainerML] Map error:', e.error);
    });

    map.on('styledata', () => {
      console.log('[MapContainerML] Style data loaded');
    });

    map.on('sourcedata', (e) => {
      if (e.isSourceLoaded) {
        console.log('[MapContainerML] Source loaded:', e.sourceId);
      }
    });

    // Add navigation controls
    map.addControl(new maplibregl.NavigationControl(), 'top-left');
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      'top-left'
    );
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 100 }), 'bottom-left');

    map.on('load', () => {
      console.log('[MapContainerML] Map loaded successfully');

      // Force a resize to ensure the canvas fills the container
      map.resize();

      const canvas = map.getCanvas();
      console.log('[MapContainerML] Canvas dimensions:', canvas.width, 'x', canvas.height);

      mapRef.current = map;
      setMap(map);

      // Add current location marker
      const el = document.createElement('div');
      el.className = 'current-location-marker';
      el.style.cssText = `
        width: 16px;
        height: 16px;
        background: #3b82f6;
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      `;

      currentLocationMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([currentLocation.lng, currentLocation.lat])
        .setPopup(new maplibregl.Popup().setHTML(t('map.currentPosition')))
        .addTo(map);
    });

    // Handle map click for route planning
    map.on('click', (e) => {
      addRoutePoint(e.lngLat);
    });

    // Listen for move end to refresh grid if layer is active
    map.on('moveend', () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updateWeatherGrid();
      }, 500);
    });

    // Set up ResizeObserver to handle container size changes
    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.resize();
        console.log('[MapContainerML] Resized map');
      }
    });

    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      setMap(null);
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      gridMarkersRef.current.forEach(m => m.remove());
      gridMarkersRef.current = [];
      if (currentLocationMarkerRef.current) {
        currentLocationMarkerRef.current.remove();
      }
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update center when location changes
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [currentLocation.lng, currentLocation.lat],
        zoom: 8,
        duration: 1000,
      });

      if (currentLocationMarkerRef.current) {
        currentLocationMarkerRef.current.setLngLat([currentLocation.lng, currentLocation.lat]);
      }
    }
  }, [currentLocation.lat, currentLocation.lng]);

  // Effect to trigger grid update when layer changes
  useEffect(() => {
    updateWeatherGrid();
  }, [activeLayer]);

  // Weather grid update function
  const updateWeatherGrid = useCallback(async () => {
    if (!mapRef.current) return;

    // Clear existing grid markers
    gridMarkersRef.current.forEach(m => m.remove());
    gridMarkersRef.current = [];

    if (activeLayer === 'NONE') return;

    setLoadingGrid(true);
    const bounds = mapRef.current.getBounds();
    const west = bounds.getWest();
    const east = bounds.getEast();
    const north = bounds.getNorth();
    const south = bounds.getSouth();

    // Generate a grid focused on the visible marine area
    const gridPoints: Coordinate[] = [];
    const cols = 4;
    const rows = 4;

    const lngStep = (east - west) / cols;
    const latStep = (north - south) / rows;

    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        gridPoints.push({
          lat: north - latStep * (r + 0.5),
          lng: west + lngStep * (c + 0.5)
        });
      }
    }

    try {
      const forecasts = await fetchBulkPointForecast(gridPoints);
      const marineForecasts = forecasts.filter(f => f.waveHeight > 0.05);
      renderGridMarkers(marineForecasts);
      setGridForecasts(marineForecasts);
    } catch (e) {
      console.error("Failed to fetch grid", e);
    } finally {
      setLoadingGrid(false);
    }
  }, [activeLayer]);

  // Render grid markers
  const renderGridMarkers = useCallback((points: PointForecast[]) => {
    if (!mapRef.current) return;

    points.forEach(pt => {
      let iconHtml = '';

      if (activeLayer === 'WIND') {
        const color = getWindColor(pt.windSpeed);
        iconHtml = `
          <div class="clickable-marker" style="transform: rotate(${pt.windDirection}deg); display: flex; flex-direction: column; align-items: center; justify-content: center;">
             <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="wind-marker">
                <line x1="12" y1="19" x2="12" y2="5"></line>
                <polyline points="5 12 12 5 19 12"></polyline>
             </svg>
             <div style="transform: rotate(-${pt.windDirection}deg); text-align: center; font-size: 10px; font-weight: 800; color: white; text-shadow: 0 1px 3px black; margin-top: -6px;">
                ${Math.round(pt.windSpeed)}
             </div>
          </div>
        `;
      } else if (activeLayer === 'WAVE' || activeLayer === 'SIGNIFICANT_WAVE') {
        const color = getWaveColor(pt.waveHeight);
        const period = pt.wavePeriod ? `${pt.wavePeriod.toFixed(0)}s` : '';
        iconHtml = `
          <div style="display: flex; flex-direction: column; align-items: center;">
              <div class="clickable-marker wave-badge" style="
                  background: ${color};
                  width: 32px; height: 32px;
                  border-radius: 50%; border: 2px solid white;
                  display: flex; align-items: center; justify-content: center;
              ">
                 <div style="background:white; width: 24px; height: 24px; border-radius:50%; display:flex; align-items:center; justify-content:center; color: ${color}; font-weight: 800; font-size: 11px;">
                    ${pt.waveHeight.toFixed(1)}
                 </div>
              </div>
              ${period ? `<div style="margin-top:2px; font-size:9px; color:#cbd5e1; font-weight:bold; background:rgba(15,23,42,0.7); padding:0 3px; border-radius:4px;">${period}</div>` : ''}
          </div>
        `;
      } else if (activeLayer === 'WIND_WAVE' || activeLayer === 'SWELL') {
        let height = 0;
        let direction = 0;
        let period = 0;

        if (activeLayer === 'WIND_WAVE') {
          height = pt.windWaveHeight || 0;
          direction = pt.windWaveDirection || 0;
          period = pt.windWavePeriod || 0;
        } else {
          height = pt.swellHeight || 0;
          direction = pt.swellDirection || 0;
          period = pt.swellPeriod || 0;
        }

        const color = getWaveColor(height);

        iconHtml = `
          <div class="clickable-marker" style="transform: rotate(${direction}deg); display: flex; flex-direction: column; align-items: center; justify-content: center;">
             <svg width="32" height="32" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 22 22 12 18 2 22 12 2"></polygon>
             </svg>
             <div style="transform: rotate(-${direction}deg); text-align: center; font-size: 9px; font-weight: 800; color: ${color}; text-shadow: 0 1px 3px black; display: flex; flex-direction: column; align-items: center;">
                <span>${height.toFixed(1)}m</span>
                <span style="font-size: 8px; color: #cbd5e1;">${period.toFixed(0)}s</span>
             </div>
          </div>
        `;
      } else if (activeLayer === 'CURRENTS') {
        const color = getCurrentColor(pt.currentSpeed || 0);
        const speedVal = pt.currentSpeed?.toFixed(1) || '0.0';
        const dir = pt.currentDirection || 0;
        iconHtml = `
          <div class="clickable-marker" style="transform: rotate(${dir}deg); display: flex; flex-direction: column; align-items: center; justify-content: center;">
             <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2L15 22L12 18L9 22L12 2Z" fill="${color}" fill-opacity="0.3"></path>
             </svg>
             <div style="transform: rotate(-${dir}deg); text-align: center; font-size: 10px; font-weight: 800; color: #f0abfc; text-shadow: 0 1px 3px black; margin-top: -6px;">
                ${speedVal}
             </div>
          </div>
        `;
      }

      const el = document.createElement('div');
      el.innerHTML = iconHtml;
      el.style.cursor = 'pointer';
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        handlePointClick(pt.lat, pt.lng);
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([pt.lng, pt.lat])
        .addTo(mapRef.current!);

      gridMarkersRef.current.push(marker);
    });
  }, [activeLayer]);

  // Route point handling
  const addRoutePoint = useCallback(async (lngLat: maplibregl.LngLat) => {
    if (!mapRef.current) return;

    const newWaypoint = { lng: lngLat.lng, lat: lngLat.lat };
    const newWaypoints = [...waypoints, newWaypoint];
    setWaypoints(newWaypoints);
    updateRouteStats(newWaypoints);

    // Add marker
    const el = document.createElement('div');
    el.className = 'waypoint-marker';
    el.style.cssText = `
      width: 24px;
      height: 24px;
      background: #3b82f6;
      border: 2px solid white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 12px;
      font-weight: bold;
      cursor: pointer;
    `;
    el.textContent = String(waypoints.length + 1);

    const marker = new maplibregl.Marker({ element: el, draggable: true })
      .setLngLat([lngLat.lng, lngLat.lat])
      .setPopup(new maplibregl.Popup().setHTML(`${t('map.waypoint')} ${waypoints.length + 1}`))
      .addTo(mapRef.current);

    markersRef.current.push(marker);

    // Fetch weather for this point
    try {
      const forecast = await fetchPointForecast(lngLat.lat, lngLat.lng);
      setWaypointForecasts(prev => ({ ...prev, [waypoints.length]: forecast }));
    } catch (e) {
      console.error('Failed to fetch waypoint forecast:', e);
    }

    // Auto-open sidebar on 2nd waypoint
    if (waypoints.length === 1) {
      setIsSidebarOpen(true);
      setIsDetailSidebarOpen(false);
    }
  }, [waypoints, t]);

  const updateRouteStats = useCallback((points: {lng: number, lat: number}[]) => {
    let dist = 0;
    const newLegs: RouteLeg[] = [];

    for (let i = 0; i < points.length - 1; i++) {
      const d = calculateDistance(points[i].lat, points[i].lng, points[i+1].lat, points[i+1].lng);
      const distNM = d / 1852;
      dist += distNM;

      const bearing = calculateBearing(points[i].lat, points[i].lng, points[i+1].lat, points[i+1].lng);

      newLegs.push({
        id: i,
        distance: parseFloat(distNM.toFixed(1)),
        bearing: parseFloat(bearing.toFixed(0)),
        startIdx: i,
        endIdx: i + 1
      });
    }

    setRouteStats({
      count: points.length,
      distance: parseFloat(dist.toFixed(1))
    });
    setLegs(newLegs);

    // Update route line on map
    updateRouteLine(points);
  }, []);

  const updateRouteLine = useCallback((points: {lng: number, lat: number}[]) => {
    if (!mapRef.current) return;

    const map = mapRef.current;
    const sourceId = 'route-line';

    if (map.getSource(sourceId)) {
      (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: points.map(p => [p.lng, p.lat]),
        },
      });
    } else if (points.length >= 2) {
      map.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: points.map(p => [p.lng, p.lat]),
          },
        },
      });

      map.addLayer({
        id: 'route-line-layer',
        type: 'line',
        source: sourceId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#3b82f6',
          'line-width': 4,
          'line-dasharray': [2, 2],
        },
      });
    }
  }, []);

  const clearRoute = useCallback(() => {
    if (!mapRef.current) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    if (mapRef.current.getLayer('route-line-layer')) {
      mapRef.current.removeLayer('route-line-layer');
    }
    if (mapRef.current.getSource('route-line')) {
      mapRef.current.removeSource('route-line');
    }

    setWaypoints([]);
    setRouteStats({ count: 0, distance: 0 });
    setLegs([]);
    setWaypointForecasts({});
    setIsSidebarOpen(false);
  }, []);

  // Handle point click for detailed forecast
  const handlePointClick = useCallback(async (lat: number, lng: number) => {
    setLoadingDetail(true);
    setIsDetailSidebarOpen(true);
    setIsSidebarOpen(false);

    try {
      const data = await fetchHourlyPointForecast(lat, lng);
      setSelectedPointDetail(data);
    } catch (e) {
      console.error('Failed to fetch point detail:', e);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  // Detail chart data
  const detailChartData = selectedPointDetail ? selectedPointDetail.hourly.time.map((t, i) => ({
    time: format(parseISO(t), 'HH:mm'),
    windSpeed: selectedPointDetail.hourly.windSpeed[i],
    waveHeight: selectedPointDetail.hourly.waveHeight[i],
    swellHeight: selectedPointDetail.hourly.swellHeight[i],
    currentSpeed: selectedPointDetail.hourly.currentSpeed?.[i] || 0
  })) : [];

  return (
    <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, overflow: 'hidden' }} className="bg-card">
      {/* Map Container */}
      <div
        ref={mapContainerRef}
        style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: DARK_MAP_CONFIG.backgroundColor }}
      />

      {/* Layer Controls Panel */}
      <div className="absolute top-4 right-4 z-[400] bg-elevated backdrop-blur border border-app rounded-lg shadow-xl text-xs w-36 animate-in fade-in slide-in-from-right-4 overflow-hidden">
        <button
          onClick={() => setIsLayersPanelExpanded(!isLayersPanelExpanded)}
          className="w-full flex items-center justify-between gap-2 p-2 border-b border-subtle text-secondary font-bold uppercase bg-elevated hover:bg-hover transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Layers size={14} /> {t('map.mapLayers')}
          </div>
          {isLayersPanelExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <div
          className="transition-all duration-300 ease-in-out overflow-hidden overflow-y-auto"
          style={{
            maxHeight: isLayersPanelExpanded ? '70vh' : '0',
            opacity: isLayersPanelExpanded ? 1 : 0
          }}
        >
          <div className="space-y-1 p-2">
            {/* Basic Layers */}
            <button
              onClick={() => setActiveLayer('NONE')}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${activeLayer === 'NONE' ? 'bg-button-secondary text-primary' : 'text-muted hover:bg-hover'}`}
            >
              <div className={`w-2 h-2 rounded-full border ${activeLayer === 'NONE' ? 'border-primary bg-transparent' : 'border-muted'}`}></div> {t('map.none')}
            </button>
            <button
              onClick={() => setActiveLayer('WIND')}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${activeLayer === 'WIND' ? 'bg-blue-600 text-primary' : 'text-muted hover:bg-hover'}`}
            >
              <Wind size={12} /> {t('map.wind')}
            </button>
            <button
              onClick={() => setActiveLayer('WAVE')}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${activeLayer === 'WAVE' ? 'bg-teal-600 text-primary' : 'text-muted hover:bg-hover'}`}
            >
              <Waves size={12} /> {t('map.sigWaves')}
            </button>
            <button
              onClick={() => setActiveLayer('WIND_WAVE')}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${activeLayer === 'WIND_WAVE' ? 'bg-cyan-600 text-primary' : 'text-muted hover:bg-hover'}`}
            >
              <Waves size={12} /> {t('map.windWaves')}
            </button>
            <button
              onClick={() => setActiveLayer('SWELL')}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${activeLayer === 'SWELL' ? 'bg-indigo-600 text-primary' : 'text-muted hover:bg-hover'}`}
            >
              <Waves size={12} /> {t('weather.swell')}
            </button>
            <button
              onClick={() => setActiveLayer('CURRENTS')}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${activeLayer === 'CURRENTS' ? 'bg-emerald-600 text-primary' : 'text-muted hover:bg-hover'}`}
            >
              <Activity size={12} /> {t('map.currents')}
            </button>

            {/* Advanced Layers Divider */}
            <div className="border-t border-subtle my-2 pt-2">
              <div className="text-[10px] text-muted uppercase font-bold mb-1 px-2">Advanced Layers</div>
            </div>

            <button
              onClick={() => setAdvancedLayer(advancedLayer === 'WIND_PARTICLES' ? 'NONE' : 'WIND_PARTICLES')}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${advancedLayer === 'WIND_PARTICLES' ? 'bg-purple-600 text-primary' : 'text-muted hover:bg-hover'}`}
            >
              <Wind size={12} /> Wind Particles
            </button>
            <button
              onClick={() => setAdvancedLayer(advancedLayer === 'CURRENT_PARTICLES' ? 'NONE' : 'CURRENT_PARTICLES')}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${advancedLayer === 'CURRENT_PARTICLES' ? 'bg-violet-600 text-primary' : 'text-muted hover:bg-hover'}`}
            >
              <Activity size={12} /> Current Particles
            </button>
            <button
              onClick={() => setAdvancedLayer(advancedLayer === 'WAVE_HEATMAP' ? 'NONE' : 'WAVE_HEATMAP')}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${advancedLayer === 'WAVE_HEATMAP' ? 'bg-pink-600 text-primary' : 'text-muted hover:bg-hover'}`}
            >
              <Waves size={12} /> Wave Heatmap
            </button>
            <button
              onClick={() => setAdvancedLayer(advancedLayer === 'SEA_TEMP' ? 'NONE' : 'SEA_TEMP')}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${advancedLayer === 'SEA_TEMP' ? 'bg-orange-600 text-primary' : 'text-muted hover:bg-hover'}`}
            >
              <Droplets size={12} /> Sea Temperature
            </button>

            {/* GeoJSON Overlay Layers Divider */}
            <div className="border-t border-subtle my-2 pt-2">
              <div className="text-[10px] text-muted uppercase font-bold mb-1 px-2">{t('map.geoJSONLayers') || 'Map Overlays'}</div>
            </div>

            <button
              onClick={() => setGeoJSONLayers(prev => ({ ...prev, coastline: !prev.coastline }))}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${geoJSONLayers.coastline ? 'bg-cyan-700 text-primary' : 'text-muted hover:bg-hover'}`}
            >
              <MapPin size={12} /> {t('map.coastline') || 'Coastline'}
            </button>
            <button
              onClick={() => setGeoJSONLayers(prev => ({ ...prev, bathymetry: !prev.bathymetry }))}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${geoJSONLayers.bathymetry ? 'bg-blue-700 text-primary' : 'text-muted hover:bg-hover'}`}
            >
              <Droplets size={12} /> {t('map.bathymetry') || 'Bathymetry'}
            </button>
            <button
              onClick={() => setGeoJSONLayers(prev => ({ ...prev, reefs: !prev.reefs }))}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${geoJSONLayers.reefs ? 'bg-orange-600 text-primary' : 'text-muted hover:bg-hover'}`}
            >
              <Waves size={12} /> {t('map.reefs') || 'Coral Reefs'}
            </button>
            <button
              onClick={() => setGeoJSONLayers(prev => ({ ...prev, ports: !prev.ports }))}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${geoJSONLayers.ports ? 'bg-amber-600 text-primary' : 'text-muted hover:bg-hover'}`}
            >
              <Navigation size={12} /> {t('map.ports') || 'Ports'}
            </button>
            <button
              onClick={() => setGeoJSONLayers(prev => ({ ...prev, marineAreas: !prev.marineAreas }))}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${geoJSONLayers.marineAreas ? 'bg-purple-600 text-primary' : 'text-muted hover:bg-hover'}`}
            >
              <MapPin size={12} /> {t('map.marineAreas') || 'Marine Areas'}
            </button>
            <button
              onClick={() => setGeoJSONLayers(prev => ({ ...prev, radar: !prev.radar }))}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${geoJSONLayers.radar ? 'bg-sky-600 text-primary' : 'text-muted hover:bg-hover'}`}
            >
              <Droplets size={12} /> {t('map.rainRadar') || 'Rain Radar'}
            </button>
          </div>
          {(loadingGrid || loadingAdvancedLayer) && (
            <div className="pb-2 px-2 text-[10px] text-center text-blue-300 animate-pulse">{t('map.updatingForecast')}</div>
          )}
        </div>
      </div>

      {/* Route Sidebar Toggle */}
      {!isSidebarOpen && legs.length > 0 && (
        <button
          onClick={() => { setIsSidebarOpen(true); setIsDetailSidebarOpen(false); }}
          className="absolute left-0 top-1/2 -translate-y-1/2 h-32 w-6 bg-elevated border-y border-r border-app rounded-r-xl flex items-center justify-center cursor-pointer hover:bg-button-secondary z-[400] shadow-xl transition-colors"
        >
          <div className="rotate-90 text-[10px] uppercase font-bold text-muted tracking-widest whitespace-nowrap">{t('map.routeInfo')}</div>
        </button>
      )}

      {/* Route Sidebar */}
      {isSidebarOpen && (
        <div className="absolute top-0 left-0 bottom-0 w-80 bg-card/95 backdrop-blur shadow-2xl border-r border-app z-[500] flex flex-col animate-in slide-in-from-left duration-300">
          <div className="p-4 border-b border-app flex justify-between items-center bg-card">
            <div>
              <h2 className="font-bold text-primary flex items-center gap-2"><Navigation size={18} className="text-accent"/> {t('map.routePlan')}</h2>
              <p className="text-[10px] text-muted uppercase tracking-wider">{routeStats.count} {t('map.waypoints')} - {routeStats.distance} {t('units.nm')}</p>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="p-1 hover:bg-hover rounded text-muted transition-colors"><X size={20}/></button>
          </div>

          <div className="p-4 bg-elevated border-b border-app">
            <label className="text-xs text-secondary flex justify-between mb-2">
              {t('map.avgSpeed')}: <span className="text-primary font-bold">{speed} {t('units.knots')}</span>
            </label>
            <input type="range" min="1" max="40" value={speed} onChange={(e) => setSpeed(parseInt(e.target.value))} className="w-full h-1 bg-button-secondary rounded-lg appearance-none cursor-pointer" style={{ accentColor: 'var(--text-accent)' }} />
            <div className="flex justify-between text-[10px] text-muted mt-1">
              <span>1 {t('units.knots')}</span><span>40 {t('units.knots')}</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {legs.map((leg, idx) => {
              const forecast = waypointForecasts[leg.startIdx];
              const time = (leg.distance / speed) * 60;

              return (
                <div key={leg.id} className="bg-elevated border border-app rounded-lg p-3 relative group">
                  <div className="flex justify-between items-start mb-2">
                    <div className="text-xs font-bold text-primary">{t('map.leg')} {idx + 1}</div>
                    <div className="text-[10px] text-muted">{leg.distance} {t('units.nm')} @ {leg.bearing}deg</div>
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex-1 h-1 bg-button-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-accent w-1/2"></div>
                    </div>
                    <div className="text-[10px] text-accent font-mono">~{Math.round(time)}{t('units.minutes')}</div>
                  </div>

                  {forecast && (
                    <div className="grid grid-cols-2 gap-2 text-[10px] bg-card p-2 rounded border border-subtle">
                      <div className="flex items-center gap-1 text-secondary">
                        <Waves size={10} className="text-accent"/> {forecast.waveHeight.toFixed(1)}{t('units.meters')}
                      </div>
                      <div className="flex items-center gap-1 text-secondary">
                        <Wind size={10} className="text-accent"/> {forecast.windSpeed.toFixed(0)} {t('units.knots')}
                      </div>
                    </div>
                  )}

                  <div className="absolute left-[-18px] top-1/2 -translate-y-1/2 w-4 flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-accent border-2 border-card"></div>
                    {idx < legs.length - 1 && <div className="w-0.5 h-full bg-button-secondary my-1"></div>}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-4 border-t border-app bg-card">
            <button onClick={clearRoute} className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors">
              <Trash2 size={14} /> {t('map.clearRoute')}
            </button>
          </div>
        </div>
      )}

      {/* Detail Sidebar */}
      {isDetailSidebarOpen && (
        <div className="absolute top-0 right-0 bottom-0 w-96 bg-card/95 backdrop-blur shadow-2xl border-l border-app z-[500] flex flex-col animate-in slide-in-from-right duration-300">
          <div className="p-4 border-b border-app flex justify-between items-center bg-card">
            <div>
              <h2 className="font-bold text-primary flex items-center gap-2"><Activity size={18} className="text-teal-400"/> {t('map.pointForecast')}</h2>
              <p className="text-[10px] text-muted uppercase tracking-wider">
                {selectedPointDetail ? `${selectedPointDetail.lat.toFixed(4)}N, ${selectedPointDetail.lng.toFixed(4)}E` : t('map.loadingData')}
              </p>
            </div>
            <button onClick={() => setIsDetailSidebarOpen(false)} className="p-1 hover:bg-hover rounded text-muted transition-colors"><X size={20}/></button>
          </div>

          {loadingDetail ? (
            <div className="flex-1 flex items-center justify-center text-blue-400 animate-pulse">
              <Clock size={32} className="animate-spin mr-2" /> {t('map.loadingData')}
            </div>
          ) : selectedPointDetail && (
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Wave & Swell Chart */}
              {(activeLayer === 'WAVE' || activeLayer === 'SWELL' || activeLayer === 'SIGNIFICANT_WAVE' || activeLayer === 'WIND_WAVE' || activeLayer === 'NONE') && (
                <div className="bg-elevated/50 rounded-xl p-4 border border-app animate-in fade-in slide-in-from-right-8">
                  <h3 className="text-xs font-bold text-secondary uppercase mb-4 flex items-center gap-2"><Waves size={14}/> {t('map.waveSwellHeight')}</h3>
                  <div className="h-40 w-full min-h-[160px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={detailChartData}>
                        <defs>
                          <linearGradient id="waveGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--chart-tertiary)" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="var(--chart-tertiary)" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="swellGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--chart-secondary)" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="var(--chart-secondary)" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                        <XAxis dataKey="time" stroke="var(--chart-text)" fontSize={10} tickLine={false} axisLine={false} interval={4} />
                        <YAxis stroke="var(--chart-text)" fontSize={10} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={{ backgroundColor: 'var(--app-bg-card)', borderColor: 'var(--app-border)' }}
                          itemStyle={{ color: 'var(--text-secondary)' }}
                          labelStyle={{ color: 'var(--text-muted)' }}
                        />
                        <Area type="monotone" dataKey="waveHeight" stroke="var(--chart-tertiary)" fill="url(#waveGrad)" strokeWidth={2} name={t('weather.waveHeight')} />
                        <Area type="monotone" dataKey="swellHeight" stroke="var(--chart-secondary)" fill="url(#swellGrad)" strokeWidth={2} name={t('weather.swell')} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Wind Chart */}
              {(activeLayer === 'WIND' || activeLayer === 'NONE') && (
                <div className="bg-elevated/50 rounded-xl p-4 border border-app animate-in fade-in slide-in-from-right-10">
                  <h3 className="text-xs font-bold text-secondary uppercase mb-4 flex items-center gap-2"><Wind size={14}/> {t('map.windSpeedChart')}</h3>
                  <div className="h-40 w-full min-h-[160px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={detailChartData}>
                        <defs>
                          <linearGradient id="windGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--chart-primary)" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="var(--chart-primary)" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                        <XAxis dataKey="time" stroke="var(--chart-text)" fontSize={10} tickLine={false} axisLine={false} interval={4} />
                        <YAxis stroke="var(--chart-text)" fontSize={10} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={{ backgroundColor: 'var(--app-bg-card)', borderColor: 'var(--app-border)' }}
                          itemStyle={{ color: 'var(--text-secondary)' }}
                          labelStyle={{ color: 'var(--text-muted)' }}
                        />
                        <Area type="monotone" dataKey="windSpeed" stroke="var(--chart-primary)" fill="url(#windGrad)" strokeWidth={2} name={t('weather.windSpeed')} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Currents Chart */}
              {(activeLayer === 'CURRENTS' || activeLayer === 'NONE') && (
                <div className="bg-elevated/50 rounded-xl p-4 border border-app animate-in fade-in slide-in-from-right-8">
                  <h3 className="text-xs font-bold text-secondary uppercase mb-4 flex items-center gap-2"><Activity size={14}/> {t('map.currentVelocity')}</h3>
                  <div className="h-40 w-full min-h-[160px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={detailChartData}>
                        <defs>
                          <linearGradient id="currentGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                        <XAxis dataKey="time" stroke="var(--chart-text)" fontSize={10} tickLine={false} axisLine={false} interval={4} />
                        <YAxis stroke="var(--chart-text)" fontSize={10} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={{ backgroundColor: 'var(--app-bg-card)', borderColor: 'var(--app-border)' }}
                          itemStyle={{ color: 'var(--text-secondary)' }}
                          labelStyle={{ color: 'var(--text-muted)' }}
                        />
                        <Area type="monotone" dataKey="currentSpeed" stroke="#10b981" fill="url(#currentGrad)" strokeWidth={2} name={t('map.currents')} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Color Scale Legends - Placeholder for future layer implementations */}
      {/* Dynamic legend — colours match the actual WebGL shader ramps */}
      {advancedLayer === 'WIND_PARTICLES' && (
        <ColorScaleLegend
          scale={COLOR_SCALES.windParticles}
          unit="km/h"
          title={t('map.legend.windSpeed')}
          position="bottomright"
        />
      )}

      {advancedLayer === 'CURRENT_PARTICLES' && (
        <ColorScaleLegend
          scale={COLOR_SCALES.currentParticles}
          unit="m/s"
          title={t('map.legend.currentVelocity')}
          position="bottomright"
        />
      )}

      {advancedLayer === 'WAVE_HEATMAP' && (
        <ColorScaleLegend
          scale={COLOR_SCALES.waveHeatmap}
          unit="m"
          title={t('map.legend.waveHeight')}
          position="bottomright"
        />
      )}

      {advancedLayer === 'SEA_TEMP' && (
        <ColorScaleLegend
          scale={COLOR_SCALES.seaTemperature}
          unit="°C"
          title={t('map.legend.seaTemperature') || 'Sea Temperature'}
          position="bottomright"
        />
      )}

      {geoJSONLayers.bathymetry && (
        <ColorScaleLegend
          scale={COLOR_SCALES.bathymetry}
          unit="m"
          title={t('map.legend.bathymetry')}
          position="bottomleft"
        />
      )}

      {/* MapLibre Native Layers (Phase 1) */}
      <PortsLayerML
        visible={geoJSONLayers.ports}
        onPortClick={(port) => {
          console.log('[MapContainerML] Port clicked:', port.name);
        }}
      />
      <ReefLayerML
        visible={geoJSONLayers.reefs}
        opacity={0.7}
      />
      <BathymetryLayerML
        visible={geoJSONLayers.bathymetry}
        opacity={0.6}
      />
      <RainRadarLayerML
        visible={geoJSONLayers.radar}
        opacity={0.5}
        animated={false}
      />

      {/*
        Wave Composite Layer — heatmap base + whitecap particles on top.
        Rendering order matters: WaveHeatmapLayerML is listed FIRST so MapLibre adds
        it to the layer stack before WaveParticleLayerML. Both use beforeId='landcover'
        so the resulting stack order is: [heatmap → particles → landcover → labels].
        Both use the SAME sharedMarineData.gridData — zero extra API calls.
      */}
      <WaveHeatmapLayerML
        visible={advancedLayer === 'WAVE_HEATMAP'}
        opacity={0.7}
        sharedGridData={sharedMarineData.gridData}
      />
      <WaveParticleLayerML
        visible={advancedLayer === 'WAVE_HEATMAP'}
        particleCount={256}
        speedFactor={2.0}
        pointSize={3.0}
        sharedGridData={sharedMarineData.gridData}
      />

      {/* GPGPU Particle Layers (Phase 3 & 4) */}
      <WindParticleLayerML
        visible={advancedLayer === 'WIND_PARTICLES'}
        particleCount={256}
        speedFactor={0.5}
        pointSize={2.5}
        sharedGridData={sharedMarineData.gridData}
      />
      <CurrentParticleLayerML
        visible={advancedLayer === 'CURRENT_PARTICLES'}
        particleCount={192}
        speedFactor={6.0}
        pointSize={2.5}
        sharedGridData={sharedMarineData.gridData}
      />

      {/* Sea Temperature Layer (Phase 5) */}
      <SeaTemperatureLayerML
        visible={advancedLayer === 'SEA_TEMP'}
        opacity={0.6}
        minTemp={0}   /* Extended from 10 → 0°C to match legend + cold-water regions */
        maxTemp={35}  /* Extended from 30 → 35°C to match legend + tropical regions */
        sharedGridData={sharedMarineData.gridData}
      />
    </div>
  );
}

export default MapContainerML;
