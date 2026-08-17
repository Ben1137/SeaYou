/**
 * DEV-ONLY surface-swell override — build-time gated on `import.meta.env.DEV`.
 *
 * WHY: lets the agent deterministically render the DIVER modal's
 * SurfaceSwellExposureCard at a chosen swell (e.g. a big-swell caution state)
 * for unattended screenshots, without waiting for real ocean conditions to
 * cooperate. It only substitutes the swell height/period the card reads — it
 * touches NO scoring, NO other card, NO network, NO real weather data.
 *
 * PROD SAFETY (load-bearing): the sole caller wraps every reference in
 * `if (import.meta.env.DEV)`. Vite statically replaces `import.meta.env.DEV`
 * with `false` in the production build, so the branch is dead-code-eliminated
 * and this side-effect-free module is tree-shaken out of the deployed bundle.
 * It is NOT runtime-toggleable in prod. Verify:
 *   pnpm --filter @seame/web build && grep -rn SEAYOU_DEV_SWELL dist/  → 0 hits
 *
 * Usage (dev only): append `?devSwell=<height_m>,<period_s>` to the URL, e.g.
 *   http://localhost:5173/?devSwell=2.6,14   → big long-period swell (caution)
 *   http://localhost:5173/?devSwell=0.3,6    → small short-period swell (calm)
 */

/** Searchable prod-absence marker. If this appears in dist/, tree-shaking failed. */
export const DEV_SWELL_MARKER = 'SEAYOU_DEV_SWELL_v1';

/**
 * Read a dev swell override from the URL query string.
 * Returns null when absent or malformed (so the card falls back to real data).
 */
export function readDevSwellOverride(): { swellHeight: number; swellPeriod: number } | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = new URLSearchParams(window.location.search).get('devSwell');
    if (!raw) return null;
    const [h, t] = raw.split(',').map((s) => Number(s.trim()));
    if (!isFinite(h) || !isFinite(t) || h <= 0 || t <= 0) return null;
    // eslint-disable-next-line no-console
    console.info(`[${DEV_SWELL_MARKER}] dev swell override active — H=${h} m, T=${t} s (local, no network).`);
    return { swellHeight: h, swellPeriod: t };
  } catch {
    return null;
  }
}
