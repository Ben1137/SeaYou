/**
 * create-checkout-session — Supabase Edge Function (Deno runtime)
 * ----------------------------------------------------------------
 * Called from the frontend when a signed-in user clicks "Start Free
 * Trial" / "Upgrade to Premium". Creates a Stripe Checkout Session in
 * subscription mode and returns the hosted-page URL.
 *
 * Flow:
 *   1. Verify caller is authenticated (reads JWT from Authorization
 *      header → uses anon-key client to resolve user.id).
 *   2. Create a Stripe Checkout Session with the configured Price ID.
 *      `client_reference_id` and `metadata.user_id` both carry the
 *      Supabase user UUID so the webhook can link the payment back.
 *   3. Return `{ url }` — the frontend does `window.location.href = url`.
 *
 * Required env vars (Supabase → Project → Edge Functions → Secrets):
 *   SUPABASE_URL              — auto-injected
 *   SUPABASE_ANON_KEY         — auto-injected (used to verify caller JWT)
 *   STRIPE_SECRET_KEY         — sk_live_... or sk_test_...
 *   STRIPE_PRICE_ID           — price_... for the Premium subscription
 *   STRIPE_SUCCESS_URL        — e.g. https://seayou.app/?checkout=success
 *   STRIPE_CANCEL_URL         — e.g. https://seayou.app/?checkout=cancel
 *   STRIPE_TRIAL_DAYS         — optional, e.g. "7"
 *
 * Local invocation:
 *   supabase functions serve create-checkout-session
 *   curl -X POST http://localhost:54321/functions/v1/create-checkout-session \
 *        -H "Authorization: Bearer <user-jwt>"
 */

// deno-lint-ignore-file no-explicit-any
// @ts-ignore — resolved at Supabase runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// ─── CORS ──────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// ─── Env helpers ───────────────────────────────────────────────────────────

function env(name: string, required = true): string {
  // @ts-ignore — Deno global at runtime
  const value = (globalThis as any).Deno?.env?.get?.(name) ?? '';
  if (required && !value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

// ─── Stripe REST via fetch (no npm package needed on Deno edge) ────────────

async function createStripeCheckoutSession(params: {
  userId: string;
  email?: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  trialDays?: number;
  stripeSecret: string;
}): Promise<{ id: string; url: string }> {
  const form = new URLSearchParams();
  form.append('mode', 'subscription');
  form.append('success_url', params.successUrl);
  form.append('cancel_url', params.cancelUrl);
  form.append('line_items[0][price]', params.priceId);
  form.append('line_items[0][quantity]', '1');
  form.append('client_reference_id', params.userId);
  form.append('metadata[user_id]', params.userId);
  form.append('subscription_data[metadata][user_id]', params.userId);
  if (params.email) form.append('customer_email', params.email);
  if (params.trialDays && params.trialDays > 0) {
    form.append(
      'subscription_data[trial_period_days]',
      String(params.trialDays),
    );
  }
  form.append('allow_promotion_codes', 'true');

  const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.stripeSecret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  const data = await resp.json();
  if (!resp.ok) {
    console.error('[create-checkout-session] Stripe error', data);
    throw new Error(
      data?.error?.message || `Stripe error ${resp.status}`,
    );
  }
  return { id: data.id as string, url: data.url as string };
}

// ─── Main handler ──────────────────────────────────────────────────────────

// @ts-ignore — Deno global
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const SUPABASE_URL = env('SUPABASE_URL');
    const SUPABASE_ANON_KEY = env('SUPABASE_ANON_KEY');
    // Optional — absence triggers mock mode for regional testing without Stripe
    const STRIPE_SECRET_KEY = env('STRIPE_SECRET_KEY', false);

    // 1) Verify caller auth (runs in both real and mock paths)
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return jsonResponse(401, { error: 'Missing Authorization header' });
    }
    const jwt = authHeader.slice('Bearer '.length);

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      console.warn('[create-checkout-session] auth failed', userErr);
      return jsonResponse(401, { error: 'Invalid session' });
    }
    const user = userData.user;

    // 2) MOCK MODE — no Stripe key configured (regional bypass for dev/testing)
    if (!STRIPE_SECRET_KEY) {
      console.log(`[create-checkout-session] No STRIPE_SECRET_KEY — MOCK mode for user ${user.id}`);
      await new Promise<void>((resolve) => setTimeout(resolve, 800));
      const mockUrl = env('STRIPE_SUCCESS_URL', false) || req.headers.get('origin') || '/';
      return jsonResponse(200, { url: mockUrl, id: 'mock_session' });
    }

    // 3) Real Stripe path — only reached when key is configured
    const STRIPE_PRICE_ID = env('STRIPE_PRICE_ID');
    const STRIPE_SUCCESS_URL = env('STRIPE_SUCCESS_URL');
    const STRIPE_CANCEL_URL = env('STRIPE_CANCEL_URL');
    const trialDaysRaw = env('STRIPE_TRIAL_DAYS', false);
    const trialDays = trialDaysRaw ? Number(trialDaysRaw) : undefined;

    const session = await createStripeCheckoutSession({
      userId: user.id,
      email: user.email,
      priceId: STRIPE_PRICE_ID,
      successUrl: STRIPE_SUCCESS_URL,
      cancelUrl: STRIPE_CANCEL_URL,
      trialDays,
      stripeSecret: STRIPE_SECRET_KEY,
    });

    return jsonResponse(200, { id: session.id, url: session.url });
  } catch (err) {
    console.error('[create-checkout-session] fatal', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonResponse(500, { error: message });
  }
});
