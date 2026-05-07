import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ViewState, Location, UI_CONSTANTS, NAVIGATION_CONSTANTS, TsunamiRisk, fetchActiveTsunamis, checkTsunamiRisk } from '@seame/core';
import Dashboard from './components/Dashboard';
import { MapProvider } from './components/map/MapProvider';
import { MapContainerML } from './components/map/MapContainerML';
import Atmosphere from './components/Atmosphere';
import { RoutePlanningView } from './components/RoutePlanningView';
import { CoastsMarinasView } from './components/CoastsMarinasView';
import { AuthModal } from './components/AuthModal';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { LanguageSelector } from './src/components/LanguageSelector';
import { AlertProvider } from './src/contexts/AlertContext';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { RouteProvider } from './src/contexts/RouteContext';
import { ToastHost, toast } from './components/ui/Toast';
import { DialogHost } from './components/ui/Dialog';
import { TsunamiBanner } from './components/TsunamiBanner';
import { LayoutDashboard, Map as MapIcon, Cloud, Navigation, Anchor, MapPin, Plus, Search, X, Check, Moon, Sun, User, ChevronDown, Globe, LogOut, Heart, Clock, Star } from 'lucide-react';
import { searchLocations, reverseGeocode, SavedLocation } from '@seame/core';
import { searchLocationsSmart, resolvePlace, type LocationSearchResult } from './src/services/locationSearchService';
import { useAlertConfig } from './src/contexts/AlertContext';
import { AuthPage } from './components/AuthPage';
import { OnboardingModal } from './components/OnboardingModal';
import { InteractiveTour } from './components/onboarding/InteractiveTour';
import { UserProfileModal } from './components/profile/UserProfileModal';
import { WaveLoader } from './components/ui/WaveLoader';
import { useCachedWeather } from './src/hooks/useCachedWeather';
import { useTheme } from './src/hooks/useTheme';
import { useVoyageAutoSave } from './hooks/useVoyageAutoSave';
import { reconcileLocalRoutesToCloud } from '@seame/core';
import { useTranslation } from 'react-i18next';
import './src/pwa';
import {
  initOneSignalWeb,
  requestPushPermission,
  waitForPlayerId,
  onPlayerIdChange,
  getPlayerId,
  isNotificationReady,
} from './src/services/oneSignalWeb';

/** Polling interval for GDACS tsunami feeds (5 minutes) */
const TSUNAMI_POLL_MS = 5 * 60 * 1000;

const DEFAULT_LOC: Location = {
  id: 0,
  name: NAVIGATION_CONSTANTS.DEFAULT_LOCATION.name,
  lat: NAVIGATION_CONSTANTS.DEFAULT_LOCATION.lat,
  lng: NAVIGATION_CONSTANTS.DEFAULT_LOCATION.lng,
  country: NAVIGATION_CONSTANTS.DEFAULT_LOCATION.country
};

const GEO_PROMPT_KEY = 'seayou_geo_prompt_dismissed';

const NAV_ITEMS = [
  { view: ViewState.DASHBOARD, icon: LayoutDashboard, labelKey: 'nav.dashboard', marinerOnly: false },
  { view: ViewState.ATMOSPHERE, icon: Cloud, labelKey: 'nav.atmosphere', marinerOnly: false },
  { view: ViewState.MAP, icon: MapIcon, labelKey: 'nav.map', marinerOnly: false },
  { view: ViewState.ROUTE_PLANNING, icon: Navigation, labelKey: 'nav.routes', marinerOnly: true },
  { view: ViewState.COASTS_MARINAS, icon: Anchor, labelKey: 'nav.nearby', marinerOnly: false },
] as const;

// ─── Profile button — opens AuthModal when signed out, opens UserProfileModal when signed in ───
interface ProfileButtonProps {
  onOpenAuthModal: () => void;
  onOpenProfile: () => void;
  variant: 'desktop' | 'mobile';
}

