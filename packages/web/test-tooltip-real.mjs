import { parseISO, format, isSameDay as isSameDayFn } from 'date-fns';

// Simulate realistic 144-point data (72h past → now → 72h future)
// Using Aug 21, 2026 14:00 as "now"
const now = new Date('2026-08-21T14:00:00Z');
const nowIndex = 72; // Middle of 144-point array

const chartData = [];
for (let i = 0; i < 144; i++) {
  const offsetHours = i - nowIndex; // -72 to +71
  const pointTime = new Date(now.getTime() + offsetHours * 3600000);
  chartData.push({
    time: pointTime.toISOString(),
    displayTime: pointTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
    height: Math.random() * 3,
  });
}

// Now test the REAL tooltip formatter
const formatTooltip = (point) => {
  if (!point?.time) return 'N/A';
  const pointDate = parseISO(point.time);
  const todayDate = new Date();
  const same = pointDate.toDateString() === todayDate.toDateString();
  const formatted = same
    ? format(pointDate, "'Today, 'HH:mm")
    : format(pointDate, 'EEE d MMM, HH:mm');
  return formatted;
};

console.log('═══════════════════════════════════════════════════════════════');
console.log('TOOLTIP FORMATTER TEST — REAL 144-POINT DATA');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log(`Chart data length: ${chartData.length} points`);
console.log(`Now reference: ${now.toISOString()}`);
console.log(`Today's date string: ${new Date().toDateString()}\n`);

const tests = [
  { idx: 0, label: 'FIRST (72h past)' },
  { idx: nowIndex, label: 'NOW (current time)' },
  { idx: 143, label: 'LAST (72h future)' },
];

const results = [];
tests.forEach(({ idx, label }) => {
  const point = chartData[idx];
  const formatted = formatTooltip(point);
  const parsed = parseISO(point.time);
  const dateStr = parsed.toDateString();
  const iso = point.time;

  results.push(formatted);

  console.log(`[${label}] Index ${idx}`);
  console.log(`  Raw ISO:     ${iso}`);
  console.log(`  Date str:    ${dateStr}`);
  console.log(`  Formatted:   "${formatted}"`);
  console.log();
});

console.log('═══════════════════════════════════════════════════════════════');
console.log('VERIFICATION');
console.log('═══════════════════════════════════════════════════════════════\n');

const unique = new Set(results);
console.log(`Unique formatted values: ${unique.size} (should be 3)`);
console.log(`Formatted array:`);
results.forEach((r, i) => console.log(`  [${i}]: "${r}"`));

// Extract dates from formatted strings
const extractedDates = results.map(r => r.split(',')[0].trim());
console.log(`\nExtracted date portions:`);
extractedDates.forEach((d, i) => console.log(`  [${i}]: "${d}"`));

const uniqueDates = new Set(extractedDates);
console.log(`\nUnique dates: ${uniqueDates.size} (should be 3)`);

// Verify day-of-week correctness
console.log('\nDAY-OF-WEEK VERIFICATION:');
tests.forEach(({ idx, label }, testIdx) => {
  const point = chartData[idx];
  const parsed = parseISO(point.time);
  const dayName = format(parsed, 'EEEE');
  const formatted = results[testIdx];
  console.log(`  [${label}] ${formatted} → day = ${dayName}`);
});

if (unique.size === 3 && uniqueDates.size === 3) {
  console.log('\n✓ SUCCESS: All three dates are different, formatter works correctly');
} else {
  console.log('\n✗ FAILED: Date formatter is not producing unique dates');
}
