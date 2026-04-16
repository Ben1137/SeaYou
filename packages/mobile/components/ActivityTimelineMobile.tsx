/**
 * ActivityTimelineMobile.tsx — React Native 24-hour activity score sparkline
 *
 * Mobile re-implementation of the web ActivityTimeline component.
 * Renders a horizontal row of colored blocks representing hourly Go/Caution/Poor/No-Go.
 * Tappable blocks show a tooltip with time and score.
 *
 * Phase 3 Mobile — Activity Timeline
 */

import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutChangeEvent } from 'react-native';
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

function scoreLabel(score: number): string {
  if (score >= 75) return 'Go';
  if (score >= 50) return 'OK';
  if (score >= 30) return 'Poor';
  return 'No';
}

interface HourData {
  score: number;
  color: string;
  time: string;     // e.g. "14:00"
  label: string;    // e.g. "Go"
}

export function ActivityTimelineMobile({
  persona,
  weatherData,
  startHourIndex,
}: ActivityTimelineMobileProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const hours = useMemo(() => {
    const totalHours = weatherData.hourly?.time?.length ?? 0;
    const end = Math.min(startHourIndex + 24, totalHours);
    const result: HourData[] = [];

    for (let i = startHourIndex; i < end; i++) {
      const conditions = extractHourlyConditions(weatherData, i);
      const scored = scoreActivity(persona, conditions);
      const timeStr = weatherData.hourly.time[i]?.slice(11, 16) ?? `+${i - startHourIndex}h`;
      result.push({
        score: scored.overall,
        color: scoreToColor(scored.overall),
        time: timeStr,
        label: scoreLabel(scored.overall),
      });
    }
    return result;
  }, [persona, weatherData, startHourIndex]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  const handleTap = useCallback((index: number) => {
    setSelectedIndex((prev) => (prev === index ? null : index));
  }, []);

  if (hours.length === 0) return null;

  const selected = selectedIndex !== null ? hours[selectedIndex] : null;
  const blockCount = hours.length;
  // Calculate tooltip position to prevent overflow
  const blockWidth = containerWidth > 0 ? containerWidth / blockCount : 0;

  return (
    <View style={styles.wrapper}>
      {/* Tooltip */}
      {selected && selectedIndex !== null && containerWidth > 0 && (
        <View style={styles.tooltipRow}>
          <View
            style={[
              styles.tooltip,
              {
                left: Math.max(
                  0,
                  Math.min(
                    (selectedIndex + 0.5) * blockWidth - 36,
                    containerWidth - 72,
                  ),
                ),
              },
            ]}
          >
            <Text style={styles.tooltipText}>
              {selected.time} · {Math.round(selected.score)} {selected.label}
            </Text>
          </View>
        </View>
      )}

      {/* Sparkline */}
      <View style={styles.container} onLayout={onLayout}>
        {hours.map((h, i) => (
          <TouchableOpacity
            key={i}
            activeOpacity={0.7}
            onPress={() => handleTap(i)}
            style={[
              styles.block,
              { backgroundColor: h.color },
              selectedIndex === i && styles.blockSelected,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${h.time}: score ${Math.round(h.score)}, ${h.label}`}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 8,
  },
  tooltipRow: {
    height: 22,
    position: 'relative',
    marginBottom: 3,
  },
  tooltip: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minWidth: 72,
    alignItems: 'center',
  },
  tooltipText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  container: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    gap: 1,
  },
  block: {
    flex: 1,
  },
  blockSelected: {
    opacity: 1,
    transform: [{ scaleY: 1.5 }],
  },
});

export default ActivityTimelineMobile;
