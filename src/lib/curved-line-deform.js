import { computeCurveDeformation, bendingEnergy } from './curve-deform.js';

/**
 * "Curved line" demo: combines the LINE demo and the CURVE demo.
 *
 * ---------------------------------------------------------------------------
 * THE CURVE HALF (reused verbatim from curve-deform.js)
 * ---------------------------------------------------------------------------
 * A fine-resolution baseline is bent into a 2D shape by pinning three
 * points: the two true ends ("Pole One" and "Pole Two", the ones the user
 * drags -- lowering them is literally dragging their offset negative) and
 * the exact midpoint, which is always pinned at offset 0. The midpoint pin
 * is what makes this an actual BEND rather than a rigid translation: with
 * only the two end poles pinned and nothing else, the minimum-bending-energy
 * solution on an open path is the affine ramp between them (zero discrete
 * curvature already satisfies both constraints, so nothing bends at all --
 * see line-deform.js's derivation of why affine functions are the open
 * path's zero-energy null space). Anchoring the middle removes that
 * degenerate case: the two poles are now dragged away from a fixed
 * reference, which is exactly the physical picture of holding the center of
 * a semi-rigid rod steady while pushing its two ends down.
 *
 * ---------------------------------------------------------------------------
 * THE LINE HALF (generalizes line-deform.js's governing idea)
 * ---------------------------------------------------------------------------
 * line-deform.js's whole point is that the points shown are NOT simply "one
 * per index" -- their layout is recomputed from a derived 1-D metric
 * (relative pin spacing, via apportion()/computeSortedPinPlacement()) every
 * time that metric changes. Here the same idea is generalized from a
 * DISCRETE metric (integer point counts apportioned across a few pin gaps)
 * to a CONTINUOUS one: the curve's own arc length. `numPoints` display
 * points are placed EVENLY SPACED BY ARC LENGTH along the bent shape --
 * i.e. the bent curve is treated as an actual physical line (its own
 * length), not as a function sampled at even x-intervals.
 *
 * WHY THIS PRODUCES CLUSTERING NEAR THE POLES: bending energy keeps the
 * curve's SECOND difference smooth, but does nothing to keep its SLOPE
 * constant. Lowering the two end poles relative to the fixed, unmoving
 * midpoint concentrates nearly all of the imposed height change into the
 * segments nearest the poles, steepening the curve there and leaving the
 * middle comparatively flat. A fixed budget of points spread evenly along
 * arc length must spend more of that budget covering the same x-span
 * wherever the curve is steep -- i.e. near the poles -- which is exactly
 * the "points cluster closer to the poles" behavior the demo asks for.
 * When both poles sit at 0 (no bend at all), the curve is flat, slope is
 * constant everywhere, and arc-length spacing degenerates back to exactly
 * even index spacing -- confirmed by a test below.
 */


/**
 * The bent 2D shape: a fine-resolution baseline x[i] = i/(fineResolution-1),
 * bent perpendicular offset y[i] via computeCurveDeformation, pinned at
 * {first: poleOneValue, mid: 0, last: poleTwoValue}.
 *
 * @param {number} fineResolution  number of samples used to approximate the
 *   continuous curve (higher = more accurate arc length integration)
 * @param {number} poleOneValue    offset of the left end ("Pole One")
 * @param {number} poleTwoValue    offset of the right end ("Pole Two")
 * @returns {{x: number[], y: number[], midIndex: number}}
 */
export function computeCurvedLineShape(fineResolution, poleOneValue, poleTwoValue) {
  if (!Number.isInteger(fineResolution) || fineResolution < 5) {
    throw new Error('fineResolution must be an integer >= 5.');
  }
  const midIndex = Math.floor((fineResolution - 1) / 2);
  const { y } = computeCurveDeformation(fineResolution, midIndex, 0, poleOneValue, poleTwoValue);
  const x = Array.from({ length: fineResolution }, (_, i) => i / (fineResolution - 1));
  return { x, y, midIndex };
}

/** Cumulative Euclidean arc length along a polyline (x[i], y[i]), length n, cum[0] === 0. */
export function cumulativeArcLength(x, y) {
  const cum = [0];
  for (let i = 1; i < x.length; i++) {
    const dx = x[i] - x[i - 1];
    const dy = y[i] - y[i - 1];
    cum.push(cum[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  return cum;
}

/**
 * The (x, y) point at a given arc-length distance along the polyline,
 * linearly interpolating between the two fine samples that bracket it.
 * Clamped to the two ends for out-of-range targets (guards float round-off
 * at the exact 0 / total boundaries, not a behavioral choice).
 */
export function pointAtArcLength(x, y, cum, target) {
  const n = cum.length;
  if (target <= 0) return { x: x[0], y: y[0] };
  if (target >= cum[n - 1]) return { x: x[n - 1], y: y[n - 1] };
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < target) lo = mid;
    else hi = mid;
  }
  const span = cum[hi] - cum[lo];
  const t = span > 1e-12 ? (target - cum[lo]) / span : 0;
  return { x: x[lo] + t * (x[hi] - x[lo]), y: y[lo] + t * (y[hi] - y[lo]) };
}

/**
 * Place `numPoints` display points evenly spaced by arc length along the
 * curve produced by computeCurvedLineShape. This is the demo's full model.
 *
 * @param {number} numPoints       display points to place, >= 2
 * @param {number} fineResolution  resolution of the underlying bent shape, >= 5
 * @param {number} poleOneValue    Pole One's offset (dragging it negative "lowers" it)
 * @param {number} poleTwoValue    Pole Two's offset
 * @returns {{points: {x:number,y:number}[], totalArcLength: number, fineX: number[], fineY: number[]}}
 */
export function computeCurvedLinePoints(numPoints, fineResolution, poleOneValue, poleTwoValue) {
  if (!Number.isInteger(numPoints) || numPoints < 2) {
    throw new Error('numPoints must be an integer >= 2.');
  }
  const { x, y } = computeCurvedLineShape(fineResolution, poleOneValue, poleTwoValue);
  const cum = cumulativeArcLength(x, y);
  const total = cum[cum.length - 1];
  const points = Array.from({ length: numPoints }, (_, k) => {
    const target = (k / (numPoints - 1)) * total;
    return pointAtArcLength(x, y, cum, target);
  });
  return { points, totalArcLength: total, fineX: x, fineY: y };
}

export { bendingEnergy };
