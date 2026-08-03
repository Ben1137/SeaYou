/**
 * surfEnergy — physical wave power per unit crest length.
 *
 * Uses the general energy-flux form, exact at all depths:
 *   P = (1/16) · ρ · g · H² · Cg     [W/m]
 *
 * This reduces to the deep-water form ρ·g²·H²·T/(64π) when d >> L0
 * (where Cg → gT/4π), but is correct in shallow and intermediate water.
 * At breaking depth, P is an upper bound: breaking dissipates energy.
 *
 * Call surfPower(H, T) from energy.ts for the dimensionless H²·T index
 * used by colour-ramp scaling. This function is solely for displayed kW/m.
 */

import { G, dispersion } from './dispersion';
import { surfPower } from './energy';

const RHO = 1025; // kg/m³ — standard seawater density

/**
 * Wave power per unit crest length [W/m] using the general energy-flux form.
 *
 * @param H  Wave height (m)
 * @param T  Wave period (s)
 * @param d  Local water depth, positive-downward (m). Pass Infinity for deep water.
 *           At breaking depth this is an upper bound (energy dissipation not modelled).
 */
export function surfPowerWPerM(H: number, T: number, d: number): number {
  const Cg = isFinite(d) ? dispersion(T, d).Cg : (G * T) / (4 * Math.PI);
  return (1 / 16) * RHO * G * H * H * Cg;
}

/**
 * Wave power per unit crest length [kW/m].
 * Convenience wrapper — divide W/m by 1000.
 *
 * @param H  Wave height (m)
 * @param T  Wave period (s)
 * @param d  Local water depth, positive-downward (m). Pass Infinity for deep water.
 */
export function surfPowerKwPerM(H: number, T: number, d: number): number {
  return surfPowerWPerM(H, T, d) / 1000;
}

/**
 * Relative surf power index H²·T (dimensionless).
 * Re-exported so callers can import both from this module; do not duplicate the formula.
 */
export { surfPower };
