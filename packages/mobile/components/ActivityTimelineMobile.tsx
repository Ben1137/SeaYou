/**
 * ActivityTimelineMobile.tsx — React Native 24-hour activity score sparkline
 *
 * Mobile re-implementation of the web ActivityTimeline component.
 * Renders a horizontal row of colored blocks representing hourly Go/Caution/Poor/No-Go.
 *
 * Phase 3 Mobile — Activity Timeline
 */

import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import {
  MarineWeatherData,
  ActivityPersona,
  scoreActivity,
  extractHourlyConditions,
} from '@seame/core';

interface ActivityTimelineMobileProps {
  persona: ActivityPersona;
  weatherData: MarineWeatherData;
  startHourIndex: number;
}

// Score → color mapping (matches web version)
function scoreToColor(score: number): string {
  if (score >= 75) return '#34d399';   // emerald-400 — Go
  if (score >= 50) return '#fbbf24';   // amber-400 — Caution
  if (score >= 30) return '#fb7185';   // rose-400 — Poor
  return 'rgba(51, 65, 85, 0.5)';      // slate-700/50 — No-Go
}

export function ActivityTimelineMobile({
  persona,
  weatherData,
  startHourIndex,
}: ActivityTimelineMobileProps) {
  const hours = useMemo(() => {
    const totalHours = weatherData.hourly?.time?.length ?? 0;
    const end = Math.min(startHourIndex + 24, totalHours);
    const result: { score: number; color: string }[] = [];

    for (let i = startHourIndex; i < end; i++) {
      const conditions = extractHourlyConditions(weatherData, i);
      const scored = scoreActivity(persona, conditions);
      result.push({
        score: scored.overall,
        color: scoreToColor(scored.overall),
      });
    }
    return result;
  }, [persona, weatherData, startHourIndex]);

  if (hours.length === 0) return null;

  return (
    <View style={styles.container}>
      {hours.map((h, i) => (
        <View
          key={i}
          style={[styles.block, { backgroundColor: h.color }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 8,
    gap: 1,
  },
  block: {
    flex: 1,
  },
});

export default ActivityTimelineMobile;
