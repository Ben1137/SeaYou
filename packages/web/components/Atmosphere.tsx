
import React, { useRef, useCallback } from 'react';
import { MarineWeatherData, HourlyForecastItem, DailyForecastItem } from '@seame/core';
import {
  Wind, Navigation, Sun, Moon, Eye, Droplets,
  Gauge, Thermometer, Sunrise, Sunset, Cloud, ArrowUp, ArrowDown,
  CloudRain, CloudSnow, CloudLightning, CloudFog, CloudSun, Cloudy,
  Calendar
} from 'lucide-react';
import { format, parseISO, differenceInMinutes, addDays, isToday, isTomorrow } from 'date-fns';
import { useTranslation } from 'react-i18next';

interface AtmosphereProps {
  weatherData: MarineWeatherData | null;
}

// Weather code to icon mapping
const getWeatherIcon = (code: number, isDay: boolean, size: number = 24) => {
  const className = "flex-shrink-0";

  // Clear
  if (code === 0) {
    return isDay ? <Sun size={size} className={`${className} text-yellow-400`} /> : <Moon size={size} className={`${className} text-slate-300`} />;
  }
  // Mainly clear, partly cloudy
  if (code >= 1 && code <= 2) {
    return isDay ? <CloudSun size={size} className={`${className} text-yellow-300`} /> : <Cloud size={size} className={`${className} text-slate-400`} />;
  }
  // Overcast
  if (code === 3) {
    return <Cloudy size={size} className={`${className} text-slate-400`} />;
  }
  // Fog
  if (code >= 45 && code <= 48) {
    return <CloudFog size={size} className={`${className} text-slate-400`} />;
  }
  // Drizzle
  if (code >= 51 && code <= 57) {
    return <CloudRain size={size} className={`${className} text-blue-300`} />;
  }
  // Rain
  if (code >= 61 && code <= 67) {
    return <CloudRain size={size} className={`${className} text-blue-400`} />;
  }
  // Snow
  if (code >= 71 && code <= 77) {
    return <CloudSnow size={size} className={`${className} text-blue-200`} />;
  }
  // Rain showers
  if (code >= 80 && code <= 82) {
    return <CloudRain size={size} className={`${className} text-blue-500`} />;
  }
  // Snow showers
  if (code >= 85 && code <= 86) {
    return <CloudSnow size={size} className={`${className} text-blue-300`} />;
  }
  // Thunderstorm
  if (code >= 95 && code <= 99) {
    return <CloudLightning size={size} className={`${className} text-purple-400`} />;
  }

  return <Cloud size={size} className={`${className} text-slate-400`} />;
};

// Get weather summary text based on conditions
const getWeatherSummary = (code: number, windGusts: number, feelsLike: number, t: (key: string, options?: Record<string, unknown>) => string): string => {
  let summary = '';

  // Weather condition part
  if (code === 0) {
    summary = t('atmosphere.clearConditions');
  } else if (code >= 1 && code <= 3) {
    summary = t('atmosphere.partlyCloudyConditions');
  } else if (code >= 51 && code <= 67 || code >= 80 && code <= 82) {
    summary = t('atmosphere.rainyConditions');
  } else {
    summary = t('atmosphere.cloudyConditions');
  }

  // Wind gusts part
  if (windGusts > 20) {
    summary += ' ' + t('atmosphere.windGustsInfo', { speed: Math.round(windGusts), temp: Math.round(feelsLike) });
  }

  return summary;
};

