/**
 * /api/distance-matrix — Vercel Serverless Function
 *
 * Proxies Google Distance Matrix requests server-side so that the browser can
 * obtain driving ETA/distance without running into Google's CORS block on the
 * Distance Matrix Web Service (which is a server-only API).
 *
 * Runs on Vercel's default Node.js Fluid Compute runtime.
 *
 * Query params:
 *   origin_lat, origin_lng   — user's current location (decimal degrees)
 *   dest_lat,   dest_lng     — marina location         (decimal degrees)
 *
 * Environment variables (Vercel dashboard → Settings → Environment Variables):
 *   GOOGLE_PLACES_API_KEY  — server-side Google Maps key with Distance Matrix
 *                            API enabled. Falls back to VITE_GOOGLE_PLACES_API_KEY
 *                            if only the client-exposed key is defined.
 *
 * Response shape (HTTP 200):
 *   { driveMinutes: number, driveKm: number }
 * On any failure (bad params, no key, Google error, unreachable by road):
 *   { error: string } with an appropriate status code (400 / 500 / 502).
 *
 * Cached 10 minutes on the edge via Cache-Control so repeat OD pairs avoid
 * re-hitting Google and burning quota.
 */

interface DistanceMatrixElement {
  status: string;
  duration?: { value: number; text: string };
  distance?: { value: number; text: string };
}

interface DistanceMatrixResponse {
  status: string;
  error_message?: string;
  rows?: Array<{ elements?: DistanceMatrixElement[] }>;
}

function jsonResponse(body: unknown, status: number, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // Allow browser callers (same-origin in prod, any origin for dev tools)
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      ...extraHeaders,
    },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
    });
  }
  if (req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const url = new URL(req.url);
  const originLat = url.searchParams.get('origin_lat');
  const originLng = url.searchParams.get('origin_lng');
  const destLat = url.searchParams.get('dest_lat');
  const destLng = url.searchParams.get('dest_lng');

  if (!originLat || !originLng || !destLat || !destLng) {
    return jsonResponse(
      { error: 'Missing required params: origin_lat, origin_lng, dest_lat, dest_lng' },
      400,
    );
  }

  // Basic numeric guard to avoid forwarding garbage to Google.
  for (const [name, val] of Object.entries({ originLat, originLng, destLat, destLng })) {
    const n = Number(val);
    if (!Number.isFinite(n)) {
      return jsonResponse({ error: `Param ${name} must be a number` }, 400);
    }
  }

  const apiKey =
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.VITE_GOOGLE_PLACES_API_KEY ||
    '';
  if (!apiKey) {
    return jsonResponse(
      {
        error:
          'Server misconfigured: set GOOGLE_PLACES_API_KEY in Vercel project env vars',
      },
      500,
    );
  }

  const googleUrl = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
  googleUrl.searchParams.set('origins', `${originLat},${originLng}`);
  googleUrl.searchParams.set('destinations', `${destLat},${destLng}`);
  googleUrl.searchParams.set('mode', 'driving');
  googleUrl.searchParams.set('units', 'metric');
  googleUrl.searchParams.set('key', apiKey);

  try {
    const googleResp = await fetch(googleUrl.toString());
    if (!googleResp.ok) {
      return jsonResponse(
        { error: `Google upstream error (HTTP ${googleResp.status})` },
        502,
      );
    }
    const data = (await googleResp.json()) as DistanceMatrixResponse;
    if (data.status !== 'OK') {
      return jsonResponse(
        { error: `Google: ${data.status}`, detail: data.error_message ?? null },
        data.status === 'REQUEST_DENIED' ? 500 : 502,
      );
    }
    const element = data.rows?.[0]?.elements?.[0];
    if (!element || element.status !== 'OK' || !element.duration || !element.distance) {
      return jsonResponse(
        { error: `No route (status=${element?.status ?? 'UNKNOWN'})` },
        404,
      );
    }

    const driveMinutes = Math.round(element.duration.value / 60);
    const driveKm = Math.round((element.distance.value / 1000) * 10) / 10;

    return jsonResponse(
      { driveMinutes, driveKm },
      200,
      {
        // Edge cache 10 min, CDN revalidates; client keeps its own 10-min dedup.
        'Cache-Control': 'public, max-age=600, s-maxage=600, stale-while-revalidate=1800',
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: `Proxy fetch failed: ${msg}` }, 502);
  }
}
