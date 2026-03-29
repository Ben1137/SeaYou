import React, { useState, useEffect } from 'react';
import { ViewState, Location, UI_CONSTANTS, NAVIGATION_CONSTANTS } from '@seame/core';
import Dashboard from './components/Dashboard';
import { MapProvider } from './components/map/MapProvider';
import { MapContainerML } from './components/map/MapContainerML';
import Atmosphere from './components/Atmosphere';
import { RoutePlanningView } from './components/RoutePlanningView';
import { CoastsMarinasView } from './components/CoastsMarinasView';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { LanguageSelector } from './src/components/LanguageSelector';
import { LayoutDashboard, Map as MapIcon, Cloud, Navigation, Anchor, MapPin, Plus, Search, X, Check, Moon, Sun, User, ChevronDown, Globe } from 'lucide-react';
import { searchLocations, reverseGeocode } from '@seame/core';
import { useCachedWeather } from './src/hooks/useCachedWeather';
import { useTheme } from './src/hooks/useTheme';
import { useTranslation } from 'react-i18next';
import './src/pwa';

const DEFAULT_LOC: Location = {
  id: 0,
  name: NAVIGATION_CONSTANTS.DEFAULT_LOCATION.name,
  lat: NAVIGATION_CONSTANTS.DEFAULT_LOCATION.lat,
  lng: NAVIGATION_CONSTANTS.DEFAULT_LOCATION.lng,
  country: NAVIGATION_CONSTANTS.DEFAULT_LOCATION.country
};

const GEO_PROMPT_KEY = 'seayou_geo_prompt_dismissed';

const NAV_ITEMS = [
  { view: ViewState.DASHBOARD, icon: LayoutDashboard, labelKey: 'nav.dashboard' },
  { view: ViewState.ATMOSPHERE, icon: Cloud, labelKey: 'nav.atmosphere' },
  { view: ViewState.MAP, icon: MapIcon, labelKey: 'nav.map' },
  { view: ViewState.ROUTE_PLANNING, icon: Navigation, labelKey: 'nav.routes' },
  { view: ViewState.COASTS_MARINAS, icon: Anchor, labelKey: 'nav.marinas' },
] as const;

