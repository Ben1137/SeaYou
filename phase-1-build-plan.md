# Phase 1 — Atmosphere Timeline Feature

## Executive Summary

Add **3 days of historical weather data** to the daily forecast carousel using a cleanly-gated feature flag. Implementation is split into **two sequential, independent commits**:

1. **Anchor Refactor** — Prove zero-diff with existing behavior (prerequisite)
2. **Feature Flag + Past Data** — Add past_days param and dailyPast field (additive)

This approach decouples the refactor risk from the feature risk; if either breaks, we know which commit caused it.

---

## Problem Statement

### Current State
- Daily forecast uses `slice(0, 10)` hardcoded, assumes `daily.time[0]` = today
- Adding `past_days=3` shifts the array: `[day-3, day-2, day-1, today, ...]`
- Current code loses 3 forecast days and renders "3 days ago" as "today"
- Need: index-safe anchor that survives past_days parameter changes

### Solution
- Anchor to today's date using `findIndex()` (already proven in hourly forecast at line 148–149)
- Extract a reusable `buildDaily()` helper for both today's forecast and past data
- Gate with `VITE_FEATURE_ATMOSPHERE_TIMELINE === 'true'` for clean on/off semantics
- Expose past data in a separate `dailyPast` field (non-breaking, additive)

---

## Corrections to Earlier Agent Proposal

### 1. Feature Flag: Use VITE_*, Not import.meta.env.DEV
**Why it matters:**
- `import.meta.env.DEV` is tree-shaken from prod, with NO way to enable the feature later
- Plan requires: "flag OFF → absent from bundle; flag ON in Vercel → ships live"
- Use `import.meta.env.VITE_FEATURE_ATMOSPHERE_TIMELINE === 'true'` instead
  - Vite exposes VITE_-prefixed vars by default (verified in vite.config.ts)
  - Unset (dev) → `undefined === 'true'` → false → OFF path tree-shakes ✓
  - Set in Vercel env → `'true' === 'true'` → true → ON path compiles in ✓
  - **String comparison is mandatory** (Vite env vars are strings)

### 2. FindIndex -1 Guard: Explicit Check Required
**Why it matters:**
- `findIndex()` returns `-1` on no match (not `undefined`)
- `-1 || 0` evaluates to `-1` (truthy)
- `slice(-1, 9)` produces silent empty/garbage results in flag OFF path
- Use explicit guard: `if (todayDailyIndex === -1) todayDailyIndex = 0;`
- Pattern already proven in codebase (weatherService.ts:148–149)

### 3. Architecture: Separate dailyPast Array (Additive, Not Mutative)
**Why it matters:**
- Don't extend `dailyForecast` slice to 13 items (changes shape)
- Atmosphere.tsx:251,255 reads `dailyForecast[0]?.tempMax` for today's temps
- If [0] = "3 days ago", dashboard cards break despite correct anchoring
- Solution: Create separate `dailyPast` array (new field, opt-in)
  - `dailyForecast` stays 10 items, [0] = today (unchanged shape)
  - `dailyPast` = [] when flag OFF, [3 past days] when flag ON
  - Atmosphere.tsx needs zero changes

---

## Implementation

### File: `packages/core/src/services/weatherService.ts`

#### Commit 1: Anchor Refactor (UNCONDITIONAL, Zero-Diff)

**Goal:** Prove the refactored daily build produces identical output to the current hardcoded slice.

**Changes:**

Replace lines 162–174 with:

```typescript
// Calculate today's index in the daily arrays
// When timezone='auto', API returns times in local timezone (e.g., "2026-01-21")
// Parse the local date (YYYY-MM-DD) and find its index
const nowLocalDate = `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
let todayDailyIndex = daily.time?.findIndex((t: string) => t.startsWith(nowLocalDate)) ?? 0;
if (todayDailyIndex === -1) todayDailyIndex = 0; // explicit -1 guard

// Reusable daily builder (index-safe, anchor-relative)
// Used for today's 10-day forecast and (later) past data
const buildDaily = (startIdx: number, endIdx: number) =>
  daily.time?.slice(startIdx, endIdx).map((t: string, i: number) => {
    const idx = startIdx + i;
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
      windSpeedMax: daily.wind_speed_10m_max?.[idx] || 0
    };
  }) || [];

// Build 10-day daily forecast anchored to today
const dailyForecast = buildDaily(todayDailyIndex, todayDailyIndex + 10);
```

**Validation:**
- This refactor must produce **bit-identical output** to the current code
- Test: `JSON.stringify(general.dailyForecast)` before and after must match
- Log both to console and diff them
- **DO NOT MERGE** until zero-diff is confirmed (acceptance test)

**Why this is safe:**
- When `todayDailyIndex` = 0 (no past_days yet), `buildDaily(0, 10)` = current `slice(0, 10)`
- All array reads offset by `startIdx + i` instead of bare `[i]` — same semantics
- Defaults (`|| 0`, `|| ''`) are preserved verbatim — output is identical

---

#### Commit 2: Feature Flag + Past Data (ADDITIVE)

**Goal:** Gate past_days parameter and expose optional dailyPast field.

**Changes:**

At the top of `fetchMarineWeather()`, after building `marineParams` (after line 64), add:

```typescript
// Feature flag: Historical timeline (3 days of past weather)
// Set VITE_FEATURE_ATMOSPHERE_TIMELINE=true in Vercel env to enable
const TIMELINE_ON = import.meta.env.VITE_FEATURE_ATMOSPHERE_TIMELINE === 'true';

