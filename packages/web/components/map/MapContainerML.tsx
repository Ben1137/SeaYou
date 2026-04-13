import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useMapContext } from './MapProvider';
import { Coordinate, PointForecast, DetailedPointForecast, fetchPointForecast, fetchHourlyPointForecast, fetchBulkPointForecast, fetchMarinaDetails, toTelHref } from '@seame/core';
import type { MarinaDetails } from '@seame/core';
import { MapPin, Wind, Layers, Waves, X, Clock, Activity, Droplets, ChevronDown, ChevronUp, Thermometer, CloudRain, Cloud, Navigation, Anchor, Compass } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { ColorScaleLegend } from './ColorScaleLegend';
import { COLOR_SCALES } from '../../utils/colorScales';
import { DARK_MAP_CONFIG } from '../../utils/particleConfig';

// MapLibre Native Layers (Phase 1)
import { PortsLayerML } from './layers/PortsLayerML';
import type { PortFeature } from './layers/PortsLayerML';
import { ReefLayerML } from './layers/ReefLayerML';
import { BathymetryLayerML } from './layers/BathymetryLayerML';
import { RainRadarLayerML } from './layers/RainRadarLayerML';
import { CoastlineLayerML } from './layers/CoastlineLayerML';
import { MarineAreasLayerML } from './layers/MarineAreasLayerML';

// Pro Navigation Engine — OpenSeaMap ENC overlay (Phase 8)
import { OpenSeaMapLayerML } from './layers/OpenSeaMapLayerML';

// Custom WebGL Layers (Phase 2)
import { WaveHeatmapLayerML } from './layers/WaveHeatmapLayerML';

// GPGPU Particle Layers (Phase 3 & 4)
import { WindParticleLayerML } from './layers/WindParticleLayerML';
import { CurrentParticleLayerML } from './layers/CurrentParticleLayerML';
import { WaveParticleLayerML } from './layers/WaveParticleLayerML';

// Sea Temperature Layer (Phase 5)
import { SeaTemperatureLayerML } from './layers/SeaTemperatureLayerML';

// Compound Layers (Phase 5+)
import { CompoundSeaTempCurrentsML } from './layers/CompoundSeaTempCurrentsML';
import { CompoundSeaTempWindML } from './layers/CompoundSeaTempWindML';

// Atmospheric Forecast Layers (Phase 6B)
import { AirTemperatureLayerML } from './layers/AirTemperatureLayerML';
import { PrecipitationLayerML } from './layers/PrecipitationLayerML';
import { CloudCoverLayerML } from './layers/CloudCoverLayerML';

// Activity-specific Layers (Phase 7)
import { SwellParticleLayerML } from './layers/SwellParticleLayerML';
import { DiveSuitabilityLayerML } from './layers/DiveSuitabilityLayerML';
import { ChopLevelLayerML } from './layers/ChopLevelLayerML';
import { GustDeltaLayerML } from './layers/GustDeltaLayerML';

// Tsunami Alert Layer (Phase 5 — GDACS)
import { ActiveTsunamiLayerML } from './layers/ActiveTsunamiLayerML';
import type { TsunamiRisk } from '@seame/core';

// Shared data hooks
import { useSharedMarineData } from '../../hooks/useSharedMarineData';
import { useSharedForecastGridData } from '../../hooks/useSharedForecastGridData';

// Types
type MapLayer = 'NONE' | 'WIND' | 'WAVE' | 'SWELL' | 'CURRENTS' | 'WIND_WAVE' | 'SIGNIFICANT_WAVE';
type AdvancedLayer =
  | 'NONE'
  | 'WIND_PARTICLES'
  | 'CURRENT_PARTICLES'
  | 'WAVE_HEATMAP'
  | 'SEA_TEMP'
  // Compound layers (Phase 5+)
  | 'SEA_TEMP_CURRENTS'
  | 'SEA_TEMP_WIND'
  // Phase 6B — atmospheric forecast layers
  | 'AIR_TEMP'
  | 'PRECIPITATION'
  | 'CLOUD_COVER'
  // Phase 7 — activity-specific layers
  | 'SWELL_PARTICLES'
  | 'DIVE_SUITABILITY'
  | 'CHOP_LEVEL'
  | 'GUST_DELTA';

import type { SavedLocation } from '@seame/core';

interface MapContainerMLProps {
  currentLocation: Coordinate;
  tsunamiRisks?: TsunamiRisk[];
  favoriteLocations?: SavedLocation[];
}

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

