/**
 * COASTS & MARINAS VIEW COMPONENT
 * Browse and navigate to nearby coastal locations
 */

import React, { useState, useEffect } from 'react';
import {
  Anchor,
  MapPin,
  Navigation,
  Phone,
  Globe,
  Mail,
  Star,
  Heart,
  Search,
  Filter,
  ExternalLink,
  Fuel,
  Wifi,
  Utensils,
  Wrench,
  Zap,
  Droplet,
  Shield,
  Info,
  X,
  Loader,
} from 'lucide-react';
import type { Marina } from '@seame/core';
import {
  searchNearbyCoasts,
  navigateToMarina,
  saveFavoriteMarina,
  getFavoriteMarinas,
  removeFavoriteMarina,
  isMarinaFavorited,
  calculateETAToMarina,
  searchMarinasByName,
  formatDistance, 
  formatTime 
} from '@seame/core';
import { ErrorState } from './ErrorState';

export const CoastsMarinasView: React.FC = () => {
  const [marinas, setMarinas] = useState<Marina[]>([]);
  const [favorites, setFavorites] = useState<Marina[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentLocation, setCurrentLocation] = useState<{
    lat: number;
    lon: number;
  } | null>(null);
  const [selectedMarina, setSelectedMarina] = useState<Marina | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [currentSpeed] = useState(5); // knots
  const [activeTab, setActiveTab] = useState<'nearby' | 'favorites' | 'search'>('nearby');

  // Filter states
  const [radius, setRadius] = useState(25); // nautical miles
  const [sortBy, setSortBy] = useState<'distance' | 'rating' | 'name'>('distance');

  useEffect(() => {
    loadFavorites();
    getCurrentLocation();
  }, []);

  const getCurrentLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          };
          setCurrentLocation(location);
          // Auto-search on load
          handleSearch(location);
        },
        (error) => {
          console.error('Geolocation error:', error);
        }
      );
    }
  };

  const handleSearch = async (location = currentLocation) => {
    if (!location) {
      alert('Location not available');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const results = await searchNearbyCoasts(location.lat, location.lon, {
        radius,
        sortBy,
      });

      setMarinas(results);
    } catch (error) {
      console.error('Search error:', error);
      setError(error as Error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNameSearch = async () => {
    if (searchQuery.length < 3) {
      alert('Please enter at least 3 characters');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const results = await searchMarinasByName(
        searchQuery,
        currentLocation?.lat,
        currentLocation?.lon
      );
      setMarinas(results);
    } catch (error) {
      console.error('Search error:', error);
      setError(error as Error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadFavorites = () => {
    setFavorites(getFavoriteMarinas());
  };

  const handleToggleFavorite = (marina: Marina) => {
    if (isMarinaFavorited(marina.id)) {
      removeFavoriteMarina(marina.id);
    } else {
      saveFavoriteMarina(marina);
    }
    loadFavorites();
  };

  const handleNavigate = (marina: Marina, app: 'google' | 'waze' | 'apple') => {
    navigateToMarina(marina, app);
  };

  const handleRefresh = () => {
    handleSearch();
  };

  const displayMarinas = () => {
    switch (activeTab) {
      case 'favorites':
        return favorites;
      case 'search':
      case 'nearby':
      default:
        return marinas;
    }
  };

  return (
    <div className="min-h-screen bg-black/20 p-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="glass-panel p-6 mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2 mb-4 text-white">
          <Anchor className="w-8 h-8 text-blue-400" />
          Nearby Coasts & Marinas
        </h1>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 border-b border-white/10">
          <button
            onClick={() => setActiveTab('nearby')}
            className={`px-4 py-2 font-semibold transition-colors ${
              activeTab === 'nearby'
                ? 'text-blue-400 border-b-2 border-blue-500'
                : 'text-white/40 hover:text-white/80'
            }`}
          >
            Nearby
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`px-4 py-2 font-semibold transition-colors ${
              activeTab === 'search'
                ? 'text-blue-400 border-b-2 border-blue-500'
                : 'text-white/40 hover:text-white/80'
            }`}
          >
            Search
          </button>
          <button
            onClick={() => setActiveTab('favorites')}
            className={`px-4 py-2 font-semibold transition-colors ${
              activeTab === 'favorites'
                ? 'text-blue-400 border-b-2 border-blue-500'
                : 'text-white/40 hover:text-white/80'
            }`}
          >
            Favorites ({favorites.length})
          </button>
        </div>

        {/* Search Bar (visible in search tab) */}
        {activeTab === 'search' && (
          <div className="mb-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleNameSearch()}
                placeholder="Search marinas by name..."
                className="flex-1 p-3 border border-white/10 rounded-lg bg-black/20 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <button
                onClick={handleNameSearch}
                disabled={isLoading}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-white/10 disabled:cursor-not-allowed"
              >
                <Search className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Filters (visible in nearby tab) */}
        {activeTab === 'nearby' && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="px-4 py-2 glass-panel rounded-lg hover:bg-white/10 flex items-center gap-2 text-white"
            >
              <Filter className="w-4 h-4" />
              Filters
            </button>
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-white/10"
            >
              {isLoading ? 'Searching...' : 'Refresh'}
            </button>
            <div className="ml-auto">
              <select
                value={sortBy}
                onChange={(e) =>
                  setSortBy(e.target.value as 'distance' | 'rating' | 'name')
                }
                className="px-4 py-2 glass-inner border border-white/10 rounded-lg text-white"
              >
                <option value="distance">Sort by Distance</option>
                <option value="rating">Sort by Rating</option>
                <option value="name">Sort by Name</option>
              </select>
            </div>
          </div>
        )}

        {/* Filter Panel */}
        {showFilters && activeTab === 'nearby' && (
          <div className="mt-4 p-4 glass-inner rounded-lg space-y-4 border border-white/10">
            <div>
              <label className="block text-sm font-semibold mb-2 text-white/80">
                Search Radius: {radius} NM
              </label>
              <input
                type="range"
                min="5"
                max="100"
                step="5"
                value={radius}
                onChange={(e) => setRadius(parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <button
              onClick={() => {
                handleSearch();
                setShowFilters(false);
              }}
              className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500"
            >
              Apply Filters
            </button>
          </div>
        )}
      </div>

      {/* Marina List */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {error ? (
          <ErrorState error={error} onRetry={handleRefresh} />
        ) : isLoading ? (
          <div className="text-center py-12">
            <Loader className="inline-block animate-spin h-12 w-12 text-blue-400" />
            <p className="mt-4 text-white/40">Searching for marinas...</p>
          </div>
        ) : displayMarinas().length === 0 ? (
          <div className="glass-panel p-8 text-center">
            <Anchor className="w-16 h-16 text-white/20 mx-auto mb-4" />
            <p className="text-white/40">
              {activeTab === 'favorites'
                ? 'No favorite marinas yet'
                : 'No marinas found in this area'}
            </p>
          </div>
        ) : (
          displayMarinas().map((marina) => (
            <MarinaCard
              key={marina.id}
              marina={marina}
              isFavorited={isMarinaFavorited(marina.id)}
              currentSpeed={currentSpeed}
              onToggleFavorite={() => handleToggleFavorite(marina)}
              onNavigate={(app) => handleNavigate(marina, app)}
              onViewDetails={() => setSelectedMarina(marina)}
            />
          ))
        )}
      </div>

      {/* Marina Details Modal */}
      {selectedMarina && (
        <MarinaDetailsModal
          marina={selectedMarina}
          onClose={() => setSelectedMarina(null)}
          onNavigate={(app) => handleNavigate(selectedMarina, app)}
          isFavorited={isMarinaFavorited(selectedMarina.id)}
          onToggleFavorite={() => handleToggleFavorite(selectedMarina)}
          currentSpeed={currentSpeed}
        />
      )}
    </div>
  );
};

// Marina Card Component
const MarinaCard: React.FC<{
  marina: Marina;
  isFavorited: boolean;
  currentSpeed: number;
  onToggleFavorite: () => void;
  onNavigate: (app: 'google' | 'waze' | 'apple') => void;
  onViewDetails: () => void;
}> = ({
  marina,
  isFavorited,
  currentSpeed,
  onToggleFavorite,
  onNavigate,
  onViewDetails,
}) => {
  const eta = calculateETAToMarina(marina, currentSpeed);

  return (
    <div className={`glass-panel p-6 hover:shadow-xl transition-shadow ${marina.type === 'beach' ? 'border-l-4 border-l-orange-500' : marina.type === 'marina' ? 'border-l-4 border-l-blue-500' : ''}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-xl font-bold text-white">{marina.name}</h3>
            <span
              className={`px-2 py-1 rounded text-xs font-semibold ${
                marina.type === 'marina'
                  ? 'bg-blue-900/50 text-blue-300 border border-blue-700/50'
                  : marina.type === 'harbor'
                  ? 'bg-green-900/50 text-green-300 border border-green-700/50'
                  : marina.type === 'beach'
                  ? 'bg-yellow-900/50 text-yellow-300 border border-yellow-700/50'
                  : 'bg-slate-800 text-slate-300'
              }`}
            >
              {marina.type.toUpperCase()}
            </span>
          </div>
          {marina.rating && (
            <div className="flex items-center gap-1 mb-2">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`w-4 h-4 ${
                    i < Math.floor(marina.rating!)
                      ? 'fill-yellow-400 text-yellow-400'
                      : 'text-slate-600'
                  }`}
                />
              ))}
              <span className="text-sm text-white/40 ml-1">
                {marina.rating.toFixed(1)}
              </span>
            </div>
          )}
        </div>
        <button
          onClick={onToggleFavorite}
          className={`p-2 rounded-full ${
            isFavorited
              ? 'bg-red-900/30 text-red-400 border border-red-700/50'
              : 'glass-inner text-white/40 hover:bg-white/10'
          }`}
        >
          <Heart
            className={`w-6 h-6 ${isFavorited ? 'fill-current' : ''}`}
          />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-blue-900/30 p-3 rounded-lg border border-blue-700/50">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-4 h-4 text-blue-400" />
            <p className="text-xs text-white/80">Distance</p>
          </div>
          <p className="text-lg font-bold text-white">{formatDistance(marina.distance)}</p>
        </div>
        <div className="bg-green-900/30 p-3 rounded-lg border border-green-700/50">
          <div className="flex items-center gap-2 mb-1">
            <Navigation className="w-4 h-4 text-green-400" />
            <p className="text-xs text-white/80">ETA</p>
          </div>
          <p className="text-lg font-bold text-white">{formatTime(eta)}</p>
        </div>
      </div>

      {marina.amenities.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-semibold mb-2 text-white/80">Amenities:</p>
          <div className="flex flex-wrap gap-2">
            {marina.amenities.slice(0, 6).map((amenity) => (
              <span
                key={amenity}
                className="px-2 py-1 glass-inner text-white/80 text-xs rounded border border-white/10"
              >
                {amenity}
              </span>
            ))}
            {marina.amenities.length > 6 && (
              <span className="px-2 py-1 bg-white/10 text-white/40 text-xs rounded">
                +{marina.amenities.length - 6} more
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-3 mb-4">
        {marina.facilities.fuel && (
          <Fuel className="w-5 h-5 text-white/40" />
        )}
        {marina.facilities.water && (
          <Droplet className="w-5 h-5 text-white/40" />
        )}
        {marina.facilities.electricity && (
          <Zap className="w-5 h-5 text-white/40" />
        )}
        {marina.facilities.wifi && (
          <Wifi className="w-5 h-5 text-white/40" />
        )}
        {marina.facilities.restaurant && (
          <Utensils className="w-5 h-5 text-white/40" />
        )}
        {marina.facilities.repair && (
          <Wrench className="w-5 h-5 text-white/40" />
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onNavigate('google')}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          <Navigation className="w-4 h-4" />
          Google Maps
        </button>
        <button
          onClick={() => onNavigate('waze')}
          className="flex-1 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          <Navigation className="w-4 h-4" />
          Waze
        </button>
        <button
          onClick={onViewDetails}
          className="px-4 py-2 glass-inner text-white/80 rounded-lg hover:bg-white/10 border border-white/10"
        >
          <Info className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// Marina Details Modal Component
const MarinaDetailsModal: React.FC<{
  marina: Marina;
  onClose: () => void;
  onNavigate: (app: 'google' | 'waze' | 'apple') => void;
  isFavorited: boolean;
  onToggleFavorite: () => void;
  currentSpeed: number;
}> = ({
  marina,
  onClose,
  onNavigate,
  isFavorited,
  onToggleFavorite,
  currentSpeed,
}) => {
  const eta = calculateETAToMarina(marina, currentSpeed);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="glass-panel max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold mb-2 text-white">{marina.name}</h2>
              <p className="text-white/40">
                {marina.lat.toFixed(4)}, {marina.lon.toFixed(4)}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-full text-white/40 hover:text-white"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center p-4 bg-blue-900/30 rounded-lg border border-blue-700/50">
              <MapPin className="w-6 h-6 text-blue-400 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{formatDistance(marina.distance)}</p>
              <p className="text-sm text-white/40">Distance</p>
            </div>
            <div className="text-center p-4 bg-green-900/30 rounded-lg border border-green-700/50">
              <Navigation className="w-6 h-6 text-green-400 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{formatTime(eta)}</p>
              <p className="text-sm text-white/40">ETA</p>
            </div>
            <div className="text-center p-4 bg-amber-900/30 rounded-lg border border-amber-700/50">
              <Star className="w-6 h-6 text-amber-400 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">
                {marina.rating?.toFixed(1) || 'N/A'}
              </p>
              <p className="text-sm text-white/40">Rating</p>
            </div>
          </div>

          {marina.description && (
            <div className="mb-6">
              <h3 className="font-semibold mb-2 text-white">Description</h3>
              <p className="text-white/80">{marina.description}</p>
            </div>
          )}

          <div className="mb-6 space-y-2">
            {marina.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-5 h-5 text-white/40" />
                <a href={`tel:${marina.phone}`} className="text-blue-400 hover:underline">
                  {marina.phone}
                </a>
              </div>
            )}
            {marina.website && (
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-white/40" />
                <a
                  href={marina.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline flex items-center gap-1"
                >
                  Visit Website <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            )}
            {marina.email && (
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-white/40" />
                <a href={`mailto:${marina.email}`} className="text-blue-400 hover:underline">
                  {marina.email}
                </a>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <button
              onClick={() => onNavigate('google')}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <Navigation className="w-5 h-5" />
              Navigate with Google Maps
            </button>
            <button
              onClick={() => onNavigate('waze')}
              className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <Navigation className="w-5 h-5" />
              Navigate with Waze
            </button>
            <button
              onClick={onToggleFavorite}
              className={`w-full py-3 rounded-lg flex items-center justify-center gap-2 ${
                isFavorited
                  ? 'bg-red-600 text-white hover:bg-red-500'
                  : 'glass-inner text-white/80 hover:bg-white/10 border border-white/10'
              }`}
            >
              <Heart className={`w-5 h-5 ${isFavorited ? 'fill-current' : ''}`} />
              {isFavorited ? 'Remove from Favorites' : 'Add to Favorites'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CoastsMarinasView;
