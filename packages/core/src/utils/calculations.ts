import { startOfHour, addHours } from 'date-fns';
import { TideData, TideEvent } from '../types';

// Calculate Moon Phase & Illumination
export const getMoonData = (date: Date) => {
  let year = date.getFullYear();
  let month = date.getMonth() + 1;
  let day = date.getDate();

  if (month < 3) {
    year--;
    month += 12;
  }

  const c = 365.25 * year;
  const e = 30.6 * month;
  const jd = c + e + day - 694039.09; // jd is total days elapsed
  let b = jd / 29.5305882; // divide by the moon cycle
  b -= Math.floor(b); // get the decimal part (phase 0..1)
  
  // b is 0..1 (0=New, 0.5=Full, 1=New)
  const illumination = Math.round((0.5 - Math.cos(b * 2 * Math.PI) / 2) * 100);
  
  const phaseIndex = Math.round(b * 8) % 8;
  const phases = [
    'New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous',
    'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'
  ];

  return {
    phase: phases[phaseIndex],
    illumination,
    phaseValue: b // Raw phase value for calculations
  };
};

export const generateTideData = (lat: number, lng: number): TideData => {
  const now = new Date();
  const hourlyTides: { time: string; height: number }[] = [];
  const startHour = startOfHour(now);

  // Generate 48 hours of data
  for (let i = 0; i < 48; i++) {
    const time = addHours(startHour, i);
    const t = time.getTime() / (1000 * 60 * 60); // hours
    const period = 12.42; // M2 Tidal Constituent
    const phase = (lng / 180) * 12; // approximate phase shift based on longitude
    
    // Simple harmonic motion approximation formula
    const height = 1.2 + Math.cos(2 * Math.PI * (t + phase) / period) * 1.5;
    
    hourlyTides.push({
      time: time.toISOString(),
      height: parseFloat(height.toFixed(2))
    });
  }

  // Find the next High and Low points by comparing neighbors
  let nextHigh: TideEvent | null = null;
  let nextLow: TideEvent | null = null;
  
  for (let i = 1; i < hourlyTides.length - 1; i++) {
    const prev = hourlyTides[i-1].height;
    const curr = hourlyTides[i].height;
    const next = hourlyTides[i+1].height;

    // Peak detection
    if (!nextHigh && curr > prev && curr > next) {
      nextHigh = { time: hourlyTides[i].time, height: curr, type: 'HIGH' };
    }
    // Trough detection
    if (!nextLow && curr < prev && curr < next) {
      nextLow = { time: hourlyTides[i].time, height: curr, type: 'LOW' };
    }
    if (nextHigh && nextLow) break;
  }

  // Fallbacks if peaks aren't found in the immediate window
  if (!nextHigh) nextHigh = { time: addHours(now, 6).toISOString(), height: 2.5, type: 'HIGH' };
  if (!nextLow) nextLow = { time: addHours(now, 12).toISOString(), height: 0.2, type: 'LOW' };

  return {
    currentHeight: hourlyTides[0].height,
    rising: hourlyTides[1].height > hourlyTides[0].height,
    nextHigh,
    nextLow,
    hourly: hourlyTides
  };
};
