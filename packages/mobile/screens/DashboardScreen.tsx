import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  ListRenderItemInfo,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import {
  Wind,
  Waves,
  Thermometer,
  Navigation,
  Settings,
  Sailboat,
  Anchor as AnchorIcon,
  MapPin,
  Eye,
  TreePalm,
} from 'lucide-react-native';
import {
  generateTideData,
  ActivityPersona,
  scoreActivity,
  extractCurrentConditions,
  extractHourlyConditions,
  findBestWindow,
} from '@seame/core';
import type { MarineWeatherData } from '@seame/core';
import { useMarineData } from '../hooks/useMarineData';
import { MetricCard } from '../components/MetricCard';
import { TideCard } from '../components/TideCard';
import { HourlyForecast } from '../components/HourlyForecast';
import { ActivityTimelineMobile } from '../components/ActivityTimelineMobile';
import { ProfileScreen } from './ProfileScreen';
import { colors } from '../theme/colors';

const DEFAULT_LAT = 32.0853;
const DEFAULT_LNG = 34.7818;

// ─── Activity persona config ───

interface ActivityItem {
  id: string;
  label: string;
  persona: ActivityPersona;
  icon: React.ComponentType<{ size: number; color: string }>;
  color: string;
  glowColor: string;
}

const ACTIVITIES: ActivityItem[] = [
  { id: 'wave_surfer', label: 'Wave Surf', persona: ActivityPersona.WAVE_SURFER, icon: Waves, color: '#8b5cf6', glowColor: 'rgba(139, 92, 246, 0.2)' },
  { id: 'wind_surfer', label: 'Wind Surf', persona: ActivityPersona.WIND_SURFER, icon: Wind, color: '#22d3ee', glowColor: 'rgba(34, 211, 238, 0.2)' },
  { id: 'kite_surfer', label: 'Kite', persona: ActivityPersona.KITE_SURFER, icon: Navigation, color: '#f59e0b', glowColor: 'rgba(245, 158, 11, 0.2)' },
  { id: 'sailor', label: 'Sailing', persona: ActivityPersona.SAILOR, icon: Sailboat, color: colors.accent, glowColor: colors.accentGlow },
  { id: 'diver', label: 'Dive', persona: ActivityPersona.DIVER, icon: Eye, color: colors.blue, glowColor: colors.blueGlow },
  { id: 'beachgoer', label: 'Beach & Sun', persona: ActivityPersona.BEACHGOER, icon: TreePalm, color: '#f59e0b', glowColor: 'rgba(245, 158, 11, 0.2)' },
];

// ─── Score → color/label ───

function scoreColor(score: number): string {
  if (score >= 90) return '#a78bfa'; // purple — Epic
  if (score >= 70) return '#34d399'; // emerald — Good
  if (score >= 50) return '#3b82f6'; // blue — Fair
  if (score >= 30) return 'rgba(255,255,255,0.6)'; // dim — Poor
  return '#ef4444'; // red — Dangerous
}

function scoreLabel(score: number): string {
  if (score >= 90) return 'Epic';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Fair';
  if (score >= 30) return 'Poor';
  return 'No Go';
}

// ─── Current hour index ───

function getCurrentHourIndex(weatherData: MarineWeatherData): number {
  if (!weatherData?.hourly?.time) return 0;
  const now = Date.now();
  let closest = 0;
  let minDiff = Infinity;
  weatherData.hourly.time.forEach((t, i) => {
    const diff = Math.abs(now - new Date(t).getTime());
    if (diff < minDiff) { minDiff = diff; closest = i; }
  });
  return closest;
}

// ─── Activity Card ───

const ActivityCard = React.memo<{
  item: ActivityItem;
  weatherData: MarineWeatherData | null | undefined;
  currentHourIndex: number;
}>(({ item, weatherData, currentHourIndex }) => {
  const Icon = item.icon;

  const score = useMemo(() => {
    if (!weatherData) return null;
    const conditions = extractCurrentConditions(weatherData);
    return scoreActivity(item.persona, conditions);
  }, [weatherData, item.persona]);

  const bestWindow = useMemo(() => {
    if (!weatherData) return null;
    return findBestWindow(weatherData, item.persona, { startHourIndex: currentHourIndex });
  }, [weatherData, item.persona, currentHourIndex]);

  const overall = score?.overall ?? 0;

  return (
    <View style={styles.activityCard}>
      {/* Header row: icon + name + score badge */}
      <View style={styles.activityHeader}>
        <View style={[styles.activityIconBadge, { backgroundColor: item.glowColor }]}>
          <Icon size={18} color={item.color} />
        </View>
        <View style={styles.activityNameCol}>
          <Text style={styles.activityLabel}>{item.label}</Text>
          {bestWindow && (
            <Text style={styles.bestWindowText}>
              Best: {bestWindow.startTime.slice(11, 16)}–{bestWindow.endTime.slice(11, 16)}
            </Text>
          )}
        </View>
        {score && (
          <View style={[styles.scoreBadge, { backgroundColor: scoreColor(overall) + '33' }]}>
            <Text style={[styles.scoreValue, { color: scoreColor(overall) }]}>
              {Math.round(overall)}
            </Text>
            <Text style={[styles.scoreLabel, { color: scoreColor(overall) }]}>
              {scoreLabel(overall)}
            </Text>
          </View>
        )}
      </View>

      {/* Sparkline */}
      {weatherData && (
        <ActivityTimelineMobile
          persona={item.persona}
          weatherData={weatherData}
          startHourIndex={currentHourIndex}
        />
      )}
    </View>
  );
});
ActivityCard.displayName = 'ActivityCard';

