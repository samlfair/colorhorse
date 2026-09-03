import { computeLineBendingDisplacements, bendingEnergy } from './line-deform.js';

/**
 * Minimum-bending-energy CURVE: X points laid out along a baseline between a
 * user-positioned FirstPoint and LastPoint, with one ANCHOR point among them
 * also pulled to a user-chosen perpendicular (vertical) offset. The other
 * points bend smoothly between the three pinned points, with tension
 * distributed evenly along the curve -- the third and final deformation
 * mechanism in this project, after the circle (deform.js) and the line
 * (line-deform.js). FirstPoint and LastPoint are always at array indices 0
 * and X-1 (they never change WHICH points they are), but their perpendicular
 * VALUE is just as user-adjustable as the anchor's.
 *
 * ---------------------------------------------------------------------------
 * REUSING THE LINE MODEL, NOT REINVENTING IT
 * ---------------------------------------------------------------------------
 * This is mathematically the SAME open-path problem as line-deform.js: X
 * points on an open path, u[i] the displacement of point i from some
 * ORIGINAL baseline, minimizing
 *
 *   E = sum_{i=1}^{X-2} ( u[i+1] - 2*u[i] + u[i-1] )^2
 *
 * subject to u[p] = (pinned displacement) at a few fixed indices. The only
 * thing that changes is what "displacement" MEANS and what the ORIGINAL
 * baseline is:
 *   - line-deform.js: original[i] = i/(X-1), a left-to-right RAMP; u[i] is
 *     how far a point slides along that same line.
 *   - here: original[i] = 0 for every i, a flat baseline; u[i] is how far
 *     point i is pushed PERPENDICULAR to the baseline (i.e. its y-offset),
 *     which is exactly what turns "points on a line" into "a curve".
 *
 * Both are valid because the only property the bending-energy argument
 * actually needs from "original" is that it has ZERO discrete curvature
 * (so minimizing curvature of u is equivalent to minimizing curvature of
 * the real output, deformed = original + u) -- and EVERY affine function
 * u[i] = a + b*i has zero discrete second difference, including the
 * simplest one, the constant function b=0. So computeLineBendingDisplacements()
 * from line-deform.js is reused completely unmodified: we just pass it
 * three pins -- index 0 and X-1 at whatever values FirstPoint/LastPoint were
 * dragged to, and the anchor index at whatever offset the user chose -- and
 * read the result directly as the curve's y-coordinates.
 * ===========================================================================
 */


/**
 * @param {number} X            total number of points, X >= 3
 * @param {number} anchorIndex  index of the anchor point, 0 < anchorIndex < X-1
 * @param {number} anchorOffset perpendicular displacement applied to the anchor
 * @param {number} [firstValue] perpendicular displacement of the First Point (default 0)
 * @param {number} [lastValue]  perpendicular displacement of the Last Point (default 0)
 * @returns {{
 *   y: number[],       // perpendicular offset of every point (0 = on the original flat baseline)
 *   firstIndex: number, // always 0
 *   lastIndex: number,  // always X-1
 *   anchorIndex: number,
 * }}
 */
export function computeCurveDeformation(X, anchorIndex, anchorOffset, firstValue = 0, lastValue = 0) {
  if (!Number.isInteger(X) || X < 3) {
    throw new Error('X must be an integer >= 3 (need room for two fixed ends plus an anchor).');
  }
  if (!Number.isInteger(anchorIndex) || anchorIndex <= 0 || anchorIndex >= X - 1) {
    throw new Error(`anchorIndex must be an integer strictly between 0 and ${X - 1}.`);
  }
  if (!Number.isFinite(anchorOffset) || !Number.isFinite(firstValue) || !Number.isFinite(lastValue)) {
    throw new Error('anchorOffset, firstValue, and lastValue must all be finite numbers.');
  }

  const pins = [
    { index: 0, value: firstValue },
    { index: X - 1, value: lastValue },
    { index: anchorIndex, value: anchorOffset },
  ];
  const y = computeLineBendingDisplacements(X, pins);
  return { y, firstIndex: 0, lastIndex: X - 1, anchorIndex };
}

export { bendingEnergy };
