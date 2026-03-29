import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  ListRenderItemInfo,
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
  Fish,
  Anchor as AnchorIcon,
  MapPin,
} from 'lucide-react-native';
import { generateTideData } from '@seame/core';
import { useMarineData } from '../hooks/useMarineData';
import { MetricCard } from '../components/MetricCard';
import { TideCard } from '../components/TideCard';
import { HourlyForecast } from '../components/HourlyForecast';
import { colors } from '../theme/colors';

const DEFAULT_LAT = 32.0853;
const DEFAULT_LNG = 34.7818;

interface ActivityItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ size: number; color: string }>;
  color: string;
}

const ACTIVITIES: ActivityItem[] = [
  { id: 'sailing', label: 'Sailing', icon: Sailboat, color: colors.accent },
  { id: 'fishing', label: 'Fishing', icon: Fish, color: '#f59e0b' },
  { id: 'diving', label: 'Diving', icon: AnchorIcon, color: colors.blue },
  { id: 'surfing', label: 'Surfing', icon: Waves, color: '#8b5cf6' },
];

const ACTIVITY_CARD_WIDTH = 100;
const ACTIVITY_CARD_MARGIN = 10;

const ActivityCard = React.memo<{ item: ActivityItem }>(({ item }) => {
  const Icon = item.icon;
  return (
    <TouchableOpacity
      style={styles.activityCard}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={item.label}
    >
      <Icon size={24} color={item.color} />
      <Text style={styles.activityLabel}>{item.label}</Text>
    </TouchableOpacity>
  );
});
ActivityCard.displayName = 'ActivityCard';

export function DashboardScreen() {
  const { data, isLoading, error, refetch } = useMarineData(
    DEFAULT_LAT,
    DEFAULT_LNG,
  );

  const renderActivity = useCallback(
    ({ item }: ListRenderItemInfo<ActivityItem>) => (
      <ActivityCard item={item} />
    ),
    [],
  );

  const activityKeyExtractor = useCallback(
    (item: ActivityItem) => item.id,
    [],
  );

  const activityGetItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: ACTIVITY_CARD_WIDTH + ACTIVITY_CARD_MARGIN,
      offset: (ACTIVITY_CARD_WIDTH + ACTIVITY_CARD_MARGIN) * index,
      index,
    }),
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
              >
                <Settings size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Activities */}
            <Text style={styles.sectionTitle}>Activities</Text>
            <FlatList
              data={ACTIVITIES}
              renderItem={renderActivity}
              keyExtractor={activityKeyExtractor}
              getItemLayout={activityGetItemLayout}
              horizontal
              showsHorizontalScrollIndicator={false}
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
      <StatusBar style="light" />
    </LinearGradient>
  );
}

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
  activityCard: {
    backgroundColor: colors.glassPanel,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    width: ACTIVITY_CARD_WIDTH,
    height: 90,
    marginRight: ACTIVITY_CARD_MARGIN,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  activityLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '500',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
});
