/**
 * stripe-webhook — Supabase Edge Function (Deno runtime)
 * ------------------------------------------------------
 * Receives Stripe webhook events. We care about:
 *   • checkout.session.completed      → user paid, flip to premium
 *   • customer.subscription.deleted   → subscription cancelled, revert to free
 *   • customer.subscription.updated   → pause / past_due / resume handling
 *
 * Why raw fetch + Web Crypto (no stripe-node):
 *   The Stripe npm package relies on Node's `crypto` + `Buffer` which are
 *   not cleanly available in Deno's Edge runtime. We implement the tiny
 *   slice of signature verification ourselves using SubtleCrypto HMAC.
 *
 * Required env vars (Supabase → Project → Edge Functions → Secrets):
 *   SUPABASE_URL              — auto-injected
 *   SUPABASE_SERVICE_ROLE_KEY — auto-injected; needed to bypass RLS and
 *                               write subscriptionTier into any user's row
 *   STRIPE_SECRET_KEY         — sk_live_... or sk_test_... (not strictly
 *                               needed for verification, but handy if we
 *                               ever want to fetch full session objects)
 *   STRIPE_WEBHOOK_SECRET     — whsec_... from the webhook endpoint page
 *
 * Webhook setup (Stripe dashboard → Developers → Webhooks):
 *   Endpoint URL:
 *     https://<project-ref>.functions.supabase.co/stripe-webhook
 *   Events to send:
 *     checkout.session.completed
 *     customer.subscription.deleted
 *     customer.subscription.updated
 *
 * IMPORTANT — this endpoint must be public (no JWT verification):
 *   In supabase/config.toml add:
 *     [functions.stripe-webhook]
 *     verify_jwt = false
 *   Otherwise Supabase will 401 every Stripe delivery attempt.
 */

// deno-lint-ignore-file no-explicit-any
// @ts-ignore — resolved at Supabase runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// ─── Env helpers ───────────────────────────────────────────────────────────

function env(name: string, required = true): string {
  // @ts-ignore — Deno global at runtime
  const value = (globalThis as any).Deno?.env?.get?.(name) ?? '';
  if (required && !value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

// ─── Stripe signature verification (Web Crypto HMAC-SHA256) ────────────────
//
// Stripe sends a header like:
//   Stripe-Signature: t=1700000000,v1=5257a869e7ec...,v1=...
// The signed payload is  `${timestamp}.${rawBody}`. We accept if any v1
// signature matches and the timestamp is within 5 minutes (replay window).

const TOLERANCE_SECONDS = 300;

async function verifyStripeSignature(
  rawBody: string,
  sigHeader: string,
  secret: string,
): Promise<boolean> {
  if (!sigHeader) return false;

  const parts = sigHeader.split(',').map((p) => p.trim());
  const tsPart = parts.find((p) => p.startsWith('t='));
  const v1Parts = parts.filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!tsPart || v1Parts.length === 0) return false;

  const timestamp = Number(tsPart.slice(2));
  if (!Number.isFinite(timestamp)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > TOLERANCE_SECONDS) {
    console.warn('[stripe-webhook] signature timestamp outside tolerance');
    return false;
  }

  const signedPayload = `${timestamp}.${rawBody}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const macBuf = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signedPayload),
  );
  const expected = Array.from(new Uint8Array(macBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time compare against every v1 candidate
  return v1Parts.some((candidate) => timingSafeEqual(candidate, expected));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ─── DB update — flip subscriptionTier in user_preferences.preferences ─────

async function setSubscriptionTier(
  admin: any,
  userId: string,
  tier: 'free' | 'premium',
): Promise<void> {
  // Deep-merge: fetch current row (if any), then upsert with new tier.
  // We do NOT blindly overwrite `preferences` — other fields (persona,
  // homeLocation, hasCompletedTour, …) must be preserved.
  const { data: existing, error: fetchErr } = await admin
    .from('user_preferences')
    .select('preferences')
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchErr) {
    console.error('[stripe-webhook] fetch failed', fetchErr);
    throw fetchErr;
  }

  const merged = {
    ...(existing?.preferences ?? {}),
    subscriptionTier: tier,
  };

  const { error: upsertErr } = await admin
    .from('user_preferences')
    .upsert(
      {
        user_id: userId,
        preferences: merged,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

  if (upsertErr) {
    console.error('[stripe-webhook] upsert failed', upsertErr);
    throw upsertErr;
  }

  console.log(`[stripe-webhook] user ${userId} → ${tier}`);
}

// ─── Main handler ──────────────────────────────────────────────────────────

// @ts-ignore — Deno global
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch (err) {
    console.error('[stripe-webhook] failed to read body', err);
    return new Response('Bad request', { status: 400 });
  }

  const sigHeader = req.headers.get('stripe-signature') ?? '';

  try {
    const STRIPE_WEBHOOK_SECRET = env('STRIPE_WEBHOOK_SECRET');
    const SUPABASE_URL = env('SUPABASE_URL');
    const SERVICE_ROLE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');

    const ok = await verifyStripeSignature(rawBody, sigHeader, STRIPE_WEBHOOK_SECRET);
    if (!ok) {
      console.warn('[stripe-webhook] signature verification failed');
      return new Response('Invalid signature', { status: 400 });
    }

    const event = JSON.parse(rawBody);
    const type = event?.type as string;
    const obj = event?.data?.object ?? {};

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    switch (type) {
      case 'checkout.session.completed': {
        // Checkout done — flip to premium.
        const userId: string | undefined =
          obj?.metadata?.user_id ?? obj?.client_reference_id ?? undefined;
        if (!userId) {
          console.warn('[stripe-webhook] checkout.session.completed without user_id', obj?.id);
          break;
        }
        // Only flip if payment actually succeeded (or it's a trial).
        const status = obj?.payment_status as string | undefined;
        if (status && status !== 'paid' && status !== 'no_payment_required') {
          console.log('[stripe-webhook] skipping — payment_status=', status);
          break;
        }
        await setSubscriptionTier(admin, userId, 'premium');
        break;
      }

      case 'customer.subscription.updated': {
        // Pause / past_due / unpaid → revoke. Active/trialing → premium.
        const userId: string | undefined = obj?.metadata?.user_id;
        if (!userId) {
          console.warn('[stripe-webhook] subscription.updated without user_id metadata');
          break;
        }
        const status = obj?.status as string;
        const activeStates = ['active', 'trialing'];
        const tier: 'free' | 'premium' = activeStates.includes(status) ? 'premium' : 'free';
        await setSubscriptionTier(admin, userId, tier);
        break;
      }

      case 'customer.subscription.deleted': {
        // Cancellation → revert to free.
        const userId: string | undefined = obj?.metadata?.user_id;
        if (!userId) break;
        await setSubscriptionTier(admin, userId, 'free');
        break;
      }

      default:
        // Anything else — acknowledge so Stripe doesn't keep retrying.
        console.log('[stripe-webhook] ignoring event', type);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[stripe-webhook] fatal', err);
    // Return 500 so Stripe retries. But if it was a signature/parse issue
    // above we already returned 400 and never hit here.
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
