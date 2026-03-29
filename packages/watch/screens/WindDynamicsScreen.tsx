import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, {
  Circle,
  Line,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
  Polygon,
} from 'react-native-svg';
import { watchColors, WATCH_SIZE } from '../theme/watchColors';
import type { MarineWeatherData } from '@seame/core';

interface WindDynamicsScreenProps {
  data: MarineWeatherData | undefined;
}

const COMPASS_SIZE = 72;
const COMPASS_CENTER = COMPASS_SIZE / 2;
const COMPASS_OUTER_R = 32;
const NEEDLE_LENGTH = 24;

function degToCompass(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

function WindDynamicsScreenInner({ data }: WindDynamicsScreenProps) {
  const windSpeed = data?.current?.windSpeed ?? 0;
  const windDir = data?.current?.windDirection ?? 0;
  const gusts = data?.current?.windGusts ?? 0;

  // Needle endpoint: wind direction means "from", so arrow points in that direction
  const radians = ((windDir - 90) * Math.PI) / 180;
  const tipX = COMPASS_CENTER + Math.cos(radians) * NEEDLE_LENGTH;
  const tipY = COMPASS_CENTER + Math.sin(radians) * NEEDLE_LENGTH;

  // Arrow head points
  const arrowAngle = 0.35; // spread in radians
  const arrowLen = 6;
  const ax1 = tipX - Math.cos(radians - arrowAngle) * arrowLen;
  const ay1 = tipY - Math.sin(radians - arrowAngle) * arrowLen;
  const ax2 = tipX - Math.cos(radians + arrowAngle) * arrowLen;
  const ay2 = tipY - Math.sin(radians + arrowAngle) * arrowLen;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerIcon}>{'\u{1F4A8}'}</Text>
        <Text style={styles.headerTitle}>Wind Dynamics</Text>
      </View>

      {/* Compass */}
      <View
        style={styles.compassWrapper}
        accessibilityLabel={`Wind from ${degToCompass(windDir)} at ${windSpeed.toFixed(0)} kilometers per hour`}
      >
        <Svg width={COMPASS_SIZE} height={COMPASS_SIZE}>
          <Defs>
            <LinearGradient id="needleGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={watchColors.accent} />
              <Stop offset="1" stopColor={watchColors.teal} />
            </LinearGradient>
          </Defs>

          {/* Outer ring */}
          <Circle
            cx={COMPASS_CENTER}
            cy={COMPASS_CENTER}
            r={COMPASS_OUTER_R}
            stroke="rgba(255,255,255,0.15)"
            strokeWidth={1.5}
            fill="none"
          />

          {/* Tick marks at N/E/S/W */}
          {[0, 90, 180, 270].map((angle) => {
            const r1 = COMPASS_OUTER_R - 3;
            const r2 = COMPASS_OUTER_R + 3;
            const rad = ((angle - 90) * Math.PI) / 180;
            return (
              <Line
                key={angle}
                x1={COMPASS_CENTER + Math.cos(rad) * r1}
                y1={COMPASS_CENTER + Math.sin(rad) * r1}
                x2={COMPASS_CENTER + Math.cos(rad) * r2}
                y2={COMPASS_CENTER + Math.sin(rad) * r2}
                stroke="rgba(255,255,255,0.4)"
                strokeWidth={1.5}
              />
            );
          })}

          {/* Cardinal labels */}
          <SvgText x={COMPASS_CENTER} y={6} fill={watchColors.text} fontSize={8} fontWeight="600" textAnchor="middle">N</SvgText>
          <SvgText x={COMPASS_SIZE - 2} y={COMPASS_CENTER + 3} fill={watchColors.textMuted} fontSize={7} fontWeight="500" textAnchor="end">E</SvgText>
          <SvgText x={COMPASS_CENTER} y={COMPASS_SIZE - 1} fill={watchColors.textMuted} fontSize={7} fontWeight="500" textAnchor="middle">S</SvgText>
          <SvgText x={4} y={COMPASS_CENTER + 3} fill={watchColors.textMuted} fontSize={7} fontWeight="500" textAnchor="start">W</SvgText>

          {/* Needle line */}
          <Line
            x1={COMPASS_CENTER}
            y1={COMPASS_CENTER}
            x2={tipX}
            y2={tipY}
            stroke="url(#needleGrad)"
            strokeWidth={2.5}
            strokeLinecap="round"
          />

          {/* Arrow head */}
          <Polygon
            points={`${tipX},${tipY} ${ax1},${ay1} ${ax2},${ay2}`}
            fill={watchColors.teal}
          />

          {/* Center dot */}
          <Circle cx={COMPASS_CENTER} cy={COMPASS_CENTER} r={3} fill={watchColors.accent} />
        </Svg>
      </View>

      {/* Speed and direction */}
      <View style={styles.infoRow}>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>SPEED</Text>
          <Text style={styles.infoValue}>{windSpeed.toFixed(0)}</Text>
          <Text style={styles.infoUnit}>km/h</Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>GUSTS</Text>
          <Text style={styles.infoValue}>{gusts.toFixed(0)}</Text>
          <Text style={styles.infoUnit}>km/h</Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>DIR</Text>
          <Text style={styles.infoValue}>{degToCompass(windDir)}</Text>
          <Text style={styles.infoUnit}>{windDir.toFixed(0)}{'\u00B0'}</Text>
        </View>
      </View>
    </View>
  );
}

export const WindDynamicsScreen = React.memo(WindDynamicsScreenInner);

const styles = StyleSheet.create({
  container: {
    width: WATCH_SIZE.width,
    height: WATCH_SIZE.height,
    backgroundColor: watchColors.bgDeep,
    alignItems: 'center',
    justifyContent: 'center',
    padding: WATCH_SIZE.padding,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  headerIcon: {
    fontSize: 12,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: watchColors.text,
  },
  compassWrapper: {
    marginBottom: 8,
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
    fontSize: 14,
    fontWeight: '700',
    color: watchColors.text,
  },
  infoUnit: {
    fontSize: 8,
    color: watchColors.textMuted,
    marginTop: 1,
  },
});
