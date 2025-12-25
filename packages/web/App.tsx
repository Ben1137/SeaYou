import React, { useState, useEffect } from 'react';
import { ViewState, Location, UI_CONSTANTS, NAVIGATION_CONSTANTS } from '@seame/core';
import Dashboard from './components/Dashboard';
import MapComponent from './components/MapComponent';
import Atmosphere from './components/Atmosphere';
import { RoutePlanningView } from './components/RoutePlanningView';
import { CoastsMarinasView } from './components/CoastsMarinasView';
import { CacheStatusIndicator } from './src/components/CacheStatusIndicator';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { LanguageSelector } from './src/components/LanguageSelector';
import { LayoutDashboard, Map as MapIcon, Cloud, Navigation, Anchor, MapPin, Plus, Search, X, Check, Moon, Sun } from 'lucide-react';
import { searchLocations, reverseGeocode } from '@seame/core';
import { useCachedWeather } from './src/hooks/useCachedWeather';
import { useTheme } from './src/hooks/useTheme';
import { useTranslation } from 'react-i18next';
import './src/pwa'; // Register PWA service worker

// Default to a coastal location (Tel Aviv) if geo fails
const DEFAULT_LOC: Location = {
  id: 0,
  name: NAVIGATION_CONSTANTS.DEFAULT_LOCATION.name,
  lat: NAVIGATION_CONSTANTS.DEFAULT_LOCATION.lat,
  lng: NAVIGATION_CONSTANTS.DEFAULT_LOCATION.lng,
  country: NAVIGATION_CONSTANTS.DEFAULT_LOCATION.country
};