if (TIMELINE_ON) {
  marineParams.set('past_days', '3');
  generalParams.set('past_days', '3');
}
```

After building `dailyForecast` (after the Commit 1 code), add:

```typescript
// Past daily data (only populated when feature flag is ON)
// Slice the 3 days prior to today, or fewer if unavailable
const dailyPast = TIMELINE_ON 
  ? buildDaily(Math.max(0, todayDailyIndex - 3), todayDailyIndex)
  : [];
```

In the `general` object (around line 176), add `dailyPast` to the returned object:

```typescript
const general: GeneralWeather = {
  // ... existing fields (temperature, humidity, uvIndex, etc.) ...
  dailyForecast,
  dailyPast,  // NEW: 3 past days when TIMELINE_ON, [] otherwise
  hourlyForecast
};
```

**Validation:**
- **Flag OFF (unset env var):**
  - `past_days` param absent from both API requests
  - `dailyPast = []`
  - Output shape unchanged from prod
  - Verification: `pnpm --filter @seame/web build && grep -rn 'past_days' dist/` → 0 hits ✓
  
- **Flag ON (VITE_FEATURE_ATMOSPHERE_TIMELINE=true in Vercel):**
  - `past_days=3` added to both API requests
  - `dailyPast` contains prior 3 days (or fewer if array is shorter)
  - `dailyForecast[0]` still today, unchanged
  - Atmosphere.tsx:251,255 (today's temps) still works

---

#### Commit 3: Hygiene (OPTIONAL, Deferred)

For consistency across the codebase, consider adding `pastDays` optional parameter to:
- `buildForecastParams()` in constants
- `buildMarineParams()` in constants

This is not required for Phase 1 (fetchMarineWeather hand-builds params), but improves long-term consistency if these helpers grow to accept options.

---

## Non-Breaking, Non-Negotiable Constraints

- ✅ `forecast_days` MUST remain **10** in API request (locked, not reduced)
- ✅ `dailyForecast` shape: **10 items, [0] = today** (unchanged, Atmosphere.tsx [0] access safe)
- ✅ Dashboard cards (temp, humidity, sunrise) **untouched** (use dailyForecast[0])
- ✅ 24-hour strip **untouched** (uses findIndex already)
- ✅ Oracle shader **untouched** (shader-verify 0.00% unchanged)
- ✅ Feature flag: `VITE_FEATURE_ATMOSPHERE_TIMELINE === 'true'` (Vite-native, tree-shakeable)
- ✅ Past data: **absent when OFF**, present when ON (tree-shaken if unused)

---

## Deployment Checklist

- [ ] **Commit 1 (Anchor):** Zero-diff acceptance test passed, merged to `main`
- [ ] **Commit 2 (Flag + Data):** Feature compiles with flag OFF (prod behavior unchanged)
- [ ] **Build verification:** `pnpm --filter @seame/web build` exits 0
- [ ] **Bundle check:** `grep -rn "past_days\|VITE_FEATURE" dist/` → 0 hits (flag OFF)
- [ ] **Preview deploy:** Push to `main`, Vercel builds with VITE_FEATURE_ATMOSPHERE_TIMELINE=**unset**
- [ ] **Preview validation:**
  - API requests have no `past_days` parameter
  - dailyPast is [] or absent
  - Dashboard temps (dailyForecast[0]) display correctly
  - 24h strip, oracle unchanged
- [ ] **Production flip:** Set Vercel env var `VITE_FEATURE_ATMOSPHERE_TIMELINE=true`
- [ ] **Rebuild Vercel:** Redeploy prod with flag ON
- [ ] **Prod validation:**
  - API requests include `past_days=3`
  - dailyPast populated with 3 prior days
  - dailyForecast[0] still today
  - Timeline UI renders (component work in Phase 2)

---

## Why This Approach Works

| Concern | Solution |
|---------|----------|
| **Refactor risk** | Commit 1 is zero-diff, proves no regression before feature is added |
| **Feature risk** | Commit 2 is purely additive — new field, new param, gated by flag |
| **Flag shipping** | VITE_* semantics allow Vercel env var control without code changes |
| **Component safety** | dailyForecast stays 10 items → existing [0] reads unaffected |
| **Tree-shaking** | Flag OFF = param never sent, dailyPast never used, entirely absent from bundle |
| **Rollback** | Each commit is independent; reverting either one doesn't corrupt the other |

---

## Next: Phase 2 (Separate Work)

Once Phase 1 is live (dailyPast available via API), Phase 2 builds the UI:
- **Atmosphere.tsx** additions: Render dailyPast cards before dailyForecast carousel
- **DateFormatting** refinements: Handle "3 days ago", "2 days ago" labels
- **Dashboard tweak** (if any): Show historical temps vs current (styling only)

Phase 2 can proceed once Phase 1 is merged and live in production.