const App: React.FC = () => {
  const { resolvedTheme, toggleTheme, setAutoThemeData } = useTheme();
  const { t } = useTranslation();

  const [view, setView] = useState<ViewState>(ViewState.DASHBOARD);
  const [locations, setLocations] = useState<Location[]>([DEFAULT_LOC]);
  const [currentLocation, setCurrentLocation] = useState<Location>(DEFAULT_LOC);

  const [showLocationModal, setShowLocationModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [showGeoPrompt, setShowGeoPrompt] = useState<boolean>(
    () => navigator.geolocation != null && localStorage.getItem(GEO_PROMPT_KEY) !== '1'
  );

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

  useEffect(() => {
    if (weatherData?.general?.sunrise && weatherData?.general?.sunset) {
      setAutoThemeData(weatherData.general.sunrise, weatherData.general.sunset);
    } else if (weatherData?.daily?.sunrise?.[0] && weatherData?.daily?.sunset?.[0]) {
      setAutoThemeData(weatherData.daily.sunrise[0], weatherData.daily.sunset[0]);
    }
  }, [weatherData, setAutoThemeData]);

  const handleLocateMe = () => {
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
              newLoc = { ...resolvedLocation, id: -1 };
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
          if (err.code === 1) alert(t('location.permissionDenied'));
          else if (err.code === 2) alert(t('location.unavailable'));
          else if (err.code === 3) alert(t('location.timeout'));
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
    }
  };

  const dismissGeoPrompt = () => {
    setShowGeoPrompt(false);
    localStorage.setItem(GEO_PROMPT_KEY, '1');
  };

  const handleGeoPromptAccept = () => {
    dismissGeoPrompt();
    handleLocateMe();
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
      <div className="flex flex-col lg:flex-row h-[100dvh] theme-bg text-white overflow-hidden font-sans theme-transition">

        {/* ============ Desktop Side Rail (lg+) ============ */}
        <nav className="hidden lg:flex lg:flex-col lg:w-20 lg:shrink-0 glass-panel !rounded-none border-r border-white/10 z-20">
          <div className="flex flex-col items-center pt-6 pb-4">
            <div className="w-10 h-10 rounded-full border-2 border-white/30 flex items-center justify-center mb-2">
              <Anchor size={20} className="text-white" />
            </div>
            <span className="text-[10px] font-bold tracking-wider text-white/80">SeaYou</span>
          </div>

          <div className="flex-1 flex flex-col items-center gap-1 px-2 py-4">
            {NAV_ITEMS.map(({ view: navView, icon: Icon, labelKey }) => (
              <button
                key={navView}
                onClick={() => setView(navView)}
                className={`flex flex-col items-center gap-1 w-full py-3 rounded-xl transition-all ${
                  view === navView
                    ? 'text-white bg-white/20'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon size={20} />
                <span className="text-[9px] font-medium">{t(labelKey)}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-col items-center gap-3 pb-6 px-2">
            <button
              onClick={toggleTheme}
              className="w-10 h-10 rounded-full glass-inner flex items-center justify-center hover:bg-white/20 transition-colors border border-white/10"
              aria-label="Toggle theme"
            >
              {resolvedTheme === 'dark' ? <Sun size={16} className="text-white" /> : <Moon size={16} className="text-white" />}
            </button>
          </div>
        </nav>

        {/* ============ Main Column ============ */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* ============ Header ============ */}
          <header className="flex justify-between items-center px-5 pt-4 pb-3 shrink-0 z-20">
            {/* Left: Profile icon (no action yet — location is opened from Dashboard pill) */}
            <button
              className="w-10 h-10 rounded-full border-2 border-white/30 flex items-center justify-center hover:border-white/60 transition-colors"
            >
              <User size={18} className="text-white" />
            </button>

            {/* Center: App title */}
            <h1 className="text-2xl font-bold tracking-wide text-white">SeaYou</h1>

            {/* Right: Language + Theme toggle */}
            <div className="flex items-center gap-3">
              <LanguageSelector />

              <button
                onClick={toggleTheme}
                className="lg:hidden relative flex items-center w-[4.5rem] h-9 glass-inner rounded-full p-1 border border-white/10 shadow-inner focus:outline-none"
                aria-label="Toggle theme"
              >
                <div className={`absolute w-7 h-7 rounded-full bg-white shadow-md transition-transform duration-300 ${
                  resolvedTheme === 'dark' ? 'left-1 translate-x-0' : 'left-1 translate-x-[2.25rem]'
                }`} />
                <div className="flex-1 flex justify-center z-10">
                  <Moon size={12} className={`transition-colors duration-300 ${resolvedTheme === 'dark' ? 'text-[#0d1b2a]' : 'text-white'}`} />
                </div>
                <div className="flex-1 flex justify-center z-10">
                  <Sun size={12} className={`transition-colors duration-300 ${resolvedTheme === 'dark' ? 'text-white' : 'text-[#2c6a9b]'}`} />
                </div>
              </button>
            </div>
          </header>

          {/* Geolocation prompt banner */}
          {showGeoPrompt && (
            <div className="mx-5 mb-3 glass-panel !rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2 text-white/80">
                <MapPin size={16} className="text-blue-400 shrink-0" />
                <span>{t('location.geoPrompt', 'Use your location for accurate local forecasts?')}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleGeoPromptAccept}
                  className="bg-blue-600/80 hover:bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg font-bold transition-colors"
                >
                  {t('location.allow', 'Allow')}
                </button>
                <button
                  onClick={dismissGeoPrompt}
                  className="text-white/40 hover:text-white transition-colors"
                  aria-label="Dismiss"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Location Modal */}
          {showLocationModal && (
            <div className="fixed inset-0 z-50 modal-backdrop flex items-start justify-center pt-20 px-4">
              <div className="glass-panel w-full max-w-md bg-[#0F3A5E]/80 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-8">
                <div className="p-4 border-b border-white/10 flex justify-between items-center glass-inner !rounded-none !rounded-t-[1.25rem]">
                  <h3 className="font-bold text-white">{t('location.manage')}</h3>
                  <button onClick={() => setShowLocationModal(false)}>
                    <X className="text-white/40 hover:text-white transition-colors" />
                  </button>
                </div>

                <div className="p-4">
                  <form onSubmit={handleSearch} className="relative mb-6">
                    <input
                      type="text"
                      placeholder={t('location.search')}
                      className="w-full bg-black/20 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-white/40 focus:border-blue-400 focus:outline-none"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <Search className="absolute left-3 top-3.5 text-white/40" size={18} />
                    <button type="submit" disabled={isSearching} className="absolute right-2 top-2 bg-blue-600/80 px-3 py-1 rounded-lg text-xs font-bold hover:bg-blue-600 disabled:opacity-50">
                      {isSearching ? '...' : t('location.searchButton')}
                    </button>
                  </form>

                  <button
                    onClick={handleLocateMe}
                    className="w-full mb-4 glass-inner border border-blue-400/30 rounded-xl p-3 flex items-center justify-center gap-2 font-bold text-blue-400 hover:bg-white/10 transition-colors"
                  >
                    <MapPin size={18} /> {t('app.locateMe')}
                  </button>

                  {searchResults.length > 0 && (
                    <div className="mb-6 space-y-2">
                      <h4 className="text-xs text-white/50 uppercase font-bold mb-2">{t('location.searchResults')}</h4>
                      {searchResults.map(res => (
                        <button key={res.id} onClick={() => addLocation(res)} className="w-full flex items-center justify-between p-3 rounded-xl glass-inner hover:bg-white/15 border border-white/5 group transition-colors text-left">
                          <div>
                            <div className="font-bold text-white">{res.name}</div>
                            <div className="text-xs text-white/60">{res.admin1} {res.country}</div>
                          </div>
                          <Plus size={18} className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      ))}
                    </div>
                  )}

                  <div>
                    <h4 className="text-xs text-white/50 uppercase font-bold mb-2">{t('location.savedPlaces')}</h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto hide-scrollbar pr-2">
                      {locations.map(loc => (
                        <button
                          key={loc.id}
                          onClick={() => switchLocation(loc)}
                          className={`w-full flex items-center justify-between p-3 rounded-xl border transition-colors text-left ${
                            currentLocation.id === loc.id
                              ? 'bg-blue-500/20 border-blue-400/50'
                              : 'glass-inner border-white/5 hover:bg-white/15'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <MapPin size={18} className={currentLocation.id === loc.id ? "text-blue-400" : "text-white/40"} />
                            <span className={currentLocation.id === loc.id ? "text-white font-bold" : "text-white/70"}>{loc.name}</span>
                          </div>
                          {currentLocation.id === loc.id && <Check size={16} className="text-blue-400" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============ Main Content ============ */}
          <main className={`flex-1 relative ${view === ViewState.MAP ? 'overflow-hidden' : 'overflow-y-auto scroll-smooth hide-scrollbar'} pb-28 lg:pb-4`}>
            {view === ViewState.DASHBOARD && (
              <ErrorBoundary
                resetKeys={[currentLocation.id, 'dashboard']}
                onReset={refetch}
                onError={(error, errorInfo) => {
                  console.error('Dashboard error:', error, errorInfo);
                }}
              >
                <Dashboard weatherData={weatherData} loading={isLoading} error={error} locationName={currentLocation.name} onRetry={refetch} onLocationClick={() => setShowLocationModal(true)} />
              </ErrorBoundary>
            )}
            {view === ViewState.MAP && (
              <div className="absolute inset-0 w-full h-full">
                <ErrorBoundary
                  resetKeys={[currentLocation.id, 'map']}
                  onError={(error, errorInfo) => {
                    console.error('Map error:', error, errorInfo);
                  }}
                >
                  <MapProvider>
                    <MapContainerML currentLocation={{ lat: currentLocation.lat, lng: currentLocation.lng }} />
                  </MapProvider>
                </ErrorBoundary>
              </div>
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

          {/* ============ Bottom Navigation (mobile, < lg) ============ */}
          <div className="lg:hidden fixed bottom-0 left-0 right-0 z-20">
            <div className="bg-[#0a2033]/95 backdrop-blur-xl border-t border-white/10 px-2 pt-2 pb-6">
              <div className="flex justify-around items-center max-w-lg mx-auto">
                {NAV_ITEMS.map(({ view: navView, icon: Icon, labelKey }) => (
                  <button
                    key={navView}
                    onClick={() => setView(navView)}
                    className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all ${
                      view === navView
                        ? 'text-white bg-white/20'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    <Icon size={20} />
                    <span className="text-[10px] font-medium">{t(labelKey)}</span>
                  </button>
                ))}
              </div>

              <div className="text-center mt-1.5">
                <p className="text-[9px] text-white/30">
                  Weather data by{' '}
                  <a
                    href="https://open-meteo.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/40 hover:text-white/60 transition-colors underline"
                  >
                    Open-Meteo.com
                  </a>
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </ErrorBoundary>
  );
};

export default App;
