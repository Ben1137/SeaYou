import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { watchColors, WATCH_SIZE } from '../theme/watchColors';
import type { MarineWeatherData } from '@seame/core';

interface AtmosphereScreenProps {
  data: MarineWeatherData | undefined;
}

const RING_SIZE = 80;
const RING_STROKE = 6;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function formatTime(isoString: string | undefined): string {
  if (!isoString) return '--:--';
  try {
    const date = new Date(isoString);
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  } catch {
    return '--:--';
  }
}

function getDaylightProgress(sunrise: string | undefined, sunset: string | undefined): number {
  if (!sunrise || !sunset) return 0;
  try {
    const now = Date.now();
    const rise = new Date(sunrise).getTime();
    const set = new Date(sunset).getTime();
    if (now < rise) return 0;
    if (now > set) return 1;
    return (now - rise) / (set - rise);
  } catch {
    return 0;
  }
}

function AtmosphereScreenInner({ data }: AtmosphereScreenProps) {
  const general = data?.general;
  const temp = general?.temperature ?? 0;
  const sunrise = general?.sunrise;
  const sunset = general?.sunset;
  const rainProb = general?.hourlyForecast?.[0]?.precipitationProbability ?? 0;
  const progress = getDaylightProgress(sunrise, sunset);
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);

  return (
    <View style={styles.container}>
      {/* Sunrise */}
      <View style={styles.sunRow}>
        <Text style={styles.sunIcon}>{'\u2600'}</Text>
        <Text style={styles.sunTime}>{formatTime(sunrise)}</Text>
      </View>

      {/* Circular ring with temperature */}
      <View
        style={styles.ringContainer}
        accessibilityLabel={`Temperature ${temp.toFixed(0)} degrees. ${Math.round(progress * 100)}% daylight elapsed.`}
      >
        <Svg width={RING_SIZE} height={RING_SIZE}>
          <Defs>
            <LinearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={watchColors.accent} />
              <Stop offset="1" stopColor={watchColors.teal} />
            </LinearGradient>
          </Defs>
          {/* Track */}
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={RING_STROKE}
            fill="none"
          />
          {/* Progress */}
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            stroke="url(#ringGrad)"
            strokeWidth={RING_STROKE}
            fill="none"
            strokeDasharray={`${RING_CIRCUMFERENCE}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          />
        </Svg>
        {/* Temperature overlay */}
        <View style={styles.tempOverlay}>
          <Text style={styles.tempValue}>{temp.toFixed(0)}</Text>
          <Text style={styles.tempDeg}>{'\u00B0'}</Text>
        </View>
      </View>

      {/* Rain pill */}
      <View style={styles.rainPill}>
        <Text style={styles.rainIcon}>{'\u{1F4A7}'}</Text>
        <Text style={styles.rainText}>{rainProb}%</Text>
      </View>

      {/* Sunset */}
      <View style={styles.sunRow}>
        <Text style={styles.sunIcon}>{'\u{1F305}'}</Text>
        <Text style={styles.sunTime}>{formatTime(sunset)}</Text>
      </View>
    </View>
  );
}

export const AtmosphereScreen = React.memo(AtmosphereScreenInner);

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
  sunRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sunIcon: {
    fontSize: 12,
  },
  sunTime: {
    fontSize: 11,
    color: watchColors.textMuted,
    fontWeight: '500',
  },
  ringContainer: {
    width: RING_SIZE,
    height: RING_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tempOverlay: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  tempValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: watchColors.text,
  },
  tempDeg: {
    fontSize: 18,
    fontWeight: '300',
    color: watchColors.textMuted,
    marginTop: 4,
  },
  rainPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: watchColors.glassInner,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  rainIcon: {
    fontSize: 10,
  },
  rainText: {
    fontSize: 11,
    color: watchColors.accent,
    fontWeight: '600',
  },
});
