import { computeBendingDisplacements, bendingEnergy } from './deform.js';

/**
 * Applies the minimum-bending-energy circular deformation model (see
 * deform.js) to a color wheel: X hues evenly spaced around 0-360 degrees,
 * anchored at a user-chosen PRIMARY hue (never moves) and bent so that the
 * nearest hue slot to a user-chosen SECONDARY hue lands exactly on it.
 *
 * Reuses computeBendingDisplacements() from deform.js as-is: that function
 * is pure linear algebra over the displacement field u[i] and never touches
 * trigonometry, so it works identically whether u is expressed in radians
 * or in degrees. Here everything is degrees, which keeps hue math direct.
 */


/** Normalize a hue to [0, 360). */
export function normalizeHue(h) {
  return ((h % 360) + 360) % 360;
}

/**
 * Shortest signed angular delta (in degrees) to travel from `from` to `to`
 * around a 360-degree circle. Result is in (-180, 180].
 */
export function circularDelta(from, to) {
  let d = normalizeHue(to - from);
  if (d > 180) d -= 360;
  return d;
}

/**
 * The original (undeformed) evenly-spaced hue positions, with slot 0
 * (point A) anchored exactly at `primaryHue`. Point A never moves, so
 * anchoring the whole grid there is what makes "primary hue" a literal,
 * exact fixed point rather than merely the nearest grid slot to it.
 */
export function buildOriginalHues(X, primaryHue) {
  const step = 360 / X;
  return Array.from({ length: X }, (_, i) => normalizeHue(primaryHue + i * step));
}

/**
 * Index (excluding `excludeIndex`) of the original hue slot closest to
 * `targetHue` around the circle. Ties resolve to the lower index.
 */
export function findNearestSlot(originalHues, targetHue, excludeIndex) {
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < originalHues.length; i++) {
    if (i === excludeIndex) continue;
    const dist = Math.abs(circularDelta(originalHues[i], targetHue));
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Compute a full X-hue palette given a primary (fixed) hue and a secondary
 * (target) hue.
 *
 * Point A (index 0) is anchored exactly at primaryHue and never moves.
 * The original hue slot closest to secondaryHue becomes point N; it is
 * pinned to secondaryHue EXACTLY (via the shortest circular displacement),
 * and every other hue relaxes into the minimum-bending-energy position
 * between those two fixed points, exactly as in the geometric circle
 * model -- just measured in hue-degrees instead of plain angle.
 *
 * @param {number} X            number of hues, integer >= 5
 * @param {number} primaryHue   fixed hue in degrees (any real number; normalized mod 360)
 * @param {number} secondaryHue target hue in degrees for the nearest slot
 * @returns {{
 *   hues: number[],       // final palette hues, degrees in [0, 360), length X
 *   original: number[],   // pre-deformation evenly-spaced hues
 *   u: number[],          // angular displacement applied to each slot (degrees)
 *   A: number,            // index of the primary point (always 0)
 *   N: number,            // index of the slot that became the secondary point
 *   dN: number,           // signed displacement applied to slot N (degrees)
 *   energy: number,       // discrete bending energy of the solution
 * }}
 */
export function computeHuePalette(X, primaryHue, secondaryHue) {
  if (!Number.isFinite(primaryHue) || !Number.isFinite(secondaryHue)) {
    throw new Error('primaryHue and secondaryHue must be finite numbers.');
  }
  const A = 0;
  const original = buildOriginalHues(X, primaryHue);
  const N = findNearestSlot(original, secondaryHue, A);
  const dN = circularDelta(original[N], secondaryHue);
  const u = computeBendingDisplacements(X, A, N, dN);
  const hues = original.map((h, i) => normalizeHue(h + u[i]));
  return { hues, original, u, A, N, dN, energy: bendingEnergy(u) };
}

/**
 * Convert an HSL color (h in degrees, s/l as 0-1 fractions) to a "#rrggbb"
 * hex string.
 */
export function hslToHex(h, s, l) {
  const hue = normalizeHue(h) / 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue * 6) % 2) - 1));
  const m = l - c / 2;
  let r, g, b;
  const sector = Math.floor(hue * 6) % 6;
  if (sector === 0) [r, g, b] = [c, x, 0];
  else if (sector === 1) [r, g, b] = [x, c, 0];
  else if (sector === 2) [r, g, b] = [0, c, x];
  else if (sector === 3) [r, g, b] = [0, x, c];
  else if (sector === 4) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const toHex = (v) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