const App: React.FC = () => {
  const { resolvedTheme, toggleTheme, setAutoThemeData } = useTheme();
  const { t } = useTranslation();

  const [view, setView] = useState<ViewState>(ViewState.DASHBOARD);
  const [locations, setLocations] = useState<Location[]>([DEFAULT_LOC]);
  const [currentLocation, setCurrentLocation] = useState<Location>(DEFAULT_LOC);

  // Search State
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Use cached weather data with stale-while-revalidate pattern
  const {
    data: weatherData,
    isLoading,
    error,
    refetch,
    isStale,
    lastUpdated
  } = useCachedWeather({
    lat: currentLocation.lat,
    lon: currentLocation.lng,
    refetchInterval: UI_CONSTANTS.AUTO_REFRESH_INTERVAL_MS
  });

  // Update auto theme data when weather data changes
  useEffect(() => {
    if (weatherData?.general?.sunrise && weatherData?.general?.sunset) {
      setAutoThemeData(weatherData.general.sunrise, weatherData.general.sunset);
    } else if (weatherData?.daily?.sunrise?.[0] && weatherData?.daily?.sunset?.[0]) {
      setAutoThemeData(weatherData.daily.sunrise[0], weatherData.daily.sunset[0]);
    }
  }, [weatherData, setAutoThemeData]);


  useEffect(() => {
    // Try to get user's location automatically on first load
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          let newLoc: Location = {
            id: -1,
            name: t('app.currentLocation'),
            lat: latitude,
            lng: longitude,
          };

          try {
            const resolvedLocation = await reverseGeocode(latitude, longitude);
            if (resolvedLocation) {
              // Use the resolved location data
              newLoc = {
                ...resolvedLocation,
                id: -1, // Keep -1 as ID for current location
              };
            }
          } catch (e) {
            console.error("Failed to reverse geocode", e);
          }

          setLocations([newLoc]);
          setCurrentLocation(newLoc);
        },
        (err) => {
          // If geolocation fails or is denied, fall back to default location
          console.warn("Geolocation failed, using default location", err);
          if (err.code === 1) {
            console.info("Location permission denied. Please enable location services in your browser settings or use HTTPS.");
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  }, [t]);

  const handleLocateMe = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          let newLoc: Location = {
            id: -1, // ID for "Current Location"
            name: t('app.currentLocation'),
            lat: latitude,
            lng: longitude,
          };

          try {
            const resolvedLocation = await reverseGeocode(latitude, longitude);
            if (resolvedLocation) {
              // Use the resolved location data
              newLoc = {
                ...resolvedLocation,
                id: -1, // Keep -1 as ID for current location
              };
            }
          } catch (e) {
            console.error("Failed to reverse geocode", e);
          }

          setLocations(prev => {
              const filtered = prev.filter(l => l.id !== -1);
              return [newLoc, ...filtered];
          });
          setCurrentLocation(newLoc);
          setShowLocationModal(false);
        },
        (err) => {
          console.warn("Geolocation failed", err);
          if (err.code === 1) {
            alert(t('location.permissionDenied'));
          } else if (err.code === 2) {
            alert(t('location.unavailable'));
          } else if (err.code === 3) {
            alert(t('location.timeout'));
          }
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    const results = await searchLocations(searchQuery);
    setSearchResults(results);
    setIsSearching(false);
  };

  const addLocation = (loc: Location) => {
      if (!locations.some(l => l.id === loc.id)) {
          setLocations([...locations, loc]);
      }
      setCurrentLocation(loc);
      setShowLocationModal(false);
      setSearchQuery('');
      setSearchResults([]);
  };

  const switchLocation = (loc: Location) => {
      setCurrentLocation(loc);
      setShowLocationModal(false);
  };

  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        console.error('Root error boundary caught:', error, errorInfo);
      }}
    >
      <div className="flex flex-col h-screen bg-app-base text-primary overflow-hidden font-sans">

        {/* Top Bar */}
        <nav className="bg-card border-b border-app p-4 flex justify-between items-center z-10 shadow-md">
          <div className="flex items-center gap-2">
            <div className="bg-button p-2 rounded-lg">
              <Anchor size={24} className="text-white" />
            </div>
            <div className="hidden md:block">
               <h1 className="text-xl font-bold tracking-tight text-white">{t('app.title')}</h1>
               <p className="text-xs text-accent font-medium tracking-wider">{t('app.tagline')}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Language Selector */}
            <LanguageSelector />

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg bg-elevated hover:bg-button-secondary transition-colors border border-subtle"
              aria-label="Toggle theme"
            >
              {resolvedTheme === 'dark' ? (
                <Sun size={20} className="text-accent" />
              ) : (
                <Moon size={20} className="text-accent" />
              )}
            </button>

            {/* Location Picker */}
            <button
               onClick={() => setShowLocationModal(true)}
               className="flex items-center gap-2 bg-elevated hover:bg-button-secondary px-3 py-2 rounded-full border border-subtle transition-colors"
            >
                <MapPin size={16} className="text-red-400" />
                <span className="text-sm font-bold truncate max-w-[150px]">{currentLocation.name}</span>
                <div className="w-px h-4 bg-muted mx-1"></div>
                <Plus size={16} className="text-muted" />
            </button>
          </div>
        </nav>

      {/* Location Modal */}
      {showLocationModal && (
          <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center pt-20 px-4">
              <div className="bg-card w-full max-w-md rounded-2xl border border-subtle shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-8">
                  <div className="p-4 border-b border-app flex justify-between items-center bg-elevated">
                      <h3 className="font-bold text-white">{t('location.manage')}</h3>
                      <button onClick={() => setShowLocationModal(false)}><X className="text-muted hover:text-white" /></button>
                  </div>

                  <div className="p-4">
                      {/* Search Form */}
                      <form onSubmit={handleSearch} className="relative mb-6">
                          <input
                            type="text"
                            placeholder={t('location.search')}
                            className="w-full bg-app-base border border-subtle rounded-lg py-3 pl-10 pr-4 text-white focus:border-accent focus:outline-none"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                          />
                          <Search className="absolute left-3 top-3.5 text-muted" size={18} />
                          <button type="submit" disabled={isSearching} className="absolute right-2 top-2 bg-button px-3 py-1 rounded text-xs font-bold hover:bg-button-hover disabled:opacity-50">
                              {isSearching ? '...' : t('location.searchButton')}
                          </button>
                      </form>

                      {/* Current Location Button */}
                      <button
                        onClick={handleLocateMe}
                        className="w-full mb-4 bg-selected hover:bg-active text-accent border border-accent/30 rounded-lg p-3 flex items-center justify-center gap-2 font-bold transition-colors"
                      >
                        <MapPin size={18} /> {t('app.locateMe')}
                      </button>

                      {/* Search Results */}
                      {searchResults.length > 0 && (
                          <div className="mb-6 space-y-2">
                              <h4 className="text-xs text-muted uppercase font-bold mb-2">{t('location.searchResults')}</h4>
                              {searchResults.map(res => (
                                  <button key={res.id} onClick={() => addLocation(res)} className="w-full flex items-center justify-between p-3 rounded-lg bg-elevated hover:bg-button-secondary border border-subtle group transition-colors text-left">
                                      <div>
                                          <div className="font-bold text-white">{res.name}</div>
                                          <div className="text-xs text-secondary">{res.admin1} {res.country}</div>
                                      </div>
                                      <Plus size={18} className="text-accent opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </button>
                              ))}
                          </div>
                      )}

                      {/* Saved Locations */}
                      <div>
                          <h4 className="text-xs text-muted uppercase font-bold mb-2">{t('location.savedPlaces')}</h4>
                          <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                              {locations.map(loc => (
                                  <button
                                    key={loc.id}
                                    onClick={() => switchLocation(loc)}
                                    className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-left ${
                                        currentLocation.id === loc.id
                                        ? 'bg-selected border-accent/50'
                                        : 'bg-elevated border-subtle hover:bg-button-secondary'
                                    }`}
                                  >
                                      <div className="flex items-center gap-3">
                                          <MapPin size={18} className={currentLocation.id === loc.id ? "text-accent" : "text-muted"} />
                                          <span className={currentLocation.id === loc.id ? "text-white font-bold" : "text-secondary"}>{loc.name}</span>
                                      </div>
                                      {currentLocation.id === loc.id && <Check size={16} className="text-accent" />}
                                  </button>
                              ))}
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto relative scroll-smooth">
          {view === ViewState.DASHBOARD && (
            <ErrorBoundary
              resetKeys={[currentLocation.id, 'dashboard']}
              onReset={refetch}
              onError={(error, errorInfo) => {
                console.error('Dashboard error:', error, errorInfo);
              }}
            >
              <Dashboard weatherData={weatherData} loading={isLoading} error={error} locationName={currentLocation.name} onRetry={refetch} />
            </ErrorBoundary>
          )}
          {view === ViewState.MAP && (
            <ErrorBoundary
              resetKeys={[currentLocation.id, 'map']}
              onError={(error, errorInfo) => {
                console.error('Map error:', error, errorInfo);
              }}
            >
              <MapComponent currentLocation={{ lat: currentLocation.lat, lng: currentLocation.lng }} />
            </ErrorBoundary>
          )}
          {view === ViewState.ATMOSPHERE && (
            <ErrorBoundary
              resetKeys={[currentLocation.id, 'atmosphere']}
              onError={(error, errorInfo) => {
                console.error('Atmosphere error:', error, errorInfo);
              }}
            >
              <Atmosphere weatherData={weatherData} />
            </ErrorBoundary>
          )}
          {view === ViewState.ROUTE_PLANNING && (
            <ErrorBoundary
              resetKeys={['route-planning']}
              onError={(error, errorInfo) => {
                console.error('Route Planning error:', error, errorInfo);
              }}
            >
              <RoutePlanningView />
            </ErrorBoundary>
          )}
          {view === ViewState.COASTS_MARINAS && (
            <ErrorBoundary
              resetKeys={['coasts-marinas']}
              onError={(error, errorInfo) => {
                console.error('Coasts/Marinas error:', error, errorInfo);
              }}
            >
              <CoastsMarinasView />
            </ErrorBoundary>
          )}
        </main>

      {/* Bottom Navigation */}
      <div className="bg-card border-t border-app p-2 pb-6 z-20">
        <div className="flex justify-around items-center max-w-3xl mx-auto">
          <button
            onClick={() => setView(ViewState.DASHBOARD)}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
              view === ViewState.DASHBOARD ? 'text-accent bg-selected' : 'text-muted hover:text-secondary'
            }`}
          >
            <LayoutDashboard size={22} />
            <span className="text-xs font-medium">{t('nav.dashboard')}</span>
          </button>

          <button
            onClick={() => setView(ViewState.ATMOSPHERE)}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
              view === ViewState.ATMOSPHERE ? 'text-purple-400 bg-purple-500/10' : 'text-muted hover:text-secondary'
            }`}
          >
            <Cloud size={22} />
            <span className="text-xs font-medium">{t('nav.atmosphere')}</span>
          </button>

          <button
            onClick={() => setView(ViewState.MAP)}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
              view === ViewState.MAP ? 'text-accent bg-selected' : 'text-muted hover:text-secondary'
            }`}
          >
            <MapIcon size={22} />
            <span className="text-xs font-medium">{t('nav.map')}</span>
          </button>

          <button
            onClick={() => setView(ViewState.ROUTE_PLANNING)}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
              view === ViewState.ROUTE_PLANNING ? 'text-green-400 bg-green-500/10' : 'text-muted hover:text-secondary'
            }`}
          >
            <Navigation size={22} />
            <span className="text-xs font-medium">{t('nav.routes')}</span>
          </button>

          <button
            onClick={() => setView(ViewState.COASTS_MARINAS)}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
              view === ViewState.COASTS_MARINAS ? 'text-cyan-400 bg-cyan-500/10' : 'text-muted hover:text-secondary'
            }`}
          >
            <Anchor size={22} />
            <span className="text-xs font-medium">{t('nav.marinas')}</span>
          </button>
        </div>
      </div>

        {/* Cache Status Indicator (bottom-right) */}
        <CacheStatusIndicator />
      </div>
    </ErrorBoundary>
  );
};

export default App;