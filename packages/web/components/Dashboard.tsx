import React, { useMemo, useState } from 'react';
import { MarineWeatherData, AlertConfig } from '@seame/core';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, ComposedChart, Line
} from 'recharts';
import {
  Wind, Activity, Waves, ArrowUp, ArrowDown,
  Navigation, Settings, X, Bell, Sun, Moon, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog,
  Thermometer, ThumbsUp, Skull, Flag, Palmtree, Compass, ChevronRight, ChevronLeft, Tornado, Ruler, Layers,
  AlertTriangle, Sailboat, ChevronDown
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
  onLocationClick?: () => void;
}

const DEFAULT_ALERT_CONFIG: AlertConfig = {
  waveHeightThreshold: 2.0,
  windSpeedThreshold: 40,
  swellHeightThreshold: 2.5,
  simulateTsunami: false
};

const WeatherAnimation: React.FC<{ code: number }> = ({ code }) => {
  if (code === 0 || code === 1) return <Sun className="text-yellow-400 animate-[spin_10s_linear_infinite]" size={20} />;
  if (code === 2 || code === 3) return <Cloud className="text-white/60 animate-pulse" size={20} />;
  if (code === 45 || code === 48) return <CloudFog className="text-white/40 animate-pulse" size={20} />;
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return <CloudRain className="text-blue-300 animate-bounce" size={20} />;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return <CloudSnow className="text-white animate-bounce" size={20} />;
  if (code >= 95 && code <= 99) return <CloudLightning className="text-yellow-500 animate-pulse" size={20} />;
  return <Sun className="text-yellow-400" size={20} />;
};

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

const getWeatherConditionKey = (code: number): string => {
  const codeMap: Record<number, string> = {
    0: 'clearSky', 1: 'mainlyClear', 2: 'partlyCloudy', 3: 'overcast',
    45: 'fog', 48: 'depositingRimeFog',
    51: 'lightDrizzle', 53: 'moderateDrizzle', 55: 'denseDrizzle',
    61: 'slightRain', 63: 'moderateRain', 65: 'heavyRain',
    71: 'slightSnow', 73: 'moderateSnow', 75: 'heavySnow', 77: 'snowGrains',
    80: 'slightRainShowers', 81: 'moderateRainShowers', 82: 'violentRainShowers',
    95: 'thunderstorm', 96: 'thunderstormWithHail', 99: 'heavyHailThunderstorm'
  };
  return codeMap[code] || 'unknown';
};

