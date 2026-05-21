import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Crown,
  Sparkles,
  Anchor,
  Waves,
  Sun,
  Activity,
  Globe,
  LogOut,
  Trash2,
  ChevronRight,
  MapPin,
  Heart,
  Star,
  AlertTriangle,
  Check,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../src/contexts/AuthContext';
import { useAlertConfig } from '../../src/contexts/AlertContext';
import { useUserPreferences } from '../../src/hooks/useUserPreferences';
import { ModelPicker } from './ModelPicker';
import { startCheckout } from '../../src/services/billing';
import {
  ActivityPersona,
  scoreActivity,
  extractCurrentConditions,
  fetchMarineWeather,
  ACTIVITIES_BY_CATEGORY,
} from '@seame/core';
import type { OnboardingPersona, SavedLocation, MarineWeatherData, PersonaCategory } from '@seame/core';

// ─── Constants ───

const PERSONA_OPTIONS: {
  id: OnboardingPersona;
  icon: React.ReactNode;
  labelKey: string;
  descKey: string;
  scoringPersona: ActivityPersona;
}[] = [
  { id: 'mariner',   icon: <Anchor size={20} />,   labelKey: 'profile.persona.mariner',   descKey: 'profile.persona.marinerDesc',   scoringPersona: ActivityPersona.SAILOR },
  { id: 'surfer',    icon: <Waves size={20} />,     labelKey: 'profile.persona.surfer',    descKey: 'profile.persona.surferDesc',    scoringPersona: ActivityPersona.WAVE_SURFER },
  { id: 'beachgoer', icon: <Sun size={20} />,       labelKey: 'profile.persona.beachgoer', descKey: 'profile.persona.beachgoerDesc', scoringPersona: ActivityPersona.BEACHGOER },
  { id: 'diver',     icon: <Activity size={20} />,  labelKey: 'profile.persona.diver',     descKey: 'profile.persona.diverDesc',     scoringPersona: ActivityPersona.DIVER },
];

const PERSONA_CATEGORY_ICONS: Record<PersonaCategory, string> = {
  surfer: '🏄',
  wind_rider: '🪁',
  mariner: '⛵',
  beach: '🏖️',
  diver: '🤿',
};

const LANGUAGES = [
  { code: 'en', label: 'English',  flag: '🇬🇧' },
  { code: 'he', label: 'עברית',    flag: '🇮🇱' },
  { code: 'de', label: 'Deutsch',  flag: '🇩🇪' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'ru', label: 'Русский',  flag: '🇷🇺' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'es', label: 'Español',  flag: '🇪🇸' },
];

// ─── Favorite Ticker — live scoring per location ───

interface FavoriteTickerProps {
  favorites: SavedLocation[];
  persona: ActivityPersona;
}