// ─── Dashboard Screen ───

export function DashboardScreen() {
  const { data, isLoading, error, refetch } = useMarineData(
    DEFAULT_LAT,
    DEFAULT_LNG,
  );

  const [showProfile, setShowProfile] = useState(false);
  const openProfile = useCallback(() => setShowProfile(true), []);
  const closeProfile = useCallback(() => setShowProfile(false), []);

  const currentHourIndex = useMemo(() => {
    if (!data) return 0;
    return getCurrentHourIndex(data);
  }, [data]);

  const renderActivity = useCallback(
    ({ item }: ListRenderItemInfo<ActivityItem>) => (
      <ActivityCard item={item} weatherData={data} currentHourIndex={currentHourIndex} />
    ),
    [data, currentHourIndex],
  );

  const activityKeyExtractor = useCallback(
    (item: ActivityItem) => item.id,
    [],
  );

  if (isLoading) {
    return (
      <LinearGradient
        colors={[colors.bgGradientStart, colors.bgGradientEnd]}
        style={styles.loadingContainer}
      >
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading marine data...</Text>
        <StatusBar style="light" />
      </LinearGradient>
    );
  }

  if (error) {
    return (
      <LinearGradient
        colors={[colors.bgGradientStart, colors.bgGradientEnd]}
        style={styles.loadingContainer}
      >
        <Text style={styles.errorText}>Failed to load weather data</Text>
        <TouchableOpacity
          onPress={() => refetch()}
          style={styles.retryButton}
          accessibilityRole="button"
          accessibilityLabel="Retry loading data"
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
        <StatusBar style="light" />
      </LinearGradient>
    );
  }

  const current = data?.current;
  const tideData = generateTideData(DEFAULT_LAT, DEFAULT_LNG);

  return (
    <LinearGradient
      colors={[colors.bgGradientStart, colors.bgGradientEnd]}
      style={styles.gradient}
    >
      <FlatList
        data={[]}
        renderItem={null}
        ListHeaderComponent={
          <>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerSpacer} />
              <TouchableOpacity
                style={styles.locationPill}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Change location"
              >
                <MapPin size={14} color={colors.text} />
                <Text style={styles.locationText}>Tel Aviv</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.settingsButton}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Settings"
                onPress={openProfile}
              >
                <Settings size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Activity Cards — 6 personas with scores + sparklines */}
            <Text style={styles.sectionTitle}>Activity Report</Text>
            <FlatList
              data={ACTIVITIES}
              renderItem={renderActivity}
              keyExtractor={activityKeyExtractor}
              scrollEnabled={false}
              style={styles.activitiesList}
            />

            {/* Conditions Grid */}
            <Text style={styles.sectionTitle}>Current Conditions</Text>
            <View style={styles.grid}>
              <MetricCard
                title="Wind"
                value={current?.windSpeed?.toFixed(1) ?? '0'}
                unit="kts"
                icon={Wind}
                color={colors.accent}
              />
              <MetricCard
                title="Waves"
                value={current?.waveHeight?.toFixed(1) ?? '0'}
                unit="m"
                icon={Waves}
                color={colors.blue}
              />
              <MetricCard
                title="Air Temp"
                value={data?.general?.temperature?.toFixed(1) ?? '0'}
                unit="C"
                icon={Thermometer}
                color="#f59e0b"
              />
              <MetricCard
                title="Direction"
                value={current?.windDirection?.toFixed(0) ?? '0'}
                unit="deg"
                icon={Navigation}
                color="#8b5cf6"
              />
            </View>

            {/* Tide */}
            {tideData && <TideCard tideData={tideData} />}

            {/* Hourly Forecast */}
            {data?.hourly && <HourlyForecast hourlyData={data.hourly} />}
          </>
        }
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      />

      {/* Profile & Alerts modal — opens from the header settings gear */}
      <Modal
        visible={showProfile}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeProfile}
      >
        <ProfileScreen onClose={closeProfile} />
      </Modal>

      <StatusBar style="light" />
    </LinearGradient>
  );
}

// ─── Styles ───

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: colors.textSecondary,
    marginTop: 12,
    fontSize: 16,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: colors.glassPanel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    paddingHorizontal: 24,
    paddingVertical: 12,
    minHeight: 48,
    justifyContent: 'center',
  },
  retryText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerSpacer: {
    width: 40,
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.glassPanel,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
    minHeight: 48,
  },
  locationText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
    marginTop: 8,
  },
  activitiesList: {
    marginBottom: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 12,
  },

  // ─── Activity Card (new) ───
  activityCard: {
    backgroundColor: colors.glassPanel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: 14,
    marginBottom: 10,
  },
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  activityIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityNameCol: {
    flex: 1,
  },
  activityLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  bestWindowText: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  scoreBadge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    minWidth: 52,
  },
  scoreValue: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 22,
  },
  scoreLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
