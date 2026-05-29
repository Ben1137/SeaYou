/**
 * ais-relay — Supabase Edge Function (Deno runtime)
 * --------------------------------------------------
 * Secure server-side relay for aisstream.io WebSocket.
 * Holds AISSTREAM_API_KEY server-side so it is never exposed in the
 * client bundle. Streams AIS PositionReport messages to the caller
 * as Server-Sent Events (text/event-stream).
 *
 * GET ?bbox=lat1,lon1,lat2,lon2
 *   Authorization: Bearer <supabase-jwt>   (or ?authorization=<token>)
 *
 * Lifecycle fix: upstream WebSocket is opened SYNCHRONOUSLY before
 * returning the Response, and EdgeRuntime.waitUntil() registers the
 * stream lifetime so Deno Deploy keeps the isolate alive until the
 * WS closes or the client disconnects.
 *
 * Required secrets (Supabase → Project → Edge Functions → Secrets):
 *   AISSTREAM_API_KEY   — aisstream.io API key (no VITE_ prefix)
 *   SUPABASE_URL        — auto-injected
 *   SUPABASE_ANON_KEY   — auto-injected
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const AIS_WS_URL = 'wss://stream.aisstream.io/v0/stream';

// CORS headers applied to every response so the browser can always read
// error bodies (4xx/5xx).
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  // .trim() guards against a secret value accidentally set with leading/trailing
  // whitespace (e.g. copy-paste from a dashboard). AISStream silently drops the
  // upstream WebSocket with no close reason when the key is invalid.
  const apiKey = Deno.env.get('AISSTREAM_API_KEY')?.trim();
  if (!apiKey) {
    return new Response('AIS not configured', { status: 503, headers: corsHeaders });
  }

  // Resolve JWT — prefer Authorization header, fall back to query param
  // (EventSource in browsers cannot set custom headers).
  const url = new URL(req.url);
  const headerAuth = req.headers.get('authorization') ?? '';
  const queryToken = url.searchParams.get('authorization');
  const effectiveAuth = headerAuth || (queryToken ? `Bearer ${queryToken}` : '');

  if (!effectiveAuth) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: effectiveAuth } } },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }

  // Validate bbox: exactly 4 finite numbers, area ≤ 2°×2°.
  const rawBbox = url.searchParams.get('bbox') ?? '';
  const parts = rawBbox.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !isFinite(n))) {
    return new Response(
      'Invalid bbox — expected lat1,lon1,lat2,lon2',
      { status: 400, headers: corsHeaders },
    );
  }
  const [lat1, lon1, lat2, lon2] = parts;
  const latSpan = Math.abs(lat1 - lat2);
  const lonSpan = Math.abs(lon1 - lon2);
  if (latSpan > 2 || lonSpan > 2) {
    return new Response(
      JSON.stringify({
        error: 'bbox_too_large',
        message: 'Viewport too large for the AIS relay — max 2° × 2°.',
        latSpan: Number(latSpan.toFixed(4)),
        lonSpan: Number(lonSpan.toFixed(4)),
        maxDegrees: 2,
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Open upstream WebSocket SYNCHRONOUSLY before returning the Response.
  // If we open it inside ReadableStream.start(), Deno Deploy may tear
  // down the isolate before the WS handshake completes — causing the
  // client to see a 200 OK SSE that immediately closes with no data.
  let ws: WebSocket;
  try {
    ws = new WebSocket(AIS_WS_URL);
  } catch (err) {
    console.log(`[ais-relay] failed to construct upstream WS: ${err}`);
    return new Response(
      JSON.stringify({ error: 'upstream_unavailable', message: String(err) }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Stream lifetime promise — resolved when upstream WS closes or client
  // disconnects. Passed to EdgeRuntime.waitUntil() to keep the isolate alive.
  let resolveStreamDone: () => void = () => {};
  const streamDone = new Promise<void>((resolve) => {
    resolveStreamDone = resolve;
  });

  let positionReportCount = 0;
  let otherMessageCount = 0;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

  const body = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();

      const sendEvent = (data: unknown) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Client disconnected — ignore.
        }
      };

      const sendHeartbeat = () => {
        try {
          // SSE comment line — invisible to clients, keeps idle connections
          // alive through Cloudflare/Supabase Gateway proxies.
          controller.enqueue(enc.encode(`: keepalive ${Date.now()}\n\n`));
        } catch {
          // Client disconnected.
        }
      };

      // Initial heartbeat so client onopen fires and intermediaries see traffic.
      sendHeartbeat();
      heartbeatTimer = setInterval(sendHeartbeat, 25_000);

      ws.onopen = () => {
        console.log(
          `[ais-relay] upstream WS OPEN` +
          ` | ts=${new Date().toISOString()}` +
          ` | bbox=[${lat1},${lon1}]->[${lat2},${lon2}]` +
          ` | readyState=${ws.readyState}` +
          ` | keyLen=${apiKey.length}` +
          ` | keyPrefix=${apiKey.slice(0, 6)}…`,
        );

        // Build payload separately so we can log the exact JSON string
        // (with API key masked) before sending — this is the primary diagnostic
        // for AisStream rejections that show as silent EOF / code 1006.
        const subscriptionPayload = {
          APIKey: apiKey,
          BoundingBoxes: [[[lat1, lon1], [lat2, lon2]]],
          FilterMessageTypes: ['PositionReport'],
        };
        const payloadJson = JSON.stringify(subscriptionPayload);
        const maskedPayload = payloadJson.replace(
          /"APIKey":"[^"]*"/,
          `"APIKey":"${apiKey.slice(0, 6)}…[masked]"`,
        );
        console.log(`[ais-relay] sending subscription payload: ${maskedPayload}`);
        ws.send(payloadJson);
        console.log(`[ais-relay] subscription payload sent — byteLength=${new TextEncoder().encode(payloadJson).length}`);
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as Record<string, unknown>;
          if (msg.MessageType !== 'PositionReport') {
            otherMessageCount++;
            if (otherMessageCount <= 3) {
              console.log(`[ais-relay] non-PositionReport: ${JSON.stringify(msg).slice(0, 200)}`);
            }
            return;
          }

          const posReport = (msg.Message as Record<string, unknown> | undefined)
            ?.PositionReport as Record<string, unknown> | undefined;
          if (!posReport) return;

          const meta = (msg.MetaData ?? msg.Metadata) as Record<string, unknown> | undefined;

          positionReportCount++;
          if (positionReportCount === 1 || positionReportCount % 10 === 0) {
            console.log(`[ais-relay] forwarded ${positionReportCount} PositionReports`);
          }

          sendEvent({
            mmsi: String((meta?.MMSI ?? meta?.mmsi ?? posReport.UserID) ?? ''),
            lat: posReport.Latitude,
            lon: posReport.Longitude,
            cog: posReport.Cog ?? 0,
            sog: posReport.Sog ?? 0,
            heading: posReport.TrueHeading,
            ts: meta?.time_utc,
            name: typeof meta?.ShipName === 'string' ? meta.ShipName.trim() || null : null,
          });
        } catch (e) {
          console.log(`[ais-relay] parse error: ${e}`);
        }
      };

      ws.onclose = (ev) => {
        // Close codes reference: https://www.rfc-editor.org/rfc/rfc6455#section-7.4
        // 1000 = normal, 1001 = going away, 1006 = abnormal (no close frame received),
        // 4xxx = application-level (AISStream uses these for auth/rate-limit errors).
        const reason = ev.reason ?? '';
        const wasClean = ev.wasClean;
        console.log(
          `[ais-relay] upstream WS CLOSED` +
          ` | code=${ev.code}` +
          ` | reason="${reason}"` +
          ` | wasClean=${wasClean}` +
          ` | forwarded=${positionReportCount} PositionReports` +
          ` | ts=${new Date().toISOString()}`,
        );
        if (!wasClean || ev.code !== 1000) {
          console.error(
            `[ais-relay] upstream WS closed UNEXPECTEDLY — code=${ev.code} reason="${reason}"` +
            ` — this is likely the root cause of client Unexpected EOF`,
          );
        }
        // Forward the close details to the client as a structured SSE event
        // BEFORE closing the controller so the client can log a meaningful error.
        sendEvent({ type: 'error', message: 'Upstream WS closed', code: ev.code, reason });
        clearInterval(heartbeatTimer);
        try { controller.close(); } catch { /* already closed */ }
        resolveStreamDone();
      };

      ws.onerror = (ev) => {
        const errMsg = (ev as ErrorEvent).message ?? 'unknown';
        // Use console.error so this appears at ERROR level in Supabase Function logs,
        // not buried in INFO — makes it findable at a glance without log filtering.
        console.error(
          `[ais-relay] upstream WS ERROR` +
          ` | type=${(ev as Event).type}` +
          ` | message="${errMsg}"` +
          ` | ts=${new Date().toISOString()}` +
          ` | forwarded=${positionReportCount} PositionReports`,
        );
        // Forward to client via sendEvent (consistent with other event paths)
        // so the client can distinguish cert/DNS failures from transient drops.
        sendEvent({ type: 'error', message: 'Upstream WS error', code: 0, reason: errMsg });
        clearInterval(heartbeatTimer);
        try { controller.close(); } catch { /* already closed */ }
        resolveStreamDone();
      };

      // Client disconnect — close upstream and resolve stream lifetime.
      req.signal.addEventListener('abort', () => {
        console.log(`[ais-relay] client disconnected (forwarded ${positionReportCount} reports)`);
        clearInterval(heartbeatTimer);
        try { ws.close(); } catch { /* noop */ }
        try { controller.close(); } catch { /* already closed */ }
        resolveStreamDone();
      });
    },
  });

  // Tell Deno Deploy to keep this isolate alive until the stream is done.
  // Without this, the runtime may GC the isolate after returning the Response,
  // tearing down our WS callbacks before they fire.
  // deno-lint-ignore no-explicit-any
  const edgeRuntime = (globalThis as any).EdgeRuntime;
  if (edgeRuntime && typeof edgeRuntime.waitUntil === 'function') {
    edgeRuntime.waitUntil(streamDone);
  }

  return new Response(body, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Defeat nginx-style proxy buffering
    },
  });
});
