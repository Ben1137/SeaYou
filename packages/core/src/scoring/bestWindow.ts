import { MarineWeatherData, ActivityPersona, BestWindow } from '../types';
import { scoreActivity } from './scoreActivity';
import { extractHourlyConditions } from './extractConditions';

export function findBestWindow(
  data: MarineWeatherData,
  persona: ActivityPersona,
  options?: { minHours?: number; maxHours?: number; startHourIndex?: number }
): BestWindow | null {
  if (!data?.hourly?.time?.length) return null;
  const minH = options?.minHours ?? 2;
  const maxH = options?.maxHours ?? 6;
  const startIdx = options?.startHourIndex ?? 0;
  const totalHours = data.hourly.time.length;

  // Score every hour from startIdx onward (up to 48h)
  const limit = Math.min(startIdx + 48, totalHours);
  const scores: number[] = [];
  for (let i = startIdx; i < limit; i++) {
    const conds = extractHourlyConditions(data, i);
    scores.push(scoreActivity(persona, conds).overall);
  }

  let bestAvg = -1;
  let bestStart = -1;
  let bestEnd = -1;
  let bestPeak = 0;

  // Sliding window: try all window sizes from minH to maxH
  for (let windowSize = minH; windowSize <= maxH; windowSize++) {
    if (scores.length < windowSize) continue;

    // Initialize first window sum
    let windowSum = 0;
    for (let j = 0; j < windowSize; j++) windowSum += scores[j];

    for (let i = 0; i <= scores.length - windowSize; i++) {
      if (i > 0) {
        windowSum -= scores[i - 1];
        windowSum += scores[i + windowSize - 1];
      }
      const avg = windowSum / windowSize;
      if (avg > bestAvg) {
        bestAvg = avg;
        bestStart = i;
        bestEnd = i + windowSize - 1;
        bestPeak = Math.max(...scores.slice(i, i + windowSize));
      }
    }
  }

  // Minimum threshold
  if (bestAvg < 40 || bestStart === -1) return null;

  const absStart = startIdx + bestStart;
  const absEnd = startIdx + bestEnd;

  return {
    startIndex: absStart,
    endIndex: absEnd,
    startTime: data.hourly.time[absStart] || '',
    endTime: data.hourly.time[absEnd] || '',
    avgScore: Math.round(bestAvg),
    peakScore: Math.round(bestPeak),
    persona,
  };
}
