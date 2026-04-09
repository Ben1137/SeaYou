import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { watchColors, WATCH_SIZE } from '../theme/watchColors';
import type { MarineWeatherData } from '@seame/core';

interface AlertsScreenProps {
  data: MarineWeatherData | undefined;
}

const WAVE_WARN = 2.0;
const WIND_WARN = 30;

function getAlertLevel(data: MarineWeatherData | undefined) {
  if (!data?.current) return 'clear';
  const wave = data.current.waveHeight ?? 0;
  const wind = data.current.windSpeed ?? 0;
  if (wave > WAVE_WARN * 1.5 || wind > WIND_WARN * 1.5) return 'danger';
  if (wave > WAVE_WARN || wind > WIND_WARN) return 'warning';
  return 'clear';
}

function getAlertColors(level: string) {
  switch (level) {
    case 'danger':
      return { bg: 'rgba(239, 68, 68, 0.25)', border: watchColors.red, label: 'DANGER' };
    case 'warning':
      return { bg: 'rgba(249, 115, 22, 0.25)', border: watchColors.orange, label: 'CAUTION' };
    default:
      return { bg: 'rgba(34, 197, 94, 0.15)', border: watchColors.green, label: 'ALL CLEAR' };
  }
}

function AlertsScreenInner({ data }: AlertsScreenProps) {
  const level = getAlertLevel(data);
  const alert = getAlertColors(level);
  const wind = data?.current?.windSpeed ?? 0;
  const wave = data?.current?.waveHeight ?? 0;
  const gusts = data?.current?.windGusts ?? 0;

  return (
    <View style={styles.container}>
      {/* Alert banner */}
      <View
        style={[
          styles.alertBox,
          { backgroundColor: alert.bg, borderColor: alert.border },
        ]}
        accessibilityRole="alert"
        accessibilityLabel={`Marine alert status: ${alert.label}`}
      >
        <Text style={[styles.alertIcon, { color: alert.border }]}>
          {level === 'clear' ? '\u2713' : '\u26A0'}
        </Text>
        <Text style={[styles.alertLabel, { color: alert.border }]}>
          {alert.label}
        </Text>
        {level !== 'clear' && (
          <Text style={styles.alertDetail}>
            {level === 'danger' ? 'Hazardous conditions' : 'Elevated conditions'}
          </Text>
        )}
      </View>

      {/* Compact conditions */}
      <View style={styles.conditionsRow}>
        <View style={styles.conditionCard}>
          <Text style={styles.conditionLabel}>WAVE</Text>
          <Text style={styles.conditionValue}>{wave.toFixed(1)}</Text>
          <Text style={styles.conditionUnit}>m</Text>
        </View>
        <View style={styles.conditionCard}>
          <Text style={styles.conditionLabel}>WIND</Text>
          <Text style={styles.conditionValue}>{wind.toFixed(0)}</Text>
          <Text style={styles.conditionUnit}>km/h</Text>
        </View>
        <View style={styles.conditionCard}>
          <Text style={styles.conditionLabel}>GUST</Text>
          <Text style={styles.conditionValue}>{gusts.toFixed(0)}</Text>
          <Text style={styles.conditionUnit}>km/h</Text>
        </View>
      </View>
    </View>
  );
}

export const AlertsScreen = React.memo(AlertsScreenInner);

const styles = StyleSheet.create({
  container: {
    width: WATCH_SIZE.width,
    height: WATCH_SIZE.height,
    backgroundColor: watchColors.bgDeep,
    justifyContent: 'center',
    alignItems: 'center',
    padding: WATCH_SIZE.padding,
  },
  alertBox: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  alertIcon: {
    fontSize: 20,
    marginBottom: 2,
  },
  alertLabel: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  alertDetail: {
    fontSize: 9,
    color: watchColors.textMuted,
    marginTop: 2,
  },
  conditionsRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    gap: 6,
  },
  conditionCard: {
    flex: 1,
    backgroundColor: watchColors.glassInner,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  conditionLabel: {
    fontSize: 7,
    fontWeight: '600',
    color: watchColors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  conditionValue: {
    fontSize: 16,
    fontWeight: '700',
    color: watchColors.text,
  },
  conditionUnit: {
    fontSize: 8,
    color: watchColors.textMuted,
    marginTop: 1,
  },
});
