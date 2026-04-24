/**
 * ROUTE PLANNING VIEW COMPONENT
 * Main interface for route planning and navigation
 */

import React, { useState, useEffect } from 'react';
import {
  Navigation,
  MapPin,
  Map as MapIcon,
  Save,
  Play,
  Pause,
  Square,
  Trash2,
  Clock,
  Compass,
  Activity,
  AlertTriangle,
  Check,
  X,
  ChevronRight,
  Zap,
  CalendarClock,
} from 'lucide-react';
import type { Route, NavigationState, NavigationAlert, DepartureWindowScore } from '@seame/core';
import {
  generateRoute,
  saveRouteCloud,
  getSavedRoutesCloud,
  deleteRouteCloud,
  routeToGpx,
  downloadGpx,
  formatDistance,
  formatTime,
  formatBearing,
  offlineNavigation,
  analyzeRouteHazards,
  analyzeRouteSafety,
  optimizeRoute,
  recommendDepartureWindows,
  buildOptimizedRoute,
  RouteAnalysis,
} from '@seame/core';
import { fetchCoastlineData } from './map/layers/CoastlineLayerML';
import { useAlertConfig } from '../src/contexts/AlertContext';
import { VesselSettingsModal, VesselSettings, VESSEL_POLAR_DEFAULTS } from './VesselSettingsModal';
import { HazardAlert } from './HazardAlert';
import { LegalDisclaimerBanner } from './LegalDisclaimerBanner';
import { useRoute } from '../src/contexts/RouteContext';
import { PortSearchBar } from './route/PortSearchBar';

interface RoutePlanningViewProps {
  /** Switch the app view to the live map so the user can see / edit
   *  their route on top of the basemap. Optional — when absent the
   *  "Show on Map" button is hidden (keeps the component standalone). */
  onShowOnMap?: () => void;
}

