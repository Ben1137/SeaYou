import React, { useState, useEffect } from 'react';
import { ViewState, Coordinate, MarineWeatherData, Location } from './types';
import Dashboard from './components/Dashboard';
import MapComponent from './components/MapComponent';
import Atmosphere from './components/Atmosphere';
import { LayoutDashboard, Map as MapIcon, Cloud, Anchor, MapPin, Plus, Search, X, Check } from 'lucide-react';
import { fetchMarineWeather, searchLocations, reverseGeocode } from './services/weatherService';

// Default to a coastal location (Tel Aviv) if geo fails
const DEFAULT_LOC: Location = { id: 0, name: "Tel Aviv", lat: 32.0853, lng: 34.7818, country: "Israel" };

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>(ViewState.DASHBOARD);
  const [locations, setLocations] = useState<Location[]>([DEFAULT_LOC]);
  const [currentLocation, setCurrentLocation] = useState<Location>(DEFAULT_LOC);
  const [weatherData, setWeatherData] = useState<MarineWeatherData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Search State
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    loadWeatherData(DEFAULT_LOC);
  }, []);

  const handleLocateMe = () => {
    if (navigator.geolocation) {
      setLoading(true);
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          let cityName = "Current Location";

          try {
            const resolvedName = await reverseGeocode(latitude, longitude);
            if (resolvedName) {
              cityName = resolvedName;
            }
          } catch (e) {
            console.error("Failed to reverse geocode", e);
          }

          const newLoc: Location = {
            id: -1, // ID for "Current Location"
            name: cityName,
            lat: latitude,
            lng: longitude,
          };
          
          setLocations(prev => {
              const filtered = prev.filter(l => l.id !== -1);
              return [newLoc, ...filtered];
          });
          setCurrentLocation(newLoc);
          loadWeatherData(newLoc);
          setShowLocationModal(false);
        },
        (err) => {
          console.warn("Geolocation failed", err);
          setError("Could not retrieve location. Please check permissions.");
          setLoading(false);
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
    } else {
      setError("Geolocation is not supported by your browser.");
    }
  };

  const loadWeatherData = async (loc: Location) => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchMarineWeather(loc.lat, loc.lng);
      setWeatherData(data);
    } catch (e) {
      setError("Unable to retrieve marine forecast. Check connection.");
    } finally {
      setLoading(false);
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
      loadWeatherData(loc);
      setShowLocationModal(false);
      setSearchQuery('');
      setSearchResults([]);
  };

  const switchLocation = (loc: Location) => {
      setCurrentLocation(loc);
      loadWeatherData(loc);
      setShowLocationModal(false);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      
      {/* Top Bar */}
      <nav className="bg-slate-900 border-b border-slate-800 p-4 flex justify-between items-center z-10 shadow-md">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Anchor size={24} className="text-white" />
          </div>
          <div className="hidden md:block">
             <h1 className="text-xl font-bold tracking-tight text-white">SeaMe</h1>
             <p className="text-xs text-blue-400 font-medium tracking-wider">SEA'S INTELLIGENCE</p>
          </div>
        </div>

        {/* Location Picker */}
        <button 
           onClick={() => setShowLocationModal(true)}
           className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-full border border-slate-700 transition-colors"
        >
            <MapPin size={16} className="text-red-400" />
            <span className="text-sm font-bold truncate max-w-[150px]">{currentLocation.name}</span>
            <div className="w-px h-4 bg-slate-600 mx-1"></div>
            <Plus size={16} className="text-slate-400" />
        </button>
      </nav>

      {/* Location Modal */}
      {showLocationModal && (
          <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center pt-20 px-4">
              <div className="bg-slate-900 w-full max-w-md rounded-2xl border border-slate-700 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-8">
                  <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
                      <h3 className="font-bold text-white">Manage Locations</h3>
                      <button onClick={() => setShowLocationModal(false)}><X className="text-slate-400 hover:text-white" /></button>
                  </div>
                  
                  <div className="p-4">
                      {/* Search Form */}
                      <form onSubmit={handleSearch} className="relative mb-6">
                          <input 
                            type="text" 
                            placeholder="Search city (e.g., Haifa, Eilat)..." 
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg py-3 pl-10 pr-4 text-white focus:border-blue-500 focus:outline-none"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                          />
                          <Search className="absolute left-3 top-3.5 text-slate-500" size={18} />
                          <button type="submit" disabled={isSearching} className="absolute right-2 top-2 bg-blue-600 px-3 py-1 rounded text-xs font-bold hover:bg-blue-500 disabled:opacity-50">
                              {isSearching ? '...' : 'Find'}
                          </button>
                      </form>

                      {/* Current Location Button */}
                      <button 
                        onClick={handleLocateMe}
                        className="w-full mb-4 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-600/30 rounded-lg p-3 flex items-center justify-center gap-2 font-bold transition-colors"
                      >
                        <MapPin size={18} /> Use My Current Location
                      </button>

                      {/* Search Results */}
                      {searchResults.length > 0 && (
                          <div className="mb-6 space-y-2">
                              <h4 className="text-xs text-slate-500 uppercase font-bold mb-2">Search Results</h4>
                              {searchResults.map(res => (
                                  <button key={res.id} onClick={() => addLocation(res)} className="w-full flex items-center justify-between p-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 group transition-colors text-left">
                                      <div>
                                          <div className="font-bold text-white">{res.name}</div>
                                          <div className="text-xs text-slate-400">{res.admin1} {res.country}</div>
                                      </div>
                                      <Plus size={18} className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </button>
                              ))}
                          </div>
                      )}

                      {/* Saved Locations */}
                      <div>
                          <h4 className="text-xs text-slate-500 uppercase font-bold mb-2">Saved Places</h4>
                          <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                              {locations.map(loc => (
                                  <button 
                                    key={loc.id} 
                                    onClick={() => switchLocation(loc)}
                                    className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-left ${
                                        currentLocation.id === loc.id 
                                        ? 'bg-blue-600/20 border-blue-500/50' 
                                        : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800'
                                    }`}
                                  >
                                      <div className="flex items-center gap-3">
                                          <MapPin size={18} className={currentLocation.id === loc.id ? "text-blue-400" : "text-slate-500"} />
                                          <span className={currentLocation.id === loc.id ? "text-white font-bold" : "text-slate-300"}>{loc.name}</span>
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

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto relative scroll-smooth">
        {view === ViewState.DASHBOARD && (
          <Dashboard weatherData={weatherData} loading={loading} error={error} locationName={currentLocation.name} />
        )}
        {view === ViewState.MAP && (
          <MapComponent currentLocation={{ lat: currentLocation.lat, lng: currentLocation.lng }} />
        )}
        {view === ViewState.ATMOSPHERE && (
          <Atmosphere weatherData={weatherData} />
        )}
      </main>

      {/* Bottom Navigation */}
      <div className="bg-slate-900 border-t border-slate-800 p-2 pb-6 z-20">
        <div className="flex justify-around items-center max-w-lg mx-auto">
          <button
            onClick={() => setView(ViewState.DASHBOARD)}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
              view === ViewState.DASHBOARD ? 'text-blue-400 bg-blue-500/10' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <LayoutDashboard size={24} />
            <span className="text-xs font-medium">Dashboard</span>
          </button>
          
          <button
            onClick={() => setView(ViewState.MAP)}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
              view === ViewState.MAP ? 'text-blue-400 bg-blue-500/10' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <MapIcon size={24} />
            <span className="text-xs font-medium">Map</span>
          </button>

          <button
            onClick={() => setView(ViewState.ATMOSPHERE)}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
              view === ViewState.ATMOSPHERE ? 'text-purple-400 bg-purple-500/10' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Cloud size={24} />
            <span className="text-xs font-medium">Atmosphere</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;