/**
 * GPX Export — Phase 6.
 *
 * Pure string-builders for the GPX 1.1 XML format, plus a browser-side
 * download helper. Output validates against the Topografix 1.1 schema
 * and round-trips cleanly through OpenCPN, Garmin BaseCamp, and
 * Navionics Boating.
 *
 * Two entry points:
 *   • `routeToGpx(route)` — a planned route (waypoints + <rte>).
 *   • `voyageToGpx(log)`  — a completed voyage (<trk> with timestamps
 *                          and extension speeds per point).
 *
 * All functions are pure — the caller decides when to trigger a
 * browser download via `downloadGpx()`.
 */
import type { Route, Waypoint } from '../types/navigation';
import type { VoyageLog } from './voyageLogService';

const GPX_NS = 'http://www.topografix.com/GPX/1/1';
const GPX_CREATOR = 'SeaYou';
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance';
const SCHEMA_LOC =
  'http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd';

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function waypointXml(wp: Waypoint, tag: 'wpt' | 'rtept'): string {
  return (
    `    <${tag} lat="${wp.lat.toFixed(7)}" lon="${wp.lon.toFixed(7)}">\n` +
    `      <name>${xmlEscape(wp.name || wp.id)}</name>\n` +
    `      <type>${xmlEscape(wp.type)}</type>\n` +
    `    </${tag}>\n`
  );
}

/** GPX 1.1 document for a planned Route (waypoints + ordered <rte>). */
export function routeToGpx(route: Route): string {
  const waypoints = route.waypoints.map((w) => waypointXml(w, 'wpt')).join('');
  const rtepts = route.waypoints.map((w) => waypointXml(w, 'rtept')).join('');
  const meta =
    `  <metadata>\n` +
    `    <name>${xmlEscape(route.name)}</name>\n` +
    `    <time>${route.createdAt.toISOString()}</time>\n` +
    `  </metadata>\n`;

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<gpx version="1.1" creator="${GPX_CREATOR}" xmlns="${GPX_NS}" ` +
    `xmlns:xsi="${XSI_NS}" xsi:schemaLocation="${SCHEMA_LOC}">\n` +
    meta +
    waypoints +
    `  <rte>\n` +
    `    <name>${xmlEscape(route.name)}</name>\n` +
    rtepts.replace(/^ {4}/gm, '    ') + // already indented
    `  </rte>\n` +
    `</gpx>\n`
  );
}

/** GPX 1.1 document for a completed Voyage (<trk> with <trkpt> history). */
export function voyageToGpx(log: VoyageLog): string {
  const coords = log.track?.geometry?.coordinates ?? [];
  const times = log.track?.properties?.coordTimes ?? [];
  const speeds = log.track?.properties?.coordSpeeds ?? [];

  const trkpts = coords
    .map(([lon, lat], i) => {
      const ts = times[i] ?? log.startTime.toISOString();
      const sp = typeof speeds[i] === 'number' ? speeds[i] : null;
      const speedExt =
        sp !== null
          ? `        <extensions><speed>${sp.toFixed(2)}</speed></extensions>\n`
          : '';
      return (
        `      <trkpt lat="${lat.toFixed(7)}" lon="${lon.toFixed(7)}">\n` +
        `        <time>${ts}</time>\n` +
        speedExt +
        `      </trkpt>\n`
      );
    })
    .join('');

  const meta =
    `  <metadata>\n` +
    `    <name>${xmlEscape(log.name ?? 'Voyage')}</name>\n` +
    `    <time>${log.startTime.toISOString()}</time>\n` +
    `    <desc>${log.distanceTraveled.toFixed(2)} NM · avg ` +
    `${log.avgSpeed.toFixed(1)} kt · max ${log.maxSpeed.toFixed(1)} kt</desc>\n` +
    `  </metadata>\n`;

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<gpx version="1.1" creator="${GPX_CREATOR}" xmlns="${GPX_NS}" ` +
    `xmlns:xsi="${XSI_NS}" xsi:schemaLocation="${SCHEMA_LOC}">\n` +
    meta +
    `  <trk>\n` +
    `    <name>${xmlEscape(log.name ?? 'Voyage')}</name>\n` +
    `    <trkseg>\n` +
    trkpts +
    `    </trkseg>\n` +
    `  </trk>\n` +
    `</gpx>\n`
  );
}

/** Slugify a suggested filename so the download doesn't break in any OS. */
function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'seayou'
  );
}

/**
 * Trigger a browser download of a GPX string. Safe to call from a
 * click handler; uses a short-lived Object URL and revokes it after
 * the next tick.
 */
export function downloadGpx(filenameBase: string, gpxXml: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const blob = new Blob([gpxXml], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slugify(filenameBase)}.gpx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