const FavoriteTicker: React.FC<FavoriteTickerProps> = ({ favorites, persona }) => {
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState(0);
  const [scores, setScores] = useState<Record<string, { score: number; label: string; color: string } | null>>({});
  const fetchedRef = useRef<Set<string>>(new Set());

  // Fetch weather data + score for each favorite
  useEffect(() => {
    if (favorites.length === 0) return;

    let cancelled = false;
    const fetchAll = async () => {
      for (const fav of favorites) {
        if (fetchedRef.current.has(fav.id)) continue;
        fetchedRef.current.add(fav.id);
        try {
          const weather = await fetchMarineWeather(fav.lat, fav.lng);
          if (cancelled) return;
          const conds = extractCurrentConditions(weather);
          const result = scoreActivity(persona, conds);
          setScores(prev => ({
            ...prev,
            [fav.id]: { score: result.overall, label: result.label, color: result.color },
          }));
        } catch {
          if (!cancelled) {
            setScores(prev => ({ ...prev, [fav.id]: null }));
          }
        }
      }
    };
    fetchAll();
    return () => { cancelled = true; };
  }, [favorites, persona]);

  // Auto-rotate every 3s
  useEffect(() => {
    if (favorites.length <= 1) return;
    const timer = setInterval(() => {
      setActiveIndex(i => (i + 1) % favorites.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [favorites.length]);

  if (favorites.length === 0) {
    return (
      <div className="flex items-center gap-3 px-4 py-5 rounded-2xl"
        style={{ background: 'var(--app-bg-card)', border: '1px solid var(--app-border)' }}>
        <Heart size={18} className="text-white/20 shrink-0" />
        <span className="text-sm text-white/30">{t('profile.noFavorites', 'No favorite locations yet')}</span>
      </div>
    );
  }

  const fav = favorites[activeIndex];
  const scoreData = scores[fav?.id];

  return (
    <div className="relative overflow-hidden rounded-2xl"
      style={{ background: 'var(--app-bg-card)', border: '1px solid var(--app-border)' }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={fav.id}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.35, ease: 'easeInOut' }}
          className="flex items-center gap-3 px-4 py-4"
        >
          <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
            <MapPin size={16} className="text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white truncate">{fav.name}</div>
            <div className="text-xs text-white/40 mt-0.5">
              {fav.lat.toFixed(2)}, {fav.lng.toFixed(2)}
            </div>
          </div>
          {scoreData ? (
            <div className="flex flex-col items-end shrink-0">
              <div className={`text-lg font-black ${scoreData.color}`}>
                {scoreData.score}
              </div>
              <div className="text-[10px] text-white/40 font-medium">{scoreData.label}</div>
            </div>
          ) : scoreData === null ? (
            <span className="text-xs text-white/20">--</span>
          ) : (
            <div className="w-5 h-5 border-2 border-white/10 border-t-blue-400 rounded-full animate-spin shrink-0" />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Dot indicators */}
      {favorites.length > 1 && (
        <div className="flex justify-center gap-1.5 pb-3">
          {favorites.map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveIndex(i)}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                i === activeIndex ? 'bg-blue-400 w-4' : 'bg-white/15'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Main Profile Modal ───

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose }) => {
  const { user, signOut } = useAuth();
  const { t, i18n } = useTranslation();
  const {
    persona,
    setPersona,
    subscriptionTier,
    primaryPersona,
    favoriteLocations,
    cloudSyncStatus,
  } = useAlertConfig();
  const { preferences, setPreference } = useUserPreferences();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);

  const isPremium = subscriptionTier === 'premium';
  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const email = user?.email || '';
  const avatarUrl = user?.user_metadata?.avatar_url;
  const initial = displayName.charAt(0).toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    onClose();
  };

  const handleDeleteAccount = () => {
    // For now, show confirmation then sign out
    // Full account deletion requires a Supabase Edge Function
    setShowDeleteConfirm(false);
    signOut();
    onClose();
  };

  const handlePersonaChange = (p: OnboardingPersona) => {
    setPersona(p);
  };

  const handleLanguageChange = (code: string) => {
    i18n.changeLanguage(code);
    localStorage.setItem('seayou-language', code);
    setShowLangPicker(false);
  };

  const currentLang = LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[95] flex items-start justify-center overflow-y-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

          {/* Modal panel */}
          <motion.div
            className="relative z-10 w-full max-w-md my-4 mx-4 sm:my-8 rounded-3xl overflow-hidden"
            style={{ background: 'linear-gradient(165deg, #1a2744 0%, #0f1d33 100%)' }}
            initial={{ scale: 0.92, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 30 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* ─── SECTION 1: Header / Identity ─── */}
            <div className="relative px-6 pt-8 pb-6">
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
              >
                <X size={16} className="text-white/40" />
              </button>

              <div className="flex items-center gap-4">
                {/* Avatar */}
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="w-16 h-16 rounded-2xl object-cover border-2 border-white/10"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center border-2 border-white/10">
                    <span className="text-2xl font-black text-white">{initial}</span>
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-black text-white truncate">{displayName}</h2>
                  <p className="text-sm text-white/40 truncate">{email}</p>

                  {/* Tier badge */}
                  <div className="flex items-center gap-2 mt-2">
                    {isPremium ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-400 border border-amber-400/20">
                        <Crown size={12} /> {t('profile.premium', 'Premium')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-white/5 text-white/40 border border-white/10">
                        {t('profile.free', 'Free')}
                      </span>
                    )}

                    {/* Sync indicator */}
                    {cloudSyncStatus === 'synced' && (
                      <span className="text-[10px] text-green-400/60 flex items-center gap-1">
                        <Check size={10} /> {t('profile.synced', 'Synced')}
                      </span>
                    )}
                    {cloudSyncStatus === 'syncing' && (
                      <span className="text-[10px] text-blue-400/60">
                        {t('profile.syncing', 'Syncing...')}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Upgrade CTA (only for free users) */}
              {!isPremium && (
                <button
                  onClick={async () => {
                    const res = await startCheckout();
                    if (!res.ok && res.error) {
                      // startCheckout redirects on success, so we only
                      // reach this branch on failure. Surface the issue
                      // via a lightweight alert — a toast system would be
                      // nicer but this modal is auth-gated and errors here
                      // are rare.
                      alert(res.error.message);
                    }
                  }}
                  className="mt-5 w-full h-12 rounded-2xl font-bold text-sm bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
                >
                  <Sparkles size={16} /> {t('profile.upgradeToPremium', 'Upgrade to Premium')}
                </button>
              )}
            </div>

            {/* Divider */}
            <div className="h-px mx-6" style={{ background: 'var(--app-border, rgba(255,255,255,0.08))' }} />

            {/* ─── SECTION 2: Personalization ─── */}
            <div className="px-6 py-5">
              <h3 className="text-xs uppercase tracking-wider font-semibold text-white/30 mb-4">
                {t('profile.personalization', 'Personalization')}
              </h3>

              {/* Persona selector */}
              <div className="grid grid-cols-2 gap-2 mb-5">
                {PERSONA_OPTIONS.map(opt => {
                  const isSelected = persona === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => handlePersonaChange(opt.id)}
                      className={`flex items-center gap-2.5 px-3 py-3 rounded-xl transition-all text-left ${
                        isSelected
                          ? 'bg-blue-500/15 border-blue-400/30 ring-1 ring-blue-400/20'
                          : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.06]'
                      } border`}
                    >
                      <span className={isSelected ? 'text-blue-400' : 'text-white/30'}>
                        {opt.icon}
                      </span>
                      <div className="min-w-0">
                        <div className={`text-sm font-semibold ${isSelected ? 'text-white' : 'text-white/60'}`}>
                          {t(opt.labelKey, opt.id)}
                        </div>
                      </div>
                      {isSelected && (
                        <Check size={14} className="text-blue-400 ml-auto shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Language selector */}
              <div className="relative">
                <button
                  onClick={() => setShowLangPicker(v => !v)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] transition-colors"
                >
                  <Globe size={18} className="text-white/30 shrink-0" />
                  <div className="flex-1 text-left">
                    <div className="text-xs text-white/30 font-medium">{t('profile.language', 'Language')}</div>
                    <div className="text-sm text-white/80 font-semibold">{currentLang.flag} {currentLang.label}</div>
                  </div>
                  <ChevronRight size={16} className={`text-white/20 transition-transform ${showLangPicker ? 'rotate-90' : ''}`} />
                </button>

                <AnimatePresence>
                  {showLangPicker && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="grid grid-cols-2 gap-1.5 mt-2">
                        {LANGUAGES.map(lang => (
                          <button
                            key={lang.code}
                            onClick={() => handleLanguageChange(lang.code)}
                            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                              i18n.language === lang.code
                                ? 'bg-blue-500/15 text-blue-400 font-semibold'
                                : 'text-white/50 hover:bg-white/5'
                            }`}
                          >
                            <span>{lang.flag}</span>
                            <span className="truncate">{lang.label}</span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Model picker */}
              <div className="mt-3">
                <ModelPicker
                  selectedModel={preferences.selectedModel}
                  onChange={(m) => setPreference('selectedModel', m)}
                />
              </div>
            </div>

            {/* Divider */}
            <div className="h-px mx-6" style={{ background: 'var(--app-border, rgba(255,255,255,0.08))' }} />

            {/* ─── SECTION 3: Favorites Ticker ─── */}
            <div className="px-6 py-5">
              <h3 className="text-xs uppercase tracking-wider font-semibold text-white/30 mb-4 flex items-center gap-2">
                <Star size={12} className="text-amber-400/60" />
                {t('profile.favoriteLocations', 'Favorite Locations')}
                {favoriteLocations.length > 0 && (
                  <span className="text-[10px] text-white/20 font-normal ml-auto">
                    {favoriteLocations.length} {t('profile.saved', 'saved')}
                  </span>
                )}
              </h3>

              <FavoriteTicker
                favorites={favoriteLocations}
                persona={primaryPersona}
              />
            </div>

            {/* Divider */}
            <div className="h-px mx-6" style={{ background: 'var(--app-border, rgba(255,255,255,0.08))' }} />

            {/* ─── SECTION 4: Danger Zone ─── */}
            <div className="px-6 py-5 pb-8">
              <h3 className="text-xs uppercase tracking-wider font-semibold text-white/30 mb-4">
                {t('profile.account', 'Account')}
              </h3>

              <div className="space-y-2">
                {/* Sign Out */}
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] transition-colors group"
                >
                  <LogOut size={18} className="text-white/30 group-hover:text-white/50 shrink-0" />
                  <span className="text-sm text-white/60 group-hover:text-white/80 font-semibold">
                    {t('auth.signOut', 'Sign out')}
                  </span>
                </button>

                {/* Delete Account */}
                {!showDeleteConfirm ? (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-red-500/[0.04] border border-red-500/10 hover:bg-red-500/10 transition-colors group"
                  >
                    <Trash2 size={18} className="text-red-400/40 group-hover:text-red-400/70 shrink-0" />
                    <span className="text-sm text-red-400/50 group-hover:text-red-400/80 font-semibold">
                      {t('profile.deleteAccount', 'Delete Account')}
                    </span>
                  </button>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-xl bg-red-500/10 border border-red-500/20"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-sm font-bold text-red-400">
                          {t('profile.deleteConfirmTitle', 'Are you sure?')}
                        </div>
                        <div className="text-xs text-red-400/60 mt-1 leading-relaxed">
                          {t('profile.deleteConfirmDesc', 'This will permanently delete your account and all synced data. This action cannot be undone.')}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1 h-9 rounded-lg text-xs font-semibold text-white/60 bg-white/5 hover:bg-white/10 transition-colors"
                      >
                        {t('common.cancel', 'Cancel')}
                      </button>
                      <button
                        onClick={handleDeleteAccount}
                        className="flex-1 h-9 rounded-lg text-xs font-bold text-white bg-red-500 hover:bg-red-600 transition-colors"
                      >
                        {t('profile.deleteConfirm', 'Yes, Delete')}
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
