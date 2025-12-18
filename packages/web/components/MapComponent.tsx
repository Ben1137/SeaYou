
import React, { useEffect, useRef, useState } from 'react';
import * as L from 'leaflet';
import { Coordinate, PointForecast, DetailedPointForecast, fetchPointForecast, fetchHourlyPointForecast, fetchBulkPointForecast } from '@seame/core';
import { Trash2, Navigation, MapPin, Wind, Layers, Waves, X, Clock, Activity, Droplets } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';

const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28]
});
L.Marker.prototype.options.icon = DefaultIcon;

interface MapComponentProps {
  currentLocation: Coordinate;
}

interface RouteLeg {
  id: number;
  distance: number; // Nautical Miles
  bearing: number; // Degrees
  startIdx: number;
  endIdx: number;
}

type MapLayer = 'NONE' | 'WIND' | 'WAVE' | 'SWELL' | 'CURRENTS' | 'WIND_WAVE' | 'SIGNIFICANT_WAVE';

const toRad = (deg: number) => deg * Math.PI / 180;
const toDeg = (rad: number) => rad * 180 / Math.PI;

const calculateBearing = (startLat: number, startLng: number, destLat: number, destLng: number) => {
  const startLatRad = toRad(startLat);
  const startLngRad = toRad(startLng);
  const destLatRad = toRad(destLat);
  const destLngRad = toRad(destLng);

  const y = Math.sin(destLngRad - startLngRad) * Math.cos(destLatRad);
  const x = Math.cos(startLatRad) * Math.sin(destLatRad) -
            Math.sin(startLatRad) * Math.cos(destLatRad) * Math.cos(destLngRad - startLngRad);
  
  let brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
};

const getWindColor = (speed: number) => {
  if (speed < 10) return '#60a5fa'; // Blue-400
  if (speed < 20) return '#22d3ee'; // Cyan-400
  if (speed < 30) return '#4ade80'; // Green-400
  if (speed < 50) return '#facc15'; // Yellow-400
  return '#f87171'; // Red-400
};

const getWaveColor = (height: number) => {
  if (height < 0.5) return '#93c5fd'; // Blue-300
  if (height < 1.0) return '#3b82f6'; // Blue-500
  if (height < 2.0) return '#34d399'; // Emerald-400
  if (height < 3.0) return '#facc15'; // Yellow-400
  return '#ef4444'; // Red-500
};

const getCurrentColor = (speed: number) => {
  if (speed < 0.2) return '#93c5fd';
  if (speed < 0.5) return '#22d3ee';
  if (speed < 1.0) return '#34d399';
  if (speed < 1.5) return '#facc15';
  return '#ef4444';
};

