import React, { useMemo, useState } from 'react';
import { MarineWeatherData, AlertConfig } from '@seame/core';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, ComposedChart, Line, Legend
} from 'recharts';
import {
  Wind, Activity, Droplets, AlertTriangle, Waves, ArrowUp, ArrowDown,
  Navigation, Settings, X, Bell, Sun, Moon, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog,
  Thermometer, ThumbsUp, Skull, Flag, Palmtree, Compass, ChevronRight, ChevronLeft, Tornado, Ruler, Layers
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { getWeatherDescription } from '@seame/core';
import { DashboardSkeleton } from './LoadingSkeleton';
import { ErrorState } from './ErrorState';
import { useTranslation } from 'react-i18next';

interface DashboardProps {
  weatherData: MarineWeatherData | null | undefined;
  loading: boolean;
  error: Error | null;
  locationName: string;
  onRetry?: () => void;
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
  if (code === 0 || code === 1) return <Sun className="text-accent animate-[spin_10s_linear_infinite]" size={20} />;
  // Cloudy
  if (code === 2 || code === 3) return <Cloud className="text-secondary animate-pulse" size={20} />;
  // Fog
  if (code === 45 || code === 48) return <CloudFog className="text-muted animate-pulse" size={20} />;
  // Rain / Drizzle
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return <CloudRain className="text-accent animate-bounce" size={20} />;
  // Snow
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return <CloudSnow className="text-primary animate-bounce" size={20} />;
  // Thunder
  if (code >= 95 && code <= 99) return <CloudLightning className="text-yellow-500 animate-pulse" size={20} />;

  return <Sun className="text-accent" size={20} />;
};

// Translation helper for cardinal directions
const getCardinalDirectionKey = (angle: number): number => {
  return Math.round(angle / 45) % 8;
};

// Translation helper for mariner wind directions
const getMarinerWindDirKey = (angle: number): number => {
  return Math.round(angle / 45) % 8;
};

// Translation helper for sea states
const getSeaStateKey = (heightM: number): string => {
  if (heightM < 0.1) return "calm";
  if (heightM < 0.5) return "smooth";
  if (heightM < 1.25) return "slight";
  if (heightM < 2.5) return "moderate";
  if (heightM < 4) return "rough";
  if (heightM < 6) return "veryRough";
  if (heightM < 9) return "high";
  return "phenomenal";
};

// Translation helper for weather conditions
const getWeatherConditionKey = (code: number): string => {
  const codeMap: Record<number, string> = {
    0: 'clearSky',
    1: 'mainlyClear', 2: 'partlyCloudy', 3: 'overcast',
    45: 'fog', 48: 'depositingRimeFog',
    51: 'lightDrizzle', 53: 'moderateDrizzle', 55: 'denseDrizzle',
    61: 'slightRain', 63: 'moderateRain', 65: 'heavyRain',
    71: 'slightSnow', 73: 'moderateSnow', 75: 'heavySnow',
    77: 'snowGrains',
    80: 'slightRainShowers', 81: 'moderateRainShowers', 82: 'violentRainShowers',
    95: 'thunderstorm', 96: 'thunderstormWithHail', 99: 'heavyHailThunderstorm'
  };
  return codeMap[code] || 'unknown';
};

const Dashboard: React.FC<DashboardProps> = ({ weatherData, loading, error, locationName, onRetry }) => {
  const { t } = useTranslation();
  const [showSettings, setShowSettings] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertConfig>(DEFAULT_ALERT_CONFIG);
  const [forecastTab, setForecastTab] = useState<'mariner' | 'surfer' | 'kite' | 'beach'>('mariner');
  const [dismissedAlert, setDismissedAlert] = useState(false);

  // Graph Tab State
  const [activeGraph, setActiveGraph] = useState<'tide' | 'wave' | 'swell'>('wave');

  // Translation helper functions
  const getCardinalDirection = (angle: number): string => {
    const keys = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
    const index = Math.round(angle / 45) % 8;
    return t(`directions.${keys[index]}`);
  };

  const getMarinerWindDir = (angle: number): string => {
    const keys = ['northerly', 'northeasterly', 'easterly', 'southeasterly', 'southerly', 'southwesterly', 'westerly', 'northwesterly'];
    const index = Math.round(angle / 45) % 8;
    return t(`directions.${keys[index]}`);
  };

  const getSeaStateTerm = (heightM: number): string => {
    const key = getSeaStateKey(heightM);
    return t(`seaState.${key}`);
  };

  const getSeaStateFull = (minM: number, maxM: number): string => {
    const minTerm = getSeaStateTerm(minM);
    const maxTerm = getSeaStateTerm(maxM);
    const rangeText = `${(minM * 100).toFixed(0)}-${(maxM * 100).toFixed(0)} cm`;
    if (minTerm === maxTerm) return `${minTerm} (${rangeText})`;
    return `${minTerm} ${t('seaState.to')} ${maxTerm} (${rangeText})`;
  };

  const getWeatherConditionTranslated = (code: number): string => {
    const key = getWeatherConditionKey(code);
    return t(`weatherConditions.${key}`);
  };

  // All hooks must be called before any conditional returns
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
    if (!weatherData?.hourly?.time) {
      return [];
    }
    const start = currentHourIndex;
    const end = Math.min(start + 24, weatherData.hourly.time.length);

    const data = weatherData.hourly.time.slice(start, end).map((time, i) => {
      const globalIndex = start + i;
      return {
        time: time,
        displayTime: format(parseISO(time), 'HH:mm'),
        waveHeight: weatherData.hourly.wave_height?.[globalIndex] || 0,
        windSpeed: weatherData.hourly.wind_speed_10m?.[globalIndex] || 0,
        swellHeight: weatherData.hourly.swell_wave_height?.[globalIndex] || 0,
        wavePeriod: weatherData.hourly.wave_period?.[globalIndex] || 0,
        swellPeriod: weatherData.hourly.swell_wave_period?.[globalIndex] || 0,
      };
    });

    return data;
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
    if (!weatherData?.current) {
      return null;
    }
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
      seaTemp: weatherData.current.seaTemperature,
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
            title: t('alerts.stormWarning'),
            message: t('alerts.stormMessage'),
            icon: Tornado,
            color: "bg-red-600"
        };
    }
    if (weatherCode >= 80 || wind > 50 || wave > 3.0) {
        return {
            title: t('alerts.roughWeather'),
            message: t('alerts.roughWeatherMessage'),
            icon: CloudLightning,
            color: "bg-orange-600"
        };
    }
    if (alertConfig.simulateTsunami) {
        return {
            title: t('alerts.tsunami'),
            message: t('alerts.tsunamiMessage'),
            icon: Waves,
            color: "bg-red-900 animate-pulse border-2 border-red-500"
        };
    }
    return null;
  }, [weatherData, currentConditions, alertConfig.simulateTsunami, t]);

  const sailingCondition = useMemo(() => {
    if (!currentConditions) return null;
    const { wind, wave } = currentConditions;

    const windSpeed = wind || 0;
    const waveHeight = wave || 0;

    if (windSpeed > 55 || waveHeight > 3.5) return { label: t('activity.sailing.hazardous'), description: t('activity.sailing.hazardousDesc'), color: 'text-red-500', bg: 'bg-red-500/10', icon: Skull };
    if (windSpeed > 40 || waveHeight > 2.5) return { label: t('activity.sailing.challenging'), description: t('activity.sailing.challengingDesc'), color: 'text-orange-500', bg: 'bg-orange-500/10', icon: AlertTriangle };
    if (windSpeed < 10) return { label: t('activity.sailing.calm'), description: t('activity.sailing.calmDesc'), color: 'text-secondary', bg: 'bg-elevated', icon: Wind };
    if (windSpeed >= 10 && waveHeight < 2.0) return { label: t('activity.sailing.good'), description: t('activity.sailing.goodDesc'), color: 'text-green-400', bg: 'bg-green-500/10', icon: ThumbsUp };
    return { label: t('activity.sailing.moderate'), description: t('activity.sailing.moderateDesc'), color: 'text-accent', bg: 'bg-blue-500/10', icon: Flag };
  }, [currentConditions, t]);

  const surfStats = useMemo(() => {
    if (!currentConditions) return null;
    const { swell, swellPeriod, wind } = currentConditions;

    let surfRating = t('activity.surf.poor');
    let surfColor = 'text-secondary';

    // More realistic surf conditions for Mediterranean and similar seas
    // Use default value of 0 if undefined
    const swellHeight = swell || 0;
    const swellPeriodValue = swellPeriod || 0;

    // Adjusted thresholds for more realistic ratings
    // Fair: Small swells with decent period (beginner-friendly)
    if (swellHeight >= 0.5 && swellPeriodValue >= 4) {
      surfRating = t('activity.surf.fair');
      surfColor = 'text-accent';
    }
    // Good: Medium swells with good period (intermediate)
    if (swellHeight >= 1.0 && swellPeriodValue >= 6) {
      surfRating = t('activity.surf.good');
      surfColor = 'text-green-400';
    }
    // Epic: Large swells with long period (advanced)
    if (swellHeight >= 1.5 && swellPeriodValue >= 8) {
      surfRating = t('activity.surf.epic');
      surfColor = 'text-purple-400';
    }

    return {
      surf: { rating: surfRating, color: surfColor },
      kite: { color: 'text-primary' }
    };
  }, [currentConditions, t]);

  const beachStats = useMemo(() => {
    if (!currentConditions || !weatherData?.general) return null;
    const { wind, wave, currentUV } = currentConditions;
    const { temperature, weatherCode } = weatherData.general;

    const windSpeed = wind || 0;
    const waveHeight = wave || 0;
    const uvIndex = currentUV || 0;
    const temp = temperature || 20;
    const code = weatherCode || 0;

    let status = t('activity.beach.perfect');
    let color = "text-green-400";
    let message = t('activity.beach.perfectDesc');

    if (code > 50) {
        status = t('activity.beach.poor'); color = "text-muted"; message = t('activity.beach.poorDesc');
    } else if (windSpeed > 30) {
        status = t('activity.beach.windy'); color = "text-orange-400"; message = t('activity.beach.windyDesc');
    } else if (temp < 20) {
        status = t('activity.beach.chilly'); color = "text-blue-300"; message = t('activity.beach.chillyDesc');
    } else if (temp > 35) {
        status = t('activity.beach.scorching'); color = "text-red-400"; message = t('activity.beach.scorchingDesc');
    } else if (waveHeight > 1.5) {
        status = t('activity.beach.roughSurf'); color = "text-yellow-400"; message = t('activity.beach.roughSurfDesc');
    }

    return { status, color, message, uvIndex };
  }, [currentConditions, weatherData?.general, t]);

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

        const maxUVBlock = Math.max(...uvs).toFixed(0);

        blocks.push({
            period: `${startTime} - ${endTime}`,
            date: nextDay,
            pressure: `${minPress}-${maxPress} hPa`,
            seaStatus: getSeaStateFull(minWave, maxWave),
            wind: `${windDirText} (${minWind}-${maxWind} km/h)`,
            visibility: `${avgVisNM} nm`,
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

  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;

  if (!weatherData || !currentConditions) {
      if (!loading && !error) return <div className="p-8 text-center text-secondary">{t('common.noData')}</div>;
      return null;
  }

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
          <h1 className="text-3xl font-bold text-primary flex items-center gap-2">
            <span className="relative flex h-8 w-8 items-center justify-center mr-2">
                <WeatherAnimation code={weatherData.general?.weatherCode || 0} />
            </span>
            {getWeatherConditionTranslated(weatherData.general?.weatherCode || 0)}
          </h1>
          <p className="text-secondary text-sm mt-1 flex items-center gap-1">
             <span className="font-semibold text-primary">{locationName}</span>
             <span className="opacity-50">•</span>
             {weatherData.latitude.toFixed(4)}°N, {weatherData.longitude.toFixed(4)}°E
             <span className="opacity-50">•</span>
             {format(new Date(), 'EEE, MMM d')}
          </p>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 bg-elevated hover:bg-app-hover text-secondary rounded-lg transition-colors flex items-center gap-2"
        >
          <Settings size={20} />
          <span className="text-xs font-bold hidden sm:inline">{t('dashboard.alertConfig')}</span>
        </button>
      </header>

      {showSettings && (
        <div className="bg-card border border-app p-4 rounded-xl shadow-2xl animate-in fade-in slide-in-from-top-4 mb-6 relative z-50">
          <div className="flex justify-between items-center mb-4 border-b border-subtle pb-2">
            <h3 className="font-bold text-primary flex items-center gap-2">
              <Bell size={16} className="text-accent" /> {t('dashboard.alertConfiguration')}
            </h3>
            <button onClick={() => setShowSettings(false)} className="text-muted hover:text-secondary"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="space-y-4">
                 <div>
                    <label className="text-xs text-secondary flex justify-between mb-1">{t('dashboard.waveThreshold')} (m) <span className="text-primary">{alertConfig.waveHeightThreshold}</span></label>
                    <input type="range" min="0.5" max="10" step="0.5" value={alertConfig.waveHeightThreshold} onChange={(e)=>setAlertConfig({...alertConfig, waveHeightThreshold: parseFloat(e.target.value)})} className="w-full h-2 bg-elevated rounded-lg cursor-pointer accent-blue-500"/>
                 </div>
                 <div>
                    <label className="text-xs text-secondary flex justify-between mb-1">{t('dashboard.windThreshold')} (km/h) <span className="text-primary">{alertConfig.windSpeedThreshold}</span></label>
                    <input type="range" min="10" max="100" step="5" value={alertConfig.windSpeedThreshold} onChange={(e)=>setAlertConfig({...alertConfig, windSpeedThreshold: parseFloat(e.target.value)})} className="w-full h-2 bg-elevated rounded-lg cursor-pointer accent-cyan-500"/>
                 </div>
                 <div className="flex items-center justify-between p-3 bg-red-950/30 border border-red-900/50 rounded-lg">
                    <div className="flex items-center gap-2">
                        <Waves size={16} className="text-red-500" />
                        <span className="text-sm font-bold text-red-200">{t('dashboard.tsunamiSimulation')}</span>
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

      <div className="bg-card border border-app p-4 rounded-xl shadow-lg">
         <h3 className="text-xs font-bold text-secondary uppercase flex items-center gap-2 mb-4">
             <Flag size={14} /> {t('activity.report')}
         </h3>
         <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {sailingCondition && (
                <div className={`p-4 rounded-lg border border-subtle flex items-center gap-4 ${sailingCondition.bg} relative`}>
                   <sailingCondition.icon className={`${sailingCondition.color} rtl:order-2`} size={32} />
                   <div className="rtl:order-1">
                      <div className={`font-bold text-lg ${sailingCondition.color}`}>{sailingCondition.label} {t('activity.sailing.label')}</div>
                      <div className="text-xs text-secondary leading-tight">{sailingCondition.description}</div>
                   </div>
                </div>
              )}

              {surfStats && (
                 <div className="grid grid-cols-2 gap-2 relative">
                    <div className="bg-elevated p-3 rounded-lg flex flex-col items-center justify-center border border-subtle relative">
                       <div className="text-[10px] text-muted uppercase mb-1">{t('activity.surf.label')}</div>
                       <div className={`font-bold text-xl ${surfStats.surf.color}`}>{surfStats.surf.rating}</div>
                    </div>
                    <div className="bg-elevated p-3 rounded-lg flex flex-col items-center justify-center border border-subtle">
                       <div className="text-[10px] text-muted uppercase mb-1">{t('activity.kite.label')}</div>

                       {/* Updated Kite Card to show only wind data */}
                       <div className="flex flex-col items-center">
                          <div className="font-bold text-lg text-primary font-mono flex items-center gap-1">
                             {(currentConditions?.wind || 0).toFixed(0)} <span className="text-xs text-secondary font-sans">km/h</span>
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-secondary mt-1">
                             <Navigation size={10} style={{ transform: `rotate(${currentConditions?.windDirection || 0}deg)` }} className="text-cyan-400" />
                             <span>{getCardinalDirection(currentConditions?.windDirection || 0)}</span>
                          </div>
                       </div>
                    </div>
                 </div>
              )}

              {beachStats && (
                <div className="bg-elevated p-3 rounded-lg border border-subtle flex flex-col justify-between relative">
                   <div className="flex justify-between items-start">
                      <div>
                         <span className="text-xs font-bold text-secondary flex items-center gap-2 rtl:flex-row-reverse"><Palmtree size={14}/> {t('activity.beach.label')}</span>
                         <div className={`text-lg font-bold ${beachStats.color}`}>{beachStats.status}</div>
                      </div>
                      <div className="text-right rtl:text-left mr-6 rtl:mr-0 rtl:ml-6">
                         <div className="text-xs text-secondary">{t('weather.currentUV')}</div>
                         <div className="font-bold text-primary">{beachStats.uvIndex.toFixed(0)}</div>
                      </div>
                   </div>
                   <div className="text-[10px] text-muted mt-2">{beachStats.message}</div>
                </div>
              )}
         </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* WAVE */}
        <div className="bg-card border border-app p-4 rounded-xl relative overflow-hidden group">
           <div className="absolute top-0 right-0 rtl:left-0 rtl:right-auto p-2 opacity-10 group-hover:opacity-20 transition-opacity"><Activity size={64} /></div>
           <div className="flex items-center gap-2 mb-2 text-secondary">
              <Activity size={16} className="text-accent"/>
              <span className="text-xs font-bold uppercase">{t('weather.waveHeight')}</span>
           </div>
           <div className="flex items-baseline gap-1">
             <span className="text-3xl font-bold text-primary">{currentConditions.wave.toFixed(1)}</span>
             <span className="text-sm text-muted">m</span>
           </div>
           <p className="text-xs text-muted mt-1">{t('weather.period')}: {currentConditions.wavePeriod.toFixed(1)}s</p>
        </div>

        {/* WIND */}
        <div className="bg-card border border-app p-4 rounded-xl relative overflow-hidden group">
           <div className="absolute top-0 right-0 rtl:left-0 rtl:right-auto p-2 opacity-10 group-hover:opacity-20 transition-opacity"><Wind size={64} /></div>
           <div className="flex items-center gap-2 mb-2 text-secondary">
              <Wind size={16} className="text-cyan-400"/>
              <span className="text-xs font-bold uppercase">{t('weather.windSpeed')}</span>
           </div>
           <div className="flex items-baseline gap-1">
             <span className="text-3xl font-bold text-primary">{currentConditions.wind.toFixed(0)}</span>
             <span className="text-sm text-muted">km/h</span>
           </div>
           <div className="flex items-center gap-1 mt-1 text-muted text-xs">
              <Navigation size={12} style={{ transform: `rotate(${currentConditions.windDirection}deg)` }} />
              <span>{getCardinalDirection(currentConditions.windDirection)} ({currentConditions.windDirection}°)</span>
           </div>
        </div>

        {/* SWELL - Updated Icon to Waves */}
        <div className="bg-card border border-app p-4 rounded-xl relative overflow-hidden group">
           <div className="absolute top-0 right-0 rtl:left-0 rtl:right-auto p-2 opacity-10 group-hover:opacity-20 transition-opacity"><Waves size={64} /></div>
           <div className="flex items-center gap-2 mb-2 text-secondary">
              <Waves size={16} className="text-teal-400"/>
              <span className="text-xs font-bold uppercase">{t('weather.swell')}</span>
           </div>
           <div className="flex items-baseline gap-1">
             <span className="text-3xl font-bold text-primary">{currentConditions.swell.toFixed(1)}</span>
             <span className="text-sm text-muted">m</span>
           </div>
           <div className="mt-1 text-muted text-xs">
              <div className="flex items-center gap-1 mb-1">
                 <Navigation size={12} style={{ transform: `rotate(${currentConditions.swellDirection}deg)` }} />
                 <span>{getCardinalDirection(currentConditions.swellDirection)}</span>
              </div>
              <div className="font-semibold text-teal-500/80">{t('weather.period')}: {currentConditions.swellPeriod.toFixed(1)}s</div>
           </div>
        </div>

        {/* TEMP (AIR + SEA) - Updated Icon to Thermometer */}
        <div className="bg-card border border-app p-4 rounded-xl relative overflow-hidden group">
           <div className="absolute top-0 right-0 rtl:left-0 rtl:right-auto p-2 opacity-10 group-hover:opacity-20 transition-opacity"><Thermometer size={64} /></div>
           <div className="flex justify-between h-full">
               {/* Air Temp */}
               <div className="flex flex-col justify-between">
                   <div className="flex items-center gap-2 text-secondary">
                      <Thermometer size={16} className="text-yellow-400"/>
                      <span className="text-xs font-bold uppercase">{t('weather.air')}</span>
                   </div>
                   <div className="flex items-baseline gap-1">
                     <span className="text-3xl font-bold text-primary">{weatherData.general?.temperature.toFixed(0)}</span>
                     <span className="text-sm text-muted">°C</span>
                   </div>
               </div>

               <div className="w-px bg-subtle mx-2"></div>

               {/* Sea Temp */}
               <div className="flex flex-col justify-between">
                   <div className="flex items-center gap-2 text-secondary">
                      <Waves size={16} className="text-accent"/>
                      <span className="text-xs font-bold uppercase">{t('weather.sea')}</span>
                   </div>
                   <div className="flex items-baseline gap-1">
                     <span className="text-3xl font-bold text-primary">{currentConditions.seaTemp?.toFixed(0)}</span>
                     <span className="text-sm text-muted">°C</span>
                   </div>
               </div>
           </div>
           <p className="text-xs text-muted mt-2 absolute bottom-2 left-4">{t('weather.feelsLike')} {weatherData.general?.feelsLike.toFixed(0)}°</p>
        </div>
      </div>

      {/* COMBINED INTERACTIVE GRAPH CONTAINER */}
      <div className="bg-card border border-app p-4 rounded-xl min-w-0">

          <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
             <div className="flex items-center gap-2">
                 {/* Icon changes based on active tab */}
                 {activeGraph === 'tide' && <Waves size={16} className="text-accent" />}
                 {activeGraph === 'wave' && <Activity size={16} className="text-accent" />}
                 {activeGraph === 'swell' && <Layers size={16} className="text-teal-400" />}

                 <h3 className="text-xs font-bold text-secondary uppercase">
                    {activeGraph === 'tide' && t('forecast.tideSchedule')}
                    {activeGraph === 'wave' && t('forecast.waveForecast')}
                    {activeGraph === 'swell' && t('forecast.swellForecast')}
                 </h3>
             </div>

             {/* Tab Switcher */}
             <div className="flex bg-app-base p-1 rounded-lg border border-subtle">
                 <button
                   onClick={() => setActiveGraph('wave')}
                   className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${activeGraph === 'wave' ? 'bg-blue-600/20 text-accent shadow-sm' : 'text-muted hover:text-secondary'}`}
                 >
                   {t('forecast.waves')}
                 </button>
                 <button
                   onClick={() => setActiveGraph('swell')}
                   className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${activeGraph === 'swell' ? 'bg-teal-600/20 text-teal-400 shadow-sm' : 'text-muted hover:text-secondary'}`}
                 >
                   {t('forecast.swell')}
                 </button>
                 <button
                   onClick={() => setActiveGraph('tide')}
                   className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${activeGraph === 'tide' ? 'bg-elevated text-primary shadow-sm' : 'text-muted hover:text-secondary'}`}
                 >
                   {t('forecast.tides')}
                 </button>
             </div>
          </div>

          {/* Active Graph Indicator / Legend Area */}
          <div className="flex gap-4 mb-2 text-xs items-center pl-2">
             {activeGraph === 'tide' && weatherData.tides && (
                  <div className="flex gap-4">
                     <div className="flex items-center gap-1"><ArrowUp size={12} className="text-accent" /><span className="text-secondary">{t('forecast.high')}: {format(parseISO(weatherData.tides.nextHigh.time), 'HH:mm')}</span></div>
                     <div className="flex items-center gap-1"><ArrowDown size={12} className="text-accent" /><span className="text-secondary">{t('forecast.low')}: {format(parseISO(weatherData.tides.nextLow.time), 'HH:mm')}</span></div>
                     {currentConditions.seaLevel !== undefined && (
                        <div className="hidden md:flex gap-1 items-center bg-elevated/50 px-2 py-0.5 rounded">
                            <Ruler size={10} className="text-teal-400" />
                            <span className="text-secondary">MSL:</span>
                            <span className="text-primary font-bold">{currentConditions.seaLevel.toFixed(2)}m</span>
                        </div>
                     )}
                  </div>
             )}
             {activeGraph !== 'tide' && (
                 <>
                   <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full opacity-50 ${activeGraph === 'wave' ? 'bg-blue-500' : 'bg-teal-500'}`}></div>
                      <span className="text-secondary">{t('weather.height')} (m)</span>
                   </div>
                   <div className="flex items-center gap-2">
                      <div className="w-3 h-1 bg-yellow-400 rounded-full"></div>
                      <span className="text-secondary">{t('weather.period')} (s)</span>
                   </div>
                 </>
             )}
          </div>

          <div className="w-full" style={{ height: '256px', minHeight: '256px' }}>
            <ResponsiveContainer width="100%" height={256}>
               {activeGraph === 'tide' ? (
                  <AreaChart data={tideChartData}>
                    <defs>
                      <linearGradient id="colorTide" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--chart-primary)" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="var(--chart-primary)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="displayTime" stroke="var(--chart-text)" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--chart-text)" fontSize={10} tickLine={false} axisLine={false} domain={['dataMin - 0.5', 'dataMax + 0.5']} />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--app-bg-card)', borderColor: 'var(--app-border)' }} itemStyle={{ color: 'var(--text-primary)' }} />
                    <Area type="monotone" dataKey="height" stroke="var(--chart-primary)" fillOpacity={1} fill="url(#colorTide)" strokeWidth={2} name={t('forecast.tideHeight')} />
                  </AreaChart>
               ) : (
                  <ComposedChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                      <XAxis dataKey="displayTime" stroke="var(--chart-text)" fontSize={10} tickLine={false} axisLine={false} />

                      {/* Left Axis: Height (Meters) */}
                      <YAxis
                          yAxisId="left"
                          stroke="var(--chart-text)"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                          label={{ value: 'm', angle: -90, position: 'insideLeft', fill: 'var(--chart-text)' }}
                      />

                      {/* Right Axis: Period (Seconds) */}
                      <YAxis
                          yAxisId="right"
                          orientation="right"
                          stroke="var(--chart-text)"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                          domain={[0, 20]}
                          label={{ value: 's', angle: 90, position: 'insideRight', fill: 'var(--chart-text)' }}
                      />

                      <Tooltip contentStyle={{ backgroundColor: 'var(--app-bg-card)', borderColor: 'var(--app-border)' }} itemStyle={{ color: 'var(--text-primary)' }} labelStyle={{ color: 'var(--text-secondary)' }} />

                      {activeGraph === 'wave' ? (
                          <>
                             <Area yAxisId="left" type="monotone" dataKey="waveHeight" stroke="var(--chart-primary)" fill="var(--chart-primary)" fillOpacity={0.2} strokeWidth={2} name={t('weather.waveHeight')} />
                             <Line yAxisId="right" type="monotone" dataKey="wavePeriod" stroke="#facc15" strokeWidth={2} dot={false} name={t('weather.wavePeriod')} />
                          </>
                      ) : (
                          <>
                             <Area yAxisId="left" type="monotone" dataKey="swellHeight" stroke="var(--chart-secondary)" fill="var(--chart-secondary)" fillOpacity={0.2} strokeWidth={2} name={t('weather.swellHeight')} />
                             <Line yAxisId="right" type="monotone" dataKey="swellPeriod" stroke="#facc15" strokeWidth={2} dot={false} name={t('weather.swellPeriod')} />
                          </>
                      )}
                  </ComposedChart>
               )}
            </ResponsiveContainer>
          </div>
      </div>

      <div className="bg-card border border-app rounded-xl overflow-hidden relative">
        <div className="p-4 border-b border-subtle flex justify-between items-center bg-card/50">
            <h3 className="text-sm font-bold text-secondary uppercase flex items-center gap-2">
                <Compass size={16} className="text-accent" />
                {forecastTab === 'mariner' && t('forecast.marinerForecast')}
                {forecastTab === 'surfer' && t('forecast.surferForecast')}
                {forecastTab === 'kite' && t('forecast.kiteForecast')}
                {forecastTab === 'beach' && t('forecast.beachForecast')}
            </h3>
            <div className="flex gap-2">
                <button onClick={handlePrevTab} className="p-1 hover:bg-elevated rounded"><ChevronLeft size={20} className="text-secondary rtl:rotate-180"/></button>
                <button onClick={handleNextTab} className="p-1 hover:bg-elevated rounded"><ChevronRight size={20} className="text-secondary rtl:rotate-180"/></button>
            </div>
        </div>

        <div className="overflow-x-auto min-h-[200px] transition-all duration-300 ease-in-out">
            <table className="w-full text-left text-xs text-secondary min-w-[800px]">
                <thead className="bg-app-base text-secondary uppercase font-bold text-[10px] tracking-wider">
                    <tr>
                        <th className="p-3 border-r border-subtle w-32">{t('table.period')}</th>
                        {forecastTab === 'mariner' && (
                            <>
                                <th className="p-3 border-r border-subtle">{t('table.pressure')}</th>
                                <th className="p-3 border-r border-subtle">{t('table.seaStatus')}</th>
                                <th className="p-3 border-r border-subtle">{t('table.wind')}</th>
                                <th className="p-3 border-r border-subtle">{t('table.visibility')}</th>
                                <th className="p-3 border-r border-subtle">{t('table.weather')}</th>
                                <th className="p-3">{t('table.swell')}</th>
                            </>
                        )}
                        {forecastTab === 'surfer' && (
                            <>
                                <th className="p-3 border-r border-subtle">{t('table.waveHeight')}</th>
                                <th className="p-3 border-r border-subtle">{t('table.period')}</th>
                                <th className="p-3 border-r border-subtle">{t('table.swellHeight')}</th>
                                <th className="p-3 border-r border-subtle">{t('table.swellPeriod')}</th>
                                <th className="p-3 border-r border-subtle">{t('table.swellDir')}</th>
                                <th className="p-3">{t('table.rating')}</th>
                            </>
                        )}
                        {forecastTab === 'kite' && (
                            <>
                                <th className="p-3 border-r border-subtle">{t('table.windSpeed')}</th>
                                <th className="p-3 border-r border-subtle">{t('table.direction')}</th>
                                <th className="p-3 border-r border-subtle">{t('table.waveHeight')}</th>
                                <th className="p-3 border-r border-subtle">{t('table.weather')}</th>
                                <th className="p-3">{t('table.condition')}</th>
                            </>
                        )}
                        {forecastTab === 'beach' && (
                             <>
                                <th className="p-3 border-r border-subtle">{t('table.temp')}</th>
                                <th className="p-3 border-r border-subtle">{t('table.uvIndex')}</th>
                                <th className="p-3 border-r border-subtle">{t('table.windSand')}</th>
                                <th className="p-3 border-r border-subtle">{t('table.seaState')}</th>
                                <th className="p-3">{t('table.comfort')}</th>
                            </>
                        )}
                    </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
                    {forecastTableBlocks.map((row, idx) => (
                        <tr key={idx} className="hover:bg-elevated/50 transition-colors">
                            <td className="p-3 border-r border-subtle">
                                <div className="font-bold text-primary mb-1">{row.period}</div>
                                <div className="text-[10px] text-muted">{row.date}</div>
                            </td>

                            {forecastTab === 'mariner' && (
                                <>
                                    <td className="p-3 border-r border-subtle">{row.pressure}</td>
                                    <td className="p-3 border-r border-subtle text-secondary">{row.seaStatus}</td>
                                    <td className="p-3 border-r border-subtle text-primary font-medium">{row.wind}</td>
                                    <td className="p-3 border-r border-subtle">{row.visibility}</td>
                                    <td className="p-3 border-r border-subtle flex items-center gap-1.5">
                                        <WeatherAnimation code={row.weatherCode} />
                                        {getWeatherConditionTranslated(row.weatherCode)}
                                    </td>
                                    <td className="p-3 text-teal-400">{row.swell} ({row.swellHeight}m)</td>
                                </>
                            )}

                             {forecastTab === 'surfer' && (
                                <>
                                    <td className="p-3 border-r border-subtle font-bold text-blue-300">{row.waveHeight}</td>
                                    <td className="p-3 border-r border-subtle">{row.wavePeriod}s</td>
                                    <td className="p-3 border-r border-subtle font-medium text-teal-300">{row.swellHeight}m</td>
                                    <td className="p-3 border-r border-subtle">{row.swellPeriod}s</td>
                                    <td className="p-3 border-r border-subtle">{row.swell}</td>
                                    <td className="p-3">
                                        {(() => {
                                            const swellH = parseFloat(row.swellHeight);
                                            const swellP = parseFloat(row.swellPeriod);
                                            if (swellH >= 1.5 && swellP >= 8) return <span className="text-purple-400 font-bold">{t('activity.surf.epic')}</span>;
                                            if (swellH >= 1.0 && swellP >= 6) return <span className="text-green-400 font-bold">{t('activity.surf.good')}</span>;
                                            if (swellH >= 0.5 && swellP >= 4) return <span className="text-accent">{t('activity.surf.fair')}</span>;
                                            return <span className="text-muted">{t('activity.surf.poor')}</span>;
                                        })()}
                                    </td>
                                </>
                            )}

                            {forecastTab === 'kite' && (
                                <>
                                    <td className="p-3 border-r border-subtle font-bold text-cyan-300">{row.wind.split('(')[1]?.replace(')', '') || row.wind}</td>
                                    <td className="p-3 border-r border-subtle">{row.wind.split('(')[0]}</td>
                                    <td className="p-3 border-r border-subtle">{row.waveHeight}</td>
                                    <td className="p-3 border-r border-subtle flex items-center gap-1.5">
                                         <WeatherAnimation code={row.weatherCode} />
                                         {getWeatherConditionTranslated(row.weatherCode)}
                                    </td>
                                    <td className="p-3">
                                        {row.wind.includes("20-") || row.wind.includes("25-") ? <span className="text-green-400 font-bold">{t('activity.kite.optimal')}</span> : <span className="text-muted">{t('activity.kite.light')}</span>}
                                    </td>
                                </>
                            )}
                             {forecastTab === 'beach' && (
                                <>
                                    <td className="p-3 border-r border-subtle font-bold text-yellow-300">{row.temp}°C</td>
                                    <td className="p-3 border-r border-subtle">{row.uv}</td>
                                    <td className="p-3 border-r border-subtle">{row.wind}</td>
                                    <td className="p-3 border-r border-subtle">{row.seaStatus.split('(')[0]}</td>
                                    <td className="p-3">
                                        {(() => {
                                            const code = row.weatherCode;
                                            const temp = parseFloat(row.temp);
                                            const wind = parseFloat(row.wind.split('-')[1] || row.wind);

                                            if (code >= 51 || code >= 80) return <span className="text-red-400 font-bold">{t('activity.beach.poorRain')}</span>;
                                            if (code === 3 && temp <= 20) return <span className="text-secondary">{t('activity.beach.coolCloudy')}</span>;
                                            if (code === 3) return <span className="text-secondary">{t('activity.beach.cloudy')}</span>;
                                            if (temp < 18) return <span className="text-blue-300">{t('activity.beach.cold')}</span>;
                                            if (temp < 22) return <span className="text-blue-200">{t('activity.beach.cool')}</span>;
                                            if (wind > 30) return <span className="text-orange-400">{t('activity.beach.windy')}</span>;
                                            return <span className="text-green-400 font-bold">{t('activity.beach.great')}</span>;
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
            {['mariner', 'surfer', 'kite', 'beach'].map((tab) => (
                <div key={tab} className={`w-2 h-2 rounded-full ${forecastTab === tab ? 'bg-blue-500' : 'bg-subtle'}`} />
            ))}
        </div>
      </div>

    </div>
  );
};

export default Dashboard;
