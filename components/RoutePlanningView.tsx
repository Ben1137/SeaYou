/**
 * ROUTE PLANNING VIEW COMPONENT
 * Main interface for route planning and navigation
 */

import React, { useState, useEffect } from 'react';
import {
  Navigation,
  MapPin,
  Plus,
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
} from 'lucide-react';
import type { Route, NavigationState, NavigationAlert } from '../types/navigation.types';
import {
  generateRoute,
  addWaypoint,
  saveRoute,
  getSavedRoutes,
  deleteRoute,
  formatDistance,
  formatTime,
  formatBearing,
} from '../services/routePlanningService';
import {
  offlineNavigation,
} from '../services/offlineNavigationService';
import {
  analyzeRouteHazards,
  suggestHazardAvoidance,
  RouteAnalysis,
} from '../services/nauticalChartService';
import { VesselSettingsModal, VesselSettings } from './VesselSettingsModal';
import { HazardAlert } from './HazardAlert';

export const RoutePlanningView: React.FC = () => {
  const [route, setRoute] = useState<Route | null>(null);
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
  const [vesselSettings, setVesselSettings] = useState<VesselSettings>({
    draft: 2.0,
    name: 'My Vessel',
    type: 'sail',
  });

  useEffect(() => {
    const savedSettings = localStorage.getItem('vesselSettings');
    if (savedSettings) {
      setVesselSettings(JSON.parse(savedSettings));
    }
    loadSavedRoutes();
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

  const loadSavedRoutes = () => {
    setSavedRoutes(getSavedRoutes());
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
      const analysis = await analyzeRouteHazards(
        routeToAnalyze.waypoints,
        vesselSettings.draft,
        500 // 500m safety margin
      );
      
      setHazardAnalysis(analysis);
    } catch (error) {
      console.error('Error analyzing route:', error);
      alert('Failed to analyze route for hazards. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFixRoute = () => {
    if (!route || !hazardAnalysis) return;
    
    const criticalHazards = hazardAnalysis.hazards.filter(
      (h) => h.hazard.severity === 'critical'
    );
    
    if (criticalHazards.length === 0) return;
    
    let updatedRoute = { ...route };
    let hasUpdates = false;
    
    criticalHazards.forEach((hazardInfo) => {
      const segmentIndex = hazardInfo.waypointSegment;
      const start = route.waypoints[segmentIndex];
      const end = route.waypoints[segmentIndex + 1];
      
      const avoidanceWaypoint = suggestHazardAvoidance(
        hazardInfo.hazard,
        start,
        end,
        500
      );
      
      if (avoidanceWaypoint) {
        updatedRoute = addWaypoint(updatedRoute, avoidanceWaypoint, segmentIndex + 1);
        hasUpdates = true;
      }
    });
    
    if (hasUpdates) {
      setRoute(updatedRoute);
      analyzeRoute(updatedRoute);
      alert('Route updated with avoidance waypoints. Please verify with official charts.');
    } else {
      alert('Could not automatically find safe avoidance path. Manual rerouting required.');
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
    await analyzeRoute(newRoute);
  };

  const handleSaveRoute = () => {
    if (!route) return;
    
    const name = routeName || prompt('Enter route name:');
    if (name) {
      const routeToSave = { ...route, name };
      saveRoute(routeToSave);
      loadSavedRoutes();
      alert('Route saved!');
    }
  };

  const handleLoadRoute = (savedRoute: Route) => {
    setRoute(savedRoute);
    setShowSavedRoutes(false);
  };

  const handleDeleteRoute = (routeId: string) => {
    if (confirm('Delete this route?')) {
      deleteRoute(routeId);
      loadSavedRoutes();
    }
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
    <div className="min-h-screen bg-slate-950 p-4">
      {/* Header */}
      <div className="bg-slate-900 rounded-lg shadow-lg p-6 mb-4 border border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold flex items-center gap-2 text-white">
            <Navigation className="w-8 h-8 text-blue-400" />
            Marine Route Planner
          </h1>
          <button
            onClick={() => setShowSavedRoutes(!showSavedRoutes)}
            className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 border border-slate-700"
          >
            {showSavedRoutes ? 'Hide' : 'View'} Saved Routes
          </button>
        </div>
        
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setShowVesselSettings(true)}
            className="text-sm text-blue-400 hover:text-white underline flex items-center gap-1"
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
                  className="text-slate-400 hover:text-white"
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
        <div className="bg-slate-900 rounded-lg shadow-lg p-6 mb-4 border border-slate-800">
          <h2 className="text-xl font-bold mb-4 text-white">Saved Routes</h2>
          {savedRoutes.length === 0 ? (
            <p className="text-slate-400">No saved routes yet</p>
          ) : (
            <div className="space-y-3">
              {savedRoutes.map((savedRoute) => (
                <div
                  key={savedRoute.id}
                  className="flex items-center justify-between p-4 border border-slate-700 rounded-lg hover:bg-slate-800"
                >
                  <div className="flex-1">
                    <h3 className="font-semibold text-white">{savedRoute.name}</h3>
                    <p className="text-sm text-slate-400">
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
        <div className="bg-slate-900 rounded-lg shadow-lg p-6 mb-4 border border-slate-800">
          <h2 className="text-xl font-bold mb-4 text-white">Create New Route</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2 text-slate-300">
                Route Name (Optional)
              </label>
              <input
                type="text"
                value={routeName}
                onChange={(e) => setRouteName(e.target.value)}
                placeholder="e.g., Weekend Cruise"
                className="w-full p-3 border border-slate-700 rounded-lg bg-slate-950 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-slate-300">
                Start Location
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={startLocation}
                  onChange={(e) => setStartLocation(e.target.value)}
                  placeholder="Location name"
                  className="flex-1 p-3 border border-slate-700 rounded-lg bg-slate-950 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                  className="p-3 border border-slate-700 rounded-lg bg-slate-950 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <input
                  type="text"
                  value={startLon}
                  onChange={(e) => setStartLon(e.target.value)}
                  placeholder="Longitude"
                  className="p-3 border border-slate-700 rounded-lg bg-slate-950 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-slate-300">
                Destination
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={destLocation}
                  onChange={(e) => setDestLocation(e.target.value)}
                  placeholder="Location name"
                  className="flex-1 p-3 border border-slate-700 rounded-lg bg-slate-950 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                  className="p-3 border border-slate-700 rounded-lg bg-slate-950 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <input
                  type="text"
                  value={destLon}
                  onChange={(e) => setDestLon(e.target.value)}
                  placeholder="Longitude"
                  className="p-3 border border-slate-700 rounded-lg bg-slate-950 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-slate-300">
                Average Speed (knots)
              </label>
              <input
                type="number"
                value={averageSpeed}
                onChange={(e) => setAverageSpeed(parseFloat(e.target.value))}
                min="1"
                max="50"
                step="0.5"
                className="w-full p-3 border border-slate-700 rounded-lg bg-slate-950 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
        <div className="bg-slate-900 rounded-lg shadow-lg p-6 mb-4 border border-slate-800">
          
          {/* Hazard Analysis */}
          {isAnalyzing ? (
            <div className="p-4 mb-4 text-center text-slate-400">
              <div className="animate-spin inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mb-2"></div>
              <p>Analyzing route hazards...</p>
            </div>
          ) : hazardAnalysis && (
            <HazardAlert analysis={hazardAnalysis} onFixRoute={handleFixRoute} />
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
            <div className="bg-slate-800/50 p-4 rounded-lg">
              <p className="text-sm text-slate-400 mb-1">Distance</p>
              <p className="text-2xl font-bold text-white">
                {formatDistance(route.totalDistance)}
              </p>
            </div>
            <div className="bg-slate-800/50 p-4 rounded-lg">
              <p className="text-sm text-slate-400 mb-1">ETA</p>
              <p className="text-2xl font-bold text-white">
                {formatTime(route.estimatedTime * 60)}
              </p>
            </div>
            <div className="bg-slate-800/50 p-4 rounded-lg">
              <p className="text-sm text-slate-400 mb-1">Waypoints</p>
              <p className="text-2xl font-bold text-white">{route.waypoints.length}</p>
            </div>
            <div className="bg-slate-800/50 p-4 rounded-lg">
              <p className="text-sm text-slate-400 mb-1">Avg Speed</p>
              <p className="text-2xl font-bold text-white">{route.averageSpeed} kts</p>
            </div>
          </div>

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
        <div className="bg-slate-900 rounded-lg shadow-lg p-6 border border-slate-800">
          <h2 className="text-xl font-bold mb-4 text-white">Active Navigation</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-900/30 p-4 rounded-lg border border-blue-700/50">
              <div className="flex items-center gap-2 mb-2">
                <Compass className="w-5 h-5 text-blue-400" />
                <p className="text-sm text-slate-300">Heading</p>
              </div>
              <p className="text-2xl font-bold text-white">
                {formatBearing(navigationState.heading)}
              </p>
            </div>

            <div className="bg-green-900/30 p-4 rounded-lg border border-green-700/50">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-5 h-5 text-green-400" />
                <p className="text-sm text-slate-300">Speed</p>
              </div>
              <p className="text-2xl font-bold text-white">
                {navigationState.speed.toFixed(1)} kts
              </p>
            </div>

            <div className="bg-purple-900/30 p-4 rounded-lg border border-purple-700/50">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-5 h-5 text-purple-400" />
                <p className="text-sm text-slate-300">Distance</p>
              </div>
              <p className="text-2xl font-bold text-white">
                {formatDistance(navigationState.distanceToNext)}
              </p>
            </div>

            <div className="bg-orange-900/30 p-4 rounded-lg border border-orange-700/50">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-orange-400" />
                <p className="text-sm text-slate-300">ETA</p>
              </div>
              <p className="text-2xl font-bold text-white">
                {formatTime(navigationState.etaToNext)}
              </p>
            </div>
          </div>

          {navigationState.nextWaypoint && (
            <div className="bg-slate-800/50 p-6 rounded-lg mb-4 border border-slate-700">
              <p className="text-sm text-slate-400 mb-2">Next Waypoint</p>
              <h3 className="text-2xl font-bold mb-4 text-white">
                {navigationState.nextWaypoint.name}
              </h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Bearing</p>
                  <p className="text-xl font-bold text-white">
                    {formatBearing(navigationState.bearingToNext)}
                  </p>
                </div>
                <ChevronRight className="w-8 h-8 text-slate-600" />
              </div>
            </div>
          )}

          <div className="mb-4">
            <div className="flex justify-between text-sm text-slate-400 mb-2">
              <span>Progress</span>
              <span>{navigationState.progress.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-4 overflow-hidden">
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
