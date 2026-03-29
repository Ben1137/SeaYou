import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { watchColors, WATCH_SIZE } from '../theme/watchColors';
import type { MarineWeatherData } from '@seame/core';

interface ConditionsScreenProps {
  data: MarineWeatherData | undefined;
}

function degToCompass(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

function getUvLabel(uv: number): { label: string; color: string } {
  if (uv <= 2) return { label: 'Low', color: watchColors.green };
  if (uv <= 5) return { label: 'Moderate', color: watchColors.yellow };
  if (uv <= 7) return { label: 'High', color: watchColors.orange };
  return { label: 'Extreme', color: watchColors.red };
}

function ConditionsScreenInner({ data }: ConditionsScreenProps) {
  const swell = data?.current?.swellHeight ?? 0;
  const swellPeriod = data?.current?.swellPeriod ?? 0;
  const swellDir = data?.current?.swellDirection ?? 0;
  const seaTemp = data?.current?.seaTemperature ?? 0;
  const uvIndex = data?.current?.uvIndex ?? 0;
  const uv = getUvLabel(uvIndex);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerIcon}>{'\u{1F30A}'}</Text>
        <Text style={styles.headerTitle}>Conditions</Text>
      </View>

      {/* Swell card */}
      <View style={styles.swellCard}>
        <Text style={styles.swellLabel}>SWELL</Text>
        <View style={styles.swellRow}>
          <Text style={styles.swellValue}>{swell.toFixed(1)}</Text>
          <Text style={styles.swellUnit}>m</Text>
          <View style={styles.swellMeta}>
            <Text style={styles.swellMetaText}>{swellPeriod.toFixed(0)}s</Text>
            <Text style={styles.swellMetaText}>{degToCompass(swellDir)}</Text>
          </View>
        </View>
      </View>

      {/* 2-column grid */}
      <View style={styles.grid}>
        <View style={styles.gridCard}>
          <Text style={styles.gridLabel}>SEA TEMP</Text>
          <Text style={styles.gridValue}>
            {seaTemp.toFixed(1)}<Text style={styles.gridUnit}>{'\u00B0C'}</Text>
          </Text>
        </View>
        <View style={styles.gridCard}>
          <Text style={styles.gridLabel}>UV INDEX</Text>
          <Text style={[styles.gridValue, { color: uv.color }]}>
            {uvIndex.toFixed(0)}
          </Text>
          <Text style={[styles.gridSub, { color: uv.color }]}>{uv.label}</Text>
        </View>
      </View>
    </View>
  );
}

export const ConditionsScreen = React.memo(ConditionsScreenInner);

const styles = StyleSheet.create({
  container: {
    width: WATCH_SIZE.width,
    height: WATCH_SIZE.height,
    backgroundColor: watchColors.bgDeep,
    padding: WATCH_SIZE.padding,
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  headerIcon: {
    fontSize: 13,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: watchColors.text,
  },
  swellCard: {
    backgroundColor: watchColors.glassInner,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  swellLabel: {
    fontSize: 8,
    fontWeight: '600',
    color: watchColors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  swellRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  swellValue: {
    fontSize: 24,
    fontWeight: '700',
    color: watchColors.text,
  },
  swellUnit: {
    fontSize: 12,
    color: watchColors.textMuted,
  },
  swellMeta: {
    marginLeft: 'auto',
    alignItems: 'flex-end',
  },
  swellMetaText: {
    fontSize: 10,
    color: watchColors.accent,
  },
  grid: {
    flexDirection: 'row',
    gap: 6,
  },
  gridCard: {
    flex: 1,
    backgroundColor: watchColors.glassInner,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  gridLabel: {
    fontSize: 7,
    fontWeight: '600',
    color: watchColors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  gridValue: {
    fontSize: 18,
    fontWeight: '700',
    color: watchColors.text,
  },
  gridUnit: {
    fontSize: 11,
    color: watchColors.textMuted,
  },
  gridSub: {
    fontSize: 9,
    fontWeight: '500',
    marginTop: 2,
  },
});
