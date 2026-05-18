/**
 * /api/noaa/[...path] — Vercel Serverless Function
 *
 * Proxies NOAA ArcGIS MapServer tile requests server-side.
 * NOAA's server returns no Access-Control-Allow-Origin header, so browsers
 * block direct requests. This function forwards the request with a proper
 * User-Agent, validates the response is actually an image, and passes it
 * back to the client with the correct CORS and Cache-Control headers.
 *
 * Route catches: /api/noaa/MCS/ENCOnline/MapServer/export?...
 * Upstream:      https://gis.charttools.noaa.gov/arcgis/rest/services/...
 */

export const config = {
  runtime: 'edge',
};

const UPSTREAM_BASE = 'https://gis.charttools.noaa.gov/arcgis/rest/services';

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // Strip the /api/noaa prefix to get the upstream path + query string.
  const upstreamPath = url.pathname.replace(/^\/api\/noaa\/?/, '');
  const upstreamUrl = `${UPSTREAM_BASE}/${upstreamPath}${url.search}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        // NOAA's server sometimes rejects requests without a browser-like UA.
        'User-Agent':
          'Mozilla/5.0 (compatible; SeaYou/1.0; +https://sea-you1-0-app.vercel.app)',
        Accept: 'image/png,image/*,*/*',
        Referer: 'https://sea-you1-0-app.vercel.app/',
      },
      // Respect Vercel edge timeout (30 s default is fine for tile requests).
    });

    // NOAA returns XML error envelopes with HTTP 200 on bad params.
    // Detect them by Content-Type and return a transparent 1×1 PNG instead
    // so MapLibre doesn't choke trying to decode XML as image data.
    const ct = upstream.headers.get('content-type') ?? '';
    if (!upstream.ok || (!ct.includes('image') && !ct.includes('octet-stream'))) {
      // Return a 1×1 transparent PNG so the tile slot stays empty but MapLibre
      // doesn't mark the source as errored.
      const blank = transparentPng();
      return new Response(blank, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=60',
        },
      });
    }

    // Stream the image through with CORS header and a short cache.
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': ct || 'image/png',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=7200',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Return a blank tile on network failure so MapLibre doesn't error-loop.
    const blank = transparentPng();
    return new Response(blank, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=10',
        'X-Proxy-Error': msg.slice(0, 200),
      },
    });
  }
}

// Minimal 1×1 transparent PNG (67 bytes, base64-decoded inline).
function transparentPng(): Uint8Array {
  const b64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
