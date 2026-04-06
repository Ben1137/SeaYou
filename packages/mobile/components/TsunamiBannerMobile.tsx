/**
 * TsunamiBannerMobile.tsx — React Native tsunami alert banner
 *
 * Mobile equivalent of the web TsunamiBanner component.
 * Renders at the top of the screen with risk-level coloring,
 * pulsing animation for HIGH risk, and dismiss capability.
 *
 * Phase 5 Mobile — Tsunami Alerts UI
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Linking,
} from 'react-native';
import { AlertTriangle, X, ExternalLink } from 'lucide-react-native';
import type { TsunamiRisk } from '@seame/core';

interface TsunamiBannerMobileProps {
  risks: TsunamiRisk[];
}

const RISK_STYLES = {
  HIGH: { bg: '#7f1d1d', border: '#ef4444' },       // red-900 / red-500
  MODERATE: { bg: '#7c2d12', border: '#f97316' },   // orange-900 / orange-500
  LOW: { bg: '#78350f', border: '#f59e0b' },         // amber-900 / amber-500
} as const;

export function TsunamiBannerMobile({ risks }: TsunamiBannerMobileProps) {
  const [dismissed, setDismissed] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Determine highest severity
  const highestLevel = risks.reduce<TsunamiRisk['riskLevel']>(
    (max, r) => {
      const order = { HIGH: 3, MODERATE: 2, LOW: 1 };
      return order[r.riskLevel] > order[max] ? r.riskLevel : max;
    },
    'LOW',
  );

  const isHigh = highestLevel === 'HIGH';
  const style = RISK_STYLES[highestLevel];

  // Pulse animation for HIGH risk
  useEffect(() => {
    if (!isHigh || dismissed || risks.length === 0) return;

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();

    return () => animation.stop();
  }, [isHigh, dismissed, risks.length, pulseAnim]);

  if (dismissed || risks.length === 0) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: style.bg,
          borderBottomColor: style.border,
          opacity: isHigh ? pulseAnim : 1,
        },
      ]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      {/* Icon */}
      <View style={styles.iconContainer}>
        <AlertTriangle size={22} color="#ffffff" />
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.title}>
          {isHigh
            ? 'TSUNAMI WARNING \u2014 SEEK HIGH GROUND'
            : highestLevel === 'MODERATE'
              ? 'TSUNAMI ADVISORY'
              : 'EARTHQUAKE WATCH'}
        </Text>

        {risks.slice(0, 3).map((risk) => (
          <View key={risk.event.id} style={styles.eventRow}>
            <View
              style={[
                styles.dot,
                {
                  backgroundColor:
                    risk.riskLevel === 'HIGH'
                      ? '#f87171'
                      : risk.riskLevel === 'MODERATE'
                        ? '#fb923c'
                        : '#fbbf24',
                },
              ]}
            />
            <Text style={styles.eventTitle} numberOfLines={1}>
              {risk.event.title}
            </Text>
            <Text style={styles.separator}>|</Text>
            <Text style={styles.eventDetail}>
              M{risk.event.magnitude.toFixed(1)}
            </Text>
            <Text style={styles.separator}>|</Text>
            <Text style={styles.eventDetail}>
              {Math.round(risk.distanceKm)} km
            </Text>
            {risk.event.url && (
              <TouchableOpacity
                onPress={() => Linking.openURL(risk.event.url!)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <ExternalLink size={12} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            )}
          </View>
        ))}

        {risks.length > 3 && (
          <Text style={styles.moreEvents}>
            +{risks.length - 3} more events
          </Text>
        )}
      </View>

      {/* Dismiss */}
      <TouchableOpacity
        onPress={() => setDismissed(true)}
        style={styles.dismissButton}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityLabel="Dismiss alert"
        accessibilityRole="button"
      >
        <X size={16} color="rgba(255,255,255,0.8)" />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 50, // account for status bar
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    gap: 10,
  },
  iconContainer: {
    paddingTop: 2,
  },
  content: {
    flex: 1,
  },
  title: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  eventTitle: {
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '700',
    fontSize: 12,
    flexShrink: 1,
  },
  separator: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
  },
  eventDetail: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
  },
  moreEvents: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    marginTop: 2,
  },
  dismissButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default TsunamiBannerMobile;