const Dashboard: React.FC<DashboardProps> = ({ weatherData, loading, error, locationName, onRetry, onLocationClick }) => {
  const { t } = useTranslation();
  const [showSettings, setShowSettings] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertConfig>(DEFAULT_ALERT_CONFIG);
  const [forecastTab, setForecastTab] = useState<'mariner' | 'surfer' | 'kite' | 'beach'>('mariner');
  const [dismissedAlert, setDismissedAlert] = useState(false);
  const [activeGraph, setActiveGraph] = useState<'tide' | 'wave' | 'swell'>('wave');

  const getCardinalDirection = (angle: number): string => {
    const keys = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
    return t(`directions.${keys[Math.round(angle / 45) % 8]}`);
  };

  const getMarinerWindDir = (angle: number): string => {
    const keys = ['northerly', 'northeasterly', 'easterly', 'southeasterly', 'southerly', 'southwesterly', 'westerly', 'northwesterly'];
    return t(`directions.${keys[Math.round(angle / 45) % 8]}`);
  };

  const getSeaStateTerm = (heightM: number): string => t(`seaState.${getSeaStateKey(heightM)}`);
  const getSeaStateFull = (minM: number, maxM: number): string => {
    const minTerm = getSeaStateTerm(minM);
    const maxTerm = getSeaStateTerm(maxM);
    const rangeText = `${(minM * 100).toFixed(0)}-${(maxM * 100).toFixed(0)} cm`;
    if (minTerm === maxTerm) return `${minTerm} (${rangeText})`;
    return `${minTerm} ${t('seaState.to')} ${maxTerm} (${rangeText})`;
  };

  const getWeatherConditionTranslated = (code: number): string => t(`weatherConditions.${getWeatherConditionKey(code)}`);

  // ─── useMemo hooks (unchanged logic) ───

  const currentHourIndex = useMemo(() => {
    if (!weatherData?.hourly?.time) return 0;
    const nowTime = Date.now();
    let closestIdx = 0, minDiff = Infinity;
    weatherData.hourly.time.forEach((t, i) => {
      const diff = Math.abs(nowTime - new Date(t).getTime());
      if (diff < minDiff) { minDiff = diff; closestIdx = i; }
    });
    return closestIdx;
  }, [weatherData]);

  const chartData = useMemo(() => {
    if (!weatherData?.hourly?.time) return [];
    const start = currentHourIndex;
    const end = Math.min(start + 24, weatherData.hourly.time.length);
    return weatherData.hourly.time.slice(start, end).map((time, i) => {
      const gi = start + i;
      return {
        time, displayTime: format(parseISO(time), 'HH:mm'),
        waveHeight: weatherData.hourly.wave_height?.[gi] || 0,
        windSpeed: weatherData.hourly.wind_speed_10m?.[gi] || 0,
        swellHeight: weatherData.hourly.swell_wave_height?.[gi] || 0,
        wavePeriod: weatherData.hourly.wave_period?.[gi] || 0,
        swellPeriod: weatherData.hourly.swell_wave_period?.[gi] || 0,
      };
    });
  }, [weatherData, currentHourIndex]);

  const tideChartData = useMemo(() => {
    if (!weatherData?.tides) return [];
    return weatherData.tides.hourly.slice(0, 24).map(t => ({
      time: t.time, displayTime: format(parseISO(t.time), 'HH:mm'), height: t.height
    }));
  }, [weatherData]);

  const currentConditions = useMemo(() => {
    if (!weatherData?.current) return null;
    return {
      wave: weatherData.current.waveHeight, wavePeriod: weatherData.current.wavePeriod,
      wind: weatherData.current.windSpeed, windDirection: weatherData.current.windDirection,
      swell: weatherData.current.swellHeight, swellDirection: weatherData.current.swellDirection,
      swellPeriod: weatherData.current.swellPeriod, pressure: weatherData.current.pressure,
      visibility: weatherData.current.visibility, seaTemp: weatherData.current.seaTemperature,
      seaLevel: weatherData.current.seaLevel, currentUV: weatherData.current.uvIndex
    };
  }, [weatherData]);

  const roughWeatherAlert = useMemo(() => {
    if (!weatherData?.general || !currentConditions) return null;
    const { weatherCode } = weatherData.general;
    const { wind, wave } = currentConditions;
    if (weatherCode >= 95 || wind > 65 || wave > 4.5) return { title: t('alerts.stormWarning'), message: t('alerts.stormMessage'), icon: Tornado, color: "bg-red-600" };
    if (weatherCode >= 80 || wind > 50 || wave > 3.0) return { title: t('alerts.roughWeather'), message: t('alerts.roughWeatherMessage'), icon: CloudLightning, color: "bg-orange-600" };
    if (alertConfig.simulateTsunami) return { title: t('alerts.tsunami'), message: t('alerts.tsunamiMessage'), icon: Waves, color: "bg-red-900 animate-pulse border-2 border-red-500" };
    return null;
  }, [weatherData, currentConditions, alertConfig.simulateTsunami, t]);

  const sailingCondition = useMemo(() => {
    if (!currentConditions) return null;
    const windSpeed = currentConditions.wind || 0;
    const waveHeight = currentConditions.wave || 0;
    if (windSpeed > 55 || waveHeight > 3.5) return { label: t('activity.sailing.hazardous'), description: t('activity.sailing.hazardousDesc'), color: 'text-red-500', icon: Skull };
    if (windSpeed > 40 || waveHeight > 2.5) return { label: t('activity.sailing.challenging'), description: t('activity.sailing.challengingDesc'), color: 'text-orange-500', icon: AlertTriangle };
    if (windSpeed < 10) return { label: t('activity.sailing.calm'), description: t('activity.sailing.calmDesc'), color: 'text-white/60', icon: Wind };
    if (windSpeed >= 10 && waveHeight < 2.0) return { label: t('activity.sailing.good'), description: t('activity.sailing.goodDesc'), color: 'text-green-400', icon: ThumbsUp };
    return { label: t('activity.sailing.moderate'), description: t('activity.sailing.moderateDesc'), color: 'text-blue-400', icon: Flag };
  }, [currentConditions, t]);

  const surfStats = useMemo(() => {
    if (!currentConditions) return null;
    const swellHeight = currentConditions.swell || 0;
    const swellPeriodValue = currentConditions.swellPeriod || 0;
    let surfRating = t('activity.surf.poor'), surfColor = 'text-white/60';
    if (swellHeight >= 0.5 && swellPeriodValue >= 4) { surfRating = t('activity.surf.fair'); surfColor = 'text-blue-400'; }
    if (swellHeight >= 1.0 && swellPeriodValue >= 6) { surfRating = t('activity.surf.good'); surfColor = 'text-green-400'; }
    if (swellHeight >= 1.5 && swellPeriodValue >= 8) { surfRating = t('activity.surf.epic'); surfColor = 'text-purple-400'; }
    return { surf: { rating: surfRating, color: surfColor }, kite: { color: 'text-white' } };
  }, [currentConditions, t]);

  const beachStats = useMemo(() => {
    if (!currentConditions || !weatherData?.general) return null;
    const windSpeed = currentConditions.wind || 0, waveHeight = currentConditions.wave || 0;
    const uvIndex = currentConditions.currentUV || 0, temp = weatherData.general.temperature || 20;
    const code = weatherData.general.weatherCode || 0;
    let status = t('activity.beach.perfect'), color = "text-green-400", message = t('activity.beach.perfectDesc');
    if (code > 50) { status = t('activity.beach.poor'); color = "text-white/40"; message = t('activity.beach.poorDesc'); }
    else if (windSpeed > 30) { status = t('activity.beach.windy'); color = "text-orange-400"; message = t('activity.beach.windyDesc'); }
    else if (temp < 20) { status = t('activity.beach.chilly'); color = "text-blue-300"; message = t('activity.beach.chillyDesc'); }
    else if (temp > 35) { status = t('activity.beach.scorching'); color = "text-red-400"; message = t('activity.beach.scorchingDesc'); }
    else if (waveHeight > 1.5) { status = t('activity.beach.roughSurf'); color = "text-yellow-400"; message = t('activity.beach.roughSurfDesc'); }
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
      const sliceIndexes = Array.from({ length: end - start }, (_, k) => k + start);
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
      const minPress = Math.min(...pressures).toFixed(0), maxPress = Math.max(...pressures).toFixed(0);
      const minWave = Math.min(...waveHeights), maxWave = Math.max(...waveHeights);
      const minWind = Math.min(...windSpeeds).toFixed(0), maxWind = Math.max(...windSpeeds).toFixed(0);
      const avgVisNM = ((visibilities.reduce((a, b) => a + b, 0) / visibilities.length) / 1852).toFixed(0);
      const startDirVal = windDirs[0], endDirVal = windDirs[windDirs.length - 1];
      const startDirTxt = getMarinerWindDir(startDirVal), endDirTxt = getMarinerWindDir(endDirVal);
      let windDirText = startDirTxt;
      if (Math.abs(startDirVal - endDirVal) > 45 && Math.abs(startDirVal - endDirVal) < 315) windDirText = `${startDirTxt}-${endDirTxt}`;
      const swellDirAvg = swellDirs.reduce((a, b) => a + b, 0) / swellDirs.length;
      blocks.push({
        period: `${startTime} - ${endTime}`, date: nextDay,
        pressure: `${minPress}-${maxPress} hPa`,
        seaStatus: getSeaStateFull(minWave, maxWave),
        wind: `${windDirText} (${minWind}-${maxWind} km/h)`,
        visibility: `${avgVisNM} nm`, weatherCode: weatherData.hourly.weather_code?.[start] || 0,
        swell: getMarinerWindDir(swellDirAvg),
        swellHeight: (swellHeights.reduce((a, b) => a + b, 0) / swellHeights.length).toFixed(1),
        swellPeriod: (swellPeriods.reduce((a, b) => a + b, 0) / swellPeriods.length).toFixed(1),
        waveHeight: `${minWave.toFixed(1)}-${maxWave.toFixed(1)}m`,
        wavePeriod: (wavePeriods.reduce((a, b) => a + b, 0) / wavePeriods.length).toFixed(1),
        temp: weatherData.general?.temperature.toFixed(0) || "20",
        uv: Math.max(...uvs).toFixed(0)
      });
    }
    return blocks;
  }, [weatherData, currentHourIndex]);

  const handleNextTab = () => {
    const tabs: ('mariner' | 'surfer' | 'kite' | 'beach')[] = ['mariner', 'surfer', 'kite', 'beach'];
    setForecastTab(tabs[(tabs.indexOf(forecastTab) + 1) % tabs.length]);
  };
  const handlePrevTab = () => {
    const tabs: ('mariner' | 'surfer' | 'kite' | 'beach')[] = ['mariner', 'surfer', 'kite', 'beach'];
    setForecastTab(tabs[(tabs.indexOf(forecastTab) - 1 + tabs.length) % tabs.length]);
  };

  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (!weatherData || !currentConditions) {
    if (!loading && !error) return <div className="p-8 text-center text-white/60">{t('common.noData')}</div>;
    return null;
  }

  return (
    <div className="px-5 space-y-6 pb-8 max-w-6xl mx-auto relative">

      {/* ─── Location Pill (centered) ─── */}
      <div className="flex justify-center">
        <button onClick={onLocationClick} className="glass-panel flex items-center px-4 py-1.5 space-x-2 !rounded-full cursor-pointer hover:bg-white/20 transition-colors">
          <Navigation size={14} className="text-white" />
          <span className="text-sm font-semibold">{locationName}</span>
          <ChevronDown size={12} className="opacity-70" />
        </button>
      </div>

      {/* ─── Alert Banner ─── */}
      {roughWeatherAlert && !dismissedAlert && (
        <div className="alert-banner p-4 flex items-start space-x-3 relative text-white">
          <div className="mt-1"><Bell size={20} /></div>
          <div>
            <h2 className="font-bold text-lg leading-tight uppercase text-white/90">{roughWeatherAlert.title}</h2>
            <p className="text-sm opacity-90 leading-snug">{roughWeatherAlert.message}</p>
          </div>
          <button onClick={() => setDismissedAlert(true)} className="absolute top-3 right-3 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
            <X size={12} />
          </button>
        </div>
      )}

      {/* ─── Weather Hero Section ─── */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="relative flex h-8 w-8 items-center justify-center">
              <WeatherAnimation code={weatherData.general?.weatherCode || 0} />
            </span>
            {getWeatherConditionTranslated(weatherData.general?.weatherCode || 0)}
          </h1>
          <p className="text-white/60 text-sm mt-1 flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-white">{locationName}</span>
            <span className="text-white/30">•</span>
            {weatherData.latitude.toFixed(4)}°N, {weatherData.longitude.toFixed(4)}°E
            <span className="text-white/30">•</span>
            {format(new Date(), 'EEE, MMM d')}
          </p>
        </div>
        <button onClick={() => setShowSettings(!showSettings)} className="glass-inner flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/20 transition-colors border border-white/10 shrink-0">
          <Settings size={16} />
          <span className="text-xs font-bold hidden sm:inline">{t('dashboard.alertConfig')}</span>
        </button>
      </div>

      {/* ─── Alert Config Modal ─── */}
      {showSettings && (
        <div className="glass-panel p-4 bg-[#0F3A5E]/60 shadow-2xl animate-in fade-in slide-in-from-top-4 mb-2 relative z-50">
          <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-2">
            <h3 className="font-bold text-white flex items-center gap-2">
              <Bell size={16} className="text-blue-400" /> {t('dashboard.alertConfiguration')}
            </h3>
            <button onClick={() => setShowSettings(false)} className="text-white/40 hover:text-white"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-xs text-white/60 flex justify-between mb-1">{t('dashboard.waveThreshold')} (m) <span className="text-white">{alertConfig.waveHeightThreshold}</span></label>
                <input type="range" min="0.5" max="10" step="0.5" value={alertConfig.waveHeightThreshold} onChange={(e) => setAlertConfig({ ...alertConfig, waveHeightThreshold: parseFloat(e.target.value) })} className="w-full" />
              </div>
              <div>
                <label className="text-xs text-white/60 flex justify-between mb-1">{t('dashboard.windThreshold')} (km/h) <span className="text-white">{alertConfig.windSpeedThreshold}</span></label>
                <input type="range" min="10" max="100" step="5" value={alertConfig.windSpeedThreshold} onChange={(e) => setAlertConfig({ ...alertConfig, windSpeedThreshold: parseFloat(e.target.value) })} className="w-full" />
              </div>
              <div className="flex items-center justify-between p-3 bg-red-950/30 border border-red-900/50 rounded-lg">
                <div className="flex items-center gap-2"><Waves size={16} className="text-red-500" /><span className="text-sm font-bold text-red-200">{t('dashboard.tsunamiSimulation')}</span></div>
                <input type="checkbox" checked={alertConfig.simulateTsunami} onChange={(e) => setAlertConfig({ ...alertConfig, simulateTsunami: e.target.checked })} className="w-4 h-4 rounded border-red-500 bg-transparent accent-red-600" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Activity Report (4-Column Grid) ─── */}
      <section>
        <h3 className="text-xs font-bold tracking-widest text-white/70 mb-3 uppercase flex items-center"><Flag size={12} className="mr-2" /> {t('activity.report')}</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Sailing Card */}
          <div className="glass-panel p-4 flex flex-col justify-between">
            <div className="w-10 h-10 rounded-lg glass-inner flex items-center justify-center mb-3">
              <Sailboat size={20} className="text-white" />
            </div>
            {sailingCondition ? (
              <>
                <h4 className={`font-bold mb-1 ${sailingCondition.color}`}>{sailingCondition.label} {t('activity.sailing.label')}</h4>
                <p className="text-xs text-white/70 leading-snug">{sailingCondition.description}</p>
              </>
            ) : (
              <p className="text-xs text-white/40">--</p>
            )}
          </div>
          {/* Surf Card */}
          <div className="glass-panel p-4 flex flex-col justify-between">
            <div className="w-10 h-10 rounded-lg glass-inner flex items-center justify-center mb-3">
              <Waves size={20} className="text-teal-400" />
            </div>
            <h4 className="font-bold mb-1 uppercase tracking-wide">{t('activity.surf.label')}</h4>
            {surfStats ? (
              <p className={`text-xs font-bold ${surfStats.surf.color}`}>{surfStats.surf.rating}</p>
            ) : (
              <p className="text-xs text-white/40">--</p>
            )}
          </div>
          {/* Kite Card */}
          <div className="glass-panel p-4 flex flex-col justify-between">
            <div className="w-10 h-10 rounded-lg glass-inner flex items-center justify-center mb-3">
              <Wind size={20} className="text-white" />
            </div>
            <h4 className="font-bold mb-1 uppercase tracking-wide">{t('activity.kite.label')}</h4>
            <p className="text-xs text-white/90 font-bold">{(currentConditions.wind || 0).toFixed(0)} km/h<br /><span className="text-[10px] font-normal opacity-70"><Navigation size={8} className="inline mr-1" style={{ transform: `rotate(${currentConditions.windDirection}deg)` }} />{getCardinalDirection(currentConditions.windDirection)}</span></p>
          </div>
          {/* Beach Day + UV Combined Card */}
          <div className="glass-panel p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg glass-inner flex items-center justify-center">
                <Palmtree size={20} className="text-yellow-400" />
              </div>
              <div className="text-right">
                <h4 className="text-[10px] font-bold uppercase tracking-wide text-white/50">{t('weather.currentUV')}</h4>
                <p className="text-2xl font-bold leading-none">{(currentConditions.currentUV || 0).toFixed(0)}</p>
              </div>
            </div>
            <h4 className="font-bold mb-1">{t('activity.beach.label')}</h4>
            {beachStats ? (
              <p className={`text-xs font-bold ${beachStats.color}`}>{beachStats.status}<br /><span className="text-[10px] font-normal text-white/70">{beachStats.message}</span></p>
            ) : (
              <p className="text-xs text-white/40">--</p>
            )}
          </div>
        </div>
      </section>

      {/* ─── Conditions Grid ─── */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Wave Height */}
        <div className="glass-panel p-4 relative overflow-hidden flex flex-col justify-between">
          <h3 className="text-xs font-bold tracking-widest text-white/70 mb-2 uppercase relative z-10 flex items-center"><Activity size={12} className="mr-1.5" /> {t('weather.waveHeight')}</h3>
          <div className="relative z-10 mt-2">
            <div className="flex items-end mb-1"><span className="text-4xl font-bold leading-none">{currentConditions.wave.toFixed(1)}</span><span className="text-lg ml-1 mb-1 font-medium">m</span></div>
            <p className="text-[10px] text-teal-400 font-medium">{t('weather.period')}: {currentConditions.wavePeriod.toFixed(1)}s</p>
          </div>
          <div className="absolute bottom-0 right-0 w-full h-16 opacity-50 z-0 pointer-events-none">
            <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 300 100">
              <path d="M0,80 Q50,80 100,50 T200,80 T300,50 L300,100 L0,100 Z" fill="rgba(255,255,255,0.05)" />
              <path d="M0,80 Q50,80 100,50 T200,80 T300,50" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" />
            </svg>
          </div>
        </div>

        {/* Wind Speed */}
        <div className="glass-panel p-4 relative overflow-hidden flex flex-col justify-between">
          <h3 className="text-xs font-bold tracking-widest text-white/70 mb-2 uppercase relative z-10 flex items-center"><Wind size={12} className="mr-1.5" /> {t('weather.windSpeed')}</h3>
          <div className="relative z-10 mt-2">
            <div className="flex items-end mb-1"><span className="text-4xl font-bold leading-none">{currentConditions.wind.toFixed(0)}</span><span className="text-lg ml-1 mb-1 font-medium">km/h</span></div>
            <p className="text-[10px] text-white/80 font-medium flex items-center gap-1"><Navigation size={10} style={{ transform: `rotate(${currentConditions.windDirection}deg)` }} /> {getCardinalDirection(currentConditions.windDirection)} ({currentConditions.windDirection}°)</p>
          </div>
          <Wind className="absolute bottom-2 right-3 text-white/[0.07]" size={48} />
        </div>

        {/* Swell */}
        <div className="glass-panel p-4 relative overflow-hidden flex flex-col justify-between">
          <h3 className="text-xs font-bold tracking-widest text-white/70 mb-2 uppercase relative z-10 flex items-center"><Waves size={12} className="mr-1.5" /> {t('weather.swell')}</h3>
          <div className="relative z-10 mt-2">
            <div className="flex items-end mb-1"><span className="text-4xl font-bold leading-none">{currentConditions.swell.toFixed(1)}</span><span className="text-lg ml-1 mb-1 font-medium">m</span></div>
            <p className="text-[10px] text-teal-400 font-medium flex items-center gap-1"><Navigation size={10} style={{ transform: `rotate(${currentConditions.swellDirection}deg)` }} /> {getCardinalDirection(currentConditions.swellDirection)} <span className="ml-2 opacity-70">{t('weather.period')}: {currentConditions.swellPeriod.toFixed(1)}s</span></p>
          </div>
          <Waves className="absolute bottom-2 right-4 text-white/[0.07]" size={56} />
        </div>

        {/* Temperature (Air + Sea combined) */}
        <div className="glass-panel p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold tracking-widest text-white/70 uppercase flex items-center"><Thermometer size={12} className="mr-1.5" /> {t('weather.air')}</h3>
            <h3 className="text-xs font-bold tracking-widest text-white/70 uppercase flex items-center"><Thermometer size={12} className="mr-1.5 text-orange-400" /> {t('weather.sea')}</h3>
          </div>
          <div className="flex justify-between items-end mt-2">
            <div>
              <div className="flex items-start"><span className="text-3xl font-bold leading-none">{weatherData.general?.temperature.toFixed(0)}</span><span className="text-sm ml-0.5 mt-0.5">°C</span></div>
              <p className="text-[10px] text-white/60 mt-1">{t('weather.feelsLike')} {weatherData.general?.feelsLike.toFixed(0)}°</p>
            </div>
            <div className="text-right">
              <div className="flex items-start justify-end"><span className="text-3xl font-bold leading-none">{currentConditions.seaTemp?.toFixed(0)}</span><span className="text-sm ml-0.5 mt-0.5">°C</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Wave Forecast Chart ─── */}
      <section className="glass-panel p-4">
        <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-3">
          <h3 className="text-xs font-bold tracking-widest text-white/70 uppercase flex items-center">
            {activeGraph === 'tide' && <Waves size={14} className="mr-1.5" />}
            {activeGraph === 'wave' && <Activity size={14} className="mr-1.5" />}
            {activeGraph === 'swell' && <Layers size={14} className="mr-1.5" />}
            {activeGraph === 'tide' && t('forecast.tideSchedule')}
            {activeGraph === 'wave' && t('forecast.waveForecast')}
            {activeGraph === 'swell' && t('forecast.swellForecast')}
          </h3>
          <div className="flex space-x-1 bg-black/20 p-1 rounded-lg">
            <button onClick={() => setActiveGraph('wave')} className={`text-[10px] font-bold px-3 py-1 rounded transition-colors ${activeGraph === 'wave' ? 'bg-blue-600/80 text-white shadow-sm' : 'text-white/60 hover:text-white'}`}>{t('forecast.waves')}</button>
            <button onClick={() => setActiveGraph('swell')} className={`text-[10px] font-bold px-3 py-1 rounded transition-colors ${activeGraph === 'swell' ? 'bg-teal-600/80 text-white shadow-sm' : 'text-white/60 hover:text-white'}`}>{t('forecast.swell')}</button>
            <button onClick={() => setActiveGraph('tide')} className={`text-[10px] font-bold px-3 py-1 rounded transition-colors ${activeGraph === 'tide' ? 'bg-white/20 text-white shadow-sm' : 'text-white/60 hover:text-white'}`}>{t('forecast.tides')}</button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-4 mb-3 text-[10px] font-medium pl-2">
          {activeGraph === 'tide' && weatherData.tides && (
            <>
              <div className="flex items-center gap-1"><ArrowUp size={12} style={{ color: 'var(--chart-primary)' }} /><span className="text-white/60">{t('forecast.high')}: {format(parseISO(weatherData.tides.nextHigh.time), 'HH:mm')}</span></div>
              <div className="flex items-center gap-1"><ArrowDown size={12} style={{ color: 'var(--chart-primary)' }} /><span className="text-white/60">{t('forecast.low')}: {format(parseISO(weatherData.tides.nextLow.time), 'HH:mm')}</span></div>
            </>
          )}
          {activeGraph !== 'tide' && (
            <>
              <div className="flex items-center"><span className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: activeGraph === 'wave' ? 'var(--chart-primary)' : 'var(--chart-secondary)' }} /> {t('weather.height')} (m)</div>
              <div className="flex items-center"><span className="w-2 h-2 rounded-full bg-yellow-400 mr-1.5" /> {t('weather.period')} (s)</div>
            </>
          )}
        </div>

        <div className="w-full" style={{ height: '256px', minHeight: '256px' }}>
          <ResponsiveContainer width="100%" height={256}>
            {activeGraph === 'tide' ? (
              <AreaChart data={tideChartData}>
                <defs>
                  <linearGradient id="colorTide" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--chart-primary)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--chart-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="displayTime" stroke="var(--chart-text)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--chart-text)" fontSize={10} tickLine={false} axisLine={false} domain={['dataMin - 0.5', 'dataMax + 0.5']} />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.5rem', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff' }} />
                <Area type="monotone" dataKey="height" stroke="var(--chart-primary)" fillOpacity={1} fill="url(#colorTide)" strokeWidth={2} name={t('forecast.tideHeight')} />
              </AreaChart>
            ) : (
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="displayTime" stroke="var(--chart-text)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" stroke="var(--chart-text)" fontSize={10} tickLine={false} axisLine={false} label={{ value: 'm', angle: -90, position: 'insideLeft', fill: 'var(--chart-text)' }} />
                <YAxis yAxisId="right" orientation="right" stroke="var(--chart-text)" fontSize={10} tickLine={false} axisLine={false} domain={[0, 20]} label={{ value: 's', angle: 90, position: 'insideRight', fill: 'var(--chart-text)' }} />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.5rem', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff' }} labelStyle={{ color: 'rgba(255,255,255,0.6)' }} />
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
      </section>

      {/* ─── Mariner's Forecast Table ─── */}
      <section className="glass-panel overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b border-white/10 bg-black/10">
          <h3 className="text-xs font-bold tracking-widest text-white/70 uppercase flex items-center">
            <Compass size={14} className="mr-1.5" />
            {forecastTab === 'mariner' && t('forecast.marinerForecast')}
            {forecastTab === 'surfer' && t('forecast.surferForecast')}
            {forecastTab === 'kite' && t('forecast.kiteForecast')}
            {forecastTab === 'beach' && t('forecast.beachForecast')}
          </h3>
          <div className="flex space-x-2">
            <button onClick={handlePrevTab} className="w-5 h-5 rounded glass-inner flex items-center justify-center hover:bg-white/20"><ChevronLeft size={10} /></button>
            <button onClick={handleNextTab} className="w-5 h-5 rounded glass-inner flex items-center justify-center hover:bg-white/20"><ChevronRight size={10} /></button>
          </div>
        </div>
        <div className="w-full overflow-x-auto hide-scrollbar">
          <table className="w-full text-[10px] text-left whitespace-nowrap">
            <thead className="text-white/60 bg-black/20">
              <tr>
                <th className="px-4 py-2 font-medium">{t('table.period')}</th>
                {forecastTab === 'mariner' && (<><th className="px-4 py-2 font-medium">{t('table.pressure')}</th><th className="px-4 py-2 font-medium">{t('table.seaStatus')}</th><th className="px-4 py-2 font-medium">{t('table.wind')}</th><th className="px-4 py-2 font-medium">{t('table.visibility')}</th><th className="px-4 py-2 font-medium">{t('table.weather')}</th><th className="px-4 py-2 font-medium">{t('table.swell')}</th></>)}
                {forecastTab === 'surfer' && (<><th className="px-4 py-2 font-medium">{t('table.waveHeight')}</th><th className="px-4 py-2 font-medium">{t('table.period')}</th><th className="px-4 py-2 font-medium">{t('table.swellHeight')}</th><th className="px-4 py-2 font-medium">{t('table.swellPeriod')}</th><th className="px-4 py-2 font-medium">{t('table.swellDir')}</th><th className="px-4 py-2 font-medium">{t('table.rating')}</th></>)}
                {forecastTab === 'kite' && (<><th className="px-4 py-2 font-medium">{t('table.windSpeed')}</th><th className="px-4 py-2 font-medium">{t('table.direction')}</th><th className="px-4 py-2 font-medium">{t('table.waveHeight')}</th><th className="px-4 py-2 font-medium">{t('table.weather')}</th><th className="px-4 py-2 font-medium">{t('table.condition')}</th></>)}
                {forecastTab === 'beach' && (<><th className="px-4 py-2 font-medium">{t('table.temp')}</th><th className="px-4 py-2 font-medium">{t('table.uvIndex')}</th><th className="px-4 py-2 font-medium">{t('table.windSand')}</th><th className="px-4 py-2 font-medium">{t('table.seaState')}</th><th className="px-4 py-2 font-medium">{t('table.comfort')}</th></>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {forecastTableBlocks.map((row, idx) => (
                <tr key={idx} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 font-bold">{row.period}<br /><span className="text-[10px] font-normal text-white/50">{row.date}</span></td>
                  {forecastTab === 'mariner' && (<><td className="px-4 py-3 text-white/80">{row.pressure}</td><td className="px-4 py-3 text-white/80">{row.seaStatus}</td><td className="px-4 py-3 font-bold">{row.wind}</td><td className="px-4 py-3 text-white/80">{row.visibility}</td><td className="px-4 py-3 flex items-center gap-1"><WeatherAnimation code={row.weatherCode} />{getWeatherConditionTranslated(row.weatherCode)}</td><td className="px-4 py-3 text-teal-400 font-bold">{row.swell} ({row.swellHeight}m)</td></>)}
                  {forecastTab === 'surfer' && (<><td className="px-4 py-3 font-bold text-blue-300">{row.waveHeight}</td><td className="px-4 py-3">{row.wavePeriod}s</td><td className="px-4 py-3 font-medium text-teal-300">{row.swellHeight}m</td><td className="px-4 py-3">{row.swellPeriod}s</td><td className="px-4 py-3">{row.swell}</td><td className="px-4 py-3">{(() => { const sh = parseFloat(row.swellHeight), sp = parseFloat(row.swellPeriod); if (sh >= 1.5 && sp >= 8) return <span className="text-purple-400 font-bold">{t('activity.surf.epic')}</span>; if (sh >= 1.0 && sp >= 6) return <span className="text-green-400 font-bold">{t('activity.surf.good')}</span>; if (sh >= 0.5 && sp >= 4) return <span className="text-blue-400">{t('activity.surf.fair')}</span>; return <span className="text-white/40">{t('activity.surf.poor')}</span>; })()}</td></>)}
                  {forecastTab === 'kite' && (<><td className="px-4 py-3 font-bold text-cyan-300">{row.wind.split('(')[1]?.replace(')', '') || row.wind}</td><td className="px-4 py-3">{row.wind.split('(')[0]}</td><td className="px-4 py-3">{row.waveHeight}</td><td className="px-4 py-3 flex items-center gap-1"><WeatherAnimation code={row.weatherCode} />{getWeatherConditionTranslated(row.weatherCode)}</td><td className="px-4 py-3">{row.wind.includes("20-") || row.wind.includes("25-") ? <span className="text-green-400 font-bold">{t('activity.kite.optimal')}</span> : <span className="text-white/40">{t('activity.kite.light')}</span>}</td></>)}
                  {forecastTab === 'beach' && (<><td className="px-4 py-3 font-bold text-yellow-300">{row.temp}°C</td><td className="px-4 py-3">{row.uv}</td><td className="px-4 py-3">{row.wind}</td><td className="px-4 py-3">{row.seaStatus.split('(')[0]}</td><td className="px-4 py-3">{(() => { const code = row.weatherCode, temp = parseFloat(row.temp); if (code >= 51 || code >= 80) return <span className="text-red-400 font-bold">{t('activity.beach.poorRain')}</span>; if (code === 3 && temp <= 20) return <span className="text-white/60">{t('activity.beach.coolCloudy')}</span>; if (code === 3) return <span className="text-white/60">{t('activity.beach.cloudy')}</span>; if (temp < 18) return <span className="text-blue-300">{t('activity.beach.cold')}</span>; if (temp < 22) return <span className="text-blue-200">{t('activity.beach.cool')}</span>; return <span className="text-green-400 font-bold">{t('activity.beach.great')}</span>; })()}</td></>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-2 flex gap-1 justify-center">
          {['mariner', 'surfer', 'kite', 'beach'].map((tab) => (
            <div key={tab} className={`w-2 h-2 rounded-full ${forecastTab === tab ? 'bg-blue-500' : 'bg-white/20'}`} />
          ))}
        </div>
      </section>

    </div>
  );
};

export default Dashboard;
