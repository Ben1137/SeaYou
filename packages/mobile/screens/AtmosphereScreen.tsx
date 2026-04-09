import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  ListRenderItemInfo,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import {
  Thermometer,
  Droplets,
  Wind,
  Eye,
  Sun,
  Moon,
  Gauge,
} from 'lucide-react-native';
import { useMarineData } from '../hooks/useMarineData';
import { HourlyForecastItem } from '@seame/core';
import { colors } from '../theme/colors';

const DEFAULT_LAT = 32.0853;
const DEFAULT_LNG = 34.7818;

const HOUR_CARD_WIDTH = 64;
const HOUR_CARD_MARGIN = 8;

interface AtmoMetric {
  id: string;
  label: string;
  value: string;
  unit: string;
  icon: React.ComponentType<{ size: number; color: string }>;
  color: string;
}

const AtmoCard = React.memo<{ item: AtmoMetric }>(({ item }) => {
  const Icon = item.icon;
  return (
    <View style={styles.atmoCard}>
      <View style={styles.atmoCardHeader}>
        <Icon size={18} color={item.color} />
        <Text style={styles.atmoCardLabel}>{item.label}</Text>
      </View>
      <View style={styles.atmoCardValue}>
        <Text style={[styles.atmoCardNumber, { color: item.color }]}>
          {item.value}
        </Text>
        <Text style={styles.atmoCardUnit}>{item.unit}</Text>
      </View>
    </View>
  );
});
AtmoCard.displayName = 'AtmoCard';

const HourlyItem = React.memo<{ item: HourlyForecastItem }>(({ item }) => (
  <View style={styles.hourCard}>
    <Text style={styles.hourTime}>
      {new Date(item.time).toLocaleTimeString([], { hour: '2-digit' })}
    </Text>
    <Text style={styles.hourTemp}>{item.temperature.toFixed(0)}</Text>
    <Text style={styles.hourWind}>{item.windSpeed.toFixed(0)}kts</Text>
  </View>
));
HourlyItem.displayName = 'HourlyItem';

