/**
 * billing.ts — Stripe checkout bridge.
 *
 * Frontend entry point for the paywall. Calls our
 * `create-checkout-session` Supabase Edge Function, then redirects the
 * browser to the Stripe-hosted checkout page.
 *
 * Why `supabase.functions.invoke` (not a raw fetch):
 *   .invoke() automatically injects the caller's JWT in the
 *   `Authorization` header, which the Edge Function needs to resolve the
 *   user.id and attach it to `metadata.user_id`. Using raw fetch would
 *   require us to manually read the session token — more code, more room
 *   for bugs.
 *
 * Failure modes we surface to the caller:
 *   • NOT_SIGNED_IN  — the user is anonymous; the UI should prompt login.
 *   • NOT_CONFIGURED — Supabase client isn't initialized (dev-only fallback).
 *   • SERVER_ERROR   — anything the Edge Function returned.
 */

import { getSupabaseClient, isSupabaseConfigured } from '@seame/core';

export type StartCheckoutError =
  | { code: 'NOT_CONFIGURED'; message: string }
  | { code: 'NOT_SIGNED_IN';  message: string }
  | { code: 'SERVER_ERROR';   message: string };

export interface StartCheckoutResult {
  ok: boolean;
  error?: StartCheckoutError;
}

/**
 * Kick off a Stripe Checkout Session and redirect the browser to the
 * hosted payment page. On success this function never resolves (the page
 * is redirected away). On failure it returns `{ ok: false, error }`.
 */
export async function startCheckout(): Promise<StartCheckoutResult> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      error: {
        code: 'NOT_CONFIGURED',
        message: 'Supabase is not configured in this build.',
      },
    };
  }

  const supabase = getSupabaseClient();

  // Caller must be signed in — the Edge Function requires a JWT to
  // attach user_id to Stripe metadata.
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session) {
    return {
      ok: false,
      error: {
        code: 'NOT_SIGNED_IN',
        message: 'Please sign in before upgrading.',
      },
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke<{ url: string; id: string }>(
      'create-checkout-session',
      { body: {} },
    );

    if (error) {
      console.error('[billing] checkout invoke error', error);
      return {
        ok: false,
        error: { code: 'SERVER_ERROR', message: error.message ?? 'Checkout failed' },
      };
    }

    if (!data?.url) {
      return {
        ok: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Checkout session did not return a URL.',
        },
      };
    }

    // Full-page redirect to Stripe Checkout. Using href (not assign) so
    // the back-button semantics land on our site, not on Stripe.
    window.location.href = data.url;
    return { ok: true };
  } catch (err) {
    console.error('[billing] startCheckout failed', err);
    const message = err instanceof Error ? err.message : 'Checkout failed';
    return { ok: false, error: { code: 'SERVER_ERROR', message } };
  }
}
