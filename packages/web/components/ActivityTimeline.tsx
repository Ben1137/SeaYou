import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
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
 * Tap any block on mobile to see a tooltip with time + score + label.
 * Desktop users still see native title-attribute tooltips on hover.
 */
export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({
  persona,
  weatherData,
  startHourIndex,
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Auto-dismiss tooltip after 3 seconds
  useEffect(() => {
    if (selectedIndex !== null) {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      dismissTimer.current = setTimeout(() => setSelectedIndex(null), 3000);
    }
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [selectedIndex]);

  // Dismiss on outside click/touch
  useEffect(() => {
    if (selectedIndex === null) return;
    const handleOutside = (e: Event) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSelectedIndex(null);
      }
    };
    document.addEventListener('pointerdown', handleOutside);
    return () => document.removeEventListener('pointerdown', handleOutside);
  }, [selectedIndex]);

  const handleBlockTap = useCallback((index: number, e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setSelectedIndex((prev) => (prev === index ? null : index));
  }, []);

  if (hours.length === 0) return null;

  const selected = selectedIndex !== null ? hours[selectedIndex] : null;
  // Calculate tooltip left position as percentage
  const tooltipLeft = selectedIndex !== null
    ? ((selectedIndex + 0.5) / hours.length) * 100
    : 0;

  return (
    <div className="mt-2 relative" ref={containerRef}>
      {/* Tooltip */}
      {selected && selectedIndex !== null && (
        <div
          className="absolute -top-8 z-50 pointer-events-none"
          style={{ left: `${tooltipLeft}%`, transform: 'translateX(-50%)' }}
        >
          <div className="bg-slate-800 text-white text-[10px] font-medium px-2 py-1 rounded shadow-lg border border-slate-600/50 whitespace-nowrap">
            {selected.time} · {selected.score} · {selected.label}
          </div>
        </div>
      )}
      {/* Sparkline bars */}
      <div className="flex gap-px rounded overflow-hidden h-[10px]">
        {hours.map((h, i) => {
          const bg =
            h.score >= 75
              ? 'bg-emerald-400'
              : h.score >= 50
                ? 'bg-amber-400'
                : h.score >= 30
                  ? 'bg-rose-400/80'
                  : 'bg-slate-700/50';
          const isSelected = selectedIndex === i;
          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              aria-label={`${h.time}: ${h.score} — ${h.label}`}
              aria-pressed={isSelected}
              className={`flex-1 ${bg} transition-all cursor-pointer ${isSelected ? 'ring-1 ring-white/80 scale-y-150 brightness-125' : ''}`}
              title={`${h.time}: ${h.score} (${h.label})`}
              onClick={(e) => handleBlockTap(i, e)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleBlockTap(i, e as unknown as React.MouseEvent);
                }
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                handleBlockTap(i, e as unknown as React.MouseEvent);
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

export default ActivityTimeline;