const ProfileButton: React.FC<ProfileButtonProps> = ({ onOpenAuthModal, onOpenProfile, variant }) => {
  const { user } = useAuth();
  const { t } = useTranslation();

  const signedIn = !!user;
  const displayName = user?.email?.split('@')[0] ?? '';
  const avatarUrl = user?.user_metadata?.avatar_url;
  const initial = displayName.charAt(0).toUpperCase();

  const handleClick = () => {
    if (signedIn) {
      onOpenProfile();
    } else {
      onOpenAuthModal();
    }
  };

  const buttonClass =
    variant === 'desktop'
      ? 'w-10 h-10 rounded-full glass-inner flex items-center justify-center hover:bg-white/20 transition-colors border border-white/10 overflow-hidden'
      : 'lg:hidden w-9 h-9 sm:w-10 sm:h-10 rounded-full border-2 border-white/30 flex items-center justify-center hover:border-white/60 transition-colors overflow-hidden';

  return (
    <button
      id={variant === 'desktop' ? 'tour-profile-menu-desktop' : 'tour-profile-menu-mobile'}
      onClick={handleClick}
      className={buttonClass}
      aria-label={signedIn ? t('auth.profile', 'Profile') : t('auth.signIn', 'Sign In')}
    >
      {signedIn && avatarUrl ? (
        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : signedIn && initial ? (
        <span className="text-sm font-bold text-white">{initial}</span>
      ) : (
        <User size={variant === 'desktop' ? 16 : 16} className="text-white" />
      )}
    </button>
  );
};

// Synchronous localStorage cache key for tour completion.
// Written on tour finish/skip so the next page load can short-circuit the
// ~500ms Supabase hydration window that would otherwise flash the tour again.
const TOUR_LOCAL_CACHE_KEY = 'tourCompleted';

const AppContent: React.FC = () => {
  const { resolvedTheme, toggleTheme, setAutoThemeData } = useTheme();
  const { t, i18n } = useTranslation();
  const alertConfig = useAlertConfig();
  const { loading: authLoading, user: authUser } = useAuth();

  // Phase 6 — Auto-persist completed voyages to the cloud logbook.
  useVoyageAutoSave();

  // Phase 6 — On sign-in, push any local-only routes to the cloud so
  // the user's anonymous work isn't orphaned. Idempotent (upsert by id).
  useEffect(() => {
    if (!authUser) return;
    void reconcileLocalRoutesToCloud();
  }, [authUser]);

  // Synchronous localStorage read — immediately blocks tour during the first
  // render cycle, before Supabase responds with cloud preferences.
  const tourLocallyCompleted =
    typeof window !== 'undefined' &&
    window.localStorage.getItem(TOUR_LOCAL_CACHE_KEY) === 'true';

  // Mirror cloud → local whenever Supabase confirms completion on another
  // device, so next refresh can short-circuit immediately.
  useEffect(() => {
    if (alertConfig.hasCompletedTour === true && !tourLocallyCompleted) {
      try {
        window.localStorage.setItem(TOUR_LOCAL_CACHE_KEY, 'true');
      } catch {
        // Ignore quota / private-mode errors.
      }
    }
  }, [alertConfig.hasCompletedTour, tourLocallyCompleted]);

  const [view, setView] = useState<ViewState>(ViewState.DASHBOARD);
  const [locations, setLocations] = useState<Location[]>([DEFAULT_LOC]);
  const [currentLocation, setCurrentLocation] = useState<Location>(DEFAULT_LOC);

  const [showLocationModal, setShowLocationModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LocationSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // ─── Onboarding state — local-only flag (cloud sync cannot override) ───
  const ONBOARDING_FLAG = 'seayou_onboarding_done';
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(
    () => localStorage.getItem(ONBOARDING_FLAG) === '1'
  );
  const showOnboarding = !hasCompletedOnboarding;

  // ─── App Tour state — shows after onboarding, persisted to preferences/Supabase ───
  // DOUBLE-LOCK GUARD against the refresh race condition:
  //   1. Synchronous localStorage check — blocks tour on frame 1 before any
  //      async state resolves (kills the ~500ms flash window entirely).
  //   2. Strict async guard — requires auth finished loading AND preferences
  //      finished loading AND Supabase says hasCompletedTour === false.
  // Any one of these evaluating "still loading" keeps the tour off-screen.
  // Sea Trial — tightened gate. Signed-in users MUST have a 'synced'
  // cloud read before the tour can fire (no more 'error' fallback that
  // let the local default `hasCompletedTour: false` win). Signed-out
  // users gate on local flag only — cloud isn't available to them.
  const isSignedIn = !!authUser;
  const prefsLoaded = isSignedIn
    ? alertConfig.cloudSyncStatus === 'synced'
    : true;
  const showAppTour =
    !tourLocallyCompleted &&
    !authLoading &&
    prefsLoaded &&
    hasCompletedOnboarding &&
    alertConfig.persona !== null &&
    alertConfig.hasCompletedTour === false;

  // ─── Persona-filtered navigation — "Routes" tab only visible to mariners ───
  const visibleNavItems = useMemo(
    () => NAV_ITEMS.filter(item => !item.marinerOnly || alertConfig.persona === 'mariner'),
    [alertConfig.persona]
  );

  // (mainScrollRef is declared further down for pull-to-refresh / re-tap scroll)

  // ─── Pull-to-refresh state ───
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pullStartY = useRef(0);
  const isPulling = useRef(false);

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

  // Initialize OneSignal web SDK (Phase 4 — Push Notifications)
  useEffect(() => {
    initOneSignalWeb().catch(() => {/* non-critical */});
  }, []);

  // ─── OneSignal Player ID capture ────────────────────────────────────────
  // As soon as the SDK knows a Player ID (either because the user was
  // already subscribed in a past session, or has just granted permission),
  // write it into preferences so the `daily-surf-report` Edge Function can
  // target this user. Also hook the `change` event so we survive silent
  // re-subscriptions without needing a page reload.
  useEffect(() => {
    if (!authUser?.id) return;
    let cancelled = false;

    // 1) Initial read: if permission was already granted in a prior
    //    session, the Player ID is available synchronously.
    const initial = getPlayerId();
    if (initial && initial !== alertConfig.onesignalPlayerId) {
      alertConfig.setOnesignalPlayerId(initial);
    }

    // 2) Listen for subsequent SDK-initiated changes.
    const off = onPlayerIdChange((id) => {
      if (cancelled) return;
      if (id && id !== alertConfig.onesignalPlayerId) {
        alertConfig.setOnesignalPlayerId(id);
      }
    });
    return () => { cancelled = true; off(); };
    // We intentionally depend on `authUser?.id` only — rebinding on every
    // preferences change would thrash the listener. `setOnesignalPlayerId`
    // is stable (wrapped in useCallback) and reads latest value via closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.id]);

  /**
   * Prompt for push permission, then capture + persist the Player ID.
   * Called from:
   *   (a) the InteractiveTour `onFinish` callback — the UX-ideal moment
   *       the user has just seen what the app can do for them.
   *   (b) a fallback effect on login, when a signed-in user hasn't been
   *       prompted yet (e.g. they skipped the tour, or logged in fresh on
   *       a new device).
   * Safe to call multiple times: if permission is already granted, we just
   * capture the Player ID. If previously denied, the browser silently
   * resolves and we leave the opt-in opportunity for the settings toggle.
   */
  const promptPushAndCapture = useCallback(async () => {
    if (!authUser?.id) return;
    const granted = await requestPushPermission();
    if (!granted) return;
    // `waitForPlayerId` now rejects on timeout (event-driven, not polling)
    // so we must wrap it — our realtime listener also writes to preferences
    // as a secondary path if the SDK fires `change` after we've given up.
    let id: string;
    try {
      id = await waitForPlayerId();
    } catch (err) {
      console.error('[App] promptPushAndCapture: waitForPlayerId failed', err);
      return;
    }
    // Resolve home coordinates: active location > first recent > first
    // favorite. The Edge Function strictly requires both lat/lon, so we
    // always have a value even for brand-new users on the default spot.
    const fallback =
      alertConfig.recentSearches[0] ?? alertConfig.favoriteLocations[0] ?? null;
    const lat = currentLocation.lat ?? fallback?.lat ?? DEFAULT_LOC.lat;
    const lon = currentLocation.lng ?? fallback?.lng ?? DEFAULT_LOC.lng;
    alertConfig.setPushRegistration({ id, lat, lon });
  }, [authUser?.id, alertConfig, currentLocation.lat, currentLocation.lng]);

  // Fallback prompt: signed in, tour done, but we have never captured a
  // Player ID. This handles users who skipped the tour or installed on a
  // new device after the tour was already flagged complete server-side.
  const hasPromptedRef = useRef(false);
  useEffect(() => {
    if (hasPromptedRef.current) return;
    if (!authUser?.id) return;
    if (!alertConfig.hasCompletedTour) return; // handled by tour `onFinish`
    if (alertConfig.onesignalPlayerId) return; // already captured
    if (isNotificationReady()) {
      // Permission already granted — just capture the ID, no prompt needed
      const id = getPlayerId();
      if (id) alertConfig.setOnesignalPlayerId(id);
      return;
    }
    hasPromptedRef.current = true;
    // Small delay so the prompt doesn't collide with post-login UI flashes.
    const t = setTimeout(() => { promptPushAndCapture(); }, 1200);
    return () => clearTimeout(t);
  }, [
    authUser?.id,
    alertConfig.hasCompletedTour,
    alertConfig.onesignalPlayerId,
    alertConfig,
    promptPushAndCapture,
  ]);

  // ─── Tsunami risk state + background polling (Phase 5) ───
  const [tsunamiRisks, setTsunamiRisks] = useState<TsunamiRisk[]>([]);

  useEffect(() => {
    const lat = currentLocation.lat;
    const lng = currentLocation.lng;
    if (!lat || !lng) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const events = await fetchActiveTsunamis();
        if (cancelled) return;

        if (events.length === 0) {
          console.log('[TsunamiPoll] No active GDACS events');
          setTsunamiRisks([]);
          return;
        }

        console.log(`[TsunamiPoll] ${events.length} GDACS events fetched`);
        const risks = checkTsunamiRisk(lat, lng, events);
        setTsunamiRisks(risks);

        if (risks.length > 0) {
          console.warn(
            '%c TSUNAMI RISK DETECTED ',
            'background: #dc2626; color: white; font-size: 18px; font-weight: bold; padding: 4px 12px;',
            risks.map((r) => ({
              title: r.event.title,
              magnitude: r.event.magnitude,
              distanceKm: Math.round(r.distanceKm),
              riskLevel: r.riskLevel,
            }))
          );

          // Fire native push notification for HIGH risk
          const highRisk = risks.find((r) => r.riskLevel === 'HIGH');
          if (highRisk && 'Notification' in window && Notification.permission === 'granted') {
            new Notification('⚠️ TSUNAMI WARNING', {
              body: `${highRisk.event.title} — M${highRisk.event.magnitude.toFixed(1)} — ${Math.round(highRisk.distanceKm)} km away. Seek high ground immediately.`,
              icon: '/icons/icon-192x192.png',
              tag: 'tsunami-high',
              requireInteraction: true,
            });
          }
        }
      } catch (err) {
        if (!cancelled) console.warn('[TsunamiPoll] Failed:', err);
      }
    };

    // Initial fetch
    poll();

    // Poll every 5 minutes
    const intervalId = setInterval(poll, TSUNAMI_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [currentLocation.lat, currentLocation.lng]);

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
          if (err.code === 1) toast.error(t('location.permissionDenied'));
          else if (err.code === 2) toast.error(t('location.unavailable'));
          else if (err.code === 3) toast.warning(t('location.timeout'));
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

  // Debounced live search — fires as user types (after 300ms pause)
  const handleSearchInput = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!value.trim() || value.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      const results = await searchLocationsSmart(value, i18n.language);
      setSearchResults(results);
      setIsSearching(false);
    }, 300);
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    setIsSearching(true);
    const results = await searchLocationsSmart(searchQuery, i18n.language);
    setSearchResults(results);
    setIsSearching(false);
  };

  const selectSearchResult = async (result: LocationSearchResult) => {
    let resolvedLat = result.lat;
    let resolvedLng = result.lng;
    let resolvedName = result.name;

    // Resolve coordinates via Google Place Details if this came from Autocomplete
    if (result.needsResolution && result.placeId) {
      setIsSearching(true);
      const resolved = await resolvePlace(result.placeId);
      setIsSearching(false);
      if (resolved) {
        resolvedLat = resolved.lat;
        resolvedLng = resolved.lng;
        resolvedName = resolved.name || result.name;
      } else {
        console.warn('[App] Place Details resolution failed for', result.placeId);
        return; // Can't navigate without coordinates
      }
    }

    const loc: Location = {
      id: typeof result.id === 'string' ? parseInt(result.id, 10) || Date.now() : (result.id as unknown as number),
      name: resolvedName,
      lat: resolvedLat,
      lng: resolvedLng,
    };
    if (!locations.some(l => l.id === loc.id)) {
      setLocations([...locations, loc]);
    }
    setCurrentLocation(loc);
    setShowLocationModal(false);
    setSearchQuery('');
    setSearchResults([]);
    // Track as recent search with resolved coordinates (via preferences → cloud sync)
    alertConfig.addRecentSearch({
      id: result.id,
      name: resolvedName,
      lat: resolvedLat,
      lng: resolvedLng,
    });
  };

  const selectSavedLocation = (saved: SavedLocation) => {
    const loc: Location = {
      id: parseInt(saved.id, 10) || Date.now(),
      name: saved.name,
      lat: saved.lat,
      lng: saved.lng,
    };
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

  // ─── Scroll-to-top on re-tap of active nav ───
  const mainScrollRef = useRef<HTMLElement>(null);
  const handleNavClick = useCallback((targetView: ViewState) => {
    if (view === targetView && mainScrollRef.current) {
      mainScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setView(targetView);
    }
  }, [view]);

  // ─── Auto-scroll to top whenever the active view changes ───
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    mainScrollRef.current?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [view]);

  // ─── Pull-to-refresh touch handlers ───
  const PULL_THRESHOLD = 80;
  const PULL_MAX = 120;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isRefreshing) return;
    const el = mainScrollRef.current;
    if (el && el.scrollTop <= 0) {
      pullStartY.current = e.touches[0].clientY;
      isPulling.current = true;
    }
  }, [isRefreshing]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling.current || isRefreshing) return;
    const delta = e.touches[0].clientY - pullStartY.current;
    if (delta > 0) {
      setPullDistance(Math.min(delta * 0.5, PULL_MAX));
    } else {
      isPulling.current = false;
      setPullDistance(0);
    }
  }, [isRefreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current || isRefreshing) return;
    isPulling.current = false;
    if (pullDistance >= PULL_THRESHOLD) {
      setIsRefreshing(true);
      try {
        await refetch();
      } catch (err) {
        console.error('Pull-to-refresh failed:', err);
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, isRefreshing, refetch]);

  // ─── Inline favorite toggle (used inside search modal) ───
  // Handles both resolved locations (recents/favorites) and unresolved
  // Autocomplete results (resolves coordinates via Place Details first).
  const toggleFavoriteFor = useCallback(async (loc: SavedLocation | LocationSearchResult) => {
    let resolved: SavedLocation = { id: loc.id, name: loc.name, lat: loc.lat, lng: loc.lng };

    // If this is an unresolved Autocomplete result, get exact coordinates first
    if ('needsResolution' in loc && loc.needsResolution && 'placeId' in loc && loc.placeId) {
      const details = await resolvePlace(loc.placeId);
      if (details) {
        resolved = { ...resolved, lat: details.lat, lng: details.lng, name: details.name || loc.name };
      } else {
        console.warn('[App] Cannot favorite — Place Details resolution failed');
        return;
      }
    }

    if (alertConfig.isFavorite(resolved.id)) {
      alertConfig.removeFavorite(resolved.id);
    } else {
      alertConfig.addFavorite(resolved);
    }
  }, [alertConfig]);

  return (
    <>
      {/* Phase 5 — Global tsunami alert banner (fixed top, above everything) */}
      <TsunamiBanner risks={tsunamiRisks} />
      <div className="flex flex-col lg:flex-row h-[100dvh] w-full max-w-[100vw] theme-bg text-white overflow-hidden font-sans theme-transition">

        {/* ============ Desktop Side Rail (lg+) ============ */}
        <nav className="hidden lg:flex lg:flex-col lg:w-20 lg:shrink-0 glass-panel !rounded-none border-r border-white/10 z-20">
          <div className="flex flex-col items-center pt-6 pb-4">
            <div className="w-10 h-10 rounded-full border-2 border-white/30 flex items-center justify-center mb-2">
              <Anchor size={20} className="text-white" />
            </div>
            <span className="text-[10px] font-bold tracking-wider text-white/80">SeaYou</span>
          </div>

          <div className="flex-1 flex flex-col items-center gap-1 px-2 py-4">
            {visibleNavItems.map(({ view: navView, icon: Icon, labelKey }) => (
              <button
                key={navView}
                id={
                  navView === ViewState.DASHBOARD ? 'tour-nav-dashboard-desktop'
                  : navView === ViewState.MAP ? 'tour-nav-map-desktop'
                  : navView === ViewState.COASTS_MARINAS ? 'tour-nav-nearby-desktop'
                  : undefined
                }
                onClick={() => handleNavClick(navView)}
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
            <ProfileButton onOpenAuthModal={() => setIsAuthModalOpen(true)} onOpenProfile={() => setIsProfileOpen(true)} variant="desktop" />
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
          <header className="flex items-center justify-between gap-2 px-3 sm:px-5 pt-4 pb-3 shrink-0 z-20 w-full min-w-0 max-w-[100vw] box-border">
            {/* Left: Profile icon */}
            <div className="flex-shrink-0">
              <ProfileButton onOpenAuthModal={() => setIsAuthModalOpen(true)} onOpenProfile={() => setIsProfileOpen(true)} variant="mobile" />
            </div>

            {/* Center: App title with anchor logo — flex-1 so it gets its fair share */}
            <div className="flex-1 min-w-0 flex items-center justify-center gap-1.5 sm:gap-2">
              <Anchor size={18} className="text-white/90 shrink-0" aria-hidden="true" />
              <h1 className="text-lg sm:text-2xl font-bold tracking-wide text-white whitespace-nowrap truncate">SeaYou</h1>
            </div>

            {/* Right: Language + Theme toggle */}
            <div className="flex-shrink-0 flex items-center gap-2 sm:gap-3">
              <LanguageSelector />

              <button
                onClick={toggleTheme}
                className="lg:hidden relative flex items-center w-14 sm:w-[4.5rem] h-8 sm:h-9 glass-inner rounded-full p-1 border border-white/10 shadow-inner focus:outline-none shrink-0"
                aria-label="Toggle theme"
              >
                <div className={`absolute w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white shadow-md transition-transform duration-300 ${
                  resolvedTheme === 'dark' ? 'left-1 translate-x-0' : 'left-1 translate-x-[1.45rem] sm:translate-x-[2.25rem]'
                }`} />
                <div className="flex-1 flex justify-center z-10">
                  <Moon size={11} className={`transition-colors duration-300 ${resolvedTheme === 'dark' ? 'text-[#0d1b2a]' : 'text-white'}`} />
                </div>
                <div className="flex-1 flex justify-center z-10">
                  <Sun size={11} className={`transition-colors duration-300 ${resolvedTheme === 'dark' ? 'text-white' : 'text-[#2c6a9b]'}`} />
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
            <div className="fixed inset-0 z-50 modal-backdrop flex items-start justify-center pt-16 sm:pt-20 px-4" onClick={() => setShowLocationModal(false)}>
              <div className="glass-panel w-full max-w-md bg-[#0F3A5E]/80 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-8" onClick={(e) => e.stopPropagation()}>
                <div className="p-4 border-b border-white/10 flex justify-between items-center glass-inner !rounded-none !rounded-t-[1.25rem]">
                  <h3 className="font-bold text-white">{t('location.manage')}</h3>
                  <button onClick={() => setShowLocationModal(false)}>
                    <X className="text-white/40 hover:text-white transition-colors" />
                  </button>
                </div>

                <div className="p-4 max-h-[70vh] overflow-y-auto hide-scrollbar">
                  {/* Search input — live autocomplete */}
                  <form onSubmit={handleSearch} className="relative mb-4">
                    <input
                      type="text"
                      placeholder={t('location.search')}
                      className="w-full bg-black/20 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-white/40 focus:border-blue-400 focus:outline-none"
                      value={searchQuery}
                      onChange={(e) => handleSearchInput(e.target.value)}
                      autoFocus
                    />
                    <Search className="absolute left-3 top-3.5 text-white/40" size={18} />
                    {isSearching && (
                      <div className="absolute right-3 top-3.5">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-blue-400 rounded-full animate-spin" />
                      </div>
                    )}
                  </form>

                  {/* ─── Typing state: show search results with favorite hearts ─── */}
                  {searchQuery.trim().length >= 2 && searchResults.length > 0 && (
                    <div className="mb-4 space-y-1.5">
                      <h4 className="text-xs text-white/50 uppercase font-bold mb-2">{t('location.searchResults', 'Results')}</h4>
                      {searchResults.map(res => {
                        const isFav = alertConfig.isFavorite(res.id);
                        return (
                          <div key={res.id} className="flex items-center gap-1">
                            <button onClick={() => selectSearchResult(res)} className="flex-1 flex items-center p-3 rounded-xl glass-inner hover:bg-white/15 border border-white/5 group transition-colors text-left min-w-0">
                              <div className="min-w-0 flex-1">
                                <div className="font-bold text-white truncate">{res.name}</div>
                                {res.subtitle && <div className="text-xs text-white/50 truncate">{res.subtitle}</div>}
                              </div>
                              <Plus size={16} className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleFavoriteFor(res); }}
                              className="p-2.5 rounded-xl hover:bg-white/10 transition-colors shrink-0"
                              aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
                            >
                              <Heart size={16} className={`transition-colors ${isFav ? 'text-red-400 fill-red-400' : 'text-white/25 hover:text-white/50'}`} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ─── Empty state: GPS + Recents + Favorites ─── */}
                  {searchQuery.trim().length < 2 && (
                    <>
                      {/* GPS button */}
                      <button
                        onClick={handleLocateMe}
                        className="w-full mb-4 glass-inner border border-blue-400/30 rounded-xl p-3 flex items-center gap-3 font-bold text-blue-400 hover:bg-white/10 transition-colors"
                      >
                        <MapPin size={18} />
                        <span>{t('app.locateMe', 'Current Location')}</span>
                      </button>

                      {/* Recent Searches — with favorite hearts */}
                      {alertConfig.recentSearches.length > 0 && (
                        <div className="mb-4">
                          <h4 className="text-xs text-white/50 uppercase font-bold mb-2 flex items-center gap-1.5">
                            <Clock size={12} /> {t('location.recentSearches', 'Recent')}
                          </h4>
                          <div className="space-y-1.5">
                            {alertConfig.recentSearches.map(loc => {
                              const isFav = alertConfig.isFavorite(loc.id);
                              return (
                                <div key={loc.id} className="flex items-center gap-1">
                                  <button
                                    onClick={() => selectSavedLocation(loc)}
                                    className="flex-1 flex items-center gap-3 p-3 rounded-xl glass-inner hover:bg-white/15 border border-white/5 transition-colors text-left min-w-0"
                                  >
                                    <Clock size={14} className="text-white/30 shrink-0" />
                                    <span className="text-white/80 truncate">{loc.name}</span>
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); toggleFavoriteFor(loc); }}
                                    className="p-2.5 rounded-xl hover:bg-white/10 transition-colors shrink-0"
                                    aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
                                  >
                                    <Heart size={16} className={`transition-colors ${isFav ? 'text-red-400 fill-red-400' : 'text-white/25 hover:text-white/50'}`} />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Favorites */}
                      {alertConfig.favoriteLocations.length > 0 && (
                        <div className="mb-4">
                          <h4 className="text-xs text-white/50 uppercase font-bold mb-2 flex items-center gap-1.5">
                            <Star size={12} /> {t('location.favorites', 'Favorites')}
                          </h4>
                          <div className="space-y-1.5">
                            {alertConfig.favoriteLocations.map(loc => (
                              <button
                                key={loc.id}
                                onClick={() => selectSavedLocation(loc)}
                                className="w-full flex items-center gap-3 p-3 rounded-xl glass-inner hover:bg-white/15 border border-amber-400/20 transition-colors text-left"
                              >
                                <Heart size={14} className="text-amber-400 shrink-0 fill-amber-400" />
                                <span className="text-white/90 truncate">{loc.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Saved Places (session locations) */}
                      {locations.length > 0 && (
                        <div>
                          <h4 className="text-xs text-white/50 uppercase font-bold mb-2">{t('location.savedPlaces', 'Saved Places')}</h4>
                          <div className="space-y-1.5 max-h-48 overflow-y-auto hide-scrollbar pr-1">
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
                                  <MapPin size={16} className={currentLocation.id === loc.id ? "text-blue-400" : "text-white/40"} />
                                  <span className={currentLocation.id === loc.id ? "text-white font-bold" : "text-white/70"}>{loc.name}</span>
                                </div>
                                {currentLocation.id === loc.id && <Check size={14} className="text-blue-400" />}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ============ Main Content ============ */}
          <main
            ref={mainScrollRef}
            className={`flex-1 relative ${view === ViewState.MAP ? 'overflow-hidden' : 'overflow-y-auto scroll-smooth hide-scrollbar'} pb-28 lg:pb-4`}
            onTouchStart={view !== ViewState.MAP ? handleTouchStart : undefined}
            onTouchMove={view !== ViewState.MAP ? handleTouchMove : undefined}
            onTouchEnd={view !== ViewState.MAP ? handleTouchEnd : undefined}
          >
            {/* Pull-to-refresh indicator */}
            {(pullDistance > 0 || isRefreshing) && (
              <div
                className="flex items-center justify-center pointer-events-none"
                style={{
                  height: isRefreshing ? 48 : pullDistance * 0.6,
                  opacity: isRefreshing ? 1 : Math.min(pullDistance / PULL_THRESHOLD, 1),
                  transition: isRefreshing || pullDistance === 0 ? 'height 0.3s ease, opacity 0.3s ease' : 'none',
                }}
              >
                <div
                  className={`w-6 h-6 rounded-full border-2 border-white/40 border-t-white ${isRefreshing ? 'animate-spin' : ''}`}
                  style={{
                    transform: isRefreshing ? 'none' : `rotate(${pullDistance * 3}deg)`,
                    opacity: isRefreshing ? 1 : Math.min(pullDistance / PULL_THRESHOLD, 1),
                  }}
                />
              </div>
            )}
            {view === ViewState.DASHBOARD && (
              <ErrorBoundary
                resetKeys={[currentLocation.id, 'dashboard']}
                onReset={refetch}
                onError={(error, errorInfo) => {
                  console.error('Dashboard error:', error, errorInfo);
                }}
              >
                <Dashboard weatherData={weatherData} loading={isLoading} error={error} locationName={currentLocation.name} currentLat={currentLocation.lat} currentLng={currentLocation.lng} onRetry={refetch} onLocationClick={() => setShowLocationModal(true)} />
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
                    <MapContainerML currentLocation={{ lat: currentLocation.lat, lng: currentLocation.lng }} tsunamiRisks={tsunamiRisks} favoriteLocations={alertConfig.favoriteLocations} />
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
                <RoutePlanningView onShowOnMap={() => setView(ViewState.MAP)} />
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
            <div
              className="backdrop-blur-xl px-2 pt-2 pb-6 theme-transition"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--app-bg-card) 95%, transparent)',
                borderTop: '1px solid var(--app-border)',
              }}
            >
              <div className="flex justify-around items-center max-w-lg mx-auto">
                {visibleNavItems.map(({ view: navView, icon: Icon, labelKey }) => (
                  <button
                    key={navView}
                    id={
                      navView === ViewState.DASHBOARD ? 'tour-nav-dashboard-mobile'
                      : navView === ViewState.MAP ? 'tour-nav-map-mobile'
                      : navView === ViewState.COASTS_MARINAS ? 'tour-nav-nearby-mobile'
                      : undefined
                    }
                    onClick={() => handleNavClick(navView)}
                    className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all ${
                      view === navView
                        ? 'text-white bg-white/20'
                        : 'text-white/60 hover:text-white'
                    }`}
                    style={view === navView ? { color: 'var(--text-accent)' } : { color: 'var(--text-muted)' }}
                  >
                    <Icon size={20} />
                    <span className="text-[10px] font-medium">{t(labelKey)}</span>
                  </button>
                ))}
              </div>

              <div className="text-center mt-1.5">
                <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                  Weather data by{' '}
                  <a
                    href="https://open-meteo.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:opacity-80 transition-colors underline"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Open-Meteo.com
                  </a>
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* Auth Modal */}
        <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />

        {/* User Profile Modal */}
        <UserProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />

        {/* First-time Onboarding — local-only flag prevents cloud sync from skipping */}
        <OnboardingModal isOpen={showOnboarding} onComplete={() => {
          localStorage.setItem(ONBOARDING_FLAG, '1');
          setHasCompletedOnboarding(true);
        }} />

        {/* Post-onboarding Interactive Tour — only mount after prefs are confirmed loaded */}
        {showAppTour && <InteractiveTour
          run={showAppTour}
          onFinish={() => {
            // Write local cache FIRST so the next page load is instantly guarded
            // even if the Supabase round-trip is still in flight.
            try {
              window.localStorage.setItem(TOUR_LOCAL_CACHE_KEY, 'true');
            } catch {
              // Ignore quota / private-mode errors — cloud persistence still fires.
            }
            alertConfig.setHasCompletedTour(true);

            // UX-ideal moment to ask for push permission: the user has
            // just seen what the app can do and understands the value of
            // daily surf reports. `promptPushAndCapture` is a no-op if the
            // user isn't signed in, if permission is already granted, or
            // if they deny — so it's safe to fire unconditionally here.
            hasPromptedRef.current = true; // suppress the fallback effect
            promptPushAndCapture();
          }}
        />}
      </div>
    </>
  );
};

// ─── Auth Gate — shows AuthPage when not signed in ───

const AuthGate: React.FC = () => {
  const { user, loading } = useAuth();

  // Show nothing while restoring session (prevents flash)
  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #0a1628 0%, #0d2847 50%, #0a1628 100%)' }}>
        <WaveLoader size={72} />
      </div>
    );
  }

  // Not authenticated → full-page sign-in
  if (!user) {
    return <AuthPage />;
  }

  // Authenticated → main app (with onboarding gate inside)
  return <AppContent />;
};

// ─── Root App — wraps providers around AuthGate ───

const App: React.FC = () => (
  <ErrorBoundary
    onError={(error, errorInfo) => {
      console.error('Root error boundary caught:', error, errorInfo);
    }}
  >
    <AuthProvider>
      <AlertProvider>
        <RouteProvider>
          <AuthGate />
          {/* Phase 7 — global glass toast + modal stack, mounted once at
              the root so any module (including non-React services) can
              call toast.success() / confirmDialog() etc. */}
          <ToastHost />
          <DialogHost />
        </RouteProvider>
      </AlertProvider>
    </AuthProvider>
  </ErrorBoundary>
);

export default App;
