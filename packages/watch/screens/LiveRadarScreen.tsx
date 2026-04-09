import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { watchColors, WATCH_SIZE } from '../theme/watchColors';

interface LiveRadarScreenProps {
  lat: number;
  lng: number;
}

const PULSE_SIZE = 48;

function LiveRadarScreenInner({ lat, lng }: LiveRadarScreenProps) {
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 2000,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const pulseScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2.5],
  });

  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 0],
  });

  return (
    <View style={styles.container}>
      {/* Header pill */}
      <View style={styles.headerPill}>
        <View style={styles.liveDot} />
        <Text style={styles.headerText}>Live Radar</Text>
      </View>

      {/* Pulsing location dot */}
      <View
        style={styles.radarArea}
        accessibilityLabel={`Your location: ${lat.toFixed(4)} latitude, ${lng.toFixed(4)} longitude`}
      >
        {/* Pulse ring */}
        <Animated.View
          style={[
            styles.pulseRing,
            {
              transform: [{ scale: pulseScale }],
              opacity: pulseOpacity,
            },
          ]}
        />
        {/* Center dot */}
        <View style={styles.centerDot} />

        {/* Range rings */}
        <View style={[styles.rangeRing, styles.rangeRingInner]} />
        <View style={[styles.rangeRing, styles.rangeRingOuter]} />
      </View>

      {/* Coordinates */}
      <View style={styles.coordBox}>
        <Text style={styles.coordLabel}>POSITION</Text>
        <Text style={styles.coordValue}>
          {lat.toFixed(4)}{'\u00B0'}N
        </Text>
        <Text style={styles.coordValue}>
          {lng.toFixed(4)}{'\u00B0'}E
        </Text>
      </View>
    </View>
  );
}

export const LiveRadarScreen = React.memo(LiveRadarScreenInner);

const styles = StyleSheet.create({
  container: {
    width: WATCH_SIZE.width,
    height: WATCH_SIZE.height,
    backgroundColor: watchColors.bgDeep,
    alignItems: 'center',
    justifyContent: 'center',
    padding: WATCH_SIZE.padding,
    gap: 10,
  },
  headerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: watchColors.accent,
  },
  headerText: {
    fontSize: 11,
    fontWeight: '600',
    color: watchColors.accent,
  },
  radarArea: {
    width: PULSE_SIZE * 2.5,
    height: PULSE_SIZE * 2.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: watchColors.accent,
  },
  centerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: watchColors.accent,
    zIndex: 1,
  },
  rangeRing: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 0.5,
    borderColor: 'rgba(56, 189, 248, 0.15)',
  },
  rangeRingInner: {
    width: 50,
    height: 50,
  },
  rangeRingOuter: {
    width: 90,
    height: 90,
  },
  coordBox: {
    alignItems: 'center',
  },
  coordLabel: {
    fontSize: 8,
    fontWeight: '600',
    color: watchColors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  coordValue: {
    fontSize: 11,
    color: watchColors.text,
    fontVariant: ['tabular-nums'],
  },
});
