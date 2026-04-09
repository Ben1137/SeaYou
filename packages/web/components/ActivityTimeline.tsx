import React, { useMemo } from 'react';
import {
  MarineWeatherData,
  ActivityPersona,
  scoreActivity,
  extractHourlyConditions,
} from '@seame/core';
import { format, parseISO } from 'date-fns';

interface ActivityTimelineProps {
  persona: ActivityPersona;
  weatherData: MarineWeatherData;
  startHourIndex: number;
}

/**
 * Horizontal 24-hour sparkline showing hourly activity scores as colored blocks.
 * Green = Go (>=75), Amber = Caution (50-74), Rose = Poor (30-49), Slate = No-Go (<30).
 */
export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({
  persona,
  weatherData,
  startHourIndex,
}) => {
  const hours = useMemo(() => {
    const totalHours = weatherData.hourly?.time?.length ?? 0;
    const end = Math.min(startHourIndex + 24, totalHours);
    const result: { score: number; time: string; label: string }[] = [];

    for (let i = startHourIndex; i < end; i++) {
      const conditions = extractHourlyConditions(weatherData, i);
      const scored = scoreActivity(persona, conditions);
      const timeStr = weatherData.hourly.time[i];
      result.push({
        score: scored.overall,
        time: timeStr ? format(parseISO(timeStr), 'HH:mm') : `+${i - startHourIndex}h`,
        label: scored.label,
      });
    }
    return result;
  }, [persona, weatherData, startHourIndex]);

  if (hours.length === 0) return null;

  return (
    <div className="mt-2 flex gap-px rounded overflow-hidden h-[6px]">
      {hours.map((h, i) => {
        const bg =
          h.score >= 75
            ? 'bg-emerald-400'
            : h.score >= 50
              ? 'bg-amber-400'
              : h.score >= 30
                ? 'bg-rose-400/80'
                : 'bg-slate-700/50';
        return (
          <div
            key={i}
            className={`flex-1 ${bg} transition-colors`}
            title={`${h.time}: ${h.score} (${h.label})`}
          />
        );
      })}
    </div>
  );
};

export default ActivityTimeline;
