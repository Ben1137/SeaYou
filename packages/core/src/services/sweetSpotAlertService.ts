import type { ThresholdRange } from '../types/preferences';

export function isInSweetSpot(value: number, range: ThresholdRange): boolean {
  return value >= range.sweetMin && value <= range.sweetMax;
}

export type ConditionKind = 'sweet_spot' | 'too_calm' | 'too_rough' | 'normal';

export function evaluateConditions(
  current: { waveHeight: number; windSpeed: number },
  waveRange: ThresholdRange,
  windRange: ThresholdRange,
  notifyWhenInSweetSpot: boolean,
): { kind: ConditionKind; details: string[] } | null {
  if (current.waveHeight > waveRange.high || current.windSpeed > windRange.high) {
    return { kind: 'too_rough', details: ['Conditions above safe threshold'] };
  }
  if (current.waveHeight < waveRange.low && current.windSpeed < windRange.low) {
    return { kind: 'too_calm', details: ['Conditions below minimum'] };
  }
  if (
    notifyWhenInSweetSpot &&
    isInSweetSpot(current.waveHeight, waveRange) &&
    isInSweetSpot(current.windSpeed, windRange)
  ) {
    return {
      kind: 'sweet_spot',
      details: [
        `Wave ${current.waveHeight.toFixed(1)}m in sweet spot ${waveRange.sweetMin}–${waveRange.sweetMax}m`,
        `Wind ${current.windSpeed.toFixed(0)} km/h in sweet spot ${windRange.sweetMin}–${windRange.sweetMax} km/h`,
      ],
    };
  }
  return null;
}