export const RoutePlanningView: React.FC<RoutePlanningViewProps> = ({ onShowOnMap }) => {
  // Route lives in shared context so the map layers + form stay in sync.
  const { route, setRoute, removeWaypoint, safety, setSafety } = useRoute();
  const { persona } = useAlertConfig();
  const [isNavigating, setIsNavigating] = useState(false);
  const [navigationState, setNavigationState] = useState<NavigationState | null>(null);
  const [alerts, setAlerts] = useState<NavigationAlert[]>([]);
  const [savedRoutes, setSavedRoutes] = useState<Route[]>([]);
  const [showSavedRoutes, setShowSavedRoutes] = useState(false);
  const [routeName, setRouteName] = useState('');

  // Form states for creating route
  const [startLocation, setStartLocation] = useState('');
  const [startLat, setStartLat] = useState('');
  const [startLon, setStartLon] = useState('');
  const [destLocation, setDestLocation] = useState('');
  const [destLat, setDestLat] = useState('');
  const [destLon, setDestLon] = useState('');
  const [averageSpeed, setAverageSpeed] = useState(5);

  // Hazard analysis state
  const [hazardAnalysis, setHazardAnalysis] = useState<RouteAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showVesselSettings, setShowVesselSettings] = useState(false);

  // Phase 3 — isochrone optimizer + departure-window recommender
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizeStatus, setOptimizeStatus] = useState<string | null>(null);
  const [isScoringWindows, setIsScoringWindows] = useState(false);
  const [departureWindows, setDepartureWindows] = useState<DepartureWindowScore[] | null>(null);
  const [vesselSettings, setVesselSettings] = useState<VesselSettings>({
    draft: 2.0,
    name: 'My Vessel',
    type: 'sail',
    ...VESSEL_POLAR_DEFAULTS.sail,
  });

  useEffect(() => {
    const savedSettings = localStorage.getItem('vesselSettings');
    if (savedSettings) {
      // Merge saved settings with polar defaults so upgrading users
      // (pre-Phase 3) still get sensible baseline speed numbers.
      const parsed = JSON.parse(savedSettings) as Partial<VesselSettings>;
      const t = (parsed.type ?? 'sail') as VesselSettings['type'];
      const def = VESSEL_POLAR_DEFAULTS[t];
      setVesselSettings({
        draft: parsed.draft ?? 2.0,
        name: parsed.name ?? 'My Vessel',
        type: t,
        cruiseSpeed: parsed.cruiseSpeed ?? def.cruiseSpeed,
        upwindPenalty: parsed.upwindPenalty ?? def.upwindPenalty,
        maxHeadSea: parsed.maxHeadSea ?? def.maxHeadSea,
      });
    }
    void loadSavedRoutes();
    setupNavigationListeners();

    // Auto-init start location if empty
    if (!startLocation && !startLat && 'geolocation' in navigator) {
      handleUseCurrentLocation('start');
    }

    return () => {
      offlineNavigation.off('navigationUpdate');
      offlineNavigation.off('alert');
      offlineNavigation.off('waypointReached');
      offlineNavigation.off('destinationReached');
    };
  }, []);

  // Re-run hazard analysis whenever the shared route changes (e.g. user
  // added/moved/deleted a waypoint from the map) OR the active persona
  // changes (Phase 4 — different persona = different severity thresholds
  // and different departure-window ranking). Debounced so a drag doesn't
  // spam the Overpass API.
  useEffect(() => {
    if (!route) {
      setHazardAnalysis(null);
      // Stale departure windows no longer match the active persona.
      setDepartureWindows(null);
      return;
    }
    const handle = window.setTimeout(() => {
      analyzeRoute(route);
    }, 500);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.id, route?.waypoints.length, route?.totalDistance, persona]);

  const setupNavigationListeners = () => {
    offlineNavigation.on('navigationUpdate', (state: NavigationState) => {
      setNavigationState(state);
    });

    offlineNavigation.on('alert', (alert: NavigationAlert) => {
      setAlerts((prev) => [alert, ...prev].slice(0, 5));
      
      if (alert.autoClose) {
        setTimeout(() => {
          setAlerts((prev) => prev.filter((a) => a !== alert));
        }, 5000);
      }
    });

    offlineNavigation.on('destinationReached', () => {
      setIsNavigating(false);
    });
  };

  const loadSavedRoutes = async () => {
    // Phase 6 — cloud-aware loader; falls back to localStorage silently
    // when the user is anonymous or Supabase is misconfigured.
    const rows = await getSavedRoutesCloud();
    setSavedRoutes(rows);
  };

  const handleSaveVesselSettings = (settings: VesselSettings) => {
    setVesselSettings(settings);
    localStorage.setItem('vesselSettings', JSON.stringify(settings));
    setShowVesselSettings(false);
    
    // Re-analyze route if exists
    if (route) {
      analyzeRoute(route);
    }
  };

  const analyzeRoute = async (routeToAnalyze: Route) => {
    if (!vesselSettings) return;

    setIsAnalyzing(true);
    try {
      // Phase 1 — static OSM seamark hazards.
      const analysis = await analyzeRouteHazards(
        routeToAnalyze.waypoints,
        vesselSettings.draft,
        500 // 500m safety margin
      );
      setHazardAnalysis(analysis);

      // Phase 2 — weather-along-route + persona coloring + landmask + depth.
      // Coastline pulls from Natural Earth (cached by CoastlineLayerML).
      // If the user isn't viewing the map yet we still want the check — the
      // fetch is cheap and cached at module level.
      const coastline = await fetchCoastlineData();
      const safetyAnalysis = await analyzeRouteSafety(
        routeToAnalyze.waypoints,
        routeToAnalyze.averageSpeed,
        {
          persona,
          vesselDraftM: vesselSettings.draft,
          safetyMarginM: 2.0,
          coastline,
          departureTime: new Date(),
        },
      );
      setSafety(safetyAnalysis);
    } catch (error) {
      console.error('Error analyzing route:', error);
      alert('Failed to analyze route for hazards. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCreateRoute = async () => {
    const sLat = parseFloat(startLat);
    const sLon = parseFloat(startLon);
    const dLat = parseFloat(destLat);
    const dLon = parseFloat(destLon);

    if (isNaN(sLat) || isNaN(sLon) || isNaN(dLat) || isNaN(dLon)) {
      alert('Please enter valid coordinates');
      return;
    }

    const newRoute = generateRoute(
      { lat: sLat, lon: sLon, name: startLocation || 'Start' },
      { lat: dLat, lon: dLon, name: destLocation || 'Destination' },
      averageSpeed
    );

    if (routeName) {
      newRoute.name = routeName;
    }

    setRoute(newRoute);
    // Hazard analysis fires automatically via the route-change effect.
  };

  // Phase 3 — run the isochrone optimizer over the current route's
  // start/destination pair and replace the shared route with the
  // optimized polyline. Uses the vessel polar (cruise speed / upwind
  // penalty / head-sea cap) from VesselSettings.
  const handleOptimizeRoute = async () => {
    if (!route || route.waypoints.length < 2) return;
    const start = route.waypoints[0];
    const dest = route.waypoints[route.waypoints.length - 1];
    setIsOptimizing(true);
    setOptimizeStatus(null);
    try {
      const coastline = await fetchCoastlineData();
      const opt = await optimizeRoute(
        start,
        dest,
        {
          cruiseSpeed: vesselSettings.cruiseSpeed,
          upwindPenalty: vesselSettings.upwindPenalty,
          maxHeadSea: vesselSettings.maxHeadSea,
          isSailboat: vesselSettings.type === 'sail',
        },
        {
          coastline,
          departureTime: new Date(),
          persona, // Phase 4 — persona-aware cost function
        },
      );
      const next = buildOptimizedRoute(route, opt);
      setRoute(next);
      if (opt.fellBackToRhumb) {
        setOptimizeStatus(
          'Optimizer fell back to rhumb line — weather data unavailable for this area.',
        );
      } else {
        const rhumbEta = opt.rhumbEtaHours;
        const optEta = opt.etaHours;
        const savedMin = Math.round((rhumbEta - optEta) * 60);
        setOptimizeStatus(
          savedMin > 0
            ? `Optimized path saves ~${savedMin} min vs. rhumb (visited ${opt.diagnostics.cellsVisited} of ${opt.diagnostics.gridSize * opt.diagnostics.gridSize} cells).`
            : `Optimizer couldn't beat rhumb here — weather is favorable. ETA unchanged.`,
        );
      }
    } catch (e) {
      console.error('optimize failed', e);
      setOptimizeStatus('Optimizer failed — see console for details.');
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleFindBestDeparture = async () => {
    if (!route || route.waypoints.length < 2) return;
    setIsScoringWindows(true);
    try {
      const windows = await recommendDepartureWindows(
        route.waypoints,
        route.averageSpeed,
        { persona, horizonH: 48, stepHours: 3, topN: 3 },
      );
      setDepartureWindows(windows);
    } catch (e) {
      console.error('recommendDepartureWindows failed', e);
      setDepartureWindows([]);
    } finally {
      setIsScoringWindows(false);
    }
  };

  const handleSaveRoute = async () => {
    if (!route) return;

    const name = routeName || prompt('Enter route name:');
    if (!name) return;
    const routeToSave = { ...route, name };
    // Cloud-first save; falls back to localStorage when anonymous.
    const canonical = await saveRouteCloud(
      routeToSave,
      vesselSettings as unknown as Record<string, unknown>,
    );
    // Swap in the canonical row so subsequent edits reference the cloud uuid.
    setRoute(canonical);
    await loadSavedRoutes();
    alert('Route saved!');
  };

  const handleLoadRoute = (savedRoute: Route) => {
    setRoute(savedRoute);
    setShowSavedRoutes(false);
  };

  const handleDeleteRoute = async (routeId: string) => {
    if (confirm('Delete this route?')) {
      await deleteRouteCloud(routeId);
      await loadSavedRoutes();
    }
  };

  const handleExportRouteGpx = (savedRoute: Route) => {
    const xml = routeToGpx(savedRoute);
    downloadGpx(savedRoute.name || `route-${savedRoute.id}`, xml);
  };

  const handleStartNavigation = async () => {
    if (!route) return;

    try {
      await offlineNavigation.startNavigation(route);
      setIsNavigating(true);
    } catch (error) {
      alert('Failed to start navigation: ' + (error as Error).message);
    }
  };

  const handleStopNavigation = () => {
    offlineNavigation.stopNavigation();
    setIsNavigating(false);
    setNavigationState(null);
  };

  const handleUseCurrentLocation = async (type: 'start' | 'dest') => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude.toFixed(4);
          const lon = position.coords.longitude.toFixed(4);

          if (type === 'start') {
            setStartLat(lat);
            setStartLon(lon);
            setStartLocation('Current Location');
          } else {
            setDestLat(lat);
            setDestLon(lon);
            setDestLocation('Current Location');
          }
        },
        (error) => {
          alert('Failed to get location: ' + error.message);
        }
      );
    } else {
      alert('Geolocation not supported');
    }
  };

  const dismissAlert = (alert: NavigationAlert) => {
    setAlerts((prev) => prev.filter((a) => a !== alert));
  };

  return (
    <div className="min-h-screen bg-black/20 p-4 max-w-6xl mx-auto">
      <LegalDisclaimerBanner />
      {/* Header */}
      <div className="glass-panel p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold flex items-center gap-2 text-white">
            <Navigation className="w-8 h-8 text-blue-400" />
            Route Planner
          </h1>
          <div className="flex gap-2">
            {onShowOnMap && route && (
              <button
                onClick={onShowOnMap}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 flex items-center gap-2"
                title="View route on the live map — right-click / long-press to drop waypoints"
              >
                <MapIcon className="w-4 h-4" />
                Show on Map
              </button>
            )}
            <button
              onClick={() => setShowSavedRoutes(!showSavedRoutes)}
              className="px-4 py-2 glass-panel text-white rounded-lg hover:bg-white/10"
            >
              {showSavedRoutes ? 'Hide' : 'View'} Saved Routes
            </button>
          </div>
        </div>

        <div className="flex justify-end mb-4">
          <button
            onClick={() => setShowVesselSettings(true)}
            className="text-[10px] text-blue-400 hover:text-blue-300 font-medium underline underline-offset-2 flex items-center gap-1"
          >
            Vessel Settings: {vesselSettings.name} ({vesselSettings.draft}m draft)
          </button>
        </div>

        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="mb-4 space-y-2">
            {alerts.map((alert, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg flex items-center justify-between ${
                  alert.severity === 'warning'
                    ? 'bg-yellow-900/30 border border-yellow-700/50'
                    : alert.severity === 'success'
                    ? 'bg-green-900/30 border border-green-700/50'
                    : alert.severity === 'error'
                    ? 'bg-red-900/30 border border-red-700/50'
                    : 'bg-blue-900/30 border border-blue-700/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  {alert.severity === 'warning' && (
                    <AlertTriangle className="w-5 h-5 text-yellow-400" />
                  )}
                  {alert.severity === 'success' && (
                    <Check className="w-5 h-5 text-green-400" />
                  )}
                  <span className="font-semibold text-white">{alert.message}</span>
                </div>
                <button
                  onClick={() => dismissAlert(alert)}
                  className="text-white/40 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Saved Routes List */}
      {showSavedRoutes && (
        <div className="glass-panel p-6 mb-4">
          <h2 className="text-xl font-bold mb-4 text-white">Saved Routes</h2>
          {savedRoutes.length === 0 ? (
            <p className="text-white/40">No saved routes yet</p>
          ) : (
            <div className="space-y-3">
              {savedRoutes.map((savedRoute) => (
                <div
                  key={savedRoute.id}
                  className="flex items-center justify-between p-4 border border-white/10 rounded-lg hover:bg-white/10"
                >
                  <div className="flex-1">
                    <h3 className="font-semibold text-white">{savedRoute.name}</h3>
                    <p className="text-sm text-white/40">
                      {formatDistance(savedRoute.totalDistance)} • ETA:{' '}
                      {formatTime(savedRoute.estimatedTime * 60)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleLoadRoute(savedRoute)}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500"
                    >
                      Load
                    </button>
                    <button
                      onClick={() => handleExportRouteGpx(savedRoute)}
                      className="px-3 py-2 bg-slate-600 text-white rounded hover:bg-slate-500"
                      title="Export as GPX"
                    >
                      GPX
                    </button>
                    <button
                      onClick={() => handleDeleteRoute(savedRoute.id)}
                      className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Route Creation Form */}
      {!isNavigating && (
        <div className="glass-panel p-6 mb-4">
          <h2 className="text-xl font-bold mb-4 text-white">Create New Route</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2 text-white/80">
                Route Name (Optional)
              </label>
              <input
                type="text"
                value={routeName}
                onChange={(e) => setRouteName(e.target.value)}
                placeholder="e.g., Weekend Cruise"
                className="w-full p-3 border border-white/10 rounded-lg bg-black/20 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-white/80">
                Start Location
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={startLocation}
                  onChange={(e) => setStartLocation(e.target.value)}
                  placeholder="Location name"
                  className="flex-1 p-3 border border-white/10 rounded-lg bg-black/20 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <button
                  onClick={() => handleUseCurrentLocation('start')}
                  className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500"
                >
                  <MapPin className="w-5 h-5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={startLat}
                  onChange={(e) => setStartLat(e.target.value)}
                  placeholder="Latitude"
                  className="p-3 border border-white/10 rounded-lg bg-black/20 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <input
                  type="text"
                  value={startLon}
                  onChange={(e) => setStartLon(e.target.value)}
                  placeholder="Longitude"
                  className="p-3 border border-white/10 rounded-lg bg-black/20 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-white/80">
                Destination
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={destLocation}
                  onChange={(e) => setDestLocation(e.target.value)}
                  placeholder="Location name"
                  className="flex-1 p-3 border border-white/10 rounded-lg bg-black/20 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <button
                  onClick={() => handleUseCurrentLocation('dest')}
                  className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500"
                >
                  <MapPin className="w-5 h-5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={destLat}
                  onChange={(e) => setDestLat(e.target.value)}
                  placeholder="Latitude"
                  className="p-3 border border-white/10 rounded-lg bg-black/20 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <input
                  type="text"
                  value={destLon}
                  onChange={(e) => setDestLon(e.target.value)}
                  placeholder="Longitude"
                  className="p-3 border border-white/10 rounded-lg bg-black/20 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-white/80">
                Average Speed (knots)
              </label>
              <input
                type="number"
                value={averageSpeed}
                onChange={(e) => setAverageSpeed(parseFloat(e.target.value))}
                min="1"
                max="50"
                step="0.5"
                className="w-full p-3 border border-white/10 rounded-lg bg-black/20 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <button
              onClick={handleCreateRoute}
              className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 font-semibold flex items-center justify-center gap-2"
            >
              <Navigation className="w-5 h-5" />
              Create Route
            </button>
          </div>
        </div>
      )}

      {/* Route Display */}
      {route && (
        <div className="glass-panel bg-[#0F3A5E]/80 p-6 mb-4">

          {/* Hazard Analysis */}
          {isAnalyzing ? (
            <div className="p-4 mb-4 text-center text-white/40">
              <div className="animate-spin inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mb-2"></div>
              <p>Analyzing route hazards...</p>
            </div>
          ) : hazardAnalysis && (
            <HazardAlert analysis={hazardAnalysis} safety={safety} />
          )}

          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">{route.name}</h2>
            {!isNavigating && (
              <button
                onClick={handleSaveRoute}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Save
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="glass-inner p-4 rounded-lg">
              <p className="text-sm text-white/40 mb-1">Distance</p>
              <p className="text-2xl font-bold text-white">
                {formatDistance(route.totalDistance)}
              </p>
            </div>
            <div className="glass-inner p-4 rounded-lg">
              <p className="text-sm text-white/40 mb-1">ETA</p>
              <p className="text-2xl font-bold text-white">
                {formatTime(route.estimatedTime * 60)}
              </p>
            </div>
            <div className="glass-inner p-4 rounded-lg">
              <p className="text-sm text-white/40 mb-1">Waypoints</p>
              <p className="text-2xl font-bold text-white">{route.waypoints.length}</p>
            </div>
            <div className="glass-inner p-4 rounded-lg">
              <p className="text-sm text-white/40 mb-1">Avg Speed</p>
              <p className="text-2xl font-bold text-white">{route.averageSpeed} kts</p>
            </div>
          </div>

          {/* Phase 3/4 — Isochrone optimizer + persona-aware cost fn. */}
          {!isNavigating && (() => {
            // Phase 4 — persona label & cost-function description.
            const personaCopy: Record<
              string,
              { badge: string; optimizeLabel: string; hint: string; color: string }
            > = {
              surfer: {
                badge: 'Surf Mode',
                optimizeLabel: 'Optimize for Surf',
                hint: 'Biasing coastal cells with 8–14s swell + offshore wind.',
                color: 'text-cyan-300 bg-cyan-900/30 border-cyan-500/40',
              },
              diver: {
                badge: 'Dive Mode',
                optimizeLabel: 'Optimize for Dive',
                hint: 'Hard-filtering any cell with current > 0.5 m/s; prefers calm seas.',
                color: 'text-teal-200 bg-teal-900/30 border-teal-500/40',
              },
              beachgoer: {
                badge: 'Beach Mode',
                optimizeLabel: 'Optimize for Beach',
                hint: 'Extra penalty above 2 m swell — keeping the crossing comfy.',
                color: 'text-amber-200 bg-amber-900/30 border-amber-500/40',
              },
              mariner: {
                badge: 'Mariner',
                optimizeLabel: 'Optimize Route',
                hint: 'Fastest safe ETA — standard weather routing.',
                color: 'text-blue-200 bg-blue-900/30 border-blue-500/40',
              },
            };
            const active = personaCopy[persona ?? 'mariner'] ?? personaCopy.mariner;
            return (
            <div className="mb-6 p-4 rounded-lg border border-white/10 bg-black/20">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-white/90 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    Weather-Optimized Routing
                    <span
                      className={`ml-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded border ${active.color}`}
                      title="Cost function adapts to your onboarding persona — change it in Settings."
                    >
                      {active.badge}
                    </span>
                  </p>
                  <p className="text-[11px] text-white/50">{active.hint}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  onClick={handleOptimizeRoute}
                  disabled={isOptimizing || route.waypoints.length < 2}
                  className="py-2 px-3 rounded-lg bg-yellow-600 hover:bg-yellow-500 disabled:bg-white/10 disabled:text-white/40 text-white font-semibold flex items-center justify-center gap-2 text-sm"
                >
                  {isOptimizing ? (
                    <>
                      <div className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      Optimizing…
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      {active.optimizeLabel}
                    </>
                  )}
                </button>

                <button
                  onClick={handleFindBestDeparture}
                  disabled={isScoringWindows || route.waypoints.length < 2}
                  className="py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/10 disabled:text-white/40 text-white font-semibold flex items-center justify-center gap-2 text-sm"
                >
                  {isScoringWindows ? (
                    <>
                      <div className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      Scoring 48h…
                    </>
                  ) : (
                    <>
                      <CalendarClock className="w-4 h-4" />
                      Best Departure
                    </>
                  )}
                </button>
              </div>

              {optimizeStatus && (
                <p className="mt-2 text-xs text-yellow-200/90">{optimizeStatus}</p>
              )}

              {departureWindows && departureWindows.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <p className="text-xs font-bold text-indigo-300 uppercase tracking-wide mb-2">
                    Top 3 Departure Windows (next 48h)
                  </p>
                  <ul className="space-y-1.5">
                    {departureWindows.map((w, idx) => {
                      const rel = Math.round(
                        (w.departureTime.getTime() - Date.now()) / 3600000,
                      );
                      const relLabel =
                        rel <= 0 ? 'Now' : `+${rel}h`;
                      return (
                        <li
                          key={idx}
                          className="flex items-center justify-between gap-3 p-2 rounded bg-indigo-900/30 border border-indigo-500/20 text-xs"
                        >
                          <span className="font-mono text-indigo-200 w-16">
                            #{idx + 1} {relLabel}
                          </span>
                          <span className="flex-1 text-white/80 truncate">
                            {w.departureTime.toLocaleString(undefined, {
                              weekday: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}{' '}
                            — {w.summary}
                          </span>
                          <span className="text-white/60 tabular-nums">
                            ETA {formatTime(w.etaHours * 60)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {departureWindows && departureWindows.length === 0 && (
                <p className="mt-2 text-xs text-red-300/90">
                  No window scored — weather API may be offline.
                </p>
              )}
            </div>
            );
          })()}

          <PortSearchBar />

          {/* Waypoint list editor — reflects map edits live, allows
              deleting intermediate waypoints from the form side. */}
          {route.waypoints.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-white/70">
                  Waypoints ({route.waypoints.length})
                </p>
                <p className="text-[11px] text-white/40">
                  Tip: right-click / long-press the map to add · tap a pin to delete
                </p>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {route.waypoints.map((wp, i) => {
                  const isStart = wp.type === 'start';
                  const isEnd = wp.type === 'destination';
                  const badge = isStart ? 'Start' : isEnd ? 'End' : `WP ${i}`;
                  const badgeColor = isStart
                    ? 'bg-green-600/30 text-green-300 border-green-500/40'
                    : isEnd
                      ? 'bg-red-600/30 text-red-300 border-red-500/40'
                      : 'bg-blue-600/30 text-blue-300 border-blue-500/40';
                  return (
                    <div
                      key={wp.id}
                      className="flex items-center gap-3 p-2 rounded-lg bg-black/20 border border-white/10"
                    >
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold rounded border ${badgeColor}`}
                      >
                        {badge}
                      </span>
                      <span className="flex-1 text-sm text-white/80 truncate">
                        {wp.name || '(unnamed)'}
                      </span>
                      <span className="text-[11px] text-white/40 font-mono">
                        {wp.lat.toFixed(4)}, {wp.lon.toFixed(4)}
                      </span>
                      {!isStart && !isEnd && (
                        <button
                          onClick={() => removeWaypoint(i)}
                          className="p-1 text-red-400/70 hover:text-red-400 hover:bg-red-500/10 rounded"
                          title="Remove waypoint"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            {!isNavigating ? (
              <button
                onClick={handleStartNavigation}
                className="flex-1 py-3 bg-green-600 text-white rounded-lg hover:bg-green-500 font-semibold flex items-center justify-center gap-2"
              >
                <Play className="w-5 h-5" />
                Start Navigation
              </button>
            ) : (
              <button
                onClick={handleStopNavigation}
                className="flex-1 py-3 bg-red-600 text-white rounded-lg hover:bg-red-500 font-semibold flex items-center justify-center gap-2"
              >
                <Square className="w-5 h-5" />
                Stop
              </button>
            )}
          </div>
        </div>
      )}

      {showVesselSettings && (
        <VesselSettingsModal
          settings={vesselSettings}
          onSave={handleSaveVesselSettings}
          onClose={() => setShowVesselSettings(false)}
        />
      )}

      {/* Navigation Display */}
      {isNavigating && navigationState && (
        <div className="glass-panel p-6">
          <h2 className="text-xl font-bold mb-4 text-white">Active Navigation</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-900/30 p-4 rounded-lg border border-blue-700/50">
              <div className="flex items-center gap-2 mb-2">
                <Compass className="w-5 h-5 text-blue-400" />
                <p className="text-sm text-white/80">Heading</p>
              </div>
              <p className="text-2xl font-bold text-white">
                {formatBearing(navigationState.heading)}
              </p>
            </div>

            <div className="bg-green-900/30 p-4 rounded-lg border border-green-700/50">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-5 h-5 text-green-400" />
                <p className="text-sm text-white/80">Speed</p>
              </div>
              <p className="text-2xl font-bold text-white">
                {navigationState.speed.toFixed(1)} kts
              </p>
            </div>

            <div className="bg-teal-900/30 p-4 rounded-lg border border-teal-700/50">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-5 h-5 text-teal-400" />
                <p className="text-sm text-white/80">Distance</p>
              </div>
              <p className="text-2xl font-bold text-white">
                {formatDistance(navigationState.distanceToNext)}
              </p>
            </div>

            <div className="bg-orange-900/30 p-4 rounded-lg border border-orange-700/50">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-orange-400" />
                <p className="text-sm text-white/80">ETA</p>
              </div>
              <p className="text-2xl font-bold text-white">
                {formatTime(navigationState.etaToNext)}
              </p>
            </div>
          </div>

          {navigationState.nextWaypoint && (
            <div className="glass-inner p-6 rounded-lg mb-4 border border-white/10">
              <p className="text-sm text-white/40 mb-2">Next Waypoint</p>
              <h3 className="text-2xl font-bold mb-4 text-white">
                {navigationState.nextWaypoint.name}
              </h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/40">Bearing</p>
                  <p className="text-xl font-bold text-white">
                    {formatBearing(navigationState.bearingToNext)}
                  </p>
                </div>
                <ChevronRight className="w-8 h-8 text-white/40" />
              </div>
            </div>
          )}

          <div className="mb-4">
            <div className="flex justify-between text-sm text-white/40 mb-2">
              <span>Progress</span>
              <span>{navigationState.progress.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-4 overflow-hidden">
              <div
                className="bg-blue-500 h-4 rounded-full transition-all duration-500"
                style={{ width: `${navigationState.progress}%` }}
              ></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoutePlanningView;
