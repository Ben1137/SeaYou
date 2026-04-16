/**
 * ProfileScreen.tsx — Mobile persona + alert thresholds editor
 *
 * Mirrors the web AlertConfigModal. Persists all changes to AsyncStorage via
 * `preferencesStore` and syncs the persona / threshold tags to OneSignal so
 * server-side targeting stays up to date.
 *
 * Designed as a self-contained screen that can be presented either inside a
 * `<Modal>` from DashboardScreen or pushed onto a stack navigator.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Wind,
  Waves,
  Navigation as KiteIcon,
  Sailboat,
  Eye,
  TreePalm,
  AlertTriangle,
  Minus,
  Plus,
  X,
} from 'lucide-react-native';
import {
  ActivityPersona,
  UserPreferences,
  DEFAULT_PREFERENCES,
} from '@seame/core';
import {
  getUserPreferences,
  saveUserPreferences,
} from '../src/utils/preferencesStore';
import { registerUserTags } from '../src/services/oneSignalMobile';
import { colors } from '../theme/colors';

// ─── Persona config ───

interface PersonaOption {
  id: ActivityPersona;
  label: string;
  icon: React.ComponentType<{ size: number; color: string }>;
  color: string;
  glow: string;
}

const PERSONAS: PersonaOption[] = [
  {
    id: ActivityPersona.WAVE_SURFER,
    label: 'Wave Surf',
    icon: Waves,
    color: '#8b5cf6',
    glow: 'rgba(139, 92, 246, 0.25)',
  },
  {
    id: ActivityPersona.WIND_SURFER,
    label: 'Wind Surf',
    icon: Wind,
    color: colors.cyan,
    glow: 'rgba(34, 211, 238, 0.25)',
  },
  {
    id: ActivityPersona.KITE_SURFER,
    label: 'Kite',
    icon: KiteIcon,
    color: colors.amber,
    glow: colors.amberGlow,
  },
  {
    id: ActivityPersona.SAILOR,
    label: 'Sailing',
    icon: Sailboat,
    color: colors.accent,
    glow: colors.accentGlow,
  },
  {
    id: ActivityPersona.DIVER,
    label: 'Dive',
    icon: Eye,
    color: colors.blue,
    glow: colors.blueGlow,
  },
  {
    id: ActivityPersona.BEACHGOER,
    label: 'Beach & Sun',
    icon: TreePalm,
    color: colors.amber,
    glow: colors.amberGlow,
  },
];

// ─── Stepper bounds ───

const WAVE_MIN = 0.5;
const WAVE_MAX = 5.0;
const WAVE_STEP = 0.25;

const WIND_MIN = 10;
const WIND_MAX = 80;
const WIND_STEP = 5;

const SCORE_MIN = 40;
const SCORE_MAX = 100;
const SCORE_STEP = 5;

const HOURS_MIN = 1;
const HOURS_MAX = 24;
const HOURS_STEP = 1;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Build the OneSignal tag payload for the current preferences.
 * Keys mirror the web `registerUserTags` behaviour so push targeting works
 * identically across platforms.
 */
function prefsToOneSignalTags(prefs: UserPreferences): Record<string, string> {
  return {
    persona: prefs.primaryPersona,
    minScore: String(prefs.minScore),
    notifyHours: String(prefs.notifyHoursInAdvance),
    waveThreshold: prefs.alerts.waveHeightThreshold.toFixed(2),
    windThreshold: String(prefs.alerts.windSpeedThreshold),
  };
}

// ─── Props ───

interface ProfileScreenProps {
  /** Optional close callback — when present a close button is rendered */
  onClose?: () => void;
}

// ─── Screen ───

