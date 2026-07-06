/**
 * Swell energy utilities: surf power index and multi-swell combination.
 *
 * Combination uses the energy-superposition rule (significant height from
 * independent spectral partitions), not linear height addition.
 */

export interface SwellPartition {
  /** Significant wave height (m). Must be ≥ 0. */
  height: number;
  /** Peak period (s). Used for power index. */
  period: number;
  /** Peak direction (degrees from North). Informational; kept for display. */
  directionDeg?: number;
}

/**
 * Surf power index — proportional to wave energy flux per unit crest length.
 *
 * Full form: P = (ρ·g² / 64π)·H²·T.
 * We return the H²·T factor (dropping constants) for a dimensionless relative
 * index suitable for colour-ramp scaling and comparison.
 *
 * @param H  Wave height (m)
 * @param T  Wave period (s)
 */
export function surfPower(H: number, T: number): number {
  return H * H * T;
}

/**
 * Combine multiple independent swell partitions into a single equivalent
 * significant height using energy superposition:
 *
 *   H_combined = sqrt( H1² + H2² + ... + Hn² )
 *
 * Returns the dominant partition (highest height) separately for period/
 * direction display purposes.
 *
 * @param partitions  Array of swell partitions (nullish entries are ignored).
 */
export function combineSwellPartitions(
  partitions: (SwellPartition | null | undefined)[],
): { combinedHeight: number; dominant: SwellPartition | null } {
  const valid = partitions.filter(
    (p): p is SwellPartition => p != null && p.height > 0,
  );

  if (valid.length === 0) {
    return { combinedHeight: 0, dominant: null };
  }

  const energySum = valid.reduce((sum, p) => sum + p.height * p.height, 0);
  const combinedHeight = Math.sqrt(energySum);

  const dominant = valid.reduce((best, p) => (p.height > best.height ? p : best), valid[0]);

  return { combinedHeight, dominant };
}
