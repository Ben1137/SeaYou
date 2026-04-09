import React, { useCallback } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { MarineWeatherHourly } from '@seame/core';
import { colors } from '../theme/colors';

interface HourlyForecastProps {
  hourlyData: MarineWeatherHourly;
}

interface HourItem {
  id: string;
  time: string;
  windSpeed: number;
  waveHeight: number;
}

const ITEM_WIDTH = 78;
const ITEM_MARGIN = 8;

const HourCard = React.memo<{ item: HourItem }>(({ item }) => (
  <View style={styles.hourCard}>
    <Text style={styles.time}>
      {new Date(item.time).toLocaleTimeString([], { hour: '2-digit' })}
    </Text>
    <Text style={styles.wind}>{item.windSpeed.toFixed(0)}kts</Text>
    <Text style={styles.wave}>{item.waveHeight.toFixed(1)}m</Text>
  </View>
));
HourCard.displayName = 'HourCard';

export const HourlyForecast = React.memo<HourlyForecastProps>(
  ({ hourlyData }) => {
    const data: HourItem[] = hourlyData.time.slice(0, 24).map((time, i) => ({
      id: time,
      time,
      windSpeed: hourlyData.wind_speed_10m[i] ?? 0,
      waveHeight: hourlyData.wave_height[i] ?? 0,
    }));

    const renderItem = useCallback(
      ({ item }: { item: HourItem }) => <HourCard item={item} />,
      [],
    );

    const keyExtractor = useCallback((item: HourItem) => item.id, []);

    const getItemLayout = useCallback(
      (_: unknown, index: number) => ({
        length: ITEM_WIDTH + ITEM_MARGIN,
        offset: (ITEM_WIDTH + ITEM_MARGIN) * index,
        index,
      }),
      [],
    );

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Hourly Forecast</Text>
        <FlatList
          data={data}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemLayout={getItemLayout}
          horizontal
          showsHorizontalScrollIndicator={false}
        />
      </View>
    );
  },
);

HourlyForecast.displayName = 'HourlyForecast';

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
  },
  hourCard: {
    backgroundColor: colors.glassPanel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: 12,
    marginRight: ITEM_MARGIN,
    width: ITEM_WIDTH,
    alignItems: 'center',
  },
  time: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 8,
  },
  wind: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: 4,
  },
  wave: {
    fontSize: 12,
    color: colors.blue,
  },
});