// Build popup HTML for the exploration tap-to-query feature (Issue 5)
function buildQueryPopupHTML(
  forecast: PointForecast,
  layer: AdvancedLayer,
  basicLayer: MapLayer
): string {
  const latStr = `${Math.abs(forecast.lat).toFixed(4)}\u00B0${forecast.lat >= 0 ? 'N' : 'S'}`;
  const lngStr = `${Math.abs(forecast.lng).toFixed(4)}\u00B0${forecast.lng >= 0 ? 'E' : 'W'}`;

  const rows: string[] = [];
  const isGeneral = layer === 'NONE' && basicLayer === 'NONE';
  const showWind = isGeneral || layer === 'WIND_PARTICLES' || layer === 'SEA_TEMP_WIND' || basicLayer === 'WIND';
  const showWaves = isGeneral || layer === 'WAVE_HEATMAP' || basicLayer === 'WAVE' || basicLayer === 'SIGNIFICANT_WAVE' || basicLayer === 'WIND_WAVE' || basicLayer === 'SWELL';
  const showCurrents = isGeneral || layer === 'CURRENT_PARTICLES' || layer === 'SEA_TEMP_CURRENTS' || basicLayer === 'CURRENTS';
  const showSeaTemp = layer === 'SEA_TEMP' || layer === 'SEA_TEMP_CURRENTS' || layer === 'SEA_TEMP_WIND';
  const showAirTemp = layer === 'AIR_TEMP';
  const showPrecip = layer === 'PRECIPITATION';
  const showCloud = layer === 'CLOUD_COVER';

  const row = (label: string, value: string, extra?: string) =>
    `<div class="seayou-popup-row">
      <span class="seayou-popup-label">${label}</span>
      <span class="seayou-popup-value">${value}${extra ? ` <span class="seayou-popup-extra">${extra}</span>` : ''}</span>
    </div>`;

  // Activity-specific layer popups
  if (layer === 'DIVE_SUITABILITY') {
    const waveP = Math.min(forecast.waveHeight / 2.5, 1) * 40;
    const currP = Math.min((forecast.currentSpeed || 0) / 1.5, 1) * 35;
    const tempB = forecast.seaTemp ? Math.max(0, Math.min((forecast.seaTemp - 15) / 15, 1)) * 25 : 0;
    const diveScore = Math.round(Math.max(0, 100 - waveP - currP + tempB));
    rows.push(row('Dive Score', `${diveScore}/100`));
    if (forecast.seaTemp) rows.push(row('Sea Temp', `${forecast.seaTemp.toFixed(1)}°C`));
    if (forecast.currentSpeed != null) rows.push(row('Current', `${forecast.currentSpeed.toFixed(2)} m/s`));
    rows.push(row('Waves', `${forecast.waveHeight.toFixed(1)} m`));
  } else if (layer === 'CHOP_LEVEL') {
    const windWaveH = forecast.windWaveHeight || 0;
    const swellH = forecast.swellHeight || 0;
    const total = windWaveH + swellH;
    const chopRatio = total > 0.01 ? (windWaveH / total) : 0;
    rows.push(row('Chop Ratio', `${(chopRatio * 100).toFixed(0)}%`));
    rows.push(row('Wind Waves', `${windWaveH.toFixed(1)} m`));
    rows.push(row('Swell', `${swellH.toFixed(1)} m`));
  } else if (layer === 'GUST_DELTA') {
    const gusts = forecast.windGusts || forecast.windSpeed * 1.3;
    const delta = Math.max(0, gusts - forecast.windSpeed);
    rows.push(row('Gust Delta', `${delta.toFixed(1)} km/h`));
    rows.push(row('Sustained', `${forecast.windSpeed.toFixed(1)} km/h`));
    rows.push(row('Gusts', `${gusts.toFixed(1)} km/h`));
  } else if (layer === 'SWELL_PARTICLES') {
    rows.push(row('Swell', `${forecast.swellHeight.toFixed(1)} m`, forecast.swellPeriod ? `${forecast.swellPeriod.toFixed(0)}s` : ''));
    rows.push(row('Direction', `${forecast.swellDirection}\u00B0`));
    if (forecast.waveHeight > 0.01) rows.push(row('Total Waves', `${forecast.waveHeight.toFixed(1)} m`));
  } else {
    // Standard layer popups
    if (showWind) rows.push(row('Wind', `${forecast.windSpeed.toFixed(1)} km/h`, `${forecast.windDirection}\u00B0`));
    if (showWaves && forecast.waveHeight > 0.01) rows.push(row('Waves', `${forecast.waveHeight.toFixed(1)} m`, forecast.wavePeriod ? `${forecast.wavePeriod.toFixed(0)}s` : ''));
    if (showCurrents && forecast.currentSpeed != null) rows.push(row('Current', `${forecast.currentSpeed.toFixed(2)} m/s`, `${forecast.currentDirection || 0}\u00B0`));
    if (showSeaTemp) {
      if (forecast.seaTemp != null) rows.push(row('Sea Temp', `${forecast.seaTemp.toFixed(1)}°C`));
      if (forecast.waveHeight > 0.01) rows.push(row('Waves', `${forecast.waveHeight.toFixed(1)} m`, ''));
      if (forecast.currentSpeed != null) rows.push(row('Current', `${forecast.currentSpeed.toFixed(2)} m/s`, ''));
    }
    if (showAirTemp || showPrecip || showCloud) {
      rows.push(row('Wind', `${forecast.windSpeed.toFixed(1)} km/h`, `${forecast.windDirection}\u00B0`));
    }
    if (rows.length === 0) {
      rows.push(row('Wind', `${forecast.windSpeed.toFixed(1)} km/h`, `${forecast.windDirection}\u00B0`));
      if (forecast.waveHeight > 0.01) rows.push(row('Waves', `${forecast.waveHeight.toFixed(1)} m`, ''));
    }
  }

  return `<div class="seayou-popup-body">
    <div class="seayou-popup-coords">${latStr}, ${lngStr}</div>
    <div class="seayou-popup-rows">${rows.join('')}</div>
    <button class="seayou-detail-btn">View Hourly Forecast</button>
  </div>`;
}

// ─── Marina popup builders (Phase 8 — Marina Booking) ───

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Skeleton popup shown immediately on port click while we wait for Google Places.
 */
function buildMarinaSkeletonHTML(port: PortFeature): string {
  const safeName = escapeHtml(port.name || 'Marina');
  return `<div class="seayou-popup-body seayou-marina-popup">
    <div class="seayou-marina-header">
      <div class="seayou-marina-name">${safeName}</div>
      <div class="seayou-marina-sub">Loading marina details\u2026</div>
    </div>
    <div class="seayou-marina-loading">
      <div class="seayou-marina-spinner"></div>
    </div>
  </div>`;
}

/**
 * Final popup with Google Places enrichment + Call-to-Book CTA.
 * Falls back gracefully if `details` is null.
 */
