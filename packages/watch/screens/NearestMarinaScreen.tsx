import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { watchColors, WATCH_SIZE } from '../theme/watchColors';

interface NearestMarinaScreenProps {
  marinaName?: string;
  distanceKm?: number;
  etaMinutes?: number;
}

function NearestMarinaScreenInner({
  marinaName = 'Tel Aviv Marina',
  distanceKm = 2.4,
  etaMinutes = 18,
}: NearestMarinaScreenProps) {
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerIcon}>{'\u2693'}</Text>
        <Text style={styles.headerTitle}>Nearest Marina</Text>
      </View>

      {/* Marina name card */}
      <View
        style={styles.nameCard}
        accessibilityLabel={`Nearest marina: ${marinaName}, ${distanceKm} kilometers away, estimated arrival ${etaMinutes} minutes`}
      >
        <Text style={styles.marinaName} numberOfLines={2}>
          {marinaName}
        </Text>
      </View>

      {/* Distance + ETA */}
      <View style={styles.infoRow}>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>DISTANCE</Text>
          <Text style={styles.infoValue}>{distanceKm.toFixed(1)}</Text>
          <Text style={styles.infoUnit}>km</Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>ETA</Text>
          <Text style={styles.infoValue}>{etaMinutes}</Text>
          <Text style={styles.infoUnit}>min</Text>
        </View>
      </View>

      {/* Bearing */}
      <View style={styles.bearingRow}>
        <Text style={styles.bearingLabel}>BEARING</Text>
        <Text style={styles.bearingValue}>245{'\u00B0'} WSW</Text>
      </View>
    </View>
  );
}

export const NearestMarinaScreen = React.memo(NearestMarinaScreenInner);

const styles = StyleSheet.create({
  container: {
    width: WATCH_SIZE.width,
    height: WATCH_SIZE.height,
    backgroundColor: watchColors.bgDeep,
    padding: WATCH_SIZE.padding,
    justifyContent: 'center',
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerIcon: {
    fontSize: 13,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: watchColors.text,
  },
  nameCard: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  marinaName: {
    fontSize: 14,
    fontWeight: '700',
    color: watchColors.accent,
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    gap: 6,
  },
  infoCard: {
    flex: 1,
    backgroundColor: watchColors.glassInner,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 7,
    fontWeight: '600',
    color: watchColors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 18,
    fontWeight: '700',
    color: watchColors.text,
  },
  infoUnit: {
    fontSize: 9,
    color: watchColors.textMuted,
    marginTop: 1,
  },
  bearingRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  bearingLabel: {
    fontSize: 8,
    fontWeight: '600',
    color: watchColors.textMuted,
    letterSpacing: 0.5,
  },
  bearingValue: {
    fontSize: 11,
    fontWeight: '600',
    color: watchColors.teal,
  },
});
