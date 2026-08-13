/**
 * DEV-ONLY mock-auth bypass — build-time gated on `import.meta.env.DEV`.
 *
 * WHY: lets the agent render its own UI work (dashboard) for unattended
 * screenshots without a real login. It injects a purely LOCAL fake session so
 * the app renders past the auth → onboarding → tour gates. It NEVER calls
 * Supabase, uses NO real credential, and hits NO network.
 *
 * PROD SAFETY (load-bearing): every reference to this module is wrapped in
 * `if (import.meta.env.DEV)` / `import.meta.env.DEV && …`. Vite statically
 * replaces `import.meta.env.DEV` with `false` in the production build, so those
 * branches are dead-code-eliminated and this side-effect-free module is
 * tree-shaken out of the deployed bundle entirely. It is NOT runtime-toggleable,
 * NOT env-var-flippable, NOT URL-param-flippable — build-time only. Verify:
 *   pnpm --filter @seame/web build && grep -rn SEAYOU_DEV_MOCK_AUTH dist/  → 0 hits
 *
 * The real AuthContext sign-in path is untouched; this only short-circuits
 * BEFORE it, and only in dev.
 */
import type { Session, User } from '@seame/core';

/** Searchable prod-absence marker. If this string appears in dist/, tree-shaking failed. */
export const DEV_MOCK_MARKER = 'SEAYOU_DEV_MOCK_AUTH_v1';

/** Fake LOCAL user — not a real account, never authenticated against Supabase. */
export const DEV_MOCK_USER = {
  id: 'dev-mock-user-0000-0000-0000',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'dev@localhost.mock',
  app_metadata: { provider: 'dev-mock', providers: ['dev-mock'] },
  user_metadata: { full_name: 'Dev Mock (local screenshot)' },
  created_at: '2026-01-01T00:00:00.000Z',
} as unknown as User;

/** Fake LOCAL session wrapping the mock user. Token is obviously non-real. */
export const DEV_MOCK_SESSION = {
  access_token: 'dev-mock-access-token-not-a-real-jwt',
  refresh_token: 'dev-mock-refresh-token',
  expires_in: 3600,
  expires_at: 4102444800, // year 2100 — far future so nothing treats it as expired
  token_type: 'bearer',
  user: DEV_MOCK_USER,
} as unknown as Session;

/**
 * Pre-seed the localStorage gates so the dashboard renders unattended:
 *   • onboarding wizard  (useOnboarding → 'seayou_onboarding_complete')
 *   • interactive tour fast-path ('seaYouTourCompleted')
 * Location already defaults to Tel Aviv (NAVIGATION_CONSTANTS.DEFAULT_LOCATION),
 * and persona stays null → all forecast tabs show AND the tour is suppressed
 * (showAppTour requires persona !== null). Idempotent; only sets keys it hasn't.
 */
export function seedDevBypassState(): void {
  try {
    // App-level onboarding gate (App.tsx ONBOARDING_FLAG) — must equal the string '1'.
    localStorage.setItem('seayou_onboarding_done', '1');
    // useOnboarding wizard gate (offline/unauth fallback path).
    if (!localStorage.getItem('seayou_onboarding_complete')) {
      localStorage.setItem(
        'seayou_onboarding_complete',
        JSON.stringify({ completed: true, dev: DEV_MOCK_MARKER }),
      );
    }
    // Interactive-tour fast-path gate.
    if (!localStorage.getItem('seaYouTourCompleted')) {
      localStorage.setItem('seaYouTourCompleted', 'true');
    }
    console.info(
      `[${DEV_MOCK_MARKER}] dev mock-auth bypass active — local session, no Supabase, no real credential.`,
    );
  } catch {
    /* localStorage unavailable — noop */
  }
}
