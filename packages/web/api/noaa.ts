/**
 * /api/noaa — Vercel Edge Function
 *
 * Proxies NOAA ArcGIS MaritimeChartService tile requests server-side.
 * NOAA's gis.charttools.noaa.gov returns no Access-Control-Allow-Origin
 * header, so browsers block direct fetches.  This function forwards every
 * query string to the hardcoded upstream MaritimeChartService export
 * endpoint, validates the response is actually an image, and passes it back
 * with the correct CORS and Cache-Control headers.
 *
 * Why single-file (not /api/noaa/[...path].ts):
 * The catch-all [...path] route is only matching a single path segment on
 * this Vite-preset + Turbo monorepo deployment — multi-segment requests
 * like /api/noaa/MCS/ENCOnline/MapServer/exts/MaritimeChartService/MapServer/export
 * 404 at Vercel's edge before reaching the function.  Hardcoding the
 * upstream path here removes the catch-all dependency entirely: the client
 * just hits /api/noaa?bbox=...&bboxSR=...&... and we forward every param
 * to the single known upstream URL.
 *
 * Client tile URL: /api/noaa?bbox={bbox-epsg-3857}&bboxSR=3857&...
 */

export const config = {
  runtime: 'edge',
};

const UPSTREAM_URL =
  'https://gis.charttools.noaa.gov/arcgis/rest/services' +
  '/MCS/ENCOnline/MapServer/exts/MaritimeChartService/MapServer/export';

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  // Strip our own cache-buster before forwarding (harmless either way).
  const params = new URLSearchParams(url.search);
  params.delete('cb');
  const upstreamUrl = `${UPSTREAM_URL}?${params.toString()}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; SeaYou/1.0; +https://sea-you1-0-app.vercel.app)',
        Accept: 'image/png,image/*,*/*',
        Referer: 'https://sea-you1-0-app.vercel.app/',
      },
    });

    // NOAA returns XML error envelopes with HTTP 200 on bad params.
    // Detect them by Content-Type and return a transparent 1×1 PNG instead
    // so MapLibre doesn't choke trying to decode XML as image data.
    const ct = upstream.headers.get('content-type') ?? '';
    if (!upstream.ok || (!ct.includes('image') && !ct.includes('octet-stream'))) {
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

    // Buffer the body before responding to avoid any Vercel Edge streaming
    // quirks (binary corruption) that can occur when piping upstream.body
    // directly into a new Response.
    const buffer = await upstream.arrayBuffer();
    return new Response(buffer, {
      status: upstream.status,
      headers: {
        'Content-Type': ct || 'image/png',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=7200',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
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
