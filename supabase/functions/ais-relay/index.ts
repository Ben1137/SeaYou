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
 * Constraints:
 *   - Caller must be authenticated (JWT verified against Supabase Auth).
 *   - bbox must contain 4 finite numbers.
 *   - bbox area is capped at 2°×2° to limit upstream subscription cost.
 *   - AISSTREAM_API_KEY is read from Deno.env — never echoed in responses.
 *
 * Required secrets (Supabase → Project → Edge Functions → Secrets):
 *   AISSTREAM_API_KEY   — aisstream.io API key (no VITE_ prefix)
 *   SUPABASE_URL        — auto-injected
 *   SUPABASE_ANON_KEY   — auto-injected
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const AIS_WS_URL = 'wss://stream.aisstream.io/v0/stream';

Deno.serve(async (req) => {
  // Only GET is supported — SSE is a long-lived GET response.
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const apiKey = Deno.env.get('AISSTREAM_API_KEY');
  if (!apiKey) {
    return new Response('AIS not configured', { status: 503 });
  }

  // Resolve JWT — prefer Authorization header, fall back to query param
  // (EventSource in browsers cannot set custom headers).
  const url = new URL(req.url);
  const headerAuth = req.headers.get('authorization') ?? '';
  const queryToken = url.searchParams.get('authorization');
  const effectiveAuth = headerAuth || (queryToken ? `Bearer ${queryToken}` : '');

  if (!effectiveAuth) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: effectiveAuth } } },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Validate bbox: exactly 4 finite numbers, area ≤ 2°×2°.
  const rawBbox = url.searchParams.get('bbox') ?? '';
  const parts = rawBbox.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !isFinite(n))) {
    return new Response('Invalid bbox — expected lat1,lon1,lat2,lon2', { status: 400 });
  }
  const [lat1, lon1, lat2, lon2] = parts;
  if (Math.abs(lat1 - lat2) > 2 || Math.abs(lon1 - lon2) > 2) {
    return new Response('Bbox too large — max 2° x 2°', { status: 400 });
  }

  // Build the SSE ReadableStream backed by an upstream WebSocket.
  const body = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();

      const sendEvent = (data: unknown) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Client already disconnected — ignore write errors.
        }
      };

      let ws: WebSocket | null = null;

      try {
        ws = new WebSocket(AIS_WS_URL);

        ws.onopen = () => {
          ws!.send(
            JSON.stringify({
              APIKey: apiKey,
              BoundingBoxes: [[[lat1, lon1], [lat2, lon2]]],
              FilterMessageTypes: ['PositionReport'],
            }),
          );
        };

        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data as string) as Record<string, unknown>;
            if (msg.MessageType !== 'PositionReport') return;

            const posReport = (msg.Message as Record<string, unknown> | undefined)
              ?.PositionReport as Record<string, unknown> | undefined;
            if (!posReport) return;

            const meta = (msg.MetaData ?? msg.Metadata) as
              | Record<string, unknown>
              | undefined;

            sendEvent({
              mmsi: String(
                (meta?.MMSI ?? meta?.mmsi ?? posReport.UserID) ?? '',
              ),
              lat: posReport.Latitude,
              lon: posReport.Longitude,
              cog: posReport.Cog ?? 0,
              sog: posReport.Sog ?? 0,
              heading: posReport.TrueHeading,
              ts: meta?.time_utc,
              name: typeof meta?.ShipName === 'string'
                ? meta.ShipName.trim() || null
                : null,
            });
          } catch {
            // Skip malformed frames — do not crash the stream.
          }
        };

        ws.onclose = () => {
          try { controller.close(); } catch { /* already closed */ }
        };

        ws.onerror = () => {
          try { controller.close(); } catch { /* already closed */ }
        };

        // When the client disconnects (browser tab close, component unmount),
        // abort signal fires — close the upstream WebSocket immediately.
        req.signal.addEventListener('abort', () => {
          ws?.close();
          try { controller.close(); } catch { /* already closed */ }
        });
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
});