const Atmosphere: React.FC<AtmosphereProps> = ({ weatherData }) => {
  const { t } = useTranslation();

  // Mouse drag-to-scroll for horizontal containers
  const hourlyScrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragScrollLeft = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const el = hourlyScrollRef.current;
    if (!el) return;
    isDragging.current = true;
    dragStartX.current = e.pageX - el.offsetLeft;
    dragScrollLeft.current = el.scrollLeft;
    el.style.cursor = 'grabbing';
    el.style.userSelect = 'none';
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    e.preventDefault();
    const el = hourlyScrollRef.current;
    if (!el) return;
    const x = e.pageX - el.offsetLeft;
    const walk = (x - dragStartX.current) * 1.5; // 1.5x speed multiplier
    el.scrollLeft = dragScrollLeft.current - walk;
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    const el = hourlyScrollRef.current;
    if (el) {
      el.style.cursor = 'grab';
      el.style.userSelect = '';
    }
  }, []);

  if (!weatherData || !weatherData.general || !weatherData.current) return null;
  const { general, current } = weatherData;

  // Helper function to convert degrees to cardinal direction
  const getCardinalDirection = (degrees: number): string => {
    const normalizedDegrees = ((degrees % 360) + 360) % 360; // Normalize to 0-360

    if ((normalizedDegrees >= 0 && normalizedDegrees < 22.5) || normalizedDegrees >= 337.5) {
      return t('directions.north');
    } else if (normalizedDegrees >= 22.5 && normalizedDegrees < 67.5) {
      return t('directions.northeast');
    } else if (normalizedDegrees >= 67.5 && normalizedDegrees < 112.5) {
      return t('directions.east');
    } else if (normalizedDegrees >= 112.5 && normalizedDegrees < 157.5) {
      return t('directions.southeast');
    } else if (normalizedDegrees >= 157.5 && normalizedDegrees < 202.5) {
      return t('directions.south');
    } else if (normalizedDegrees >= 202.5 && normalizedDegrees < 247.5) {
      return t('directions.southwest');
    } else if (normalizedDegrees >= 247.5 && normalizedDegrees < 292.5) {
      return t('directions.west');
    } else {
      return t('directions.northwest');
    }
  };

  // Helper function to translate moon phase
  const getMoonPhaseTranslation = (phase: string): string => {
    const phaseMap: Record<string, string> = {
      'New Moon': 'newMoon',
      'Waxing Crescent': 'waxingCrescent',
      'First Quarter': 'firstQuarter',
      'Waxing Gibbous': 'waxingGibbous',
      'Full Moon': 'fullMoon',
      'Waning Gibbous': 'waningGibbous',
      'Last Quarter': 'lastQuarter',
      'Waning Crescent': 'waningCrescent'
    };
    const key = phaseMap[phase] || 'newMoon';
    return t(`moonPhases.${key}`);
  };

  // Format day name for 10-day forecast
  const formatDayName = (dateStr: string): string => {
    const date = parseISO(dateStr);
    if (isToday(date)) return t('atmosphere.today');
    if (isTomorrow(date)) return format(date, 'EEE');
    return format(date, 'EEE');
  };

  // --- Sun Cycle Calculation ---
  const now = new Date();
  const sunrise = new Date(general.sunrise);
  const sunset = new Date(general.sunset);

  const dayDuration = differenceInMinutes(sunset, sunrise);
  const timeSinceSunrise = differenceInMinutes(now, sunrise);
  let sunProgress = 0;

  if (timeSinceSunrise < 0) sunProgress = 0; // Before sunrise
  else if (timeSinceSunrise > dayDuration) sunProgress = 100; // After sunset
  else sunProgress = (timeSinceSunrise / dayDuration) * 100;

  // --- Moon Cycle Calculation (Animation Position) ---
  let moonProgress = -1; // -1 means moon is not visible/not calculated for arc

  if (general.moonrise && general.moonset) {
      const moonrise = new Date(general.moonrise);
      const moonset = new Date(general.moonset);

      // Handle day crossing for moon (if set is before rise, it sets the next day)
      let effectiveMoonset = moonset;
      if (moonset < moonrise) effectiveMoonset = addDays(moonset, 1);

      // If now is between rise and set
      if (now >= moonrise && now <= effectiveMoonset) {
          const moonDuration = differenceInMinutes(effectiveMoonset, moonrise);
          const timeSinceMoonrise = differenceInMinutes(now, moonrise);
          moonProgress = (timeSinceMoonrise / moonDuration) * 100;
      }
  }

  // --- Pressure Scale ---
  const pressure = general.pressure;
  const pressurePercent = Math.min(100, Math.max(0, ((pressure - 980) / (1040 - 980)) * 100));
  let pressureLabel = t('atmosphere.normal');
  if (pressure < 1005) pressureLabel = t('atmosphere.lowSystem');
  if (pressure > 1022) pressureLabel = t('atmosphere.highPressure');

  // Calculate temperature range for the 10-day forecast bar visualization
  const allDailyTemps = general.dailyForecast.flatMap(d => [d.tempMin, d.tempMax]);
  const minTempRange = Math.min(...allDailyTemps);
  const maxTempRange = Math.max(...allDailyTemps);
  const tempRangeSpan = maxTempRange - minTempRange || 1;

  // Get sunrise and sunset times for hourly forecast markers
  const sunriseTime = format(sunrise, 'HH:mm');
  const sunsetTime = format(sunset, 'HH:mm');
  const sunriseHour = format(sunrise, 'HH');
  const sunsetHour = format(sunset, 'HH');

  return (
    <div className="px-5 space-y-6 pb-8 max-w-6xl mx-auto">

      {/* --- CURRENT WEATHER HERO --- */}
      <div className="glass-panel p-6 flex flex-col items-center justify-center relative overflow-hidden text-center">
        {/* Weather Icon */}
        <div className="mb-2">
          {getWeatherIcon(general.weatherCode, true, 36)}
        </div>

        {/* Large Temperature */}
        <div className="text-[5rem] font-medium leading-none tracking-tighter drop-shadow-lg text-white">
          {Math.round(general.temperature)}°
        </div>

        {/* Feels Like */}
        <div className="text-xs text-white/80 mt-2">
          {t('weather.feelsLike')}: {Math.round(general.feelsLike)}°
        </div>

        {/* High / Low */}
        <div className="text-sm text-white/80 flex items-center justify-center gap-3 mt-2">
          <span className="flex items-center gap-1">
            <ArrowUp size={14} className="text-red-400" />
            <span className="font-semibold">{Math.round(general.dailyForecast[0]?.tempMax || 0)}°</span>
          </span>
          <span className="flex items-center gap-1">
            <ArrowDown size={14} className="text-blue-400" />
            <span className="font-semibold">{Math.round(general.dailyForecast[0]?.tempMin || 0)}°</span>
          </span>
        </div>

        {/* Weather Summary */}
        <div className="mt-4 pt-4 border-t border-white/10 w-full">
          <p className="text-white/60 text-sm text-center">
            {getWeatherSummary(general.weatherCode, current.windGusts, general.feelsLike, t)}
          </p>
        </div>
      </div>

      {/* --- 24-HOUR FORECAST --- */}
      <div className="glass-panel p-4">
        <h2 className="text-xs font-bold text-white/60 uppercase mb-3 flex items-center gap-2">
          <Calendar size={14} className="text-teal-400" /> {t('atmosphere.hourlyForecast')}
        </h2>

        <div
          ref={hourlyScrollRef}
          className="flex space-x-2 overflow-x-auto pb-2 snap-x hide-scrollbar cursor-grab"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {general.hourlyForecast.map((hour: HourlyForecastItem, index: number) => {
            const hourTime = parseISO(hour.time);
            const hourStr = format(hourTime, 'HH');
            const isNow = index === 0;
            const isSunrise = hourStr === sunriseHour;
            const isSunset = hourStr === sunsetHour;

            return (
              <div
                key={hour.time}
                className="min-w-[45px] flex flex-col items-center snap-start"
              >
                {/* Time */}
                <span className="text-[10px] text-white/40 mb-1">
                  {isNow ? t('common.now') : format(hourTime, 'HH')}
                </span>

                {/* Weather Icon or Sunrise/Sunset */}
                <div className="h-7 flex items-center justify-center mb-1">
                  {isSunrise ? (
                    <Sunrise size={20} className="text-yellow-500" />
                  ) : isSunset ? (
                    <Sunset size={20} className="text-orange-500" />
                  ) : (
                    getWeatherIcon(hour.weatherCode, hour.isDay, 20)
                  )}
                </div>

                {/* Temperature or Sunrise/Sunset time */}
                <span className="text-xs font-semibold text-white">
                  {isSunrise ? sunriseTime : isSunset ? sunsetTime : `${Math.round(hour.temperature)}°`}
                </span>

                {/* Precipitation probability if > 0 */}
                {hour.precipitationProbability > 0 && !isSunrise && !isSunset && (
                  <span className="text-[11px] text-blue-400 mt-0.5">
                    {hour.precipitationProbability}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* --- 16-DAY FORECAST --- */}
      <div className="glass-panel p-4">
        <h2 className="text-xs font-bold text-white/60 uppercase mb-3 flex items-center gap-2">
          <Calendar size={14} className="text-teal-400" /> {t('atmosphere.dailyForecast')}
        </h2>

        <div className="space-y-1">
          {general.dailyForecast.map((day: DailyForecastItem, index: number) => {
            // Calculate bar position for temperature range
            const lowPercent = ((day.tempMin - minTempRange) / tempRangeSpan) * 100;
            const highPercent = ((day.tempMax - minTempRange) / tempRangeSpan) * 100;
            const barWidth = highPercent - lowPercent;

            // Determine bar gradient color based on temperature
            const getBarColor = () => {
              const avgTemp = (day.tempMin + day.tempMax) / 2;
              if (avgTemp < 15) return 'from-teal-400 to-blue-500';
              return 'from-yellow-400 to-orange-500';
            };

            return (
              <div
                key={day.time}
                className={`flex items-center justify-between text-xs py-2 ${index < general.dailyForecast.length - 1 ? 'border-b border-white/10' : ''}`}
              >
                {/* Day Name */}
                <div className="w-10 text-xs text-white font-medium">
                  {formatDayName(day.time)}
                </div>

                {/* Weather Icon */}
                <div className="w-7 flex justify-center">
                  {getWeatherIcon(day.code, true, 18)}
                </div>

                {/* Precipitation probability */}
                <div className="w-9 text-right">
                  {day.precipitationProbability > 0 ? (
                    <span className="text-[10px] text-blue-400 font-medium">
                      {day.precipitationProbability}%
                    </span>
                  ) : (
                    <span className="text-[10px] text-transparent">0%</span>
                  )}
                </div>

                {/* Low Temp */}
                <div className="w-7 text-right text-[11px] text-white/40">
                  {Math.round(day.tempMin)}°
                </div>

                {/* Temperature Bar */}
                <div className="flex-1 h-1 glass-inner rounded-full relative overflow-hidden mx-2">
                  <div
                    className={`absolute h-full rounded-full bg-gradient-to-r ${getBarColor()}`}
                    style={{
                      left: `${lowPercent}%`,
                      width: `${Math.max(barWidth, 5)}%`
                    }}
                  />
                  {/* Current temperature indicator for today */}
                  {index === 0 && (
                    <div
                      className="absolute w-1.5 h-1.5 bg-white rounded-full shadow-sm top-[-1px]"
                      style={{
                        left: `${((general.temperature - minTempRange) / tempRangeSpan) * 100}%`,
                        transform: 'translateX(-50%)'
                      }}
                    />
                  )}
                </div>

                {/* High Temp */}
                <div className="w-7 text-left text-[11px] text-white font-medium">
                  {Math.round(day.tempMax)}°
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* --- SOLAR/LUNAR + WIND ROW --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* --- SOLAR & LUNAR CYCLE --- */}
        <div className="glass-panel p-4 flex flex-col justify-between">
           <h2 className="text-xs font-bold text-white/60 uppercase mb-3 flex items-center gap-2">
             <Sun size={14} className="text-yellow-500" /> {t('atmosphere.solarCycle')}
           </h2>

           {/* Sun Arc Animation - SVG */}
           <div className="relative h-20 mb-4">
              <svg viewBox="0 0 200 100" className="w-full h-full overflow-visible" preserveAspectRatio="xMidYMax meet">
                <defs>
                  <linearGradient id="sunArcGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#74b9ff" />
                    <stop offset="50%" stopColor="#ffeaa7" />
                    <stop offset="100%" stopColor="#fab1a0" />
                  </linearGradient>
                </defs>
                {/* Arc path */}
                <path
                  d="M 10 95 A 90 90 0 0 1 190 95"
                  fill="none"
                  stroke="url(#sunArcGradient)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  opacity="0.5"
                />
                {/* Sun position along arc */}
                <circle
                  cx={10 + (sunProgress / 100) * 180}
                  cy={95 - Math.sin((sunProgress / 100) * Math.PI) * 85}
                  r="8"
                  fill="#ffeaa7"
                  opacity={sunProgress > 0 && sunProgress < 100 ? 1 : 0.3}
                  className="drop-shadow-lg"
                />
                <circle
                  cx={10 + (sunProgress / 100) * 180}
                  cy={95 - Math.sin((sunProgress / 100) * Math.PI) * 85}
                  r="12"
                  fill="#ffeaa7"
                  opacity={sunProgress > 0 && sunProgress < 100 ? 0.2 : 0}
                />
                {/* Horizon line */}
                <line x1="5" y1="95" x2="195" y2="95" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
              </svg>

              {/* Sunrise / Sunset labels */}
              <div className="absolute bottom-0 left-0 text-[11px] text-white/40 flex flex-col items-center">
                 <Sunrise size={12} className="text-yellow-500/60" />
                 <span>{format(sunrise, 'HH:mm')}</span>
              </div>
              <div className="absolute bottom-0 right-0 text-[11px] text-white/40 flex flex-col items-center">
                 <Sunset size={12} className="text-orange-500/60" />
                 <span>{format(sunset, 'HH:mm')}</span>
              </div>
           </div>

           {/* Lunar Section - Moon Arc */}
           <div className="border-t border-white/10 pt-3 mt-1">
               <h2 className="text-xs font-bold text-white/60 uppercase mb-3 flex items-center gap-2">
                 <Moon size={14} className="text-white/60" /> {t('atmosphere.lunarCycle')}
               </h2>

               {/* Moon Arc Animation - SVG */}
               <div className="relative h-20 mb-6">
                  <svg viewBox="0 0 200 100" className="w-full h-full overflow-visible" preserveAspectRatio="xMidYMax meet">
                    <defs>
                      <linearGradient id="moonArcGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#94a3b8" />
                        <stop offset="50%" stopColor="#e2e8f0" />
                        <stop offset="100%" stopColor="#94a3b8" />
                      </linearGradient>
                    </defs>
                    {/* Dashed arc path */}
                    <path
                      d="M 10 95 A 90 90 0 0 1 190 95"
                      fill="none"
                      stroke="url(#moonArcGradient)"
                      strokeWidth="1.5"
                      strokeDasharray="4 3"
                      strokeLinecap="round"
                      opacity="0.35"
                    />
                    {/* Moon position along arc */}
                    {moonProgress >= 0 && (
                      <>
                        <circle
                          cx={10 + (moonProgress / 100) * 180}
                          cy={95 - Math.sin((moonProgress / 100) * Math.PI) * 85}
                          r="8"
                          fill="#e2e8f0"
                          opacity={0.9}
                        />
                        <circle
                          cx={10 + (moonProgress / 100) * 180}
                          cy={95 - Math.sin((moonProgress / 100) * Math.PI) * 85}
                          r="13"
                          fill="#e2e8f0"
                          opacity={0.12}
                        />
                      </>
                    )}
                    {/* Horizon line */}
                    <line x1="5" y1="95" x2="195" y2="95" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                  </svg>

                  {moonProgress < 0 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[10px] text-white/40 uppercase font-bold tracking-widest">{t('atmosphere.moonDown')}</span>
                    </div>
                  )}

                  {/* Moonrise / Moonset labels */}
                  <div className="absolute bottom-0 left-0 text-[11px] text-white/40 flex flex-col items-center">
                     <span className="uppercase flex items-center gap-0.5"><ArrowUp size={10}/> {t('atmosphere.rise')}</span>
                     <span className="font-mono text-white/60">{general.moonrise ? format(parseISO(general.moonrise), 'HH:mm') : '--:--'}</span>
                  </div>
                  <div className="absolute bottom-0 right-0 text-[11px] text-white/40 flex flex-col items-center">
                     <span className="uppercase flex items-center gap-0.5"><ArrowDown size={10}/> {t('atmosphere.set')}</span>
                     <span className="font-mono text-white/60">{general.moonset ? format(parseISO(general.moonset), 'HH:mm') : '--:--'}</span>
                  </div>
               </div>

               {/* Moon Phase & Next Full Moon */}
               <div className="bg-black/20 p-3 rounded-lg flex items-center justify-between">
                   <div className="flex items-center gap-2">
                       <div className="relative">
                           <Moon size={24} className="text-white/60" />
                           <div className="absolute inset-0 bg-black/60 rounded-full mix-blend-multiply" style={{ width: `${100 - general.moonIllumination}%`, marginLeft: 'auto' }}></div>
                       </div>
                       <div>
                           <div className="text-[10px] text-white/40 uppercase">{t('atmosphere.phase')}</div>
                           <div className="text-white text-xs font-bold">{getMoonPhaseTranslation(general.moonPhase)}</div>
                       </div>
                   </div>

                   <div className="text-right">
                       <div className="text-[10px] text-white/40 uppercase">{t('atmosphere.nextFullMoon')}</div>
                       <div className="text-white text-xs font-mono">
                         {general.nextFullMoon ? format(parseISO(general.nextFullMoon), 'dd MMM') : '--'}
                       </div>
                   </div>
               </div>
           </div>
        </div>

        {/* --- WIND DYNAMICS --- */}
        <div className="glass-panel p-4 flex flex-col justify-between">
            <h2 className="text-xs font-bold text-white/60 uppercase mb-3 flex items-center gap-2">
             <Wind size={14} className="text-cyan-400" /> {t('atmosphere.windDynamics')}
           </h2>

           <div className="flex flex-col items-center gap-3">
               {/* Compass */}
               <div className="relative w-24 h-24 rounded-full border border-white/10 flex items-center justify-center">
                   <div className="absolute top-1 text-[10px] font-bold text-white/60">N</div>
                   <div className="absolute bottom-1 text-[10px] font-bold text-white/60">S</div>
                   <div className="absolute left-1 text-[10px] font-bold text-white/60">W</div>
                   <div className="absolute right-1 text-[10px] font-bold text-white/60">E</div>

                   {/* Animated Arrow */}
                   <div
                     className="transition-transform duration-1000 ease-out"
                     style={{ transform: `rotate(${current.windDirection}deg)` }}
                   >
                      <Navigation size={36} className="text-cyan-500 fill-cyan-500/20" />
                   </div>
               </div>

               {/* Speed and Gusts side by side */}
               <div className="flex gap-2 w-full">
                  <div className="glass-inner p-2 rounded-lg flex-1 text-center">
                      <div className="text-[10px] text-white/60 uppercase font-bold mb-0.5">{t('weather.windSpeed')}</div>
                      <div className="text-lg font-bold text-white">{current.windSpeed.toFixed(1)}</div>
                      <div className="text-[10px] text-white/40">{t('units.kmh')}</div>
                  </div>
                  <div className="glass-inner p-2 rounded-lg flex-1 text-center">
                      <div className="text-[10px] text-white/60 uppercase font-bold mb-0.5">{t('atmosphere.gusts')}</div>
                      <div className="text-lg font-bold text-white">{current.windGusts.toFixed(1)}</div>
                      <div className="text-[10px] text-white/40">{t('units.kmh')}</div>
                  </div>
               </div>
           </div>
           <div className="text-center mt-2 text-[11px] text-white/40">
               {t('atmosphere.currentDirection')}: <span className="text-white font-bold">{current.windDirection}° {getCardinalDirection(current.windDirection)}</span>
           </div>
        </div>

      </div>

      {/* --- ATMOSPHERIC CONDITIONS --- */}
      <div className="glass-panel p-4">
         <h2 className="text-xs font-bold text-white/60 uppercase mb-4 flex items-center gap-2">
           <Gauge size={14} className="text-teal-400" /> {t('atmosphere.atmosphericConditions')}
         </h2>

         <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:divide-x divide-white/10">

             {/* Visibility */}
             <div className="flex flex-col items-center px-2">
                 <Eye size={18} className="text-blue-400 mb-1" />
                 <div className="text-[10px] text-white/60 uppercase font-bold">{t('atmosphere.visibility')}</div>
                 <div className="font-bold text-sm text-white mt-1">{(general.visibility / 1000).toFixed(1)} <span className="text-[11px] text-white/40">{t('units.kilometers')}</span></div>
                 <div className="w-full h-1 rounded-full bg-black/20 mt-2 overflow-hidden">
                   <div className="bg-blue-400 h-full rounded-full" style={{ width: `${Math.min((general.visibility / 20000) * 100, 100)}%` }}></div>
                 </div>
             </div>

             {/* Humidity */}
             <div className="flex flex-col items-center px-2">
                 <Droplets size={18} className="text-teal-400 mb-1" />
                 <div className="text-[10px] text-white/60 uppercase font-bold">{t('atmosphere.humidity')}</div>
                 <div className="font-bold text-sm text-white mt-1">{general.humidity}%</div>
                 <div className="w-full h-1 rounded-full bg-black/20 mt-2 overflow-hidden">
                     <div className="bg-teal-400 h-full rounded-full" style={{ width: `${general.humidity}%` }}></div>
                 </div>
             </div>

             {/* Pressure */}
             <div className="flex flex-col items-center px-2">
                 <Gauge size={18} className="text-yellow-400 mb-1" />
                 <div className="text-[10px] text-white/60 uppercase font-bold">{t('table.pressure')}</div>
                 <div className="font-bold text-sm text-white mt-1">{Math.round(general.pressure)} <span className="text-[11px] text-white/40">{t('units.hpa')}</span></div>
                 <div className="text-[10px] text-yellow-400/80 mt-0.5">{pressureLabel}</div>
                 <div className="w-full h-1 rounded-full bg-black/20 mt-1 relative">
                     <div className="absolute top-0 bottom-0 w-2 bg-yellow-400 rounded-full" style={{ left: `${pressurePercent}%` }}></div>
                 </div>
             </div>

             {/* UV Index */}
             <div className="flex flex-col items-center px-2">
                 <Sun size={18} className="text-orange-400 mb-1" />
                 <div className="text-[10px] text-white/60 uppercase font-bold">{t('weather.currentUV')}</div>
                 <div className="font-bold text-sm text-white mt-1">{general.uvIndex.toFixed(1)}</div>
                 <div className="w-full h-1 rounded-full bg-black/20 mt-2 overflow-hidden">
                     <div
                       className={`h-full rounded-full ${general.uvIndex < 3 ? 'bg-green-500' : general.uvIndex < 6 ? 'bg-yellow-500' : general.uvIndex < 8 ? 'bg-orange-500' : 'bg-red-500'}`}
                       style={{ width: `${Math.min(general.uvIndex / 11 * 100, 100)}%` }}
                     ></div>
                 </div>
                 <div className="text-[10px] mt-0.5 text-white/40">
                   {general.uvIndex < 3 ? 'Low' : general.uvIndex < 6 ? 'Moderate' : general.uvIndex < 8 ? 'High' : general.uvIndex < 11 ? 'Very High' : 'Extreme'}
                 </div>
             </div>

         </div>
      </div>

    </div>
  );
};

export default Atmosphere;