export function ProfileScreen({ onClose }: ProfileScreenProps) {
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);

  // Load on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await getUserPreferences();
      if (!cancelled) {
        setPrefs(loaded);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Persist + sync OneSignal tags in one shot. We debounce nothing here
   * because AsyncStorage + OneSignal addTags are both cheap and fire-and-forget.
   */
  const commit = useCallback((next: UserPreferences) => {
    setPrefs(next);
    saveUserPreferences(next).catch(() => {
      /* logged inside preferencesStore */
    });
    try {
      registerUserTags(prefsToOneSignalTags(next));
    } catch {
      /* OneSignal SDK may be uninitialized — non-critical */
    }
  }, []);

  // ─── Update helpers ───

  const updatePersona = useCallback(
    (persona: ActivityPersona) => {
      commit({ ...prefs, primaryPersona: persona });
    },
    [prefs, commit],
  );

  const updateWave = useCallback(
    (delta: number) => {
      const next = clamp(
        Math.round((prefs.alerts.waveHeightThreshold + delta) * 100) / 100,
        WAVE_MIN,
        WAVE_MAX,
      );
      commit({
        ...prefs,
        alerts: { ...prefs.alerts, waveHeightThreshold: next },
      });
    },
    [prefs, commit],
  );

  const updateWind = useCallback(
    (delta: number) => {
      const next = clamp(prefs.alerts.windSpeedThreshold + delta, WIND_MIN, WIND_MAX);
      commit({
        ...prefs,
        alerts: { ...prefs.alerts, windSpeedThreshold: next },
      });
    },
    [prefs, commit],
  );

  const updateScore = useCallback(
    (delta: number) => {
      const next = clamp(prefs.minScore + delta, SCORE_MIN, SCORE_MAX);
      commit({ ...prefs, minScore: next });
    },
    [prefs, commit],
  );

  const updateHours = useCallback(
    (delta: number) => {
      const next = clamp(prefs.notifyHoursInAdvance + delta, HOURS_MIN, HOURS_MAX);
      commit({ ...prefs, notifyHoursInAdvance: next });
    },
    [prefs, commit],
  );

  const toggleHighWaves = useCallback(() => {
    commit({
      ...prefs,
      alerts: { ...prefs.alerts, highWavesEnabled: !prefs.alerts.highWavesEnabled },
    });
  }, [prefs, commit]);

  const toggleStrongWinds = useCallback(() => {
    commit({
      ...prefs,
      alerts: { ...prefs.alerts, strongWindsEnabled: !prefs.alerts.strongWindsEnabled },
    });
  }, [prefs, commit]);

  const toggleTsunamiAlerts = useCallback(() => {
    commit({
      ...prefs,
      alerts: { ...prefs.alerts, tsunamiAlertsEnabled: !prefs.alerts.tsunamiAlertsEnabled },
    });
  }, [prefs, commit]);

  // ─── Loading state ───

  if (loading) {
    return (
      <LinearGradient
        colors={[colors.bgGradientStart, colors.bgGradientEnd]}
        style={styles.loadingContainer}
      >
        <ActivityIndicator size="large" color={colors.accent} />
        <StatusBar style="light" />
      </LinearGradient>
    );
  }

  // ─── Render ───

  return (
    <LinearGradient
      colors={[colors.bgGradientStart, colors.bgGradientEnd]}
      style={styles.gradient}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Profile & Alerts</Text>
          {onClose && (
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close settings"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <X size={22} color={colors.text} />
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.subtitle}>
          Your activity profile drives scoring, push notifications, and the
          best-window alerts.
        </Text>

        {/* ─── Primary Persona ─── */}
        <Text style={styles.sectionLabel}>Primary activity</Text>
        <View style={styles.personaGrid}>
          {PERSONAS.map((p) => {
            const Icon = p.icon;
            const active = prefs.primaryPersona === p.id;
            return (
              <TouchableOpacity
                key={p.id}
                onPress={() => updatePersona(p.id)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Select ${p.label}`}
                accessibilityState={{ selected: active }}
                style={[
                  styles.personaCard,
                  active && {
                    borderColor: p.color,
                    backgroundColor: p.glow,
                  },
                ]}
              >
                <Icon size={24} color={active ? p.color : colors.textSecondary} />
                <Text
                  style={[
                    styles.personaLabel,
                    { color: active ? colors.text : colors.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ─── Wave threshold ─── */}
        <Stepper
          title="High wave alert"
          subtitle="Notify me when waves exceed this height."
          valueLabel={`${prefs.alerts.waveHeightThreshold.toFixed(2)} m`}
          onDecrement={() => updateWave(-WAVE_STEP)}
          onIncrement={() => updateWave(WAVE_STEP)}
          decrementDisabled={prefs.alerts.waveHeightThreshold <= WAVE_MIN}
          incrementDisabled={prefs.alerts.waveHeightThreshold >= WAVE_MAX}
          trailing={
            <Switch
              value={prefs.alerts.highWavesEnabled}
              onValueChange={toggleHighWaves}
              thumbColor={colors.text}
              trackColor={{ false: 'rgba(255,255,255,0.15)', true: colors.accent }}
            />
          }
        />

        {/* ─── Wind threshold ─── */}
        <Stepper
          title="Strong wind alert"
          subtitle="Notify me when sustained wind exceeds this speed."
          valueLabel={`${prefs.alerts.windSpeedThreshold} km/h`}
          onDecrement={() => updateWind(-WIND_STEP)}
          onIncrement={() => updateWind(WIND_STEP)}
          decrementDisabled={prefs.alerts.windSpeedThreshold <= WIND_MIN}
          incrementDisabled={prefs.alerts.windSpeedThreshold >= WIND_MAX}
          trailing={
            <Switch
              value={prefs.alerts.strongWindsEnabled}
              onValueChange={toggleStrongWinds}
              thumbColor={colors.text}
              trackColor={{ false: 'rgba(255,255,255,0.15)', true: colors.accent }}
            />
          }
        />

        {/* ─── Tsunami Alerts ─── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.tsunamiIconWrap}>
              <AlertTriangle size={20} color="#ef4444" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Tsunami Alerts</Text>
              <Text style={styles.cardSubtitle}>
                Receive critical push notifications for tsunami warnings in your area.
              </Text>
            </View>
            <Switch
              value={prefs.alerts.tsunamiAlertsEnabled}
              onValueChange={toggleTsunamiAlerts}
              thumbColor={colors.text}
              trackColor={{ false: 'rgba(255,255,255,0.15)', true: '#ef4444' }}
            />
          </View>
        </View>

        {/* ─── Minimum score ─── */}
        <Stepper
          title="Minimum hype score"
          subtitle="Only alert me when a window scores above this value."
          valueLabel={`${prefs.minScore} / 100`}
          onDecrement={() => updateScore(-SCORE_STEP)}
          onIncrement={() => updateScore(SCORE_STEP)}
          decrementDisabled={prefs.minScore <= SCORE_MIN}
          incrementDisabled={prefs.minScore >= SCORE_MAX}
        />

        {/* ─── Notify hours in advance ─── */}
        <Stepper
          title="Notify hours ahead"
          subtitle="How far in advance should we scan for the best window?"
          valueLabel={`${prefs.notifyHoursInAdvance} h`}
          onDecrement={() => updateHours(-HOURS_STEP)}
          onIncrement={() => updateHours(HOURS_STEP)}
          decrementDisabled={prefs.notifyHoursInAdvance <= HOURS_MIN}
          incrementDisabled={prefs.notifyHoursInAdvance >= HOURS_MAX}
        />

        <Text style={styles.footerNote}>
          Changes save automatically and sync to your push profile.
        </Text>
      </ScrollView>
      <StatusBar style="light" />
    </LinearGradient>
  );
}

// ─── Stepper row component ───

interface StepperProps {
  title: string;
  subtitle: string;
  valueLabel: string;
  onDecrement: () => void;
  onIncrement: () => void;
  decrementDisabled?: boolean;
  incrementDisabled?: boolean;
  trailing?: React.ReactNode;
}

function Stepper({
  title,
  subtitle,
  valueLabel,
  onDecrement,
  onIncrement,
  decrementDisabled,
  incrementDisabled,
  trailing,
}: StepperProps) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardSubtitle}>{subtitle}</Text>
        </View>
        {trailing}
      </View>
      <View style={styles.stepperRow}>
        <TouchableOpacity
          onPress={onDecrement}
          disabled={decrementDisabled}
          style={[styles.stepperButton, decrementDisabled && styles.stepperButtonDisabled]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${title}`}
        >
          <Minus size={18} color={decrementDisabled ? colors.textMuted : colors.text} />
        </TouchableOpacity>
        <Text style={styles.stepperValue}>{valueLabel}</Text>
        <TouchableOpacity
          onPress={onIncrement}
          disabled={incrementDisabled}
          style={[styles.stepperButton, incrementDisabled && styles.stepperButtonDisabled]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${title}`}
        >
          <Plus size={18} color={incrementDisabled ? colors.textMuted : colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: {
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.glassPanel,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 24,
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  personaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 28,
  },
  personaCard: {
    flexBasis: '31%',
    flexGrow: 1,
    minWidth: 100,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.glassPanel,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  personaLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  card: {
    backgroundColor: colors.glassPanel,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  tsunamiIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 12,
    padding: 6,
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.glassPanelHover,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonDisabled: {
    opacity: 0.35,
  },
  stepperValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  footerNote: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 12,
  },
});
