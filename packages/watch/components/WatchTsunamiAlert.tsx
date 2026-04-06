/**
 * WatchTsunamiAlert.tsx — Full-screen tsunami warning for smartwatches
 *
 * Takes TsunamiRisk data from the core service and renders a highly visible,
 * full-screen red warning. Designed for immediate readability on a tiny display.
 *
 * Phase 5 — Watch Tsunami Alerts
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { watchColors, WATCH_SIZE } from '../theme/watchColors';
import type { TsunamiRisk } from '@seame/core';

interface WatchTsunamiAlertProps {
  risk: TsunamiRisk;
}

function WatchTsunamiAlertInner({ risk }: WatchTsunamiAlertProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulsing background for urgency
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.6,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();

    // TODO: Trigger heavy haptic pulse on mount
    // import * as Haptics from 'expo-haptics';
    // Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    // Consider repeating haptic every 2s for HIGH risk

    return () => animation.stop();
  }, [pulseAnim]);

  const isHigh = risk.riskLevel === 'HIGH';
  const bgColor = isHigh ? '#7f1d1d' : risk.riskLevel === 'MODERATE' ? '#7c2d12' : '#78350f';
  const borderColor = isHigh ? watchColors.red : risk.riskLevel === 'MODERATE' ? watchColors.orange : watchColors.yellow;

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: bgColor, opacity: isHigh ? pulseAnim : 1 },
      ]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      accessibilityLabel={`Tsunami ${risk.riskLevel} alert. ${risk.event.title}. Magnitude ${risk.event.magnitude.toFixed(1)}. ${Math.round(risk.distanceKm)} kilometers away.`}
    >
      {/* Warning icon */}
      <Text style={styles.warningIcon}>{'\u26A0\uFE0F'}</Text>

      {/* Title */}
      <Text style={[styles.title, { color: borderColor }]}>
        {isHigh ? 'EVACUATE' : risk.riskLevel === 'MODERATE' ? 'ADVISORY' : 'WATCH'}
      </Text>

      {/* Subtitle */}
      <Text style={styles.subtitle}>
        {isHigh ? 'SEEK HIGH GROUND' : 'Stay alert'}
      </Text>

      {/* Event info */}
      <View style={[styles.infoBox, { borderColor: borderColor + '60' }]}>
        <Text style={styles.magnitude} numberOfLines={1}>
          M{risk.event.magnitude.toFixed(1)}
        </Text>
        <Text style={styles.distance}>
          {Math.round(risk.distanceKm)} km
        </Text>
      </View>

      {/* Event title (truncated for watch) */}
      <Text style={styles.eventTitle} numberOfLines={1}>
        {risk.event.title}
      </Text>
    </Animated.View>
  );
}

export const WatchTsunamiAlert = React.memo(WatchTsunamiAlertInner);

// ─── Styles ───

const styles = StyleSheet.create({
  container: {
    width: WATCH_SIZE.width,
    height: WATCH_SIZE.height,
    justifyContent: 'center',
    alignItems: 'center',
    padding: WATCH_SIZE.padding,
  },
  warningIcon: {
    fontSize: 28,
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 10,
    fontWeight: '700',
    color: watchColors.text,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 2,
    marginBottom: 8,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  magnitude: {
    fontSize: 16,
    fontWeight: '800',
    color: watchColors.text,
  },
  distance: {
    fontSize: 12,
    fontWeight: '600',
    color: watchColors.textMuted,
  },
  eventTitle: {
    fontSize: 9,
    color: watchColors.textMuted,
    textAlign: 'center',
    maxWidth: WATCH_SIZE.innerWidth,
  },
});
