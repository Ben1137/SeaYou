---
name: phase-1-atmosphere-timeline-corrections
description: Critical fixes to Phase 1 implementation—feature flag semantics, -1 guard, zero-diff anchor, separate past array
metadata:
  type: project
---

## Three Critical Corrections to Phase 1 Build Plan

### 1. FEATURE FLAG GATE — Must Use VITE_* Not import.meta.env.DEV

**Problem:** Agent proposed `if (import.meta.env.DEV)` — not a real flag, it's a dev-only toggle.
- import.meta.env.DEV = statically false in `pnpm build`
- Code is tree-shaken out of prod with NO way to ship feature
- Violates plan requirement: "flag OFF → absent from bundle; flag ON → ships live"

**Fix:** Use `import.meta.env.VITE_FEATURE_ATMOSPHERE_TIMELINE === 'true'` (string comparison)
- Vite exposes VITE_-prefixed env vars by default (confirmed vite.config.ts)
- Unset (dev) → undefined === 'true' → false → OFF path tree-shakes out ✓
- Set in Vercel → 'true' === 'true' → true → ON path compiles in ✓
- **String compare is mandatory** (Vite env vars are strings, not booleans)

```typescript
const TIMELINE_ON = import.meta.env.VITE_FEATURE_ATMOSPHERE_TIMELINE === 'true';

if (TIMELINE_ON) {
  marineParams.set('past_days', '3');
  generalParams.set('past_days', '3');
}
```

Verify: `grep -rn VITE_FEATURE_ATMOSPHERE_TIMELINE dist/` → 0 hits ✓

---

### 2. FINDINDEX -1 GUARD — Explicit Check Required

**Problem:** Proposed `todayDailyIndex = daily.time?.findIndex(...) || 0`
- findIndex returns -1 on no match (not undefined)
- -1 is truthy → -1 || 0 = -1 (not 0)
- slice(-1, 9) produces silent empty/garbage list

**Fix:** Explicit -1 guard (mirrors existing pattern at weatherService.ts:148–149)
```typescript
let todayDailyIndex = daily.time?.findIndex((t: string) => t.startsWith(nowLocalISO.split('T')[0])) ?? 0;
if (todayDailyIndex === -1) todayDailyIndex = 0;  // explicit guard
```

Pattern already proven in codebase for hourly:
```typescript
let currentHourIndex = hourly.time?.findIndex(...) || 0;
if (currentHourIndex === -1) currentHourIndex = 0;
```

---

### 3. ARCHITECTURE — Separate dailyPast Array (Additive, Not Mutative)

**Problem:** Extending dailyForecast slice changes its shape (13 items instead of 10).
- Atmosphere.tsx:251,255 reads dailyForecast[0] for today's temps
- If [0] = "3 days ago", these break despite correct anchoring
- Must not touch Atmosphere.tsx (zero-diff principle)

**Fix:** Create separate dailyPast array
```typescript
// Shared builder (index-safe, anchor-relative)
const buildDaily = (start: number, end: number) =>
  daily.time?.slice(start, end).map((t: string, i: number) => {
    const idx = start + i;
    return {
      time: t,
      code: daily.weather_code?.[idx] || 0,
      tempMax: daily.temperature_2m_max?.[idx] || 0,
      tempMin: daily.temperature_2m_min?.[idx] || 0,
      sunrise: daily.sunrise?.[idx] || '',
      sunset: daily.sunset?.[idx] || '',
      precipitationProbability: daily.precipitation_probability_max?.[idx] || 0,
      precipitationSum: daily.precipitation_sum?.[idx] || 0,
      uvIndexMax: daily.uv_index_max?.[idx] || 0,
      windSpeedMax: daily.wind_speed_10m_max?.[idx] || 0,
    };
  }) || [];

// Always today-anchored (10 items, unchanged shape)
const dailyForecast = buildDaily(todayDailyIndex, todayDailyIndex + 10);

// Flagged addition: 3 past days (only when TIMELINE_ON)
const dailyPast = TIMELINE_ON 
  ? buildDaily(Math.max(0, todayDailyIndex - 3), todayDailyIndex) 
  : [];

// Expose on returned object
const general: GeneralWeather = {
  // ... existing fields ...
  dailyForecast,
  dailyPast,  // NEW: optional field
};
```

Benefits:
- dailyForecast stays 10 items → dailyForecast[0] always today → Atmosphere.tsx unchanged ✓
- dailyPast is opt-in field → component accesses if needed
- Flag OFF: dailyPast = [] (empty, no overhead, tree-shaken)
- Flag ON: dailyPast has prior 3 days (or fewer if unavailable)

---

## Commit Sequence

### Commit 1: Anchor Refactor (UNCONDITIONAL, zero-diff)
- Extract buildDaily() helper, todayDailyIndex with -1 guard
- Replace slice(0, 10) + bare [i] with buildDaily(todayDailyIndex, todayDailyIndex + 10)
- Test: JSON.stringify(general.dailyForecast) must be identical to current output
- **DO NOT MERGE** until zero-diff verified

### Commit 2: Feature Flag + Past Data (ADDITIVE)
- const TIMELINE_ON = import.meta.env.VITE_FEATURE_ATMOSPHERE_TIMELINE === 'true';
- Add past_days param only when TIMELINE_ON
- Add dailyPast field to returned general object
- Test: Flag OFF → no past_days param, dailyPast = []; Flag ON → param present, dailyPast populated

### Commit 3: Hygiene (OPTIONAL, deferred)
- Add pastDays option to buildForecastParams/buildMarineParams (consistency only)

---

## Non-Negotiables
- forecast_days STAYS 10 in API request (locked)
- dailyForecast: 10 items, [0] = today (locked)
- Atmosphere.tsx lines 251,255: untouched (locked)
- Feature flag: VITE_FEATURE_ATMOSPHERE_TIMELINE === 'true' (Vite-native)
- past_days: absent when OFF, present when ON (tree-shakeable)