const MapComponent: React.FC<MapComponentProps> = ({ currentLocation }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [routeStats, setRouteStats] = useState({ count: 0, distance: 0 });
  const [legs, setLegs] = useState<RouteLeg[]>([]);
  const [speed, setSpeed] = useState<number>(15);
  const [waypointForecasts, setWaypointForecasts] = useState<Record<number, PointForecast>>({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeLayer, setActiveLayer] = useState<MapLayer>('NONE');
  const [loadingGrid, setLoadingGrid] = useState(false);

  // Detail View State
  const [selectedPointDetail, setSelectedPointDetail] = useState<DetailedPointForecast | null>(null);
  const [isDetailSidebarOpen, setIsDetailSidebarOpen] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (mapContainer.current && !mapInstance.current) {
      // Initialize map with zoom 8 for a "Country/Region" view
      const map = L.map(mapContainer.current).setView([currentLocation.lat, currentLocation.lng], 8);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        className: 'map-tiles'
      }).addTo(map);

      L.circleMarker([currentLocation.lat, currentLocation.lng], {
        radius: 8, fillColor: "#3b82f6", color: "#ffffff", weight: 2, opacity: 1, fillOpacity: 0.8
      }).addTo(map).bindPopup("Current Position");

      mapInstance.current = map;
      layerGroupRef.current = L.layerGroup().addTo(map);

      map.on('click', (e: L.LeafletMouseEvent) => addRoutePoint(e.latlng));
      
      // Listen for move end to refresh grid if layer is active
      map.on('moveend', () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
           updateWeatherGrid();
        }, 500); 
      });
      
      // Inject CSS for animations
      const style = document.createElement('style');
      style.innerHTML = `
        @keyframes windFlow {
          0% { transform: translateY(0); opacity: 0.6; }
          50% { transform: translateY(-3px); opacity: 1; }
          100% { transform: translateY(0); opacity: 0.6; }
        }
        @keyframes wavePulse {
          0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); }
          70% { box-shadow: 0 0 0 10px rgba(59, 130, 246, 0); }
          100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
        }
        .wind-marker svg { filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5)); }
        .wave-badge { 
             transition: all 0.3s ease;
             box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        .clickable-marker { cursor: pointer; }
        .clickable-marker:hover { transform: scale(1.1); }
      `;
      document.head.appendChild(style);
    }
    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  useEffect(() => {
    if (mapInstance.current) {
      // Maintain Zoom 8 when location changes to ensure country-level context
      mapInstance.current.setView([currentLocation.lat, currentLocation.lng], 8);
    }
  }, [currentLocation.lat, currentLocation.lng]);

  // Effect to trigger grid update when layer changes
  useEffect(() => {
      updateWeatherGrid();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLayer]);

  const updateWeatherGrid = async () => {
      if (!mapInstance.current || !layerGroupRef.current) return;
      
      // Clear existing grid markers
      layerGroupRef.current.clearLayers();

      if (activeLayer === 'NONE') return;

      setLoadingGrid(true);
      const bounds = mapInstance.current.getBounds();
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
          // Use new Bulk Fetch API
          const forecasts = await fetchBulkPointForecast(gridPoints);
          
          // Filter out points with effectively 0 wave height (land)
          const marineForecasts = forecasts.filter(f => f.waveHeight > 0.05);

          renderGridMarkers(marineForecasts);
      } catch (e) {
          console.error("Failed to fetch grid", e);
      } finally {
          setLoadingGrid(false);
      }
  };

  const handlePointClick = async (lat: number, lng: number) => {
     setLoadingDetail(true);
     setIsDetailSidebarOpen(true);
     // Close route sidebar if open to prevent overlap
     setIsSidebarOpen(false);
     
     const data = await fetchHourlyPointForecast(lat, lng);
     setSelectedPointDetail(data);
     setLoadingDetail(false);
  };

  const renderGridMarkers = (points: PointForecast[]) => {
      if (!layerGroupRef.current) return;

      points.forEach(pt => {
          let iconHtml = '';
          
          if (activeLayer === 'WIND') {
              const color = getWindColor(pt.windSpeed);
              iconHtml = `
                <div class="clickable-marker" style="transform: rotate(${pt.windDirection}deg); display: flex; flex-direction: column; align-items: center; justify-content: center;">
                   <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="wind-marker" style="animation: windFlow 2s infinite ease-in-out;">
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
                        color: ${color}; font-weight: 800; font-size: 11px;
                        color: ${color};
                        animation: wavePulse 2s infinite;
                    ">
                       <div style="background:white; width: 24px; height: 24px; border-radius:50%; display:flex; align-items:center; justify-content:center;">
                          ${pt.waveHeight.toFixed(1)}
                       </div>
                    </div>
                    ${period ? `<div style="margin-top:2px; font-size:9px; color:#cbd5e1; font-weight:bold; background:rgba(15,23,42,0.7); padding:0 3px; rounded:4px;">${period}</div>` : ''}
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
              const speed = pt.currentSpeed?.toFixed(1) || '0.0';
              const dir = pt.currentDirection || 0;
              iconHtml = `
                <div class="clickable-marker" style="transform: rotate(${dir}deg); display: flex; flex-direction: column; align-items: center; justify-content: center;">
                   <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M12 2L15 22L12 18L9 22L12 2Z" fill="${color}" fill-opacity="0.3"></path>
                   </svg>
                   <div style="transform: rotate(-${dir}deg); text-align: center; font-size: 10px; font-weight: 800; color: #f0abfc; text-shadow: 0 1px 3px black; margin-top: -6px;">
                      ${speed}
                   </div>
                </div>
              `;
          }

          const icon = L.divIcon({
              className: `custom-weather-icon`,
              html: iconHtml,
              iconSize: [36, 36],
              iconAnchor: [18, 18]
          });

          const marker = L.marker([pt.lat, pt.lng], { icon }).addTo(layerGroupRef.current!);
          
          // Add click listener
          marker.on('click', (e) => {
              L.DomEvent.stopPropagation(e);
              handlePointClick(pt.lat, pt.lng);
          });
      });
  };

  const addRoutePoint = async (latlng: L.LatLng) => {
    if (!mapInstance.current) return;

    // Add marker
    const marker = L.marker(latlng, { draggable: true }).addTo(mapInstance.current);
    marker.bindPopup(`Waypoint ${markersRef.current.length + 1}`).openPopup();
    
    // Update marker ref
    markersRef.current.push(marker);
    
    // Draw/Update Polyline
    const latlngs = markersRef.current.map(m => m.getLatLng());
    if (routeLineRef.current) {
      routeLineRef.current.setLatLngs(latlngs);
    } else {
      routeLineRef.current = L.polyline(latlngs, { color: '#3b82f6', weight: 4, dashArray: '10, 10' }).addTo(mapInstance.current);
    }

    // Calculate Route Stats
    calculateRouteStats(latlngs);

    // Fetch Weather for this point
    const forecast = await fetchPointForecast(latlng.lat, latlng.lng);
    setWaypointForecasts(prev => ({ ...prev, [markersRef.current.length - 1]: forecast }));

    // Auto-open route sidebar only on 2nd waypoint
    if (markersRef.current.length === 2) {
      setIsSidebarOpen(true);
      setIsDetailSidebarOpen(false); // Close detail sidebar
    }
  };

  const calculateRouteStats = (latlngs: L.LatLng[]) => {
    let dist = 0;
    const newLegs: RouteLeg[] = [];

    for (let i = 0; i < latlngs.length - 1; i++) {
      // Distance in Meters
      const d = latlngs[i].distanceTo(latlngs[i+1]);
      // Convert to Nautical Miles (1 NM = 1852 meters)
      const distNM = d / 1852;
      dist += distNM;

      // Calculate Bearing
      const bearing = calculateBearing(latlngs[i].lat, latlngs[i].lng, latlngs[i+1].lat, latlngs[i+1].lng);

      newLegs.push({
        id: i,
        distance: parseFloat(distNM.toFixed(1)),
        bearing: parseFloat(bearing.toFixed(0)),
        startIdx: i,
        endIdx: i + 1
      });
    }

    setRouteStats({
      count: latlngs.length,
      distance: parseFloat(dist.toFixed(1))
    });
    setLegs(newLegs);
  };

  const clearRoute = () => {
    if (!mapInstance.current) return;
    
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    
    if (routeLineRef.current) {
      routeLineRef.current.remove();
      routeLineRef.current = null;
    }
    
    setRouteStats({ count: 0, distance: 0 });
    setLegs([]);
    setWaypointForecasts({});
    setIsSidebarOpen(false);
  };

  // Prepare chart data for Detail Sidebar
  const detailChartData = selectedPointDetail ? selectedPointDetail.hourly.time.map((t, i) => ({
      time: format(parseISO(t), 'HH:mm'),
      windSpeed: selectedPointDetail.hourly.windSpeed[i],
      waveHeight: selectedPointDetail.hourly.waveHeight[i],
      swellHeight: selectedPointDetail.hourly.swellHeight[i],
      currentSpeed: selectedPointDetail.hourly.currentSpeed?.[i] || 0
  })) : [];

  return (
    <div className="relative h-full w-full bg-slate-900 overflow-hidden">
      {/* Map Container */}
      <div ref={mapContainer} className="absolute inset-0 z-0" />

      {/* Map Layer Controls */}
      <div className="absolute top-4 right-4 z-[400] bg-slate-800/90 backdrop-blur border border-slate-700 p-2 rounded-lg shadow-xl text-xs w-36 animate-in fade-in slide-in-from-right-4">
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-700 text-slate-300 font-bold uppercase">
              <Layers size={14} /> Map Layers
          </div>
          <div className="space-y-1">
             <button 
               onClick={() => setActiveLayer('NONE')}
               className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 ${activeLayer === 'NONE' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-700/50'}`}
             >
                <div className={`w-2 h-2 rounded-full border ${activeLayer === 'NONE' ? 'border-white bg-transparent' : 'border-slate-500'}`}></div> None
             </button>
             <button 
               onClick={() => setActiveLayer('WIND')}
               className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 ${activeLayer === 'WIND' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700/50'}`}
             >
                <Wind size={12} /> Wind
             </button>
             <button 
               onClick={() => setActiveLayer('WAVE')}
               className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 ${activeLayer === 'WAVE' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:bg-slate-700/50'}`}
             >
                <Waves size={12} /> Sig. Waves
             </button>
             <button 
               onClick={() => setActiveLayer('WIND_WAVE')}
               className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 ${activeLayer === 'WIND_WAVE' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:bg-slate-700/50'}`}
             >
                <Waves size={12} /> Wind Waves
             </button>
             <button 
               onClick={() => setActiveLayer('SWELL')}
               className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 ${activeLayer === 'SWELL' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-700/50'}`}
             >
                <Waves size={12} /> Swell
             </button>
             <button 
               onClick={() => setActiveLayer('CURRENTS')}
               className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 ${activeLayer === 'CURRENTS' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-700/50'}`}
             >
                <Activity size={12} /> Currents
             </button>
          </div>
          {loadingGrid && (
             <div className="mt-2 text-[10px] text-center text-blue-300 animate-pulse">Updating Forecast...</div>
          )}
      </div>

      {/* Sidebar Toggle Strip (Left) */}
      {!isSidebarOpen && legs.length > 0 && (
         <button 
            onClick={() => { setIsSidebarOpen(true); setIsDetailSidebarOpen(false); }}
            className="absolute left-0 top-1/2 -translate-y-1/2 h-32 w-6 bg-slate-800 border-y border-r border-slate-700 rounded-r-xl flex items-center justify-center cursor-pointer hover:bg-slate-700 z-[400] shadow-xl"
         >
            <div className="rotate-90 text-[10px] uppercase font-bold text-slate-400 tracking-widest whitespace-nowrap">Route Info</div>
         </button>
      )}

      {/* Route Sidebar */}
      {isSidebarOpen && (
        <div className="absolute top-0 left-0 bottom-0 w-80 bg-slate-900/95 backdrop-blur shadow-2xl border-r border-slate-800 z-[500] flex flex-col animate-in slide-in-from-left duration-300">
           {/* Header */}
           <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900">
              <div>
                 <h2 className="font-bold text-white flex items-center gap-2"><Navigation size={18} className="text-blue-400"/> Route Plan</h2>
                 <p className="text-[10px] text-slate-500 uppercase tracking-wider">{routeStats.count} Waypoints • {routeStats.distance} NM</p>
              </div>
              <button onClick={() => setIsSidebarOpen(false)} className="p-1 hover:bg-slate-800 rounded text-slate-400"><X size={20}/></button>
           </div>
           
           {/* Speed Control */}
           <div className="p-4 bg-slate-800/50 border-b border-slate-800">
              <label className="text-xs text-slate-400 flex justify-between mb-2">
                  Avg Speed: <span className="text-white font-bold">{speed} kts</span>
              </label>
              <input type="range" min="1" max="40" value={speed} onChange={(e) => setSpeed(parseInt(e.target.value))} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
              <div className="flex justify-between text-[10px] text-slate-600 mt-1">
                 <span>1 kt</span><span>40 kts</span>
              </div>
           </div>

           {/* Legs List */}
           <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {legs.map((leg, idx) => {
                 // Forecast at start of leg
                 const forecast = waypointForecasts[leg.startIdx];
                 const time = (leg.distance / speed) * 60; // minutes
                 
                 return (
                   <div key={leg.id} className="bg-slate-800 border border-slate-700 rounded-lg p-3 relative group">
                      <div className="flex justify-between items-start mb-2">
                         <div className="text-xs font-bold text-slate-300">Leg {idx + 1}</div>
                         <div className="text-[10px] text-slate-500">{leg.distance} NM @ {leg.bearing}°</div>
                      </div>
                      
                      <div className="flex items-center gap-2 mb-2">
                         <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 w-1/2"></div>
                         </div>
                         <div className="text-[10px] text-blue-300 font-mono">~{Math.round(time)}m</div>
                      </div>

                      {forecast && (
                         <div className="grid grid-cols-2 gap-2 text-[10px] bg-slate-900/50 p-2 rounded border border-slate-700/50">
                             <div className="flex items-center gap-1 text-slate-400">
                                <Waves size={10} className="text-blue-400"/> {forecast.waveHeight.toFixed(1)}m
                             </div>
                             <div className="flex items-center gap-1 text-slate-400">
                                <Wind size={10} className="text-cyan-400"/> {forecast.windSpeed.toFixed(0)} kt
                             </div>
                         </div>
                      )}
                      
                      <div className="absolute left-[-18px] top-1/2 -translate-y-1/2 w-4 flex flex-col items-center">
                          <div className="w-2 h-2 rounded-full bg-blue-500 border-2 border-slate-900"></div>
                          {idx < legs.length - 1 && <div className="w-0.5 h-full bg-slate-700 my-1"></div>}
                      </div>
                   </div>
                 );
              })}
           </div>

           {/* Footer */}
           <div className="p-4 border-t border-slate-800 bg-slate-900">
              <button onClick={clearRoute} className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors">
                  <Trash2 size={14} /> Clear Route
              </button>
           </div>
        </div>
      )}

      {/* Point Detail Sidebar */}
      {isDetailSidebarOpen && (
          <div className="absolute top-0 right-0 bottom-0 w-96 bg-slate-900/95 backdrop-blur shadow-2xl border-l border-slate-800 z-[500] flex flex-col animate-in slide-in-from-right duration-300">
               <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900">
                  <div>
                     <h2 className="font-bold text-white flex items-center gap-2"><Activity size={18} className="text-teal-400"/> Point Forecast</h2>
                     <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                         {selectedPointDetail ? `${selectedPointDetail.lat.toFixed(4)}N, ${selectedPointDetail.lng.toFixed(4)}E` : 'Loading...'}
                     </p>
                  </div>
                  <button onClick={() => setIsDetailSidebarOpen(false)} className="p-1 hover:bg-slate-800 rounded text-slate-400"><X size={20}/></button>
               </div>

               {loadingDetail ? (
                   <div className="flex-1 flex items-center justify-center text-blue-400 animate-pulse">
                       <Clock size={32} className="animate-spin mr-2" /> Loading Data...
                   </div>
               ) : selectedPointDetail && (
                   <div className="flex-1 overflow-y-auto p-4 space-y-6">
                       
                       {/* Wave & Swell Chart - Show for Wave/Swell layers or by default if no specific layer */}
                       {(activeLayer === 'WAVE' || activeLayer === 'SWELL' || activeLayer === 'SIGNIFICANT_WAVE' || activeLayer === 'WIND_WAVE' || activeLayer === 'NONE') && (
                           <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 animate-in fade-in slide-in-from-right-8">
                               <h3 className="text-xs font-bold text-slate-400 uppercase mb-4 flex items-center gap-2"><Waves size={14}/> Wave & Swell Height (m)</h3>
                               <div className="h-40 w-full min-h-[160px]">
                                   <ResponsiveContainer width="100%" height="100%">
                                       <AreaChart data={detailChartData}>
                                           <defs>
                                               <linearGradient id="waveGrad" x1="0" y1="0" x2="0" y2="1">
                                                   <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                                   <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                               </linearGradient>
                                                <linearGradient id="swellGrad" x1="0" y1="0" x2="0" y2="1">
                                                   <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3}/>
                                                   <stop offset="95%" stopColor="#14b8a6" stopOpacity={0}/>
                                               </linearGradient>
                                           </defs>
                                           <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                           <XAxis dataKey="time" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} interval={4} />
                                           <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                                           <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b' }} itemStyle={{ color: '#e2e8f0' }} labelStyle={{ color: '#94a3b8' }} />
                                           <Area type="monotone" dataKey="waveHeight" stroke="#3b82f6" fill="url(#waveGrad)" strokeWidth={2} name="Wave" />
                                           <Area type="monotone" dataKey="swellHeight" stroke="#14b8a6" fill="url(#swellGrad)" strokeWidth={2} name="Swell" />
                                       </AreaChart>
                                   </ResponsiveContainer>
                               </div>
                           </div>
                       )}

                       {/* Wind Chart - Show for Wind layer or None */}
                       {(activeLayer === 'WIND' || activeLayer === 'NONE') && (
                           <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 animate-in fade-in slide-in-from-right-10">
                               <h3 className="text-xs font-bold text-slate-400 uppercase mb-4 flex items-center gap-2"><Wind size={14}/> Wind Speed (km/h)</h3>
                               <div className="h-40 w-full min-h-[160px]">
                                   <ResponsiveContainer width="100%" height="100%">
                                       <AreaChart data={detailChartData}>
                                           <defs>
                                               <linearGradient id="windGrad" x1="0" y1="0" x2="0" y2="1">
                                                   <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                                                   <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                                               </linearGradient>
                                           </defs>
                                           <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                           <XAxis dataKey="time" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} interval={4} />
                                           <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                                           <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b' }} itemStyle={{ color: '#e2e8f0' }} labelStyle={{ color: '#94a3b8' }} />
                                           <Area type="monotone" dataKey="windSpeed" stroke="#06b6d4" fill="url(#windGrad)" strokeWidth={2} name="Wind" />
                                       </AreaChart>
                                   </ResponsiveContainer>
                               </div>
                           </div>
                       )}

                       {/* Currents Chart - Show if Currents Layer or None */}
                       {(activeLayer === 'CURRENTS' || activeLayer === 'NONE') && (
                           <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 animate-in fade-in slide-in-from-right-8">
                               <h3 className="text-xs font-bold text-slate-400 uppercase mb-4 flex items-center gap-2"><Activity size={14}/> Current Velocity (km/h)</h3>
                               <div className="h-40 w-full min-h-[160px]">
                                   <ResponsiveContainer width="100%" height="100%">
                                       <AreaChart data={detailChartData}>
                                           <defs>
                                               <linearGradient id="currentGrad" x1="0" y1="0" x2="0" y2="1">
                                                   <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                                   <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                               </linearGradient>
                                           </defs>
                                           <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                           <XAxis dataKey="time" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} interval={4} />
                                           <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                                           <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b' }} itemStyle={{ color: '#e2e8f0' }} labelStyle={{ color: '#94a3b8' }} />
                                           <Area type="monotone" dataKey="currentSpeed" stroke="#10b981" fill="url(#currentGrad)" strokeWidth={2} name="Current" />
                                       </AreaChart>
                                   </ResponsiveContainer>
                               </div>
                           </div>
                       )}
                   </div>
               )}
          </div>
      )}
    </div>
  );
};

export default MapComponent;
    