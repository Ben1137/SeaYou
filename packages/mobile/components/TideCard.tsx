import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TideData } from '@seame/core';
import { colors } from '../theme/colors';

interface TideCardProps {
  tideData: TideData;
}

export const TideCard = React.memo<TideCardProps>(({ tideData }) => {
  const nextHighTime = new Date(tideData.nextHigh.time).getTime();
  const nextLowTime = new Date(tideData.nextLow.time).getTime();
  const now = Date.now();

  const nextTide =
    nextHighTime - now < nextLowTime - now
      ? tideData.nextHigh
      : tideData.nextLow;

  const isHigh = nextTide.type === 'HIGH';

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Next Tide</Text>
        <View
          style={[
            styles.typeBadge,
            { backgroundColor: isHigh ? colors.accentGlow : colors.blueGlow },
          ]}
        >
          <Text
            style={[
              styles.typeText,
              { color: isHigh ? colors.accent : colors.blue },
            ]}
          >
            {nextTide.type}
          </Text>
        </View>
      </View>
      <View style={styles.content}>
        <View style={styles.timeBlock}>
          <Text style={styles.timeValue}>
            {new Date(nextTide.time).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
          <Text style={styles.timeLabel}>Expected</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.heightBlock}>
          <Text style={styles.heightValue}>
            {nextTide.height.toFixed(2)}
          </Text>
          <Text style={styles.heightLabel}>meters</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.currentBlock}>
          <Text style={styles.currentValue}>
            {tideData.currentHeight.toFixed(2)}
          </Text>
          <Text style={styles.currentLabel}>current m</Text>
        </View>
      </View>
    </View>
  );
});

TideCard.displayName = 'TideCard';

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.glassPanel,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: 16,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 15,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  typeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  divider: {
    width: 1,
    height: 32,
    backgroundColor: colors.glassBorder,
  },
  timeBlock: {
    flex: 1,
    alignItems: 'center',
  },
  timeValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  timeLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  heightBlock: {
    flex: 1,
    alignItems: 'center',
  },
  heightValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.accent,
  },
  heightLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  currentBlock: {
    flex: 1,
    alignItems: 'center',
  },
  currentValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.blue,
  },
  currentLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
});