export function AtmosphereScreen() {
  const { data, isLoading, error, refetch } = useMarineData(
    DEFAULT_LAT,
    DEFAULT_LNG,
  );

  const renderHourly = useCallback(
    ({ item }: ListRenderItemInfo<HourlyForecastItem>) => (
      <HourlyItem item={item} />
    ),
    [],
  );

  const hourlyKeyExtractor = useCallback(
    (item: HourlyForecastItem) => item.time,
    [],
  );

  const hourlyGetItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: HOUR_CARD_WIDTH + HOUR_CARD_MARGIN,
      offset: (HOUR_CARD_WIDTH + HOUR_CARD_MARGIN) * index,
      index,
    }),
    [],
  );

  if (isLoading) {
    return (
      <LinearGradient
        colors={[colors.bgGradientStart, colors.bgGradientEnd]}
        style={styles.centered}
      >
        <ActivityIndicator size="large" color={colors.accent} />
        <StatusBar style="light" />
      </LinearGradient>
    );
  }

  if (error) {
    return (
      <LinearGradient
        colors={[colors.bgGradientStart, colors.bgGradientEnd]}
        style={styles.centered}
      >
        <Text style={styles.errorText}>Failed to load atmosphere data</Text>
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

  const general = data?.general;
  const current = data?.current;

  const weatherDesc = general?.weatherDescription ?? 'Clear sky';
  const temperature = general?.temperature?.toFixed(0) ?? '--';
  const feelsLike = general?.feelsLike?.toFixed(0) ?? '--';

  const metrics: AtmoMetric[] = [
    {
      id: 'humidity',
      label: 'Humidity',
      value: `${general?.humidity ?? '--'}`,
      unit: '%',
      icon: Droplets,
      color: '#60a5fa',
    },
    {
      id: 'wind',
      label: 'Wind',
      value: `${current?.windSpeed?.toFixed(0) ?? '--'}`,
      unit: 'kts',
      icon: Wind,
      color: colors.accent,
    },
    {
      id: 'pressure',
      label: 'Pressure',
      value: `${general?.pressure?.toFixed(0) ?? '--'}`,
      unit: 'hPa',
      icon: Gauge,
      color: '#f59e0b',
    },
    {
      id: 'visibility',
      label: 'Visibility',
      value: `${general?.visibility ? (general.visibility / 1000).toFixed(0) : '--'}`,
      unit: 'km',
      icon: Eye,
      color: '#a78bfa',
    },
    {
      id: 'uv',
      label: 'UV Index',
      value: `${general?.uvIndex?.toFixed(0) ?? '--'}`,
      unit: '',
      icon: Sun,
      color: '#fb923c',
    },
    {
      id: 'moon',
      label: 'Moon',
      value: general?.moonPhase ?? '--',
      unit: '',
      icon: Moon,
      color: '#e2e8f0',
    },
  ];

  const hourlyData: HourlyForecastItem[] =
    general?.hourlyForecast?.slice(0, 24) ?? [];

  const renderMetric = useCallback(
    ({ item }: ListRenderItemInfo<AtmoMetric>) => <AtmoCard item={item} />,
    [],
  );

  const metricKeyExtractor = useCallback((item: AtmoMetric) => item.id, []);

  return (
    <LinearGradient
      colors={[colors.bgGradientStart, colors.bgGradientEnd]}
      style={styles.gradient}
    >
      <FlatList
        data={metrics}
        renderItem={renderMetric}
        keyExtractor={metricKeyExtractor}
        numColumns={2}
        columnWrapperStyle={styles.metricsRow}
        ListHeaderComponent={
          <>
            {/* Hero weather */}
            <View style={styles.hero}>
              <Text style={styles.heroTemp}>{temperature}</Text>
              <Text style={styles.heroDegree}>C</Text>
            </View>
            <Text style={styles.heroDesc}>{weatherDesc}</Text>
            <Text style={styles.heroFeels}>Feels like {feelsLike}C</Text>

            {/* Solar */}
            <View style={styles.solarRow}>
              <View style={styles.solarItem}>
                <Sun size={16} color="#f59e0b" />
                <Text style={styles.solarLabel}>Sunrise</Text>
                <Text style={styles.solarValue}>
                  {general?.sunrise
                    ? new Date(general.sunrise).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '--:--'}
                </Text>
              </View>
              <View style={styles.solarItem}>
                <Sun size={16} color="#fb923c" />
                <Text style={styles.solarLabel}>Sunset</Text>
                <Text style={styles.solarValue}>
                  {general?.sunset
                    ? new Date(general.sunset).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '--:--'}
                </Text>
              </View>
              <View style={styles.solarItem}>
                <Moon size={16} color="#e2e8f0" />
                <Text style={styles.solarLabel}>Moonrise</Text>
                <Text style={styles.solarValue}>
                  {general?.moonrise
                    ? new Date(general.moonrise).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '--:--'}
                </Text>
              </View>
            </View>

            {/* 24h horizontal scroll */}
            {hourlyData.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>24-Hour Forecast</Text>
                <FlatList
                  data={hourlyData}
                  renderItem={renderHourly}
                  keyExtractor={hourlyKeyExtractor}
                  getItemLayout={hourlyGetItemLayout}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.hourlyList}
                />
              </>
            )}

            <Text style={styles.sectionTitle}>Conditions</Text>
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 100,
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
  hero: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginTop: 12,
  },
  heroTemp: {
    fontSize: 96,
    fontWeight: '200',
    color: colors.text,
  },
  heroDegree: {
    fontSize: 32,
    fontWeight: '300',
    color: colors.textSecondary,
    marginTop: 16,
  },
  heroDesc: {
    fontSize: 20,
    color: colors.text,
    textAlign: 'center',
    fontWeight: '500',
    marginBottom: 4,
  },
  heroFeels: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 24,
  },
  solarRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.glassPanel,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: 16,
    marginBottom: 24,
  },
  solarItem: {
    alignItems: 'center',
    gap: 4,
  },
  solarLabel: {
    fontSize: 11,
    color: colors.textMuted,
  },
  solarValue: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
  },
  hourlyList: {
    marginBottom: 24,
  },
  hourCard: {
    backgroundColor: colors.glassPanel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: 10,
    marginRight: HOUR_CARD_MARGIN,
    width: HOUR_CARD_WIDTH,
    alignItems: 'center',
    gap: 4,
  },
  hourTime: {
    fontSize: 11,
    color: colors.textMuted,
  },
  hourTemp: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  hourWind: {
    fontSize: 11,
    color: colors.accent,
  },
  metricsRow: {
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  atmoCard: {
    backgroundColor: colors.glassPanel,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: 16,
    width: '48%',
  },
  atmoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  atmoCardLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  atmoCardValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  atmoCardNumber: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  atmoCardUnit: {
    fontSize: 13,
    color: colors.textMuted,
    marginLeft: 4,
  },
});
