
import React, { useMemo, useState } from 'react';
import { MarineWeatherData, AlertConfig } from '../types';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, ComposedChart, Line, Legend
} from 'recharts';
import { 
  Wind, Activity, Droplets, AlertTriangle, Waves, ArrowUp, ArrowDown, 
  Navigation, Settings, X, Bell, Sun, Moon, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog,
  Thermometer, ThumbsUp, Skull, Flag, Palmtree, Compass, ChevronRight, ChevronLeft, Tornado, Ruler, Layers
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { getWeatherDescription } from '../services/weatherService';

interface DashboardProps {
  weatherData: MarineWeatherData | null;
  loading: boolean;
  error: string | null;
  locationName: string; 
}

const DEFAULT_ALERT_CONFIG: AlertConfig = {
  waveHeightThreshold: 2.0,
  windSpeedThreshold: 40,
  swellHeightThreshold: 2.5,
  simulateTsunami: false
};

// --- Weather Animation Component ---
const WeatherAnimation: React.FC<{ code: number }> = ({ code }) => {
  // Clear
  if (code === 0 || code === 1) return <Sun className="text-yellow-400 animate-[spin_10s_linear_infinite]" size={20} />;
  // Cloudy
  if (code === 2 || code === 3) return <Cloud className="text-slate-400 animate-pulse" size={20} />;
  // Fog
  if (code === 45 || code === 48) return <CloudFog className="text-slate-500 animate-pulse" size={20} />;
  // Rain / Drizzle
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return <CloudRain className="text-blue-400 animate-bounce" size={20} />;
  // Snow
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return <CloudSnow className="text-white animate-bounce" size={20} />;
  // Thunder
  if (code >= 95 && code <= 99) return <CloudLightning className="text-yellow-500 animate-pulse" size={20} />;
  
  return <Sun className="text-yellow-400" size={20} />;
};

const getCardinalDirection = (angle: number): string => {
  const directions = ['North', 'North East', 'East', 'South East', 'South', 'South West', 'West', 'North West'];
  const index = Math.round(angle / 45) % 8;
  return directions[index];
};

const getMarinerWindDir = (angle: number): string => {
  const directions = [
    'Northerly', 'North Easterly', 'Easterly', 'South Easterly', 
    'Southerly', 'South Westerly', 'Westerly', 'North Westerly'
  ];
  const index = Math.round(angle / 45) % 8;
  return directions[index];
};

const getSeaStateTerm = (heightM: number): string => {
  if (heightM < 0.1) return "Calm";
  if (heightM < 0.5) return "Smooth";
  if (heightM < 1.25) return "Slight";
  if (heightM < 2.5) return "Moderate";
  if (heightM < 4) return "Rough";
  if (heightM < 6) return "Very Rough";
  if (heightM < 9) return "High";
  return "Phenomenal";
};

const getSeaStateFull = (minM: number, maxM: number): string => {
    const minTerm = getSeaStateTerm(minM);
    const maxTerm = getSeaStateTerm(maxM);
    const rangeText = `${(minM * 100).toFixed(0)}-${(maxM * 100).toFixed(0)} cm`;
    if (minTerm === maxTerm) return `${minTerm} (${rangeText})`;
    return `${minTerm} to ${maxTerm} (${rangeText})`;
};

const Dashboard: React.FC<DashboardProps> = ({ weatherData, loading, error, locationName }) => {
  const [showSettings, setShowSettings] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertConfig>(DEFAULT_ALERT_CONFIG);
  const [forecastTab, setForecastTab] = useState<'mariner' | 'surfer' | 'kite' | 'beach'>('mariner');
  const [dismissedAlert, setDismissedAlert] = useState(false);
  
  // Graph Tab State
  const [activeGraph, setActiveGraph] = useState<'tide' | 'wave' | 'swell'>('tide');

  const currentHourIndex = useMemo(() => {
    if (!weatherData?.hourly?.time) return 0;
    const now = new Date();
    const nowTime = now.getTime();
    let closestIdx = 0;
    let minDiff = Infinity;

    weatherData.hourly.time.forEach((t, i) => {
      const time = new Date(t).getTime();
      const diff = Math.abs(nowTime - time);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    });
    return closestIdx;
  }, [weatherData]);

  const chartData = useMemo(() => {
    if (!weatherData) return [];
    const start = currentHourIndex;
    const end = Math.min(start + 24, weatherData.hourly.time.length);

    return weatherData.hourly.time.slice(start, end).map((time, i) => {
      const globalIndex = start + i;
      return {
        time: time,
        displayTime: format(parseISO(time), 'HH:mm'),
        waveHeight: weatherData.hourly.wave_height[globalIndex],
        windSpeed: weatherData.hourly.wind_speed_10m[globalIndex],
        swellHeight: weatherData.hourly.swell_wave_height[globalIndex],
        wavePeriod: weatherData.hourly.wave_period[globalIndex],
        swellPeriod: weatherData.hourly.swell_wave_period[globalIndex],
      };
    });
  }, [weatherData, currentHourIndex]);

  const tideChartData = useMemo(() => {
    if (!weatherData?.tides) return [];
    return weatherData.tides.hourly.slice(0, 24).map(t => ({
      time: t.time,
      displayTime: format(parseISO(t.time), 'HH:mm'),
      height: t.height
    }));
  }, [weatherData]);

  // Use the coherent 'current' object from API directly
  const currentConditions = useMemo(() => {
    if (!weatherData?.current) return null;
    return {
      wave: weatherData.current.waveHeight,
      wavePeriod: weatherData.current.wavePeriod,
      wind: weatherData.current.windSpeed,
      windDirection: weatherData.current.windDirection,
      swell: weatherData.current.swellHeight,
      swellDirection: weatherData.current.swellDirection,
      swellPeriod: weatherData.current.swellPeriod,
      pressure: weatherData.current.pressure,
      visibility: weatherData.current.visibility,
      seaTemp: weatherData.current.seaTemp,
      seaLevel: weatherData.current.seaLevel,
      currentUV: weatherData.current.uvIndex
    };
  }, [weatherData]);

  const roughWeatherAlert = useMemo(() => {
    if (!weatherData?.general || !currentConditions) return null;
    const { weatherCode } = weatherData.general;
    const { wind, wave } = currentConditions;

    if (weatherCode >= 95 || wind > 65 || wave > 4.5) {
        return {
            title: "STORM WARNING",
            message: "Severe weather conditions detected. Seek shelter immediately.",
            icon: Tornado,
            color: "bg-red-600"
        };
    }
    if (weatherCode >= 80 || wind > 50 || wave > 3.0) {
        return {
            title: "ROUGH WEATHER ADVISORY",
            message: "High winds and rough seas expected. Caution advised.",
            icon: CloudLightning,
            color: "bg-orange-600"
        };
    }
    if (alertConfig.simulateTsunami) {
        return {
            title: "TSUNAMI ALERT",
            message: "Immediate evacuation ordered. High wave impact imminent.",
            icon: Waves,
            color: "bg-red-900 animate-pulse border-2 border-red-500"
        };
    }
    return null;
  }, [weatherData, currentConditions, alertConfig.simulateTsunami]);

  const sailingCondition = useMemo(() => {
    if (!currentConditions) return null;
    const { wind, wave } = currentConditions;
    if (wind > 55 || wave > 3.5) return { label: 'Hazardous', description: 'Stay in port. Extreme conditions.', color: 'text-red-500', bg: 'bg-red-500/10', icon: Skull };
    if (wind > 40 || wave > 2.5) return { label: 'Challenging', description: 'Experienced sailors only. Rough seas.', color: 'text-orange-500', bg: 'bg-orange-500/10', icon: AlertTriangle };
    if (wind < 10) return { label: 'Calm', description: 'Light winds. Motor may be needed.', color: 'text-slate-400', bg: 'bg-slate-800', icon: Wind };
    if (wind >= 10 && wave < 2.0) return { label: 'Good', description: 'Ideal sailing conditions. Fair winds.', color: 'text-green-400', bg: 'bg-green-500/10', icon: ThumbsUp };
    return { label: 'Moderate', description: 'Standard coastal conditions.', color: 'text-blue-400', bg: 'bg-blue-500/10', icon: Flag };
  }, [currentConditions]);

  const surfStats = useMemo(() => {
    if (!currentConditions) return null;
    const { swell, swellPeriod, wind } = currentConditions;
    
    let surfRating = 'Poor';
    let surfColor = 'text-slate-400';
    if (swell > 0.5 && swellPeriod && swellPeriod > 8) { surfRating = 'Fair'; surfColor = 'text-blue-400'; }
    if (swell > 1.0 && swellPeriod && swellPeriod > 10) { surfRating = 'Good'; surfColor = 'text-green-400'; }
    if (swell > 1.5 && swellPeriod && swellPeriod > 12) { surfRating = 'Epic'; surfColor = 'text-purple-400'; }

    return {
      surf: { rating: surfRating, color: surfColor },
      kite: { color: 'text-white' }
    };
  }, [currentConditions]);

  const beachStats = useMemo(() => {
    if (!currentConditions || !weatherData?.general) return null;
    const { wind, wave, currentUV } = currentConditions;
    const { temperature, weatherCode } = weatherData.general;

    let status = "Perfect";
    let color = "text-green-400";
    let message = "Ideal conditions for tanning and chilling.";

    if (weatherCode > 50) { 
        status = "Poor"; color = "text-slate-500"; message = "Precipitation likely. Stay dry.";
    } else if (wind > 30) {
        status = "Windy"; color = "text-orange-400"; message = "Strong winds blowing sand.";
    } else if (temperature < 20) {
        status = "Chilly"; color = "text-blue-300"; message = "Bring a sweater. Not swimming weather.";
    } else if (temperature > 35) {
        status = "Scorching"; color = "text-red-400"; message = "Extreme heat. Stay hydrated.";
    } else if (wave > 1.5) {
        status = "Rough Surf"; color = "text-yellow-400"; message = "Swimming not recommended.";
    }

    return { status, color, message, uvIndex: currentUV };
  }, [currentConditions, weatherData?.general]);

  const forecastTableBlocks = useMemo(() => {
    if (!weatherData?.hourly) return [];
    
    const blocks = [];
    const startIndex = currentHourIndex;
    const totalHours = weatherData.hourly.time.length;

    for (let i = 0; i < 4; i++) {
        const start = startIndex + (i * 6);
        const end = Math.min(start + 6, totalHours);
        if (start >= totalHours) break;

        const sliceIndexes = Array.from({length: end - start}, (_, k) => k + start);
        if (sliceIndexes.length === 0) continue;
        
        const startTime = format(parseISO(weatherData.hourly.time[start]), 'HH:mm');
        const endTime = format(parseISO(weatherData.hourly.time[end - 1]), 'HH:mm');
        const nextDay = format(parseISO(weatherData.hourly.time[start]), 'dd/MM');

        const pressures = sliceIndexes.map(idx => weatherData.hourly.pressure_msl?.[idx] || 1013);
        const waveHeights = sliceIndexes.map(idx => weatherData.hourly.wave_height[idx]);
        const wavePeriods = sliceIndexes.map(idx => weatherData.hourly.wave_period[idx]);
        const windSpeeds = sliceIndexes.map(idx => weatherData.hourly.wind_speed_10m[idx]);
        const windDirs = sliceIndexes.map(idx => weatherData.hourly.wind_direction_10m[idx]);
        const visibilities = sliceIndexes.map(idx => weatherData.hourly.visibility?.[idx] || 10000);
        const swellHeights = sliceIndexes.map(idx => weatherData.hourly.swell_wave_height[idx]);
        const swellPeriods = sliceIndexes.map(idx => weatherData.hourly.swell_wave_period[idx]);
        const swellDirs = sliceIndexes.map(idx => weatherData.hourly.swell_wave_direction[idx]);
        const uvs = sliceIndexes.map(idx => weatherData.hourly.uv_index?.[idx] || 0);

        const minPress = Math.min(...pressures).toFixed(0);
        const maxPress = Math.max(...pressures).toFixed(0);
        
        const minWave = Math.min(...waveHeights);
        const maxWave = Math.max(...waveHeights);
        
        const minWind = Math.min(...windSpeeds).toFixed(0);
        const maxWind = Math.max(...windSpeeds).toFixed(0);
        
        const avgVisMeters = visibilities.reduce((a, b) => a + b, 0) / visibilities.length;
        const avgVisNM = (avgVisMeters / 1852).toFixed(0);

        const startDirVal = windDirs[0];
        const endDirVal = windDirs[windDirs.length - 1];
        const startDirTxt = getMarinerWindDir(startDirVal);
        const endDirTxt = getMarinerWindDir(endDirVal);
        let windDirText = startDirTxt;
        if (Math.abs(startDirVal - endDirVal) > 45 && Math.abs(startDirVal - endDirVal) < 315) {
            windDirText = `${startDirTxt}-${endDirTxt}`;
        }

        const swellDirAvg = swellDirs.reduce((a,b)=>a+b,0) / swellDirs.length;
        const swellDirText = getMarinerWindDir(swellDirAvg);
        const swellHeightAvg = (swellHeights.reduce((a,b)=>a+b,0) / swellHeights.length).toFixed(1);
        const swellPeriodAvg = (swellPeriods.reduce((a,b)=>a+b,0) / swellPeriods.length).toFixed(1);
        const wavePeriodAvg = (wavePeriods.reduce((a,b)=>a+b,0) / wavePeriods.length).toFixed(1);
        
        // Use hourly weather code for accurate row weather
        const hourlyCode = weatherData.hourly.weather_code?.[start] || 0;
        const weatherDesc = getWeatherDescription(hourlyCode);

        const maxUVBlock = Math.max(...uvs).toFixed(0);

        blocks.push({
            period: `${startTime} - ${endTime}`,
            date: nextDay,
            pressure: `${minPress}-${maxPress} hPa`,
            seaStatus: getSeaStateFull(minWave, maxWave),
            wind: `${windDirText} (${minWind}-${maxWind} km/h)`,
            visibility: `${avgVisNM} nm`,
            weather: weatherDesc,
            weatherCode: hourlyCode, 
            swell: swellDirText,
            swellHeight: swellHeightAvg,
            swellPeriod: swellPeriodAvg,
            waveHeight: `${minWave.toFixed(1)}-${maxWave.toFixed(1)}m`,
            wavePeriod: wavePeriodAvg,
            temp: weatherData.general?.temperature.toFixed(0) || "20",
            uv: maxUVBlock
        });
    }
    return blocks;
  }, [weatherData, currentHourIndex]);

  const handleNextTab = () => {
    const tabs: ('mariner' | 'surfer' | 'kite' | 'beach')[] = ['mariner', 'surfer', 'kite', 'beach'];
    const idx = tabs.indexOf(forecastTab);
    setForecastTab(tabs[(idx + 1) % tabs.length]);
  };

  const handlePrevTab = () => {
    const tabs: ('mariner' | 'surfer' | 'kite' | 'beach')[] = ['mariner', 'surfer', 'kite', 'beach'];
    const idx = tabs.indexOf(forecastTab);
    setForecastTab(tabs[(idx - 1 + tabs.length) % tabs.length]);
  };

  if (loading) return <div className="flex items-center justify-center h-full text-cyan-400 animate-pulse">Fetching atmospheric & marine data...</div>;
  if (error) return <div className="flex items-center justify-center h-full text-red-400"><AlertTriangle className="mr-2" /> {error}</div>;
  if (!weatherData || !currentConditions) return null;

  return (
    <div className="p-4 space-y-8 pb-24 max-w-7xl mx-auto relative">
      
      {roughWeatherAlert && !dismissedAlert && (
          <div className={`${roughWeatherAlert.color} text-white p-4 rounded-xl flex items-center justify-between shadow-xl animate-in fade-in slide-in-from-top-4 relative`}>
              <div className="flex items-center gap-4">
                  <div className="bg-white/20 p-2 rounded-full animate-bounce">
                    <roughWeatherAlert.icon size={32} />
                  </div>
                  <div>
                      <h2 className="font-bold text-lg tracking-wider">{roughWeatherAlert.title}</h2>
                      <p className="text-sm opacity-90">{roughWeatherAlert.message}</p>
                  </div>
              </div>
              <button 
                onClick={() => setDismissedAlert(true)} 
                className="p-1 hover:bg-white/20 rounded-full transition-colors absolute top-2 right-2 md:static"
              >
                <X size={20} />
              </button>
          </div>
      )}

      <header className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-2">
            <span className="relative flex h-8 w-8 items-center justify-center mr-2">
                <WeatherAnimation code={weatherData.general?.weatherCode || 0} />
            </span>
            {weatherData.general?.weatherDescription || 'Marine Weather'}
          </h1>
          <p className="text-slate-400 text-sm mt-1 flex items-center gap-1">
             <span className="font-semibold text-white">{locationName}</span> 
             <span className="opacity-50">•</span> 
             {weatherData.latitude.toFixed(4)}°N, {weatherData.longitude.toFixed(4)}°E 
             <span className="opacity-50">•</span> 
             {format(new Date(), 'EEE, MMM d')}
          </p>
        </div>
        <button 
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors flex items-center gap-2"
        >
          <Settings size={20} />
          <span className="text-xs font-bold hidden sm:inline">Alert Config</span>
        </button>
      </header>

      {showSettings && (
        <div className="bg-slate-900 border border-slate-700 p-4 rounded-xl shadow-2xl animate-in fade-in slide-in-from-top-4 mb-6 relative z-50">
          <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-2">
            <h3 className="font-bold text-white flex items-center gap-2">
              <Bell size={16} className="text-blue-400" /> Alert Configuration
            </h3>
            <button onClick={() => setShowSettings(false)} className="text-slate-500 hover:text-slate-300"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="space-y-4">
                 <div>
                    <label className="text-xs text-slate-400 flex justify-between mb-1">Wave Threshold (m) <span className="text-white">{alertConfig.waveHeightThreshold}</span></label>
                    <input type="range" min="0.5" max="10" step="0.5" value={alertConfig.waveHeightThreshold} onChange={(e)=>setAlertConfig({...alertConfig, waveHeightThreshold: parseFloat(e.target.value)})} className="w-full h-2 bg-slate-700 rounded-lg cursor-pointer accent-blue-500"/>
                 </div>
                 <div>
                    <label className="text-xs text-slate-400 flex justify-between mb-1">Wind Threshold (km/h) <span className="text-white">{alertConfig.windSpeedThreshold}</span></label>
                    <input type="range" min="10" max="100" step="5" value={alertConfig.windSpeedThreshold} onChange={(e)=>setAlertConfig({...alertConfig, windSpeedThreshold: parseFloat(e.target.value)})} className="w-full h-2 bg-slate-700 rounded-lg cursor-pointer accent-cyan-500"/>
                 </div>
                 <div className="flex items-center justify-between p-3 bg-red-950/30 border border-red-900/50 rounded-lg">
                    <div className="flex items-center gap-2">
                        <Waves size={16} className="text-red-500" />
                        <span className="text-sm font-bold text-red-200">Tsunami Alert Simulation</span>
                    </div>
                    <input 
                        type="checkbox" 
                        checked={alertConfig.simulateTsunami} 
                        onChange={(e) => setAlertConfig({...alertConfig, simulateTsunami: e.target.checked})}
                        className="w-4 h-4 rounded border-red-500 bg-transparent accent-red-600"
                    />
                 </div>
             </div>
          </div>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg">
         <h3 className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2 mb-4">
             <Flag size={14} /> Activity Report
         </h3>
         <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {sailingCondition && (
                <div className={`p-4 rounded-lg border border-slate-700/50 flex items-center gap-4 ${sailingCondition.bg} relative`}>
                   <sailingCondition.icon className={sailingCondition.color} size={32} />
                   <div>
                      <div className={`font-bold text-lg ${sailingCondition.color}`}>{sailingCondition.label} Sailing</div>
                      <div className="text-xs text-slate-400 leading-tight">{sailingCondition.description}</div>
                   </div>
                </div>
              )}
              
              {surfStats && (
                 <div className="grid grid-cols-2 gap-2 relative">
                    <div className="bg-slate-800 p-3 rounded-lg flex flex-col items-center justify-center border border-slate-700 relative">
                       <div className="text-[10px] text-slate-500 uppercase mb-1">Surf</div>
                       <div className={`font-bold text-xl ${surfStats.surf.color}`}>{surfStats.surf.rating}</div>
                    </div>
                    <div className="bg-slate-800 p-3 rounded-lg flex flex-col items-center justify-center border border-slate-700">
                       <div className="text-[10px] text-slate-500 uppercase mb-1">Kite</div>
                       
                       {/* Updated Kite Card to show only wind data */}
                       <div className="flex flex-col items-center">
                          <div className="font-bold text-lg text-white font-mono flex items-center gap-1">
                             {currentConditions.wind.toFixed(0)} <span className="text-xs text-slate-400 font-sans">km/h</span>
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-1">
                             <Navigation size={10} style={{ transform: `rotate(${currentConditions.windDirection}deg)` }} className="text-cyan-400" />
                             <span>{getCardinalDirection(currentConditions.windDirection)}</span>
                          </div>
                       </div>
                    </div>
                 </div>
              )}
              
              {beachStats && (
                <div className="bg-slate-800 p-3 rounded-lg border border-slate-700 flex flex-col justify-between relative">
                   <div className="flex justify-between items-start">
                      <div>
                         <span className="text-xs font-bold text-slate-300 flex items-center gap-2"><Palmtree size={14}/> Beach Day</span>
                         <div className={`text-lg font-bold ${beachStats.color}`}>{beachStats.status}</div>
                      </div>
                      <div className="text-right mr-6">
                         <div className="text-xs text-slate-400">Current UV</div>
                         <div className="font-bold text-white">{beachStats.uvIndex.toFixed(0)}</div>
                      </div>
                   </div>
                   <div className="text-[10px] text-slate-500 mt-2">{beachStats.message}</div>
                </div>
              )}
         </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* WAVE */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl relative overflow-hidden group">
           <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity"><Activity size={64} /></div>
           <div className="flex items-center gap-2 mb-2 text-slate-400">
              <Activity size={16} className="text-blue-400"/>
              <span className="text-xs font-bold uppercase">Wave Height</span>
           </div>
           <div className="flex items-baseline gap-1">
             <span className="text-3xl font-bold text-white">{currentConditions.wave.toFixed(1)}</span>
             <span className="text-sm text-slate-500">m</span>
           </div>
           <p className="text-xs text-slate-500 mt-1">Period: {currentConditions.wavePeriod.toFixed(1)}s</p>
        </div>

        {/* WIND */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl relative overflow-hidden group">
           <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity"><Wind size={64} /></div>
           <div className="flex items-center gap-2 mb-2 text-slate-400">
              <Wind size={16} className="text-cyan-400"/>
              <span className="text-xs font-bold uppercase">Wind Speed</span>
           </div>
           <div className="flex items-baseline gap-1">
             <span className="text-3xl font-bold text-white">{currentConditions.wind.toFixed(0)}</span>
             <span className="text-sm text-slate-500">km/h</span>
           </div>
           <div className="flex items-center gap-1 mt-1 text-slate-500 text-xs">
              <Navigation size={12} style={{ transform: `rotate(${currentConditions.windDirection}deg)` }} />
              <span>{getCardinalDirection(currentConditions.windDirection)} ({currentConditions.windDirection}°)</span>
           </div>
        </div>

        {/* SWELL - Updated Icon to Waves */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl relative overflow-hidden group">
           <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity"><Waves size={64} /></div>
           <div className="flex items-center gap-2 mb-2 text-slate-400">
              <Waves size={16} className="text-teal-400"/>
              <span className="text-xs font-bold uppercase">Swell</span>
           </div>
           <div className="flex items-baseline gap-1">
             <span className="text-3xl font-bold text-white">{currentConditions.swell.toFixed(1)}</span>
             <span className="text-sm text-slate-500">m</span>
           </div>
           <div className="mt-1 text-slate-500 text-xs">
              <div className="flex items-center gap-1 mb-1">
                 <Navigation size={12} style={{ transform: `rotate(${currentConditions.swellDirection}deg)` }} />
                 <span>{getCardinalDirection(currentConditions.swellDirection)}</span>
              </div>
              <div className="font-semibold text-teal-500/80">Period: {currentConditions.swellPeriod.toFixed(1)}s</div>
           </div>
        </div>

        {/* TEMP (AIR + SEA) - Updated Icon to Thermometer */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl relative overflow-hidden group">
           <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity"><Thermometer size={64} /></div>
           <div className="flex justify-between h-full">
               {/* Air Temp */}
               <div className="flex flex-col justify-between">
                   <div className="flex items-center gap-2 text-slate-400">
                      <Thermometer size={16} className="text-yellow-400"/>
                      <span className="text-xs font-bold uppercase">Air</span>
                   </div>
                   <div className="flex items-baseline gap-1">
                     <span className="text-3xl font-bold text-white">{weatherData.general?.temperature.toFixed(0)}</span>
                     <span className="text-sm text-slate-500">°C</span>
                   </div>
               </div>

               <div className="w-px bg-slate-800 mx-2"></div>

               {/* Sea Temp */}
               <div className="flex flex-col justify-between">
                   <div className="flex items-center gap-2 text-slate-400">
                      <Waves size={16} className="text-blue-400"/>
                      <span className="text-xs font-bold uppercase">Sea</span>
                   </div>
                   <div className="flex items-baseline gap-1">
                     <span className="text-3xl font-bold text-white">{currentConditions.seaTemp?.toFixed(0)}</span>
                     <span className="text-sm text-slate-500">°C</span>
                   </div>
               </div>
           </div>
           <p className="text-xs text-slate-500 mt-2 absolute bottom-2 left-4">Feels {weatherData.general?.feelsLike.toFixed(0)}°</p>
        </div>
      </div>

      {/* COMBINED INTERACTIVE GRAPH CONTAINER */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl min-w-0">
          
          <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
             <div className="flex items-center gap-2">
                 {/* Icon changes based on active tab */}
                 {activeGraph === 'tide' && <Waves size={16} className="text-blue-400" />}
                 {activeGraph === 'wave' && <Activity size={16} className="text-blue-400" />}
                 {activeGraph === 'swell' && <Layers size={16} className="text-teal-400" />}
                 
                 <h3 className="text-xs font-bold text-slate-400 uppercase">
                    {activeGraph === 'tide' && "Tide Schedule & Sea Level"}
                    {activeGraph === 'wave' && "Wave Forecast (Height & Period)"}
                    {activeGraph === 'swell' && "Swell Forecast (Height & Period)"}
                 </h3>
             </div>

             {/* Tab Switcher */}
             <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                 <button 
                   onClick={() => setActiveGraph('tide')}
                   className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${activeGraph === 'tide' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                 >
                   Tides
                 </button>
                 <button 
                   onClick={() => setActiveGraph('wave')}
                   className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${activeGraph === 'wave' ? 'bg-blue-600/20 text-blue-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                 >
                   Waves
                 </button>
                 <button 
                   onClick={() => setActiveGraph('swell')}
                   className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${activeGraph === 'swell' ? 'bg-teal-600/20 text-teal-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                 >
                   Swell
                 </button>
             </div>
          </div>
          
          {/* Active Graph Indicator / Legend Area */}
          <div className="flex gap-4 mb-2 text-xs items-center pl-2">
             {activeGraph === 'tide' && weatherData.tides && (
                  <div className="flex gap-4">
                     <div className="flex items-center gap-1"><ArrowUp size={12} className="text-blue-400" /><span className="text-slate-300">High: {format(parseISO(weatherData.tides.nextHigh.time), 'HH:mm')}</span></div>
                     <div className="flex items-center gap-1"><ArrowDown size={12} className="text-blue-400" /><span className="text-slate-300">Low: {format(parseISO(weatherData.tides.nextLow.time), 'HH:mm')}</span></div>
                     {currentConditions.seaLevel !== undefined && (
                        <div className="hidden md:flex gap-1 items-center bg-slate-800/50 px-2 py-0.5 rounded">
                            <Ruler size={10} className="text-teal-400" />
                            <span className="text-slate-400">MSL:</span>
                            <span className="text-white font-bold">{currentConditions.seaLevel.toFixed(2)}m</span>
                        </div>
                     )}
                  </div>
             )}
             {activeGraph !== 'tide' && (
                 <>
                   <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full opacity-50 ${activeGraph === 'wave' ? 'bg-blue-500' : 'bg-teal-500'}`}></div>
                      <span className="text-slate-400">Height (m)</span>
                   </div>
                   <div className="flex items-center gap-2">
                      <div className="w-3 h-1 bg-yellow-400 rounded-full"></div>
                      <span className="text-slate-400">Period (s)</span>
                   </div>
                 </>
             )}
          </div>

          <div className="h-64 w-full min-h-[256px]">
            <ResponsiveContainer width="99%" height="100%">
               {activeGraph === 'tide' ? (
                  <AreaChart data={tideChartData}>
                    <defs>
                      <linearGradient id="colorTide" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="displayTime" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} domain={['dataMin - 0.5', 'dataMax + 0.5']} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b' }} itemStyle={{ color: '#e2e8f0' }} />
                    <Area type="monotone" dataKey="height" stroke="#3b82f6" fillOpacity={1} fill="url(#colorTide)" strokeWidth={2} name="Tide Height" />
                  </AreaChart>
               ) : (
                  <ComposedChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="displayTime" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                      
                      {/* Left Axis: Height (Meters) */}
                      <YAxis 
                          yAxisId="left" 
                          stroke="#64748b" 
                          fontSize={10} 
                          tickLine={false} 
                          axisLine={false} 
                          label={{ value: 'm', angle: -90, position: 'insideLeft', fill: '#64748b' }}
                      />
                      
                      {/* Right Axis: Period (Seconds) */}
                      <YAxis 
                          yAxisId="right" 
                          orientation="right" 
                          stroke="#64748b" 
                          fontSize={10} 
                          tickLine={false} 
                          axisLine={false}
                          domain={[0, 20]}
                          label={{ value: 's', angle: 90, position: 'insideRight', fill: '#64748b' }}
                      />

                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b' }} itemStyle={{ color: '#e2e8f0' }} labelStyle={{ color: '#94a3b8' }} />
                      
                      {activeGraph === 'wave' ? (
                          <>
                             <Area yAxisId="left" type="monotone" dataKey="waveHeight" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} strokeWidth={2} name="Wave Height" />
                             <Line yAxisId="right" type="monotone" dataKey="wavePeriod" stroke="#facc15" strokeWidth={2} dot={false} name="Wave Period" />
                          </>
                      ) : (
                          <>
                             <Area yAxisId="left" type="monotone" dataKey="swellHeight" stroke="#14b8a6" fill="#14b8a6" fillOpacity={0.2} strokeWidth={2} name="Swell Height" />
                             <Line yAxisId="right" type="monotone" dataKey="swellPeriod" stroke="#facc15" strokeWidth={2} dot={false} name="Swell Period" />
                          </>
                      )}
                  </ComposedChart>
               )}
            </ResponsiveContainer>
          </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden relative">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
            <h3 className="text-sm font-bold text-slate-300 uppercase flex items-center gap-2">
                <Compass size={16} className="text-blue-400" />
                {forecastTab === 'mariner' && "Mariner's Forecast (IMS)"}
                {forecastTab === 'surfer' && "Surfer's Forecast"}
                {forecastTab === 'kite' && "Kite Surfer's Forecast"}
                {forecastTab === 'beach' && "Seashore Forecast"}
            </h3>
            <div className="flex gap-2">
                <button onClick={handlePrevTab} className="p-1 hover:bg-slate-800 rounded"><ChevronLeft size={20} className="text-slate-400"/></button>
                <button onClick={handleNextTab} className="p-1 hover:bg-slate-800 rounded"><ChevronRight size={20} className="text-slate-400"/></button>
            </div>
        </div>

        <div className="overflow-x-auto min-h-[200px] transition-all duration-300 ease-in-out">
            <table className="w-full text-left text-xs text-slate-400 min-w-[800px]">
                <thead className="bg-slate-950 text-slate-300 uppercase font-bold text-[10px] tracking-wider">
                    <tr>
                        <th className="p-3 border-r border-slate-800 w-32">Period</th>
                        {forecastTab === 'mariner' && (
                            <>
                                <th className="p-3 border-r border-slate-800">Pressure</th>
                                <th className="p-3 border-r border-slate-800">Sea Status</th>
                                <th className="p-3 border-r border-slate-800">Wind</th>
                                <th className="p-3 border-r border-slate-800">Visibility</th>
                                <th className="p-3 border-r border-slate-800">Weather</th>
                                <th className="p-3">Swell</th>
                            </>
                        )}
                        {forecastTab === 'surfer' && (
                            <>
                                <th className="p-3 border-r border-slate-800">Wave Height</th>
                                <th className="p-3 border-r border-slate-800">Period</th>
                                <th className="p-3 border-r border-slate-800">Swell Height</th>
                                <th className="p-3 border-r border-slate-800">Swell Period</th>
                                <th className="p-3 border-r border-slate-800">Swell Dir</th>
                                <th className="p-3">Rating</th>
                            </>
                        )}
                        {forecastTab === 'kite' && (
                            <>
                                <th className="p-3 border-r border-slate-800">Wind Speed</th>
                                <th className="p-3 border-r border-slate-800">Direction</th>
                                <th className="p-3 border-r border-slate-800">Wave Height</th>
                                <th className="p-3 border-r border-slate-800">Weather</th>
                                <th className="p-3">Condition</th>
                            </>
                        )}
                        {forecastTab === 'beach' && (
                             <>
                                <th className="p-3 border-r border-slate-800">Temp</th>
                                <th className="p-3 border-r border-slate-800">UV Index</th>
                                <th className="p-3 border-r border-slate-800">Wind (Sand)</th>
                                <th className="p-3 border-r border-slate-800">Sea State</th>
                                <th className="p-3">Comfort</th>
                            </>
                        )}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                    {forecastTableBlocks.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/50 transition-colors">
                            <td className="p-3 border-r border-slate-800">
                                <div className="font-bold text-white mb-1">{row.period}</div>
                                <div className="text-[10px] text-slate-500">{row.date}</div>
                            </td>

                            {forecastTab === 'mariner' && (
                                <>
                                    <td className="p-3 border-r border-slate-800">{row.pressure}</td>
                                    <td className="p-3 border-r border-slate-800 text-slate-200">{row.seaStatus}</td>
                                    <td className="p-3 border-r border-slate-800 text-white font-medium">{row.wind}</td>
                                    <td className="p-3 border-r border-slate-800">{row.visibility}</td>
                                    <td className="p-3 border-r border-slate-800 flex items-center gap-1.5">
                                        <WeatherAnimation code={row.weatherCode} />
                                        {row.weather}
                                    </td>
                                    <td className="p-3 text-teal-400">{row.swell} ({row.swellHeight}m)</td>
                                </>
                            )}

                             {forecastTab === 'surfer' && (
                                <>
                                    <td className="p-3 border-r border-slate-800 font-bold text-blue-300">{row.waveHeight}</td>
                                    <td className="p-3 border-r border-slate-800">{row.wavePeriod}s</td>
                                    <td className="p-3 border-r border-slate-800 font-medium text-teal-300">{row.swellHeight}m</td>
                                    <td className="p-3 border-r border-slate-800">{row.swellPeriod}s</td>
                                    <td className="p-3 border-r border-slate-800">{row.swell}</td>
                                    <td className="p-3">
                                        {parseFloat(row.wavePeriod) > 9 ? <span className="text-green-400 font-bold">Good</span> : <span className="text-slate-500">Poor</span>}
                                    </td>
                                </>
                            )}

                            {forecastTab === 'kite' && (
                                <>
                                    <td className="p-3 border-r border-slate-800 font-bold text-cyan-300">{row.wind.split('(')[1]?.replace(')', '') || row.wind}</td>
                                    <td className="p-3 border-r border-slate-800">{row.wind.split('(')[0]}</td>
                                    <td className="p-3 border-r border-slate-800">{row.waveHeight}</td>
                                    <td className="p-3 border-r border-slate-800 flex items-center gap-1.5">
                                         <WeatherAnimation code={row.weatherCode} />
                                         {row.weather}
                                    </td>
                                    <td className="p-3">
                                        {row.wind.includes("20-") || row.wind.includes("25-") ? <span className="text-green-400 font-bold">Optimal</span> : <span className="text-slate-500">Light</span>}
                                    </td>
                                </>
                            )}
                             {forecastTab === 'beach' && (
                                <>
                                    <td className="p-3 border-r border-slate-800 font-bold text-yellow-300">{row.temp}°C</td>
                                    <td className="p-3 border-r border-slate-800">{row.uv}</td>
                                    <td className="p-3 border-r border-slate-800">{row.wind}</td>
                                    <td className="p-3 border-r border-slate-800">{row.seaStatus.split('(')[0]}</td>
                                    <td className="p-3">
                                        {(() => {
                                            const code = row.weatherCode;
                                            const t = parseFloat(row.temp);
                                            const wind = parseFloat(row.wind.split('-')[1] || row.wind);
                                            
                                            if (code >= 51 || code >= 80) return <span className="text-red-400 font-bold">Poor (Rain)</span>;
                                            if (code === 3 && t <= 20) return <span className="text-slate-400">Cool & Cloudy</span>;
                                            if (code === 3) return <span className="text-slate-400">Cloudy</span>;
                                            if (t < 18) return <span className="text-blue-300">Cold</span>;
                                            if (t < 22) return <span className="text-blue-200">Cool</span>;
                                            if (wind > 30) return <span className="text-orange-400">Windy</span>;
                                            return <span className="text-green-400 font-bold">Great</span>;
                                        })()}
                                    </td>
                                </>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
        <div className="absolute bottom-2 right-4 flex gap-1 justify-center">
            {['mariner', 'surfer', 'kite', 'beach'].map((t) => (
                <div key={t} className={`w-2 h-2 rounded-full ${forecastTab === t ? 'bg-blue-500' : 'bg-slate-700'}`} />
            ))}
        </div>
      </div>

    </div>
  );
};

export default Dashboard;
