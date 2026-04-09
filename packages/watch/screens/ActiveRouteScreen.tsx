import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Line, Circle as SvgCircle } from 'react-native-svg';
import { watchColors, WATCH_SIZE } from '../theme/watchColors';

interface ActiveRouteScreenProps {
  routeName?: string;
  distanceNm?: number;
  durationHours?: number;
  progress?: number;
}

const ROUTE_WIDTH = 140;
const ROUTE_HEIGHT = 36;

function ActiveRouteScreenInner({
  routeName = 'Coastal Run',
  distanceNm = 12.5,
  durationHours = 2.3,
  progress = 0.35,
}: ActiveRouteScreenProps) {
  const progressX = 10 + (ROUTE_WIDTH - 20) * progress;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerIcon}>{'\u{1F9ED}'}</Text>
        <Text style={styles.headerTitle}>Active Route</Text>
      </View>

      {/* Route preview */}
      <View
        style={styles.routePreview}
        accessibilityLabel={`Route ${routeName}, ${Math.round(progress * 100)}% complete`}
      >
        <Svg width={ROUTE_WIDTH} height={ROUTE_HEIGHT}>
          {/* Route line (full) */}
          <Line
            x1={10}
            y1={ROUTE_HEIGHT / 2}
            x2={ROUTE_WIDTH - 10}
            y2={ROUTE_HEIGHT / 2}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={3}
            strokeLinecap="round"
          />
          {/* Route line (progress) */}
          <Line
            x1={10}
            y1={ROUTE_HEIGHT / 2}
            x2={progressX}
            y2={ROUTE_HEIGHT / 2}
            stroke={watchColors.accent}
            strokeWidth={3}
            strokeLinecap="round"
          />
          {/* Start dot */}
          <SvgCircle cx={10} cy={ROUTE_HEIGHT / 2} r={4} fill={watchColors.teal} />
          {/* Current position */}
          <SvgCircle cx={progressX} cy={ROUTE_HEIGHT / 2} r={5} fill={watchColors.accent} />
          {/* End dot */}
          <SvgCircle cx={ROUTE_WIDTH - 10} cy={ROUTE_HEIGHT / 2} r={4} fill="rgba(255,255,255,0.3)" />
        </Svg>
      </View>

      {/* Route name */}
      <View style={styles.nameCard}>
        <Text style={styles.routeName} numberOfLines={1}>
          {routeName}
        </Text>
        <Text style={styles.routeProgress}>
          {Math.round(progress * 100)}% complete
        </Text>
      </View>

      {/* Distance + Duration */}
      <View style={styles.infoRow}>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>DISTANCE</Text>
          <Text style={styles.infoValue}>{distanceNm.toFixed(1)}</Text>
          <Text style={styles.infoUnit}>nm</Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>DURATION</Text>
          <Text style={styles.infoValue}>{durationHours.toFixed(1)}</Text>
          <Text style={styles.infoUnit}>hrs</Text>
        </View>
      </View>
    </View>
  );
}

export const ActiveRouteScreen = React.memo(ActiveRouteScreenInner);

const styles = StyleSheet.create({
  container: {
    width: WATCH_SIZE.width,
    height: WATCH_SIZE.height,
    backgroundColor: watchColors.bgDeep,
    alignItems: 'center',
    justifyContent: 'center',
    padding: WATCH_SIZE.padding,
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerIcon: {
    fontSize: 12,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: watchColors.text,
  },
  routePreview: {
    alignItems: 'center',
  },
  nameCard: {
    backgroundColor: watchColors.glassInner,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
    width: '100%',
  },
  routeName: {
    fontSize: 13,
    fontWeight: '700',
    color: watchColors.text,
  },
  routeProgress: {
    fontSize: 9,
    color: watchColors.accent,
    marginTop: 2,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 6,
    width: '100%',
  },
  infoCard: {
    flex: 1,
    backgroundColor: watchColors.glassInner,
    borderRadius: 8,
    paddingVertical: 6,
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
    fontSize: 16,
    fontWeight: '700',
    color: watchColors.text,
  },
  infoUnit: {
    fontSize: 8,
    color: watchColors.textMuted,
    marginTop: 1,
  },
});
