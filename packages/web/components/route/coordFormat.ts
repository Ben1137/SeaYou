/**
 * DD ↔ DMS conversion helpers — Phase 7.
 *
 * UI may toggle between Decimal Degrees (`43.7384`) and
 * Degrees/Minutes/Seconds (`43°44'18.2"N`). Inputs must round-trip
 * without loss for the 1E-5 deg precision we actually need for routing.
 */

export type CoordAxis = 'lat' | 'lon';

function posHemi(axis: CoordAxis): 'N' | 'E' {
  return axis === 'lat' ? 'N' : 'E';
}
function negHemi(axis: CoordAxis): 'S' | 'W' {
  return axis === 'lat' ? 'S' : 'W';
}

/** Format a decimal degree value as `DD°MM'SS.S"H`. */
export function toDMS(decimal: number, axis: CoordAxis): string {
  if (!Number.isFinite(decimal)) return '';
  const hemi = decimal >= 0 ? posHemi(axis) : negHemi(axis);
  const abs = Math.abs(decimal);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = (minFloat - min) * 60;
  // Always pad minutes to 2 chars; keep 2 decimals on seconds.
  const minStr = String(min).padStart(2, '0');
  const secStr = sec.toFixed(2).padStart(5, '0');
  return `${deg}°${minStr}'${secStr}"${hemi}`;
}

/**
 * Accepts any of:
 *  - `43.7384`, `-78.1`                       (plain DD)
 *  - `43°44'18.2"N`, `78 10 30 W`, `43 44.3 N` (DMS / DMM variants)
 *  - with suffix or prefixed sign
 * Returns a finite number or `NaN` when unparseable.
 */
export function parseCoord(raw: string, axis: CoordAxis): number {
  if (!raw) return NaN;
  const s = raw.trim();
  if (!s) return NaN;

  // Pure decimal fast-path.
  const plain = Number(s);
  if (!Number.isNaN(plain) && /^[-+]?\d+(\.\d+)?$/.test(s)) return plain;

  // Extract hemisphere letter (N/S/E/W) anywhere in the string.
  const hemiMatch = s.match(/[NnSsEeWw]/);
  const hemi = hemiMatch ? hemiMatch[0].toUpperCase() : '';
  const sign = hemi === 'S' || hemi === 'W' || s.trim().startsWith('-') ? -1 : 1;

  // Pull up to 3 numeric groups (deg, min, sec) from the string.
  const nums = s
    .replace(/[NnSsEeWw]/g, ' ')
    .replace(/[°'"′″dm]/g, ' ')
    .replace(/[^\d.\s-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => Number(p))
    .filter((n) => !Number.isNaN(n));

  if (nums.length === 0) return NaN;
  const [d = 0, m = 0, sec = 0] = nums;
  const absD = Math.abs(d);
  const dec = absD + m / 60 + sec / 3600;
  const signed = sign * dec;

  // Validate range per axis.
  if (axis === 'lat' && Math.abs(signed) > 90) return NaN;
  if (axis === 'lon' && Math.abs(signed) > 180) return NaN;
  return signed;
}

/** Format for the DD input field (7 sig figs is plenty for routing). */
export function toDDString(decimal: number): string {
  if (!Number.isFinite(decimal)) return '';
  return decimal.toFixed(5);
}