function buildMarinaPopupHTML(port: PortFeature, details: MarinaDetails | null): string {
  const safeName = escapeHtml(port.name || 'Marina');
  const websiteFromPort = (port.properties?.website as string | undefined) || undefined;

  const phone = details?.formatted_phone_number || details?.international_phone_number;
  const telHref = toTelHref(phone);
  const website = details?.website || websiteFromPort;
  const rating = details?.rating;
  const ratingCount = details?.user_ratings_total;
  const openNow = details?.opening_hours?.open_now;
  const address = details?.formatted_address;

  const rows: string[] = [];

  if (rating != null) {
    const stars = '\u2605'.repeat(Math.round(rating)) + '\u2606'.repeat(5 - Math.round(rating));
    rows.push(`<div class="seayou-marina-row">
      <span class="seayou-marina-stars">${stars}</span>
      <span class="seayou-marina-rating-text">${rating.toFixed(1)}${ratingCount ? ` (${ratingCount})` : ''}</span>
    </div>`);
  }

  if (openNow != null) {
    const cls = openNow ? 'seayou-marina-open' : 'seayou-marina-closed';
    const label = openNow ? 'Open now' : 'Closed';
    rows.push(`<div class="seayou-marina-row"><span class="${cls}">${label}</span></div>`);
  }

  if (address) {
    rows.push(`<div class="seayou-marina-row seayou-marina-address">${escapeHtml(address)}</div>`);
  }

  // CTA buttons
  const buttons: string[] = [];
  if (telHref && phone) {
    buttons.push(
      `<a href="${escapeHtml(telHref)}" class="seayou-marina-call-btn">\u260E Call Marina to Book<br/><span class="seayou-marina-phone">${escapeHtml(phone)}</span></a>`,
    );
  }
  if (website) {
    buttons.push(
      `<a href="${escapeHtml(website)}" target="_blank" rel="noopener" class="seayou-marina-website-btn">\uD83C\uDF10 Visit Website</a>`,
    );
  }

  // Empty-state when no Google details came back
  if (rows.length === 0 && buttons.length === 0) {
    rows.push(
      `<div class="seayou-marina-row seayou-marina-empty">No public booking details available for this marina.</div>`,
    );
  }

  return `<div class="seayou-popup-body seayou-marina-popup">
    <div class="seayou-marina-header">
      <div class="seayou-marina-name">${safeName}</div>
    </div>
    <div class="seayou-marina-rows">${rows.join('')}</div>
    ${buttons.length > 0 ? `<div class="seayou-marina-buttons">${buttons.join('')}</div>` : ''}
  </div>`;
}

