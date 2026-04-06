/**
 * WatchDashboard.tsx — Simplified activity score overview for smartwatches
 *
 * Displays a vertical list of 5 activity personas with their current 0-100
 * score and Go/Caution/No-Go color block. Designed for maximum legibility
 * on a 198x198 watch face.
 *
 * Phase — Watch Activity Dashboard
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { watchColors, WATCH_SIZE } from '../theme/watchColors';
import {
  ActivityPersona,
  scoreActivity,
  extractCurrentConditions,
} from '@seame/core';
import type { MarineWeatherData } from '@seame/core';

interface WatchDashboardProps {
  data: MarineWeatherData | undefined;
}

// ─── Persona display config ───

interface PersonaConfig {
  persona: ActivityPersona;
  label: string;
  emoji: string;
}

const PERSONAS: PersonaConfig[] = [
  { persona: ActivityPersona.WAVE_SURFER, label: 'Surf', emoji: '\uD83C\uDFC4' },
  { persona: ActivityPersona.WIND_SURFER, label: 'Wind', emoji: '\uD83D\uDCA8' },
  { persona: ActivityPersona.KITE_SURFER, label: 'Kite', emoji: '\uD83E\uDE81' },
  { persona: ActivityPersona.SAILOR, label: 'Sail', emoji: '\u26F5' },
  { persona: ActivityPersona.DIVER, label: 'Dive', emoji: '\uD83E\uDD3F' },
];

// ─── Score → color + label ───

function scoreToColor(score: number): string {
  if (score >= 75) return watchColors.green;   // Go
  if (score >= 50) return watchColors.yellow;  // Caution
  if (score >= 30) return watchColors.orange;  // Poor
  return watchColors.red;                       // No-Go
}

function scoreToTag(score: number): string {
  if (score >= 75) return 'GO';
  if (score >= 50) return 'OK';
  if (score >= 30) return 'LOW';
  return 'NO';
}

// ─── Component ───

function WatchDashboardInner({ data }: WatchDashboardProps) {
  const scores = useMemo(() => {
    if (!data) return null;
    const conditions = extractCurrentConditions(data);
    return PERSONAS.map((p) => {
      const result = scoreActivity(p.persona, conditions);
      return {
        ...p,
        overall: result.overall,
        label: result.label,
        color: scoreToColor(result.overall),
        tag: scoreToTag(result.overall),
      };
    });
  }, [data]);

  if (!scores) {
    return (
      <View style={styles.container}>
        <Text style={styles.headerText}>Activities</Text>
        <Text style={styles.noData}>No data</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <Text style={styles.headerText}>{'\u2693'} Activities</Text>

      {/* Score rows */}
      <ScrollView
        style={styles.scrollArea}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {scores.map((s) => (
          <View
            key={s.persona}
            style={styles.row}
            accessibilityLabel={`${s.label}: score ${Math.round(s.overall)}, ${s.tag}`}
          >
            {/* Emoji + Name */}
            <Text style={styles.emoji}>{s.emoji}</Text>
            <Text style={styles.personaLabel}>{s.label}</Text>

            {/* Score number */}
            <Text style={[styles.scoreNum, { color: s.color }]}>
              {Math.round(s.overall)}
            </Text>

            {/* Go/Caution/No-Go tag */}
            <View style={[styles.tagBadge, { backgroundColor: s.color + '40' }]}>
              <Text style={[styles.tagText, { color: s.color }]}>
                {s.tag}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export const WatchDashboard = React.memo(WatchDashboardInner);

// ─── Styles ───

const styles = StyleSheet.create({
  container: {
    width: WATCH_SIZE.width,
    height: WATCH_SIZE.height,
    backgroundColor: watchColors.bgDeep,
    padding: WATCH_SIZE.padding,
    justifyContent: 'flex-start',
  },
  headerText: {
    fontSize: 12,
    fontWeight: '700',
    color: watchColors.text,
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  noData: {
    fontSize: 10,
    color: watchColors.textMuted,
    textAlign: 'center',
    marginTop: 20,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: watchColors.glassInner,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 6,
  },
  emoji: {
    fontSize: 14,
    width: 20,
    textAlign: 'center',
  },
  personaLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: watchColors.text,
  },
  scoreNum: {
    fontSize: 16,
    fontWeight: '800',
    width: 30,
    textAlign: 'right',
  },
  tagBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 28,
    alignItems: 'center',
  },
  tagText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
