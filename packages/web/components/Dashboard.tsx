import React, { useEffect, useMemo, useState } from 'react';
import { MarineWeatherData, ActivityPersona, scoreActivity, extractCurrentConditions, extractHourlyConditions, findBestWindow, type OnboardingPersona, WEATHER_MODELS, windQuality, waveScaleLabel, waveScaleI18nKey, beachgoerSafetyLabel } from '@seame/core';
import { useUserPreferences } from '../src/hooks/useUserPreferences';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, ComposedChart, Line
} from 'recharts';
import {
  Wind, Activity, Waves, ArrowUp, ArrowDown, Droplets,
  Navigation, Settings, X, Sun, Moon, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog,
  Thermometer, ThumbsUp, Skull, Flag, Palmtree, Compass, ChevronRight, ChevronLeft, Tornado, Ruler, Layers,
  AlertTriangle, Sailboat, ChevronDown, Anchor, Eye, Info, Maximize2, Minimize2
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { getWeatherDescription } from '@seame/core';
import { DashboardSkeleton } from './LoadingSkeleton';
import { ErrorState } from './ErrorState';
import { useTranslation } from 'react-i18next';
import { AlertConfigModal } from './AlertConfigModal';
import { useAlertConfig } from '../src/contexts/AlertContext';
import { ActivityTimeline } from './ActivityTimeline';
import { ScoreBreakdownModal } from './ScoreBreakdownModal';
import { useCoastalReading } from '../hooks/useCoastalReading';
import { EnergyConsistencyCard } from './EnergyConsistencyCard';
import { VoyageLogbookCard } from './VoyageLogbookCard';

interface DashboardProps {
  weatherData: MarineWeatherData | null | undefined;
  loading: boolean;
  error: Error | null;
  locationName: string;
  /** Currently active location coordinates — forwarded to AlertConfigModal
   *  so it can seed `home_lat`/`home_lon` when the user enables pushes. */
  currentLat?: number;
  currentLng?: number;
  onRetry?: () => void;
  onLocationClick?: () => void;
  isOfflineFallback?: boolean;
  lastUpdated?: Date | null;
}


const WeatherAnimation: React.FC<{ code: number }> = ({ code }) => {
  if (code === 0 || code === 1) return <Sun className="text-yellow-400 motion-safe:animate-[spin_10s_linear_infinite]" size={20} />;
  if (code === 2 || code === 3) return <Cloud className="text-white/60 motion-safe:animate-pulse" size={20} />;
  if (code === 45 || code === 48) return <CloudFog className="text-white/40 motion-safe:animate-pulse" size={20} />;
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return <CloudRain className="text-blue-300 motion-safe:animate-pulse" size={20} />;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return <CloudSnow className="text-white motion-safe:animate-pulse" size={20} />;
  if (code >= 95 && code <= 99) return <CloudLightning className="text-yellow-500 motion-safe:animate-pulse" size={20} />;
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

const Dashboard: React.FC<DashboardProps> = ({ weatherData, loading, error, locationName, currentLat, currentLng, onRetry, onLocationClick, isOfflineFallback, lastUpdated }) => {
  const { t } = useTranslation();
  const { thresholds, isDismissed, dismiss, resetDismiss, persona, selectedActivities } = useAlertConfig();
  const { preferences } = useUserPreferences();
  const [showSettings, setShowSettings] = useState(false);
  type ForecastTab = 'mariner' | 'wave_surfer' | 'wind_surfer' | 'kite_surfer' | 'boogie_boarder' | 'diver' | 'beach';
  const [forecastTab, setForecastTab] = useState<ForecastTab>('mariner');
  const [activeGraph, setActiveGraph] = useState<'tide' | 'wave' | 'swell'>('wave');
  // Selected activity persona for the Explainable-UI breakdown modal
  const [breakdownPersona, setBreakdownPersona] = useState<ActivityPersona | null>(null);

  // ─── CSS-based "fullscreen" state (works on iOS Safari — native
  // requestFullscreen() is disallowed for non-video elements there) ───
  const [isChartExpanded, setIsChartExpanded] = useState(false);
  const [isTableExpanded, setIsTableExpanded] = useState(false);

  // Lock body scroll while an expanded panel is open
  useEffect(() => {
    const expanded = isChartExpanded || isTableExpanded;
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isChartExpanded, isTableExpanded]);

  // Escape key closes expanded panels
  useEffect(() => {
    if (!isChartExpanded && !isTableExpanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsChartExpanded(false);
        setIsTableExpanded(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isChartExpanded, isTableExpanded]);

  const EXPANDED_SECTION_CLASS =
    'fixed inset-0 z-[100] w-screen h-screen bg-app-base text-primary p-4 sm:p-8 flex flex-col overflow-y-auto rounded-none';

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
    weatherData.hourly.time.forEach((timeStr: string, i: number) => {
      const diff = Math.abs(nowTime - new Date(timeStr).getTime());
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
    const { wind, wave = 0 } = currentConditions;

    // Highest priority: Extreme storm (WMO code 95+ or severe readings)
    if (weatherCode >= 95 || wind > 65 || wave > 4.5) {
      return { title: t('alerts.stormWarning'), message: t('alerts.stormMessage'), icon: Tornado, color: "bg-red-600" };
    }

    // Tsunami simulation (if enabled)
    if (thresholds.tsunamiWarningEnabled) {
      return { title: t('alerts.tsunami'), message: t('alerts.tsunamiMessage'), icon: Waves, color: "bg-red-900 animate-pulse border-2 border-red-500" };
    }

    // Dynamic threshold alerts — use the user-configured thresholds (only if enabled)
    const waveExceeded = thresholds.highWavesEnabled && wave >= thresholds.waveHeightThreshold;
    const windExceeded = thresholds.strongWindsEnabled && wind >= thresholds.windSpeedThreshold;

    if (waveExceeded && windExceeded) {
      return {
        title: t('alerts.roughWeather'),
        message: `${t('alerts.waveAlert', { value: wave.toFixed(1) })} & ${t('alerts.windAlert', { value: Math.round(wind) })}`,
        icon: CloudLightning,
        color: "bg-orange-600"
      };
    }
    if (waveExceeded) {
      return {
        title: t('alerts.highWaves', 'High Wave Alert'),
        message: t('alerts.waveAlert', { value: wave.toFixed(1), defaultValue: `${wave.toFixed(1)}m waves detected — exceeds your ${thresholds.waveHeightThreshold}m threshold` }),
        icon: Waves,
        color: "bg-orange-600"
      };
    }
    if (windExceeded) {
      return {
        title: t('alerts.strongWinds', 'Strong Wind Alert'),
        message: t('alerts.windAlert', { value: Math.round(wind), defaultValue: `${Math.round(wind)} km/h winds detected — exceeds your ${thresholds.windSpeedThreshold} km/h threshold` }),
        icon: Wind,
        color: "bg-orange-600"
      };
    }

    return null;
  }, [weatherData, currentConditions, thresholds, t]);

  // ── P5.1: Per-spot Coastal Dynamics reading ────────────────────────────────
  // Reuses @seame/core nearshoreTransform with the same H0/T policy as the map.
  // coastalReading is null when the spot is on land, deep water, or data unavailable.
  // Must be declared before scoringConditions/bestWindows so shoreNormalDeg is available.
  const coastalReadingConditions = currentConditions ? {
    swellHeight:   currentConditions.swell    ?? 0,
    swellPeriod:   currentConditions.swellPeriod ?? 0,
    swellDirection:currentConditions.swellDirection ?? 0,
    waveHeight:    currentConditions.wave      ?? 0,
    wavePeriod:    currentConditions.wavePeriod ?? 0,
    waveDirection: currentConditions.swellDirection ?? 0,
  } : null;
  const coastalReading = useCoastalReading(currentLat, currentLng, coastalReadingConditions);

  // ─── Activity Scoring (powered by @seame/core scoring engine) ───
  const scoringConditions = useMemo(() => {
    if (!weatherData) return null;
    const conds = extractCurrentConditions(weatherData);
    // Thread shore normal into scoring so wind quality affects scores
    // when the gradient is available (null → multiplier stays 1.0)
    if (coastalReading?.shoreNormalDeg != null) {
      conds.shoreNormalDeg = coastalReading.shoreNormalDeg;
    }
    return conds;
  }, [weatherData, coastalReading]);

  const activityScores = useMemo(() => {
    if (!scoringConditions) return null;
    return {
      [ActivityPersona.SAILOR]:         scoreActivity(ActivityPersona.SAILOR, scoringConditions),
      [ActivityPersona.WAVE_SURFER]:    scoreActivity(ActivityPersona.WAVE_SURFER, scoringConditions),
      [ActivityPersona.WIND_SURFER]:    scoreActivity(ActivityPersona.WIND_SURFER, scoringConditions),
      [ActivityPersona.KITE_SURFER]:    scoreActivity(ActivityPersona.KITE_SURFER, scoringConditions),
      [ActivityPersona.BOOGIE_BOARDER]: scoreActivity(ActivityPersona.BOOGIE_BOARDER, scoringConditions),
      [ActivityPersona.DIVER]:          scoreActivity(ActivityPersona.DIVER, scoringConditions),
      [ActivityPersona.BEACHGOER]:      scoreActivity(ActivityPersona.BEACHGOER, scoringConditions),
    };
  }, [scoringConditions]);

  const bestWindows = useMemo(() => {
    if (!weatherData?.hourly?.time?.length) return null;
    const snDeg = coastalReading?.shoreNormalDeg ?? null;
    return {
      [ActivityPersona.SAILOR]:         findBestWindow(weatherData, ActivityPersona.SAILOR, { startHourIndex: currentHourIndex, shoreNormalDeg: snDeg }),
      [ActivityPersona.WAVE_SURFER]:    findBestWindow(weatherData, ActivityPersona.WAVE_SURFER, { startHourIndex: currentHourIndex, shoreNormalDeg: snDeg }),
      [ActivityPersona.WIND_SURFER]:    findBestWindow(weatherData, ActivityPersona.WIND_SURFER, { startHourIndex: currentHourIndex, shoreNormalDeg: snDeg }),
      [ActivityPersona.KITE_SURFER]:    findBestWindow(weatherData, ActivityPersona.KITE_SURFER, { startHourIndex: currentHourIndex, shoreNormalDeg: snDeg }),
      [ActivityPersona.BOOGIE_BOARDER]: findBestWindow(weatherData, ActivityPersona.BOOGIE_BOARDER, { startHourIndex: currentHourIndex, shoreNormalDeg: snDeg }),
      [ActivityPersona.DIVER]:          findBestWindow(weatherData, ActivityPersona.DIVER, { startHourIndex: currentHourIndex, shoreNormalDeg: snDeg }),
      [ActivityPersona.BEACHGOER]:      findBestWindow(weatherData, ActivityPersona.BEACHGOER, { startHourIndex: currentHourIndex, shoreNormalDeg: snDeg }),
    };
  }, [weatherData, currentHourIndex, coastalReading]);

  // Tide is decision-relevant for mariners and divers; surfers/beachgoers don't need it in
  // the conditions grid (they use the tide chart instead). WAVE_SURFER may be added here
  // at reef/point breaks — deferred to D.3 which builds full persona card-filtering.
  const TIDE_PERSONAS = new Set<string>(['mariner', 'diver']);
  const showTide = !!(weatherData?.tides && (persona == null || TIDE_PERSONAS.has(persona)));

  // P5.1 debug log — flag-gated on ?coastalReadingDebug=1
  // Cross-check HFinal against ?coastalDiag=1 map output at the same lat/lon.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.location.search.includes('coastalReadingDebug=1')) return;
    if (coastalReading) {
      console.log('[CoastalReading]', locationName, {
        lat: currentLat, lon: currentLng,
        H0: coastalReading.H0.toFixed(2), T: coastalReading.T.toFixed(1),
        d: coastalReading.d.toFixed(1),
        HShoaled: coastalReading.HShoaled.toFixed(2),
        HBreaker: coastalReading.HBreaker.toFixed(2),
        method: coastalReading.method,
        Ks: coastalReading.Ks.toFixed(3), Kr: coastalReading.Kr.toFixed(3),
        breaking: coastalReading.breaking, breakingCap: coastalReading.breakingCap.toFixed(2),
      });
    } else {
      console.log('[CoastalReading]', locationName, 'null (land / deep / no data)');
    }
  }, [coastalReading, locationName, currentLat, currentLng]);

  // P5.3 wind-quality debug log — flag-gated on ?windQualityDebug=1
  useEffect(() => {
    if (typeof window === 'undefined' || !window.location.search.includes('windQualityDebug=1')) return;
    const snDeg = coastalReading?.shoreNormalDeg ?? null;
    const windDir = currentConditions?.windDirection ?? null;
    if (snDeg != null && windDir != null) {
      const wq = windQuality(windDir, snDeg);
      const windToward = ((windDir + 180) % 360 + 360) % 360;
      console.log('[WindQuality]', locationName, {
        shoreNormalDeg: snDeg, windFromDeg: windDir, windToward,
        angle: wq.angle.toFixed(1), factor: wq.factor.toFixed(3), label: wq.label,
      });
    } else {
      console.log('[WindQuality]', locationName, { shoreNormalDeg: snDeg, windDir, note: 'chip suppressed' });
    }
  }, [coastalReading, currentConditions, locationName]);

  const forecastTableBlocks = useMemo(() => {
    if (!weatherData?.hourly?.time?.length) return [];
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
      const waveHeights = sliceIndexes.map(idx => weatherData.hourly.wave_height?.[idx] ?? 0);
      const wavePeriods = sliceIndexes.map(idx => weatherData.hourly.wave_period?.[idx] ?? 0);
      const windSpeeds = sliceIndexes.map(idx => weatherData.hourly.wind_speed_10m?.[idx] ?? 0);
      const windDirs = sliceIndexes.map(idx => weatherData.hourly.wind_direction_10m?.[idx] ?? 0);
      const visibilities = sliceIndexes.map(idx => weatherData.hourly.visibility?.[idx] || 10000);
      const swellHeights = sliceIndexes.map(idx => weatherData.hourly.swell_wave_height?.[idx] ?? 0);
      const swellPeriods = sliceIndexes.map(idx => weatherData.hourly.swell_wave_period?.[idx] ?? 0);
      const swellDirs = sliceIndexes.map(idx => weatherData.hourly.swell_wave_direction?.[idx] ?? 0);
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
        startIdx: start, endIdx: end - 1,
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

  const ALL_FORECAST_TABS: ForecastTab[] = ['mariner', 'wave_surfer', 'wind_surfer', 'kite_surfer', 'boogie_boarder', 'diver', 'beach'];
  // Filter forecast tabs to only those relevant to the user's onboarding persona
  const PERSONA_TAB_MAP: Record<OnboardingPersona, ForecastTab[]> = {
    mariner: ['mariner'],
    surfer: ['wave_surfer', 'wind_surfer', 'kite_surfer', 'boogie_boarder', 'beach'],
    diver: ['diver'],
    beachgoer: ['beach'],
  };
  const FORECAST_TABS: ForecastTab[] = useMemo(
    // Harden against the primaryPersona rename (Apr 2026): the onboarding
    // flow can now write more specific sport keys ("wave_surfer") that
    // aren't in PERSONA_TAB_MAP (which only has the four umbrella
    // categories). When the map lookup returns `undefined`, fall back to
    // the full tab set so the Dashboard doesn't crash with
    // "Cannot read properties of undefined (reading 'includes')".
    () => (persona ? (PERSONA_TAB_MAP[persona] ?? ALL_FORECAST_TABS) : ALL_FORECAST_TABS),
    [persona]
  );
  // Ensure the active tab is always valid for the current persona
  useEffect(() => {
    if (!Array.isArray(FORECAST_TABS) || FORECAST_TABS.length === 0) return;
    if (!FORECAST_TABS.includes(forecastTab)) {
      setForecastTab(FORECAST_TABS[0]);
    }
  }, [FORECAST_TABS, forecastTab]);
  const handleNextTab = () => {
    if (FORECAST_TABS.length === 0) return;
    const idx = FORECAST_TABS.indexOf(forecastTab);
    setForecastTab(FORECAST_TABS[(idx + 1) % FORECAST_TABS.length]);
  };
  const handlePrevTab = () => {
    if (FORECAST_TABS.length === 0) return;
    const idx = FORECAST_TABS.indexOf(forecastTab);
    setForecastTab(FORECAST_TABS[(idx - 1 + FORECAST_TABS.length) % FORECAST_TABS.length]);
  };

  const forecastTabLabel = (tab: ForecastTab): string => {
    const map: Record<ForecastTab, string> = {
      mariner:        t('forecast.marinerForecast'),
      wave_surfer:    t('forecast.waveSurferForecast'),
      wind_surfer:    t('forecast.windSurferForecast'),
      kite_surfer:    t('forecast.kiteForecast'),
      boogie_boarder: t('forecast.boogieBoarderForecast', "Boogie Boarder's Forecast"),
      diver:          t('forecast.diverForecast'),
      beach:          t('forecast.beachForecast'),
    };
    return map[tab];
  };

  const forecastTabPersona = (tab: ForecastTab): ActivityPersona | null => {
    const map: Partial<Record<ForecastTab, ActivityPersona>> = {
      wave_surfer:    ActivityPersona.WAVE_SURFER,
      wind_surfer:    ActivityPersona.WIND_SURFER,
      kite_surfer:    ActivityPersona.KITE_SURFER,
      boogie_boarder: ActivityPersona.BOOGIE_BOARDER,
      diver:          ActivityPersona.DIVER,
      beach:          ActivityPersona.BEACHGOER,
    };
    return map[tab] ?? null;
  };

  // Tsunami risk check moved to App.tsx for global banner + polling (Phase 5)

  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (!weatherData || !currentConditions) {
    if (!loading && !error) return <div className="p-8 text-center text-white/60">{t('common.noData')}</div>;
    return null;
  }

  return (
    <div className="px-5 space-y-6 pb-8 max-w-6xl mx-auto relative">

      {/* ─── Offline Fallback Banner ─── */}
      {isOfflineFallback && (
        <div className="flex items-center gap-2 px-4 py-2.5 -mx-5 bg-amber-500/15 border-b border-amber-500/30 text-amber-300 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {t('dashboard.offlineMode', 'Offline mode, showing last saved forecast')}
            {lastUpdated && (
              <span className="ml-1 text-amber-300/70">
                ({t('dashboard.savedAt', { time: format(lastUpdated, 'HH:mm, MMM d'), defaultValue: `saved ${format(lastUpdated, 'HH:mm, MMM d')}` })})
              </span>
            )}
          </span>
        </div>
      )}

      {/* ─── Location Pill (centered) ─── */}
      <div className="flex justify-center">
        <button id="tour-search-bar" onClick={onLocationClick} className="glass-panel flex items-center px-4 py-1.5 space-x-2 !rounded-full cursor-pointer hover:bg-white/20 transition-colors">
          <Navigation size={14} className="text-white" />
          <span className="text-sm font-semibold">{locationName}</span>
          <ChevronDown size={12} className="opacity-70" />
        </button>
      </div>

      {/* ─── Alert Banner (dynamic — driven by user thresholds via AlertContext) ─── */}
      {roughWeatherAlert && !isDismissed && (
        <div className={`${roughWeatherAlert.color} rounded-xl p-4 flex items-center gap-3 relative text-white shadow-lg mx-auto w-full max-w-2xl`}>
          <div className="shrink-0 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            <roughWeatherAlert.icon size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-base sm:text-lg leading-tight uppercase text-white/95">{roughWeatherAlert.title}</h2>
            <p className="text-xs sm:text-sm opacity-90 leading-snug mt-0.5">{roughWeatherAlert.message}</p>
          </div>
          <button
            onClick={dismiss}
            className="shrink-0 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            aria-label={t('common.close', 'Dismiss alert')}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ─── Dismissed alert recovery strip ─── */}
      {roughWeatherAlert && isDismissed && (
        <button
          onClick={resetDismiss}
          className="flex items-center gap-2 px-3 py-2 -mx-5 w-[calc(100%+2.5rem)] bg-amber-500/10 border-y border-amber-500/20 text-amber-300/80 text-xs hover:bg-amber-500/15 hover:text-amber-200 transition-colors text-left"
          aria-label={t('alerts.showDismissed', 'Show dismissed weather alert')}
        >
          <roughWeatherAlert.icon size={13} className="shrink-0" />
          <span className="font-medium">{roughWeatherAlert.title}</span>
          <span className="text-amber-300/40 mx-1">·</span>
          <span className="opacity-70">{t('alerts.tapToReview', 'Tap to review')}</span>
        </button>
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
            {preferences?.selectedModel && (
              <span className="text-xs text-cyan-400/70 bg-cyan-400/10 border border-cyan-400/20 rounded px-2 py-0.5 tabular-nums">
                {WEATHER_MODELS[preferences.selectedModel]?.name ?? preferences.selectedModel}
              </span>
            )}
            <span className="text-white/30">•</span>
            <span className="tabular-nums">{weatherData.latitude.toFixed(4)}°N, {weatherData.longitude.toFixed(4)}°E</span>
            <span className="text-white/30">•</span>
            {format(new Date(), 'EEE, MMM d')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="glass-inner flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/20 transition-colors border border-white/10"
            aria-label={t('dashboard.alertConfig')}
          >
            <Settings size={16} aria-hidden="true" />
            <span className="text-xs font-bold hidden sm:inline" aria-hidden="true">{t('dashboard.alertConfig')}</span>
          </button>
        </div>
      </div>

      {/* ─── Alert Config Modal (standalone — uses AlertContext) ─── */}
      <AlertConfigModal isOpen={showSettings} onClose={() => setShowSettings(false)} currentLat={currentLat} currentLng={currentLng} />

      {/* ─── Activity Report (Persona-filtered Grid with Scores) ─── */}
      <section id="tour-dashboard-scores">
        <h3 className="text-sm font-semibold text-white/90 mb-3 uppercase tracking-wider flex items-center"><Flag size={13} className="mr-2" /> {t('activity.report')}</h3>
        {(() => {
          const ALL_CARDS: { persona: ActivityPersona; icon: typeof Sailboat; iconColor: string; labelKey: string }[] = [
            { persona: ActivityPersona.SAILOR,         icon: Sailboat,  iconColor: 'text-white',     labelKey: 'activity.sailor.label' },
            { persona: ActivityPersona.WAVE_SURFER,    icon: Waves,     iconColor: 'text-teal-400',  labelKey: 'activity.waveSurfer.label' },
            { persona: ActivityPersona.WIND_SURFER,    icon: Wind,      iconColor: 'text-cyan-400',  labelKey: 'activity.windSurfer.label' },
            { persona: ActivityPersona.KITE_SURFER,    icon: Wind,      iconColor: 'text-sky-400',   labelKey: 'activity.kiteSurfer.label' },
            { persona: ActivityPersona.BOOGIE_BOARDER, icon: Activity,  iconColor: 'text-rose-400',  labelKey: 'activity.boogieBoarder.label' },
            { persona: ActivityPersona.DIVER,          icon: Anchor,    iconColor: 'text-blue-400',  labelKey: 'activity.diver.label' },
            { persona: ActivityPersona.BEACHGOER,      icon: Palmtree,  iconColor: 'text-amber-400', labelKey: 'activity.beachgoer.label' },
          ];

          // selectedActivities (from AlertConfigModal) takes priority.
          // Falls back to onboarding persona → card map, then all cards.
          let cards = ALL_CARDS;
          if (selectedActivities.length > 0) {
            cards = ALL_CARDS.filter(c => selectedActivities.includes(c.persona));
          } else if (persona) {
            const PERSONA_CARD_MAP: Record<OnboardingPersona, ActivityPersona[]> = {
              mariner: [ActivityPersona.SAILOR],
              surfer: [ActivityPersona.WAVE_SURFER, ActivityPersona.WIND_SURFER, ActivityPersona.KITE_SURFER, ActivityPersona.BOOGIE_BOARDER, ActivityPersona.BEACHGOER],
              diver: [ActivityPersona.DIVER],
              beachgoer: [ActivityPersona.BEACHGOER],
            };
            const allowed = PERSONA_CARD_MAP[persona] ?? null;
            if (Array.isArray(allowed) && allowed.length > 0) {
              cards = ALL_CARDS.filter(c => allowed.includes(c.persona));
            }
          }

          // Highest-scoring card gets featured treatment (only meaningful with 2+ cards)
          const topPersona = cards.length > 1 && activityScores
            ? cards.reduce((best, card) => {
                const bScore = activityScores[best.persona]?.overall ?? 0;
                const cScore = activityScores[card.persona]?.overall ?? 0;
                return cScore > bScore ? card : best;
              }, cards[0]).persona
            : null;

          // Body-scale labels per persona:
          //   WAVE_SURFER, BOOGIE_BOARDER: surf idiom (Knee-high, Overhead, etc.)
          //   BEACHGOER: safety framing (Calm, Mild, Moderate, Rough, Dangerous)
          //   WIND_SURFER, KITE_SURFER, SAILOR, DIVER: no label — body scale misleads
          const SURF_SCALE_PERSONAS = new Set([
            ActivityPersona.WAVE_SURFER,
            ActivityPersona.BOOGIE_BOARDER,
          ]);

          // Single card: horizontal strip — never a lone grid cell
          if (cards.length === 1) {
            const { persona: cardPersona, icon: Icon, iconColor, labelKey } = cards[0];
            const score = activityScores?.[cardPersona];
            const bw = bestWindows?.[cardPersona];
            // Body-scale label: surf idiom for WAVE_SURFER/BOOGIE_BOARDER;
            // safety framing for BEACHGOER; null for all other personas.
            // Input is K-G HBreaker, NOT offshore Hs.
            const isSurfScale = SURF_SCALE_PERSONAS.has(cardPersona);
            const isBeachScale = cardPersona === ActivityPersona.BEACHGOER;
            const bodyScaleText: string | null = coastalReading
              ? isSurfScale
                ? waveScaleLabel(coastalReading.HBreaker)
                : isBeachScale
                  ? beachgoerSafetyLabel(coastalReading.HBreaker)
                  : null
              : null;
            // For surf labels: key via waveScaleI18nKey. For beach safety: key IS the label.
            const bodyScaleI18nKey: string | null = bodyScaleText
              ? isSurfScale
                ? waveScaleI18nKey(waveScaleLabel(coastalReading!.HBreaker))
                : bodyScaleText
              : null;
            return (
              <div
                className="glass-panel p-4 flex items-center gap-4 cursor-pointer hover:bg-white/5 hover:border-white/20 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                onClick={() => score && setBreakdownPersona(cardPersona)}
                onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && score) { e.preventDefault(); setBreakdownPersona(cardPersona); } }}
                role="button"
                tabIndex={score ? 0 : -1}
                aria-label={t('scoring.openBreakdown', { label: t(labelKey), defaultValue: `Open breakdown for ${t(labelKey)}` })}
              >
                <div className="w-10 h-10 rounded-lg glass-inner flex items-center justify-center shrink-0">
                  <Icon size={20} className={iconColor} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-sm uppercase tracking-wide">{t(labelKey)}</h4>
                  {score ? (
                    <>
                      <p className={`text-xs font-bold mt-0.5 ${score.color}`}>{t(`scoring.${score.label.toLowerCase()}`, score.label)}</p>
                      {bodyScaleI18nKey && bodyScaleText && (
                        <p className="text-[11px] text-teal-400/80 tabular-nums mt-0.5" dir="ltr">
                          {t(bodyScaleI18nKey, bodyScaleText)}
                        </p>
                      )}
                      {bw && (
                        <p className="text-[11px] text-white/50 mt-1">
                          {t('activity.bestWindow')}: {format(parseISO(bw.startTime), 'HH:mm')}–{format(parseISO(bw.endTime), 'HH:mm')}
                        </p>
                      )}
                      {score.hazard && (
                        <div className="flex items-center gap-1.5 mt-1 px-2 py-1 rounded-lg bg-red-950/40 border border-red-800/40">
                          <AlertTriangle size={11} className="shrink-0 text-red-400" />
                          <span className="text-[10px] text-red-300 leading-tight">
                            {score.hazard.label}
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-white/40">--</p>
                  )}
                </div>
                {score && (
                  <span className={`text-4xl font-bold tabular-nums leading-none shrink-0 ${score.color}`}>{score.overall}</span>
                )}
                {weatherData && (
                  <div className="hidden sm:block w-24 shrink-0">
                    <ActivityTimeline persona={cardPersona} weatherData={weatherData} startHourIndex={currentHourIndex} />
                  </div>
                )}
              </div>
            );
          }

          // Multiple cards: 2-3 column grid, top scorer visually distinguished
          return (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {cards.map(({ persona: cardPersona, icon: Icon, iconColor, labelKey }) => {
                const score = activityScores?.[cardPersona];
                const bw = bestWindows?.[cardPersona];
                const isFeatured = cardPersona === topPersona;
                // Body-scale: surf idiom for WAVE_SURFER/BOOGIE_BOARDER; safety for BEACHGOER.
                const isSurfScale2 = SURF_SCALE_PERSONAS.has(cardPersona);
                const isBeachScale2 = cardPersona === ActivityPersona.BEACHGOER;
                const bodyScale2Text: string | null = coastalReading
                  ? isSurfScale2
                    ? waveScaleLabel(coastalReading.HBreaker)
                    : isBeachScale2
                      ? beachgoerSafetyLabel(coastalReading.HBreaker)
                      : null
                  : null;
                const bodyScale2Key: string | null = bodyScale2Text
                  ? isSurfScale2
                    ? waveScaleI18nKey(waveScaleLabel(coastalReading!.HBreaker))
                    : bodyScale2Text
                  : null;
                return (
                  <div
                    key={cardPersona}
                    className={`glass-panel flex flex-col justify-between cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400/50 ${
                      isFeatured
                        ? 'col-span-2 sm:col-span-1 p-4 min-h-36 ring-1 ring-white/25 bg-white/[0.04] hover:bg-white/[0.07]'
                        : 'p-3 sm:p-4 min-h-30 hover:bg-white/5 hover:border-white/20'
                    }`}
                    onClick={() => score && setBreakdownPersona(cardPersona)}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && score) {
                        e.preventDefault();
                        setBreakdownPersona(cardPersona);
                      }
                    }}
                    role="button"
                    tabIndex={score ? 0 : -1}
                    aria-label={t('scoring.openBreakdown', { label: t(labelKey), defaultValue: `Open breakdown for ${t(labelKey)}` })}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className={`rounded-lg glass-inner flex items-center justify-center ${isFeatured ? 'w-10 h-10' : 'w-9 h-9'}`}>
                        <Icon size={isFeatured ? 20 : 18} className={iconColor} />
                      </div>
                      {score && (
                        <div className={`font-bold leading-none tabular-nums ${score.color} ${isFeatured ? 'text-3xl' : 'text-2xl'}`}>
                          {score.overall}
                        </div>
                      )}
                    </div>
                    <h4 className="font-bold text-xs uppercase tracking-wide mb-1">{t(labelKey)}</h4>
                    {score ? (
                      <>
                        <p className={`text-xs font-bold ${score.color}`}>{t(`scoring.${score.label.toLowerCase()}`, score.label)}</p>
                        {bodyScale2Key && bodyScale2Text && (
                          <p className="text-[11px] text-teal-400/80 tabular-nums mt-0.5" dir="ltr">
                            {t(bodyScale2Key, bodyScale2Text)}
                          </p>
                        )}
                        {bw && (
                          <p className="text-[11px] text-white/50 mt-1">
                            {t('activity.bestWindow')}: {format(parseISO(bw.startTime), 'HH:mm')}–{format(parseISO(bw.endTime), 'HH:mm')}
                          </p>
                        )}
                        {score.hazard && (
                          <div className="flex items-center gap-1.5 mt-1 px-2 py-1 rounded-lg bg-red-950/40 border border-red-800/40">
                            <AlertTriangle size={11} className="shrink-0 text-red-400" />
                            <span className="text-[10px] text-red-300 leading-tight">
                              {score.hazard.label}
                            </span>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-white/40">--</p>
                    )}
                    {weatherData && (
                      <ActivityTimeline
                        persona={cardPersona}
                        weatherData={weatherData}
                        startHourIndex={currentHourIndex}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </section>

      {/* ─── Explainable UI: Score Breakdown Modal ─── */}
      {(() => {
        const LABEL_MAP: Record<ActivityPersona, string> = {
          [ActivityPersona.SAILOR]:         t('activity.sailor.label'),
          [ActivityPersona.WAVE_SURFER]:    t('activity.waveSurfer.label'),
          [ActivityPersona.WIND_SURFER]:    t('activity.windSurfer.label'),
          [ActivityPersona.KITE_SURFER]:    t('activity.kiteSurfer.label'),
          [ActivityPersona.BOOGIE_BOARDER]: t('activity.boogieBoarder.label', 'Boogie Board'),
          [ActivityPersona.DIVER]:          t('activity.diver.label'),
          [ActivityPersona.BEACHGOER]:      t('activity.beachgoer.label'),
        };
        return (
          <ScoreBreakdownModal
            isOpen={breakdownPersona !== null}
            onClose={() => setBreakdownPersona(null)}
            activityLabel={breakdownPersona ? LABEL_MAP[breakdownPersona] : ''}
            score={breakdownPersona && activityScores ? activityScores[breakdownPersona] : null}
          />
        );
      })()}

      {/* ─── Conditions Grid ─── */}
      {/* Layout: 2 cols mobile/tablet → lg: 4+3 wrap (Coastal Break stays row-1) → xl: all 7 in one row */}
      <section className={`grid grid-cols-2 gap-4 ${showTide ? 'lg:grid-cols-4 xl:grid-cols-7' : 'lg:grid-cols-4 xl:grid-cols-6'}`}>
        {/* Wave Height */}
        <div className="glass-panel p-4 relative overflow-hidden flex flex-col justify-between">
          <h3 className="text-[10px] font-medium tracking-widest text-white/50 mb-2 uppercase relative z-10 flex items-center"><Activity size={11} className="mr-1.5" /> {t('weather.waveHeight')}</h3>
          <div className="relative z-10 mt-2">
            <div className="flex items-end mb-1"><span className="text-4xl font-bold leading-none tabular-nums">{(currentConditions.wave ?? 0).toFixed(1)}</span><span className="text-lg ml-1 mb-1 font-medium">m</span></div>
            <p className="text-[11px] text-accent tabular-nums">{t('weather.period')}: {(currentConditions.wavePeriod ?? 0).toFixed(1)}s</p>
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
          <h3 className="text-[10px] font-medium tracking-widest text-white/50 mb-2 uppercase relative z-10 flex items-center"><Wind size={11} className="mr-1.5" /> {t('weather.windSpeed')}</h3>
          <div className="relative z-10 mt-2">
            <div className="flex items-end mb-1"><span className="text-4xl font-bold leading-none tabular-nums">{currentConditions.wind.toFixed(0)}</span><span className="text-lg ml-1 mb-1 font-medium">km/h</span></div>
            <p className="text-[11px] text-white/60 flex items-center gap-1 whitespace-nowrap overflow-hidden"><Navigation size={10} className="shrink-0" style={{ transform: `rotate(${currentConditions.windDirection}deg)` }} /><span className="truncate min-w-0">{getCardinalDirection(currentConditions.windDirection)}</span><span className="tabular-nums shrink-0">({currentConditions.windDirection}°)</span></p>
          </div>
          <Wind className="absolute bottom-2 right-3 text-white/[0.07]" size={48} />
        </div>

        {/* Swell */}
        <div className="glass-panel p-4 relative overflow-hidden flex flex-col justify-between">
          <h3 className="text-[10px] font-medium tracking-widest text-white/50 mb-2 uppercase relative z-10 flex items-center"><Waves size={11} className="mr-1.5" /> {t('weather.swell')}</h3>
          <div className="relative z-10 mt-2">
            <div className="flex items-end mb-1"><span className="text-4xl font-bold leading-none tabular-nums">{(currentConditions.swell ?? 0).toFixed(1)}</span><span className="text-lg ml-1 mb-1 font-medium">m</span></div>
            <p className="text-[11px] text-accent tabular-nums flex items-center gap-1">
              <Navigation size={10} style={{ transform: `rotate(${currentConditions.swellDirection ?? 0}deg)` }} />
              {getCardinalDirection(currentConditions.swellDirection ?? 0)}
              <span className="text-white/30 mx-0.5">·</span>
              <span className="text-white/60">{(currentConditions.swellPeriod ?? 0).toFixed(1)}s</span>
            </p>
          </div>
          <Waves className="absolute bottom-2 right-4 text-white/[0.07]" size={56} />
        </div>

        {/* Coastal Dynamics — engine's breaking-wave height at the spot */}
        <div className="glass-panel p-4 relative overflow-hidden flex flex-col justify-between">
          <h3 className="text-[10px] font-medium tracking-widest text-white/50 mb-2 uppercase relative z-10 flex items-center">
            <Ruler size={11} className="mr-1.5 shrink-0 text-teal-400" />
            {t('coastalDynamics.label', 'Coastal Break')}
          </h3>
          {/* Value block is the second (and only other) flex child — matches sibling structure exactly. */}
          <div className="relative z-10 mt-2">
            {coastalReading ? (
              <>
                <div className="flex items-end mb-1">
                  <span className="text-4xl font-bold leading-none tabular-nums text-teal-300">
                    {coastalReading.HBreaker.toFixed(2)}
                  </span>
                  <span className="text-lg ml-1 mb-1 font-medium">m</span>
                </div>
                <p className="text-[11px] tabular-nums flex items-center gap-1 text-teal-400/80">
                  {t('coastalDynamics.methodKG', 'Komar-Gaughan')}
                  <span className="text-white/30 mx-0.5">·</span>
                  <span className="text-white/60">{coastalReading.T.toFixed(1)}s</span>
                </p>
              </>
            ) : (
              <>
                <div className="flex items-end mb-1">
                  <span className="text-4xl font-bold leading-none text-white/20">—</span>
                </div>
                <p className="text-[11px] text-white/30">
                  {t('coastalDynamics.noData', 'No nearshore data')}
                </p>
              </>
            )}
            {/* Wind-quality chip — only when shore normal is available */}
            {coastalReading?.shoreNormalDeg != null && currentConditions && (() => {
              const wq = windQuality(currentConditions.windDirection, coastalReading.shoreNormalDeg!);
              const chipColor =
                wq.label === 'offshore' ? 'bg-teal-500/20 text-teal-300 border-teal-500/30' :
                wq.label === 'onshore'  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                                          'bg-white/5 text-white/40 border-white/10';
              const chipLabel =
                wq.label === 'offshore' ? t('wind.offshore', 'Offshore') :
                wq.label === 'onshore'  ? t('wind.onshore',  'Onshore')  :
                                          t('wind.cross',     'Cross');
              return (
                <span className={`inline-flex items-center mt-2 px-2 py-0.5 rounded-full text-[10px] font-medium border ${chipColor}`}>
                  {chipLabel}
                </span>
              );
            })()}
          </div>
          {/* Caveat: absolutely positioned so it never adds a third flex child (keeps baseline grid). */}
          <span
            className="absolute bottom-1.5 left-4 text-[9px] text-white/20 leading-none z-10"
            title={t('coastalDynamics.caveat', 'Modelled estimate from swell + seafloor depth. Not a spot-calibrated forecast.')}
          >
            {t('coastalDynamics.caveatShort', 'Modelled · not a forecast')}
          </span>
          <Ruler className="absolute bottom-2 right-3 text-white/[0.05]" size={48} />
        </div>

        {/* Energy + Consistency — 7th card */}
        <EnergyConsistencyCard
          weatherData={weatherData}
          coastalReading={coastalReading}
          currentHourIndex={currentHourIndex}
        />

        {/* Water & Air Temperature — split peers: sea (left) | air (right) */}
        <div className="glass-panel p-4 relative overflow-hidden flex flex-col justify-between">
          <h3 className="text-[10px] font-medium tracking-widest text-white/50 mb-2 uppercase relative z-10 flex items-center">
            <Thermometer size={11} className="mr-1.5 shrink-0 text-orange-400" /> {t('weather.waterAir', 'Water & Air')}
          </h3>
          <div className="relative z-10 mt-2 flex gap-0">
            {/* Sea half */}
            <div className="flex-1 flex flex-col items-center">
              <div className="flex items-end justify-center mb-1">
                <span className="text-3xl font-bold leading-none tabular-nums">{currentConditions.seaTemp?.toFixed(0) ?? '--'}</span>
                <span className="text-base ml-0.5 mb-0.5 font-medium">°</span>
              </div>
              <p className="text-[10px] text-white/40 uppercase tracking-wider text-center">{t('weather.sea', 'Sea')}</p>
            </div>
            {/* Hairline divider */}
            <div className="w-px self-stretch bg-white/10 mx-3" />
            {/* Air half */}
            <div className="flex-1 flex flex-col items-center">
              <div className="flex items-end justify-center mb-1">
                <span className="text-3xl font-bold leading-none tabular-nums">{weatherData.general?.temperature.toFixed(0) ?? '--'}</span>
                <span className="text-base ml-0.5 mb-0.5 font-medium">°</span>
              </div>
              <p className="text-[10px] text-white/40 uppercase tracking-wider text-center">{t('weather.air', 'Air')}</p>
            </div>
          </div>
          <Droplets className="absolute bottom-2 right-3 text-white/[0.07]" size={48} />
        </div>

        {/* Tidal Trend — shown for mariners + divers; surfers/beachgoers defer to tide chart (D.3) */}
        {showTide && weatherData.tides && (
          <div className="glass-panel p-4 relative overflow-hidden flex flex-col justify-between">
            <h3 className="text-[10px] font-medium tracking-widest text-white/50 mb-2 uppercase relative z-10 flex items-center">
              <Waves size={11} className="mr-1.5" /> {t('forecast.tideHeight')}
            </h3>
            <div className="relative z-10 mt-2">
              <div className="flex items-end mb-1">
                <span className="text-4xl font-bold leading-none tabular-nums">
                  {weatherData.tides.currentHeight.toFixed(2)}
                </span>
                <span className="text-lg ml-1 mb-1 font-medium">m</span>
              </div>
              <p
                className={`text-[11px] tabular-nums flex items-center gap-1 ${weatherData.tides.rising ? 'text-accent' : 'text-amber-500'}`}
                title={weatherData.tides.rising ? t('forecast.rising') : t('forecast.falling')}
              >
                {weatherData.tides.rising
                  ? <ArrowUp size={11} className="shrink-0" />
                  : <ArrowDown size={11} className="shrink-0" />
                }
                {weatherData.tides.rising ? t('forecast.rising') : t('forecast.falling')}
              </p>
            </div>
            <Waves className="absolute bottom-2 right-4 text-white/[0.07]" size={56} />
          </div>
        )}
      </section>

      {/* ─── Wave Forecast Chart ─── */}
      <section
        onDoubleClick={() => setIsChartExpanded((v) => !v)}
        title={t('dashboard.doubleClickFullscreen', 'Double-click to toggle fullscreen')}
        className={isChartExpanded ? EXPANDED_SECTION_CLASS : 'glass-panel p-4 cursor-pointer'}
      >
        <div
          className="flex justify-between items-center mb-4 border-b border-white/10 pb-3"
          onDoubleClick={(e) => { e.stopPropagation(); setIsChartExpanded((v) => !v); }}
        >
          <h3 className="text-sm font-semibold text-white/90 uppercase tracking-wider flex items-center">
            {activeGraph === 'tide' && <Waves size={14} className="mr-1.5" />}
            {activeGraph === 'wave' && <Activity size={14} className="mr-1.5" />}
            {activeGraph === 'swell' && <Layers size={14} className="mr-1.5" />}
            {activeGraph === 'tide' && t('forecast.tideSchedule')}
            {activeGraph === 'wave' && t('forecast.waveForecast')}
            {activeGraph === 'swell' && t('forecast.swellForecast')}
          </h3>
          <div className="flex items-center gap-2">
            <div className="flex space-x-1 bg-black/20 p-1 rounded-lg" onDoubleClick={(e) => e.stopPropagation()}>
            <button onClick={() => setActiveGraph('wave')} className={`text-[10px] font-bold px-3 py-1 rounded transition-colors ${activeGraph === 'wave' ? 'bg-[var(--bg-button)] text-white shadow-sm' : 'bg-transparent text-white/60 hover:text-white hover:bg-white/10'}`}>{t('forecast.waves')}</button>
            <button onClick={() => setActiveGraph('swell')} className={`text-[10px] font-bold px-3 py-1 rounded transition-colors ${activeGraph === 'swell' ? 'bg-[var(--bg-button)] text-white shadow-sm' : 'bg-transparent text-white/60 hover:text-white hover:bg-white/10'}`}>{t('forecast.swell')}</button>
            <button onClick={() => setActiveGraph('tide')} className={`text-[10px] font-bold px-3 py-1 rounded transition-colors ${activeGraph === 'tide' ? 'bg-[var(--bg-button)] text-white shadow-sm' : 'bg-transparent text-white/60 hover:text-white hover:bg-white/10'}`}>{t('forecast.tides')}</button>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setIsChartExpanded((v) => !v); }}
              className="w-7 h-7 rounded-lg glass-inner flex items-center justify-center hover:bg-white/20 transition-colors"
              aria-label={isChartExpanded ? t('dashboard.exitFullscreen', 'Exit fullscreen') : t('dashboard.enterFullscreen', 'Enter fullscreen')}
              title={isChartExpanded ? t('dashboard.exitFullscreen', 'Exit fullscreen') : t('dashboard.enterFullscreen', 'Enter fullscreen')}
            >
              {isChartExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
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
              <div className="flex items-center"><span className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: 'var(--chart-primary)' }} /> {t('weather.height')} (m)</div>
              <div className="flex items-center"><span className="w-2 h-2 rounded-full bg-yellow-400 mr-1.5" /> {t('weather.period')} (s)</div>
            </>
          )}
        </div>

        <div className={`w-full relative ${isChartExpanded ? 'flex-1 min-h-[256px]' : 'h-64'}`}>
          {/* Tide tab: show empty state when sea_level_height_msl has no data (inland locations) */}
          {activeGraph === 'tide' && !weatherData.tides ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-white/30">
              <Waves size={28} />
              <p className="text-xs text-center">{t('forecast.noTideData', 'No tide data available for this location')}</p>
            </div>
          ) : (
            <div style={{ width: '100%', height: '100%', minHeight: 256 }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
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
                  <YAxis stroke="var(--chart-text)" fontSize={10} tickLine={false} axisLine={false} domain={['dataMin - 0.5', 'dataMax + 0.5']} unit=" m" />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.5rem', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff' }} formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(2)} m`, t('forecast.tideHeight')]} />
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
                      <Area yAxisId="left" type="monotone" dataKey="swellHeight" stroke="var(--chart-primary)" fill="var(--chart-primary)" fillOpacity={0.2} strokeWidth={2} name={t('weather.swellHeight')} />
                      <Line yAxisId="right" type="monotone" dataKey="swellPeriod" stroke="#facc15" strokeWidth={2} dot={false} name={t('weather.swellPeriod')} />
                    </>
                  )}
                </ComposedChart>
              )}
            </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      {/* ─── Mariner's Forecast Table ─── */}
      <section
        onDoubleClick={() => setIsTableExpanded((v) => !v)}
        title={t('dashboard.doubleClickFullscreen', 'Double-click to toggle fullscreen')}
        className={isTableExpanded ? EXPANDED_SECTION_CLASS : 'glass-panel overflow-hidden cursor-pointer'}
      >
        <div
          className="flex justify-between items-center p-4 border-b border-white/10 bg-black/10"
          onDoubleClick={(e) => { e.stopPropagation(); setIsTableExpanded((v) => !v); }}
        >
          <h3 className="text-sm font-semibold text-white/90 uppercase tracking-wider flex items-center">
            <Compass size={14} className="mr-1.5" />
            {forecastTabLabel(forecastTab)}
          </h3>
          <div className="flex items-center gap-2">
          {FORECAST_TABS.length > 1 && (
            <div className="flex space-x-2" onDoubleClick={(e) => e.stopPropagation()}>
              <button onClick={(e) => { e.stopPropagation(); handlePrevTab(); }} className="w-5 h-5 rounded glass-inner flex items-center justify-center hover:bg-white/20"><ChevronLeft size={10} /></button>
              <button onClick={(e) => { e.stopPropagation(); handleNextTab(); }} className="w-5 h-5 rounded glass-inner flex items-center justify-center hover:bg-white/20"><ChevronRight size={10} /></button>
            </div>
          )}
            <button
              onClick={(e) => { e.stopPropagation(); setIsTableExpanded((v) => !v); }}
              className="w-7 h-7 rounded-lg glass-inner flex items-center justify-center hover:bg-white/20 transition-colors"
              aria-label={isTableExpanded ? t('dashboard.exitFullscreen', 'Exit fullscreen') : t('dashboard.enterFullscreen', 'Enter fullscreen')}
              title={isTableExpanded ? t('dashboard.exitFullscreen', 'Exit fullscreen') : t('dashboard.enterFullscreen', 'Enter fullscreen')}
            >
              {isTableExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
          </div>
        </div>
        <div className={`w-full overflow-auto hide-scrollbar ${isTableExpanded ? 'flex-1 min-h-0' : ''}`}>
          <table className={`w-full text-left whitespace-nowrap ${isTableExpanded ? 'text-sm' : 'text-[10px]'}`}>
            <thead className="text-white/60 bg-black/20">
              <tr>
                <th className="px-4 py-2 font-medium">{t('table.period')}</th>
                {forecastTab === 'mariner' && (<><th className="px-4 py-2 font-medium">{t('table.pressure')}</th><th className="px-4 py-2 font-medium">{t('table.seaStatus')}</th><th className="px-4 py-2 font-medium">{t('table.wind')}</th><th className="px-4 py-2 font-medium">{t('table.visibility')}</th><th className="px-4 py-2 font-medium">{t('table.weather')}</th><th className="px-4 py-2 font-medium">{t('table.swell')}</th></>)}
                {forecastTab === 'wave_surfer' && (<><th className="px-4 py-2 font-medium">{t('table.waveHeight')}</th><th className="px-4 py-2 font-medium">{t('table.period')}</th><th className="px-4 py-2 font-medium">{t('table.swellHeight')}</th><th className="px-4 py-2 font-medium">{t('table.swellPeriod')}</th><th className="px-4 py-2 font-medium">{t('table.swellDir')}</th><th className="px-4 py-2 font-medium">{t('activity.score')}</th></>)}
                {forecastTab === 'wind_surfer' && (<><th className="px-4 py-2 font-medium">{t('table.windSpeed')}</th><th className="px-4 py-2 font-medium">{t('table.direction')}</th><th className="px-4 py-2 font-medium">{t('table.waveHeight')}</th><th className="px-4 py-2 font-medium">{t('weather.sea')}</th><th className="px-4 py-2 font-medium">{t('activity.score')}</th></>)}
                {forecastTab === 'kite_surfer' && (<><th className="px-4 py-2 font-medium">{t('table.windSpeed')}</th><th className="px-4 py-2 font-medium">{t('table.direction')}</th><th className="px-4 py-2 font-medium">{t('table.waveHeight')}</th><th className="px-4 py-2 font-medium">{t('table.weather')}</th><th className="px-4 py-2 font-medium">{t('activity.score')}</th></>)}
                {forecastTab === 'boogie_boarder' && (<><th className="px-4 py-2 font-medium">{t('table.waveHeight')}</th><th className="px-4 py-2 font-medium">{t('table.period')}</th><th className="px-4 py-2 font-medium">{t('table.swellHeight')}</th><th className="px-4 py-2 font-medium">{t('table.swellPeriod')}</th><th className="px-4 py-2 font-medium">{t('table.swellDir')}</th><th className="px-4 py-2 font-medium">{t('activity.score')}</th></>)}

                {forecastTab === 'diver' && (<><th className="px-4 py-2 font-medium">{t('table.visibility')}</th><th className="px-4 py-2 font-medium">{t('table.waveHeight')}</th><th className="px-4 py-2 font-medium">{t('weather.sea')}</th><th className="px-4 py-2 font-medium">{t('table.wind')}</th><th className="px-4 py-2 font-medium">{t('activity.score')}</th></>)}
                {forecastTab === 'beach' && (<><th className="px-4 py-2 font-medium">{t('table.temp')}</th><th className="px-4 py-2 font-medium">{t('table.uvIndex')}</th><th className="px-4 py-2 font-medium">{t('table.windSand')}</th><th className="px-4 py-2 font-medium">{t('table.seaState')}</th><th className="px-4 py-2 font-medium">{t('table.comfort')}</th></>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {forecastTableBlocks.map((row, idx) => {
                const persona = forecastTabPersona(forecastTab);
                const blockScore = persona && weatherData ? (() => {
                  const midIdx = row.startIdx + Math.floor((row.endIdx - row.startIdx) / 2);
                  const conds = extractHourlyConditions(weatherData, midIdx);
                  return scoreActivity(persona, conds);
                })() : null;
                return (
                <tr key={idx} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 font-bold">{row.period}<br /><span className="text-[11px] font-normal text-white/50">{row.date}</span></td>
                  {forecastTab === 'mariner' && (<><td className="px-4 py-3 text-white/80">{row.pressure}</td><td className="px-4 py-3 text-white/80">{row.seaStatus}</td><td className="px-4 py-3 font-bold">{row.wind}</td><td className="px-4 py-3 text-white/80">{row.visibility}</td><td className="px-4 py-3 flex items-center gap-1"><WeatherAnimation code={row.weatherCode} />{getWeatherConditionTranslated(row.weatherCode)}</td><td className="px-4 py-3 text-accent font-bold">{row.swell} ({row.swellHeight}m)</td></>)}
                  {forecastTab === 'wave_surfer' && (<><td className="px-4 py-3 font-bold text-blue-300">{row.waveHeight}</td><td className="px-4 py-3">{row.wavePeriod}s</td><td className="px-4 py-3 font-medium text-accent">{row.swellHeight}m</td><td className="px-4 py-3">{row.swellPeriod}s</td><td className="px-4 py-3">{row.swell}</td><td className="px-4 py-3">{blockScore && <span className={`font-bold ${blockScore.color}`}>{blockScore.overall}</span>}</td></>)}
                  {forecastTab === 'wind_surfer' && (<><td className="px-4 py-3 font-bold text-cyan-300">{row.wind.split('(')[1]?.replace(')', '') || row.wind}</td><td className="px-4 py-3">{row.wind.split('(')[0]}</td><td className="px-4 py-3">{row.waveHeight}</td><td className="px-4 py-3">{row.temp}°C</td><td className="px-4 py-3">{blockScore && <span className={`font-bold ${blockScore.color}`}>{blockScore.overall}</span>}</td></>)}
                  {forecastTab === 'kite_surfer' && (<><td className="px-4 py-3 font-bold text-cyan-300">{row.wind.split('(')[1]?.replace(')', '') || row.wind}</td><td className="px-4 py-3">{row.wind.split('(')[0]}</td><td className="px-4 py-3">{row.waveHeight}</td><td className="px-4 py-3 flex items-center gap-1"><WeatherAnimation code={row.weatherCode} />{getWeatherConditionTranslated(row.weatherCode)}</td><td className="px-4 py-3">{blockScore && <span className={`font-bold ${blockScore.color}`}>{blockScore.overall}</span>}</td></>)}
                  {forecastTab === 'boogie_boarder' && (<><td className="px-4 py-3 font-bold text-rose-300">{row.waveHeight}</td><td className="px-4 py-3">{row.wavePeriod}s</td><td className="px-4 py-3 font-medium text-accent">{row.swellHeight}m</td><td className="px-4 py-3">{row.swellPeriod}s</td><td className="px-4 py-3">{row.swell}</td><td className="px-4 py-3">{blockScore && <span className={`font-bold ${blockScore.color}`}>{blockScore.overall}</span>}</td></>)}

                  {forecastTab === 'diver' && (<><td className="px-4 py-3 text-white/80">{row.visibility}</td><td className="px-4 py-3">{row.waveHeight}</td><td className="px-4 py-3">{row.temp}°C</td><td className="px-4 py-3">{row.wind}</td><td className="px-4 py-3">{blockScore && <span className={`font-bold ${blockScore.color}`}>{blockScore.overall}</span>}</td></>)}
                  {forecastTab === 'beach' && (<><td className="px-4 py-3 font-bold text-yellow-300">{row.temp}°C</td><td className="px-4 py-3">{row.uv}</td><td className="px-4 py-3">{row.wind}</td><td className="px-4 py-3">{row.seaStatus.split('(')[0]}</td><td className="px-4 py-3">{(() => { const code = row.weatherCode, temp = parseFloat(row.temp); if (code >= 51 || code >= 80) return <span className="text-red-400 font-bold">{t('activity.beach.poorRain')}</span>; if (code === 3 && temp <= 20) return <span className="text-white/60">{t('activity.beach.coolCloudy')}</span>; if (code === 3) return <span className="text-white/60">{t('activity.beach.cloudy')}</span>; if (temp < 18) return <span className="text-blue-300">{t('activity.beach.cold')}</span>; if (temp < 22) return <span className="text-blue-200">{t('activity.beach.cool')}</span>; return <span className="text-green-400 font-bold">{t('activity.beach.great')}</span>; })()}</td></>)}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {FORECAST_TABS.length > 1 && (
          <div className="p-2 flex gap-1 justify-center">
            {FORECAST_TABS.map((tab) => (
              <button key={tab} onClick={() => setForecastTab(tab)} className={`w-2 h-2 rounded-full transition-colors ${forecastTab === tab ? 'bg-button' : 'bg-white/20 hover:bg-white/40'}`} />
            ))}
          </div>
        )}
      </section>

      {/* Phase 6 — Logbook. Mariner-only: knots/distance/speed are not relevant to surfers
          or beachgoers. Null persona → hidden (avoid confusing non-mariners with voyage data). */}
      {persona === 'mariner' && (
        <section>
          <VoyageLogbookCard />
        </section>
      )}

    </div>
  );
};

export default Dashboard;