export function MapContainerML({ currentLocation, tsunamiRisks = [], favoriteLocations = [] }: MapContainerMLProps) {
  const { t } = useTranslation();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const { setMap } = useMapContext();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Layer state
  const [activeLayer, setActiveLayer] = useState<MapLayer>('NONE');
  const [advancedLayer, setAdvancedLayer] = useState<AdvancedLayer>('NONE');
  const [isLayersPanelExpanded, setIsLayersPanelExpanded] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Refs to avoid stale closures inside map event listeners
  const advancedLayerRef = useRef<AdvancedLayer>(advancedLayer);
  const activeLayerRef = useRef<MapLayer>(activeLayer);

  // Popup ref for tap-to-query (single popup, reused)
  const queryPopupRef = useRef<maplibregl.Popup | null>(null);
  // Separate popup ref for marina detail popup so it doesn't fight tap-to-query
  const marinaPopupRef = useRef<maplibregl.Popup | null>(null);

  // Touch device detection (memoized once)
  const isTouchDevice = useRef(
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || navigator.maxTouchPoints > 0)
  );
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [loadingAdvancedLayer, setLoadingAdvancedLayer] = useState(false);
  const [gridForecasts, setGridForecasts] = useState<PointForecast[]>([]);

  // Shared marine data — single fetch for ocean/wave/current layers
  const isMarineLayerActive = (
    advancedLayer === 'WIND_PARTICLES' ||
    advancedLayer === 'CURRENT_PARTICLES' ||
    advancedLayer === 'WAVE_HEATMAP' ||
    advancedLayer === 'SEA_TEMP' ||
    advancedLayer === 'SEA_TEMP_CURRENTS' ||
    advancedLayer === 'SEA_TEMP_WIND' ||
    advancedLayer === 'SWELL_PARTICLES' ||
    advancedLayer === 'DIVE_SUITABILITY' ||
    advancedLayer === 'CHOP_LEVEL' ||
    advancedLayer === 'GUST_DELTA'
  );
  const sharedMarineData = useSharedMarineData(mapRef.current, isMarineLayerActive);

  // Shared forecast data — single fetch for atmospheric layers (Phase 6B)
  // Wind particles also use forecast data for global coverage (land + sea)
  const isForecastLayerActive = (
    advancedLayer === 'WIND_PARTICLES' ||
    advancedLayer === 'SEA_TEMP_WIND' ||
    advancedLayer === 'AIR_TEMP' ||
    advancedLayer === 'PRECIPITATION' ||
    advancedLayer === 'CLOUD_COVER'
  );
  const sharedForecastData = useSharedForecastGridData(mapRef.current, isForecastLayerActive);

  // GeoJSON / raster overlay state
  const [geoJSONLayers, setGeoJSONLayers] = useState({
    coastline: false,
    bathymetry: false,
    reefs: false,
    ports: false,
    marineAreas: false,
    radar: false,
    enc: false, // OpenSeaMap navigational charts
  });

  // Detail view state
  const [selectedPointDetail, setSelectedPointDetail] = useState<DetailedPointForecast | null>(null);
  const [isDetailSidebarOpen, setIsDetailSidebarOpen] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Marker refs for cleanup
  const currentLocationMarkerRef = useRef<maplibregl.Marker | null>(null);
  const gridMarkersRef = useRef<maplibregl.Marker[]>([]);

  // Keep refs in sync with state (prevents stale closures in map event handlers)
  useEffect(() => { advancedLayerRef.current = advancedLayer; }, [advancedLayer]);
  useEffect(() => { activeLayerRef.current = activeLayer; }, [activeLayer]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://api.maptiler.com/maps/019cdd5d-dd58-73ba-975e-3e2b92fca675/style.json?key=zyH9i3YVwxIqd1gD7bGK',
      center: [currentLocation.lng, currentLocation.lat],
      zoom: 8,
      attributionControl: { compact: true },
    });

    // Keep error logging — useful in all environments
    map.on('error', (e) => {
      console.error('[MapContainerML] Map error:', e.error);
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
      // Force a resize to ensure the canvas fills the container
      map.resize();

      mapRef.current = map;
      setMap(map);
      setMapLoaded(true);

      // Fix land/water contrast — MapTiler style has land at 7% and water at 8% brightness
      // which makes them indistinguishable. Brighten land to ~22% so continents are clear.
      try {
        const styleLayers = map.getStyle()?.layers ?? [];
        for (const layer of styleLayers) {
          const srcLayer = (layer as any)['source-layer'];
          if (layer.type === 'fill' && srcLayer === 'land') {
            map.setPaintProperty(layer.id, 'fill-color', '#252535');
          }
        }
      } catch { /* non-critical */ }

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

    // --- Exploration-only click handler: tap-to-query weather data ---
    map.on('click', async (e) => {
      // Close any existing query popup first
      if (queryPopupRef.current) {
        queryPopupRef.current.remove();
        queryPopupRef.current = null;
      }

      try {
        const forecast = await fetchPointForecast(e.lngLat.lat, e.lngLat.lng);

        const html = buildQueryPopupHTML(
          forecast,
          advancedLayerRef.current,
          activeLayerRef.current
        );

        const popup = new maplibregl.Popup({
          closeButton: true,
          closeOnClick: true,
          maxWidth: '220px',
          className: 'seayou-query-popup',
        })
          .setLngLat(e.lngLat)
          .setHTML(html)
          .addTo(map);

        queryPopupRef.current = popup;

        // Attach "View Hourly Forecast" button handler after DOM insertion
        requestAnimationFrame(() => {
          const btn = popup.getElement()?.querySelector('.seayou-detail-btn');
          if (btn) {
            btn.addEventListener('click', () => {
              popup.remove();
              queryPopupRef.current = null;
              handlePointClick(e.lngLat.lat, e.lngLat.lng);
            });
          }
        });
      } catch (err) {
        console.error('[MapContainerML] Tap-to-query fetch failed:', err);
      }
    });

    // --- Issue 5: Desktop hover tooltip (non-touch devices only) ---
    if (!isTouchDevice.current) {
      let hoverPopup: maplibregl.Popup | null = null;
      let hoverDebounce: ReturnType<typeof setTimeout> | null = null;
      let lastHoverLngLat: { lng: number; lat: number } | null = null;

      map.on('mousemove', (e) => {
        // Debounce: only fetch if cursor settles for 600ms
        lastHoverLngLat = { lng: e.lngLat.lng, lat: e.lngLat.lat };
        if (hoverDebounce) clearTimeout(hoverDebounce);

        hoverDebounce = setTimeout(async () => {
          if (!lastHoverLngLat) return;
          const { lng, lat } = lastHoverLngLat;

          try {
            const forecast = await fetchPointForecast(lat, lng);

            // Dismiss if cursor has moved significantly since we started
            if (lastHoverLngLat &&
                (Math.abs(lastHoverLngLat.lng - lng) > 0.05 ||
                 Math.abs(lastHoverLngLat.lat - lat) > 0.05)) return;

            if (hoverPopup) hoverPopup.remove();

            const latStr = `${Math.abs(forecast.lat).toFixed(2)}\u00B0${forecast.lat >= 0 ? 'N' : 'S'}`;
            const lngStr = `${Math.abs(forecast.lng).toFixed(2)}\u00B0${forecast.lng >= 0 ? 'E' : 'W'}`;

            let summary = `${forecast.windSpeed.toFixed(0)} km/h wind`;
            if (forecast.waveHeight > 0.01) summary += ` \u00B7 ${forecast.waveHeight.toFixed(1)}m waves`;

            hoverPopup = new maplibregl.Popup({
              closeButton: false,
              closeOnClick: false,
              maxWidth: '200px',
              className: 'seayou-hover-popup',
              offset: 15,
            })
              .setLngLat([lng, lat])
              .setHTML(`<div style="font-family:system-ui;font-size:11px;color:#cbd5e1;">
                <div style="color:#64748b;font-size:10px;margin-bottom:2px;">${latStr}, ${lngStr}</div>
                ${summary}
              </div>`)
              .addTo(map);
          } catch { /* silently ignore hover fetch errors */ }
        }, 600);
      });

      map.on('mouseout', () => {
        if (hoverDebounce) clearTimeout(hoverDebounce);
        lastHoverLngLat = null;
        if (hoverPopup) {
          hoverPopup.remove();
          hoverPopup = null;
        }
      });
    }

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
      }
    });

    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      setMap(null);
      gridMarkersRef.current.forEach(m => m.remove());
      gridMarkersRef.current = [];
      if (currentLocationMarkerRef.current) {
        currentLocationMarkerRef.current.remove();
      }
      if (queryPopupRef.current) {
        queryPopupRef.current.remove();
        queryPopupRef.current = null;
      }
      if (marinaPopupRef.current) {
        marinaPopupRef.current.remove();
        marinaPopupRef.current = null;
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

  // ─── Favorite location markers ───
  const favoriteMarkersRef = useRef<maplibregl.Marker[]>([]);
  const favDataRef = useRef<Map<string, PointForecast>>(new Map());

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Clear existing favorite markers
    favoriteMarkersRef.current.forEach((m) => m.remove());
    favoriteMarkersRef.current = [];

    if (favoriteLocations.length === 0) return;

    // Determine which metric to display based on active layers
    const getMetricForFav = (fc: PointForecast | undefined): string => {
      if (!fc) return '';
      // Primary layer takes precedence
      if (activeLayer === 'WIND') return `${Math.round(fc.windSpeed)} km/h`;
      if (activeLayer === 'WAVE' || activeLayer === 'SIGNIFICANT_WAVE') return `${fc.waveHeight.toFixed(1)}m`;
      if (activeLayer === 'SWELL') return `${(fc.swellHeight || 0).toFixed(1)}m`;
      if (activeLayer === 'CURRENTS') return `${(fc.currentSpeed || 0).toFixed(1)} m/s`;
      if (activeLayer === 'WIND_WAVE') return `${(fc.windWaveHeight || 0).toFixed(1)}m`;
      // Advanced layer fallback — sea temp variants show temperature as primary metric
      if (advancedLayer === 'SEA_TEMP' || advancedLayer === 'SEA_TEMP_CURRENTS' || advancedLayer === 'SEA_TEMP_WIND') return `${(fc.seaTemp ?? fc.temp ?? 0).toFixed(1)}°C`;
      if (advancedLayer === 'WIND_PARTICLES') return `${Math.round(fc.windSpeed)} km/h`;
      if (advancedLayer === 'WAVE_HEATMAP') return `${fc.waveHeight.toFixed(1)}m`;
      if (advancedLayer === 'CURRENT_PARTICLES') return `${(fc.currentSpeed || 0).toFixed(1)} m/s`;
      if (advancedLayer === 'AIR_TEMP') return `${fc.temp.toFixed(0)}°C`;
      if (advancedLayer === 'SWELL_PARTICLES') return `${(fc.swellHeight || 0).toFixed(1)}m`;
      return '';
    };

    const createMarkers = (forecasts?: PointForecast[]) => {
      // Build lookup by rounded coords
      const fcMap = new Map<string, PointForecast>();
      if (forecasts) {
        forecasts.forEach((fc) => {
          fcMap.set(`${fc.lat.toFixed(3)},${fc.lng.toFixed(3)}`, fc);
        });
      }
      favDataRef.current = fcMap;

      favoriteLocations.forEach((fav) => {
        const fc = fcMap.get(`${fav.lat.toFixed(3)},${fav.lng.toFixed(3)}`);
        const metric = getMetricForFav(fc);

        const el = document.createElement('div');
        el.className = 'favorite-location-marker';

        if (metric) {
          // Pill with heart + data value
          el.innerHTML = `
            <div style="display:flex; align-items:center; gap:4px; background:rgba(15,23,42,0.85); border:1px solid rgba(245,158,11,0.6); border-radius:12px; padding:2px 8px 2px 4px; backdrop-filter:blur(4px); white-space:nowrap;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#f59e0b" stroke="#fff" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              <span style="font-size:11px; font-weight:700; color:#fbbf24; text-shadow:0 1px 2px rgba(0,0,0,0.5);">${metric}</span>
            </div>`;
        } else {
          // Heart-only (no layer active)
          el.innerHTML = `
            <div style="display:flex; align-items:center; gap:3px; background:rgba(15,23,42,0.75); border:1px solid rgba(245,158,11,0.5); border-radius:12px; padding:3px 8px 3px 5px; backdrop-filter:blur(4px);">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#f59e0b" stroke="#fff" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              <span style="font-size:10px; font-weight:600; color:#e2e8f0; max-width:60px; overflow:hidden; text-overflow:ellipsis;">${fav.name.length > 10 ? fav.name.slice(0, 10) + '…' : fav.name}</span>
            </div>`;
        }
        el.style.cssText = 'cursor:pointer; filter:drop-shadow(0 2px 6px rgba(0,0,0,0.5));';

        const popup = new maplibregl.Popup({ offset: 20, closeButton: false })
          .setHTML(`<div style="font-weight:bold;font-size:13px;color:#0f172a;padding:2px 4px;">${fav.name}${metric ? `<br/><span style="font-size:11px;color:#475569;">${metric}</span>` : ''}</div>`);

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([fav.lng, fav.lat])
          .setPopup(popup)
          .addTo(map);

        favoriteMarkersRef.current.push(marker);
      });
    };

    // If any layer is active, fetch weather data for favorites
    const hasActiveLayer = activeLayer !== 'NONE' || advancedLayer !== 'NONE';
    if (hasActiveLayer && favoriteLocations.length > 0) {
      const coords = favoriteLocations.map((f) => ({ lat: f.lat, lng: f.lng }));
      fetchBulkPointForecast(coords)
        .then((forecasts) => {
          // Only update if map is still alive and these are still our favorites
          if (mapRef.current) createMarkers(forecasts);
        })
        .catch((err) => {
          console.warn('[MapContainerML] Failed to fetch favorite forecasts:', err);
          createMarkers(); // Fall back to no-data markers
        });
    } else {
      createMarkers(); // No layer active — just show hearts
    }

    return () => {
      favoriteMarkersRef.current.forEach((m) => m.remove());
      favoriteMarkersRef.current = [];
    };
  }, [favoriteLocations, mapLoaded, activeLayer, advancedLayer]);

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

  // Handle point click for detailed forecast
  const handlePointClick = useCallback(async (lat: number, lng: number) => {
    setLoadingDetail(true);
    setIsDetailSidebarOpen(true);

    try {
      const data = await fetchHourlyPointForecast(lat, lng);
      setSelectedPointDetail(data);
    } catch (e) {
      console.error('Failed to fetch point detail:', e);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  // Handle port click — opens an enriched marina-booking popup
  const handlePortClick = useCallback(async (port: PortFeature) => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // Tear down any open popups (tap-to-query + previous marina popup)
    if (queryPopupRef.current) {
      queryPopupRef.current.remove();
      queryPopupRef.current = null;
    }
    if (marinaPopupRef.current) {
      marinaPopupRef.current.remove();
      marinaPopupRef.current = null;
    }

    const [lng, lat] = port.coordinates;

    // 1. Show skeleton popup immediately so the tap feels responsive
    const popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: true,
      maxWidth: '280px',
      className: 'seayou-marina-popup-wrap',
    })
      .setLngLat([lng, lat])
      .setHTML(buildMarinaSkeletonHTML(port))
      .addTo(map);

    marinaPopupRef.current = popup;

    // 2. Read API key from Vite env (cast trick: core is compiled by tsc, web by Vite)
    const apiKey =
      (import.meta as unknown as { env?: Record<string, string> }).env
        ?.VITE_GOOGLE_PLACES_API_KEY ?? '';

    // 3. Fetch enriched details (returns null on missing key / no match / CORS)
    let details: MarinaDetails | null = null;
    try {
      details = await fetchMarinaDetails(lat, lng, port.name, apiKey);
    } catch (err) {
      console.warn('[MapContainerML] Marina details fetch failed:', err);
    }

    // 4. If the user already closed the popup, abort
    if (marinaPopupRef.current !== popup) return;

    // 5. Replace popup HTML with enriched content
    popup.setHTML(buildMarinaPopupHTML(port, details));
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
    <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, overflow: 'hidden' }}>
      {/* Map Container */}
      <div
        ref={mapContainerRef}
        style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: DARK_MAP_CONFIG.backgroundColor }}
      />

      {/* Layer Controls Panel */}
      <div className="absolute top-4 right-4 z-[400] glass-panel shadow-xl text-xs w-36 lg:w-44 animate-in fade-in slide-in-from-right-4 overflow-hidden">
        <button
          onClick={() => setIsLayersPanelExpanded(!isLayersPanelExpanded)}
          className="w-full flex items-center justify-between gap-2 p-2 border-b border-white/5 text-white/60 font-bold uppercase glass-inner hover:bg-white/10 transition-colors cursor-pointer"
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
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${activeLayer === 'NONE' ? 'bg-white/10 text-white' : 'text-white/40 hover:bg-white/10'}`}
            >
              <div className={`w-2 h-2 rounded-full border ${activeLayer === 'NONE' ? 'border-white bg-transparent' : 'border-white/40'}`}></div> {t('map.none')}
            </button>
            <button
              onClick={() => setActiveLayer('WIND')}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${activeLayer === 'WIND' ? 'bg-blue-600 text-white' : 'text-white/40 hover:bg-white/10'}`}
            >
              <Wind size={12} /> {t('map.wind')}
            </button>
            <button
              onClick={() => setActiveLayer('WAVE')}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${activeLayer === 'WAVE' ? 'bg-teal-600 text-white' : 'text-white/40 hover:bg-white/10'}`}
            >
              <Waves size={12} /> {t('map.sigWaves')}
            </button>
            <button
              onClick={() => setActiveLayer('WIND_WAVE')}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${activeLayer === 'WIND_WAVE' ? 'bg-cyan-600 text-white' : 'text-white/40 hover:bg-white/10'}`}
            >
              <Waves size={12} /> {t('map.windWaves')}
            </button>
            <button
              onClick={() => setActiveLayer('SWELL')}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${activeLayer === 'SWELL' ? 'bg-indigo-600 text-white' : 'text-white/40 hover:bg-white/10'}`}
            >
              <Waves size={12} /> {t('weather.swell')}
            </button>
            <button
              onClick={() => setActiveLayer('CURRENTS')}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${activeLayer === 'CURRENTS' ? 'bg-emerald-600 text-white' : 'text-white/40 hover:bg-white/10'}`}
            >
              <Activity size={12} /> {t('map.currents')}
            </button>

            {/* Advanced Layers Divider */}
            <div className="border-t border-white/5 my-2 pt-2">
              <div className="text-[10px] text-white/40 uppercase font-bold mb-1 px-2">{t('map.advancedLayers', 'Advanced Layers')}</div>
            </div>

            <button
              onClick={() => setAdvancedLayer(advancedLayer === 'WIND_PARTICLES' ? 'NONE' : 'WIND_PARTICLES')}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${advancedLayer === 'WIND_PARTICLES' ? 'bg-purple-600 text-white' : 'text-white/40 hover:bg-white/10'}`}
            >
              <Wind size={12} /> {t('map.windParticles', 'Wind Particles')}
            </button>
            <button
              onClick={() => setAdvancedLayer(advancedLayer === 'CURRENT_PARTICLES' ? 'NONE' : 'CURRENT_PARTICLES')}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${advancedLayer === 'CURRENT_PARTICLES' ? 'bg-violet-600 text-white' : 'text-white/40 hover:bg-white/10'}`}
            >
              <Activity size={12} /> {t('map.currentParticles', 'Current Particles')}
            </button>
            <button
              onClick={() => setAdvancedLayer(advancedLayer === 'WAVE_HEATMAP' ? 'NONE' : 'WAVE_HEATMAP')}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${advancedLayer === 'WAVE_HEATMAP' ? 'bg-pink-600 text-white' : 'text-white/40 hover:bg-white/10'}`}
            >
              <Waves size={12} /> {t('map.waveHeatmap', 'Wave Heatmap')}
            </button>
            <button
              onClick={() => setAdvancedLayer(advancedLayer === 'SEA_TEMP' ? 'NONE' : 'SEA_TEMP')}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${advancedLayer === 'SEA_TEMP' ? 'bg-orange-600 text-white' : 'text-white/40 hover:bg-white/10'}`}
            >
              <Droplets size={12} /> {t('map.seaTemperature', 'Sea Temperature')}
            </button>
            <button
              onClick={() => setAdvancedLayer(advancedLayer === 'SEA_TEMP_CURRENTS' ? 'NONE' : 'SEA_TEMP_CURRENTS')}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${advancedLayer === 'SEA_TEMP_CURRENTS' ? 'bg-gradient-to-r from-orange-600 to-violet-600 text-white' : 'text-white/40 hover:bg-white/10'}`}
            >
              <Activity size={12} /> {t('map.seaTempCurrents', 'Sea Temp + Currents')}
            </button>
            <button
              onClick={() => setAdvancedLayer(advancedLayer === 'SEA_TEMP_WIND' ? 'NONE' : 'SEA_TEMP_WIND')}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${advancedLayer === 'SEA_TEMP_WIND' ? 'bg-gradient-to-r from-orange-600 to-purple-600 text-white' : 'text-white/40 hover:bg-white/10'}`}
            >
              <Wind size={12} /> {t('map.seaTempWind', 'Sea Temp + Wind')}
            </button>
            <button
              onClick={() => setAdvancedLayer(advancedLayer === 'AIR_TEMP' ? 'NONE' : 'AIR_TEMP')}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${advancedLayer === 'AIR_TEMP' ? 'bg-red-500 text-white' : 'text-white/40 hover:bg-white/10'}`}
            >
              <Thermometer size={12} /> {t('map.airTemperature', 'Air Temperature')}
            </button>
            <button
              onClick={() => setAdvancedLayer(advancedLayer === 'PRECIPITATION' ? 'NONE' : 'PRECIPITATION')}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${advancedLayer === 'PRECIPITATION' ? 'bg-sky-600 text-white' : 'text-white/40 hover:bg-white/10'}`}
            >
              <CloudRain size={12} /> {t('map.precipitation', 'Precipitation')}
            </button>
            <button
              onClick={() => setAdvancedLayer(advancedLayer === 'CLOUD_COVER' ? 'NONE' : 'CLOUD_COVER')}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${advancedLayer === 'CLOUD_COVER' ? 'bg-slate-500 text-white' : 'text-white/40 hover:bg-white/10'}`}
            >
              <Cloud size={12} /> {t('map.cloudCover', 'Cloud Cover')}
            </button>

            {/* Activity-specific Layers (Phase 7) */}
            <div className="border-t border-white/5 my-2 pt-2">
              <div className="text-[10px] text-white/40 uppercase font-bold mb-1 px-2">{t('map.activityLayers') || 'Activity Layers'}</div>
            </div>
            <button
              onClick={() => setAdvancedLayer(advancedLayer === 'SWELL_PARTICLES' ? 'NONE' : 'SWELL_PARTICLES')}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${advancedLayer === 'SWELL_PARTICLES' ? 'bg-teal-600 text-white' : 'text-white/40 hover:bg-white/10'}`}
            >
              <Navigation size={12} /> {t('map.swellDirection') || 'Swell Direction'}
            </button>
            <button
              onClick={() => setAdvancedLayer(advancedLayer === 'DIVE_SUITABILITY' ? 'NONE' : 'DIVE_SUITABILITY')}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${advancedLayer === 'DIVE_SUITABILITY' ? 'bg-emerald-600 text-white' : 'text-white/40 hover:bg-white/10'}`}
            >
              <Anchor size={12} /> {t('map.diveSuitability') || 'Dive Suitability'}
            </button>
            <button
              onClick={() => setAdvancedLayer(advancedLayer === 'CHOP_LEVEL' ? 'NONE' : 'CHOP_LEVEL')}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${advancedLayer === 'CHOP_LEVEL' ? 'bg-fuchsia-600 text-white' : 'text-white/40 hover:bg-white/10'}`}
            >
              <Waves size={12} /> {t('map.chopLevel') || 'Chop Level'}
            </button>
            <button
              onClick={() => setAdvancedLayer(advancedLayer === 'GUST_DELTA' ? 'NONE' : 'GUST_DELTA')}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${advancedLayer === 'GUST_DELTA' ? 'bg-amber-600 text-white' : 'text-white/40 hover:bg-white/10'}`}
            >
              <Wind size={12} /> {t('map.gustDelta') || 'Gust Delta'}
            </button>

            {/* GeoJSON Overlay Layers Divider */}
            <div className="border-t border-white/5 my-2 pt-2">
              <div className="text-[10px] text-white/40 uppercase font-bold mb-1 px-2">{t('map.geoJSONLayers') || 'Map Overlays'}</div>
            </div>

            <button
              onClick={() => setGeoJSONLayers(prev => ({ ...prev, coastline: !prev.coastline }))}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${geoJSONLayers.coastline ? 'bg-cyan-700 text-white' : 'text-white/40 hover:bg-white/10'}`}
            >
              <MapPin size={12} /> {t('map.coastline') || 'Coastline'}
            </button>
            <button
              onClick={() => setGeoJSONLayers(prev => ({ ...prev, bathymetry: !prev.bathymetry }))}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${geoJSONLayers.bathymetry ? 'bg-blue-700 text-white' : 'text-white/40 hover:bg-white/10'}`}
            >
              <Droplets size={12} /> {t('map.bathymetry') || 'Bathymetry'}
            </button>
            <button
              onClick={() => setGeoJSONLayers(prev => ({ ...prev, reefs: !prev.reefs }))}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${geoJSONLayers.reefs ? 'bg-orange-600 text-white' : 'text-white/40 hover:bg-white/10'}`}
            >
              <Waves size={12} /> {t('map.reefs') || 'Coral Reefs'}
            </button>
            <button
              onClick={() => setGeoJSONLayers(prev => ({ ...prev, ports: !prev.ports }))}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${geoJSONLayers.ports ? 'bg-amber-600 text-white' : 'text-white/40 hover:bg-white/10'}`}
            >
              <Navigation size={12} /> {t('map.ports') || 'Ports'}
            </button>
            <button
              onClick={() => setGeoJSONLayers(prev => ({ ...prev, marineAreas: !prev.marineAreas }))}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${geoJSONLayers.marineAreas ? 'bg-purple-600 text-white' : 'text-white/40 hover:bg-white/10'}`}
            >
              <MapPin size={12} /> {t('map.marineAreas') || 'Marine Areas'}
            </button>
            <button
              onClick={() => setGeoJSONLayers(prev => ({ ...prev, radar: !prev.radar }))}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${geoJSONLayers.radar ? 'bg-sky-600 text-white' : 'text-white/40 hover:bg-white/10'}`}
            >
              <Droplets size={12} /> {t('map.rainRadar') || 'Rain Radar'}
            </button>
            <button
              onClick={() => setGeoJSONLayers(prev => ({ ...prev, enc: !prev.enc }))}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors ${geoJSONLayers.enc ? 'bg-rose-600 text-white' : 'text-white/40 hover:bg-white/10'}`}
              title="OpenSeaMap navigational marks (buoys, beacons, lighthouses, channel markers)"
            >
              <Compass size={12} /> {t('map.navCharts') || 'Navigational Charts (ENC)'}
            </button>
          </div>
          {(loadingGrid || sharedMarineData.loading || sharedForecastData.loading) && (
            <div className="pb-2 px-2 text-[10px] text-center text-blue-300 animate-pulse">{t('map.updatingForecast')}</div>
          )}
        </div>
      </div>

      {/* Detail Sidebar */}
      {isDetailSidebarOpen && (
        <div className="absolute top-0 right-0 bottom-0 w-96 glass-panel !rounded-none shadow-2xl border-l border-white/10 z-[500] flex flex-col animate-in slide-in-from-right duration-300">
          <div className="p-4 border-b border-white/10 flex justify-between items-center glass-inner">
            <div>
              <h2 className="font-bold text-white flex items-center gap-2"><Activity size={18} className="text-teal-400"/> {t('map.pointForecast')}</h2>
              <p className="text-[10px] text-white/40 uppercase tracking-wider">
                {selectedPointDetail ? `${selectedPointDetail.lat.toFixed(4)}N, ${selectedPointDetail.lng.toFixed(4)}E` : t('map.loadingData')}
              </p>
            </div>
            <button onClick={() => setIsDetailSidebarOpen(false)} className="p-1 hover:bg-white/10 rounded text-white/40 transition-colors"><X size={20}/></button>
          </div>

          {loadingDetail ? (
            <div className="flex-1 flex items-center justify-center text-blue-400 animate-pulse">
              <Clock size={32} className="animate-spin mr-2" /> {t('map.loadingData')}
            </div>
          ) : selectedPointDetail && (
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Wave & Swell Chart */}
              {(activeLayer === 'WAVE' || activeLayer === 'SWELL' || activeLayer === 'SIGNIFICANT_WAVE' || activeLayer === 'WIND_WAVE' || activeLayer === 'NONE') && (
                <div className="glass-inner rounded-xl p-4 border border-white/10 animate-in fade-in slide-in-from-right-8">
                  <h3 className="text-xs font-bold text-white/60 uppercase mb-4 flex items-center gap-2"><Waves size={14}/> {t('map.waveSwellHeight')}</h3>
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
                <div className="glass-inner rounded-xl p-4 border border-white/10 animate-in fade-in slide-in-from-right-10">
                  <h3 className="text-xs font-bold text-white/60 uppercase mb-4 flex items-center gap-2"><Wind size={14}/> {t('map.windSpeedChart')}</h3>
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
                <div className="glass-inner rounded-xl p-4 border border-white/10 animate-in fade-in slide-in-from-right-8">
                  <h3 className="text-xs font-bold text-white/60 uppercase mb-4 flex items-center gap-2"><Activity size={14}/> {t('map.currentVelocity')}</h3>
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

      {advancedLayer === 'SEA_TEMP_CURRENTS' && (
        <>
          <ColorScaleLegend
            scale={COLOR_SCALES.seaTemperature}
            unit="°C"
            title={t('map.legend.seaTemperature') || 'Sea Temperature'}
            position="bottomright"
          />
          <ColorScaleLegend
            scale={COLOR_SCALES.currentParticles}
            unit="m/s"
            title={t('map.legend.currentVelocity') || 'Current Velocity'}
            position="bottomleft"
          />
        </>
      )}

      {advancedLayer === 'SEA_TEMP_WIND' && (
        <>
          <ColorScaleLegend
            scale={COLOR_SCALES.seaTemperature}
            unit="°C"
            title={t('map.legend.seaTemperature') || 'Sea Temperature'}
            position="bottomright"
          />
          <ColorScaleLegend
            scale={COLOR_SCALES.windParticles}
            unit="km/h"
            title={t('map.legend.windSpeed') || 'Wind Speed'}
            position="bottomleft"
          />
        </>
      )}

      {advancedLayer === 'AIR_TEMP' && (
        <ColorScaleLegend
          scale={COLOR_SCALES.airTemperature}
          unit="°C"
          title={t('map.airTemperature', 'Air Temperature')}
          position="bottomright"
        />
      )}

      {advancedLayer === 'PRECIPITATION' && (
        <ColorScaleLegend
          scale={COLOR_SCALES.precipitation}
          unit="mm/h"
          title={t('map.precipitation', 'Precipitation')}
          position="bottomright"
        />
      )}

      {advancedLayer === 'CLOUD_COVER' && (
        <ColorScaleLegend
          scale={COLOR_SCALES.cloudCover}
          unit="%"
          title={t('map.cloudCover', 'Cloud Cover')}
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

      {/* Activity layer legends (Phase 7) */}
      {advancedLayer === 'SWELL_PARTICLES' && (
        <ColorScaleLegend
          scale={COLOR_SCALES.swellParticles}
          unit="m"
          title={t('map.legend.swellHeight') || 'Swell Height'}
          position="bottomright"
        />
      )}
      {advancedLayer === 'DIVE_SUITABILITY' && (
        <ColorScaleLegend
          scale={COLOR_SCALES.diveSuitability}
          unit="score"
          title={t('map.legend.diveSuitability') || 'Dive Suitability'}
          position="bottomright"
        />
      )}
      {advancedLayer === 'CHOP_LEVEL' && (
        <ColorScaleLegend
          scale={COLOR_SCALES.chopLevel}
          unit="ratio"
          title={t('map.legend.chopLevel') || 'Chop Level'}
          position="bottomright"
        />
      )}
      {advancedLayer === 'GUST_DELTA' && (
        <ColorScaleLegend
          scale={COLOR_SCALES.gustDelta}
          unit="km/h"
          title={t('map.legend.gustDelta') || 'Gust Delta'}
          position="bottomright"
        />
      )}

      {/* MapLibre Native Layers (Phase 1) */}
      <PortsLayerML
        visible={geoJSONLayers.ports}
        onPortClick={handlePortClick}
      />
      <ReefLayerML
        visible={geoJSONLayers.reefs}
        opacity={0.7}
      />
      <CoastlineLayerML
        visible={geoJSONLayers.coastline}
        opacity={0.8}
      />
      <MarineAreasLayerML
        visible={geoJSONLayers.marineAreas}
        opacity={0.5}
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

      {/* OpenSeaMap ENC overlay (Phase 8 — Pro Navigation) */}
      <OpenSeaMapLayerML
        visible={geoJSONLayers.enc}
        opacity={0.85}
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

      {/* Compound Layers (Phase 5+) */}
      {advancedLayer === 'SEA_TEMP_CURRENTS' && (
        <CompoundSeaTempCurrentsML
          visible
          tempOpacity={0.45}
          minTemp={0}
          maxTemp={35}
          sharedGridData={sharedMarineData.gridData}
        />
      )}

      {advancedLayer === 'SEA_TEMP_WIND' && (
        <CompoundSeaTempWindML
          visible
          tempOpacity={0.45}
          minTemp={0}
          maxTemp={35}
          sharedGridData={sharedMarineData.gridData}
          sharedForecastData={sharedForecastData.gridData}
        />
      )}

      {/* Atmospheric Forecast Layers (Phase 6B) — use sharedForecastData, not marine */}
      <AirTemperatureLayerML
        visible={advancedLayer === 'AIR_TEMP'}
        opacity={0.6}
        minTemp={-20}
        maxTemp={50}
        sharedGridData={sharedForecastData.gridData}
      />
      <PrecipitationLayerML
        visible={advancedLayer === 'PRECIPITATION'}
        opacity={0.7}
        maxPrecip={15}
        sharedGridData={sharedForecastData.gridData}
      />
      <CloudCoverLayerML
        visible={advancedLayer === 'CLOUD_COVER'}
        opacity={0.55}
        sharedGridData={sharedForecastData.gridData}
      />

      {/* Activity-specific Layers (Phase 7) */}
      <SwellParticleLayerML
        visible={advancedLayer === 'SWELL_PARTICLES'}
        particleCount={192}
        sharedGridData={sharedMarineData.gridData}
      />
      <DiveSuitabilityLayerML
        visible={advancedLayer === 'DIVE_SUITABILITY'}
        opacity={0.6}
        sharedGridData={sharedMarineData.gridData}
      />
      <ChopLevelLayerML
        visible={advancedLayer === 'CHOP_LEVEL'}
        opacity={0.55}
        sharedGridData={sharedMarineData.gridData}
      />
      <GustDeltaLayerML
        visible={advancedLayer === 'GUST_DELTA'}
        opacity={0.6}
        sharedGridData={sharedMarineData.gridData}
      />

      {/* Phase 5 — Tsunami event epicenters (always visible when alerts exist) */}
      <ActiveTsunamiLayerML
        risks={tsunamiRisks}
        visible={tsunamiRisks.length > 0}
      />

    </div>
  );
}

export default MapContainerML;
