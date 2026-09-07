import { solveLinearSystem } from './deform.js';
import { normalizeHue as normalizeDegrees, circularDelta } from './hue-deform.js';
import { computeSortedPinPlacement, computeLineDeformation, computeLineBendingDisplacements } from './line-deform.js';

/**
 * Cylinder deformation: combines all three prior mechanisms (circle, line,
 * curve) into one model where every point carries three cylindrical
 * coordinates -- D (an angle in degrees, 0-360, the circular axis), Z
 * (0-1, the line axis), and R (0-1, the curve/radius axis) -- built from
 * two user-given anchors, each a full (D, Z, R).
 *
 * ---------------------------------------------------------------------------
 * THE D AXIS: THE CIRCLE MODEL, GENERALIZED TO TWO INDEPENDENT ANCHORS
 * ---------------------------------------------------------------------------
 * X points start at native, evenly-spaced angles D_native[i] = i*360/X.
 * Each anchor's D is assigned to whichever index's native angle is CLOSEST
 * to it (excluding slots already claimed by an earlier anchor), pinned
 * there exactly, and every other point's D relaxes by minimizing circular
 * discrete bending energy -- deform.js's model, generalized here (via
 * computeCircularBendingDisplacements) to accept an arbitrary set of pins
 * instead of a hardcoded A/N pair, since neither anchor is guaranteed to
 * land exactly on its native slot.
 *
 * ---------------------------------------------------------------------------
 * THE R AXIS: A CLOSED RING, PINNED AT ONLY THE TWO REAL ANCHORS
 * ---------------------------------------------------------------------------
 * R only varies with D (every Z-level repeats the same D-R ring -- see
 * below), so computing it is a question of "how does R vary as you walk
 * around the D ring." X points on a closed ring, pinned at exactly the two
 * anchors' native D-indices to their own R, everything else minimizing
 * circular bending energy -- computeCircularBendingDisplacements (the SAME
 * solver the D axis above uses) handles the ring's periodic boundary
 * condition natively, so no artificial third pin is needed just to make an
 * open-path solver behave like a closed one.
 *
 * (An earlier version unrolled the ring into an (X+1)-point OPEN curve --
 * literally reusing computeLineBendingDisplacements from line-deform.js --
 * and pinned position 0 and position X, the SAME physical point, to a
 * shared `minChroma` "seam" value as a stand-in for periodicity. That seam
 * was a single point yanked far below its smoothly-varying neighbors, and
 * minimum-bending-energy interpolation pulling toward it from both sides
 * produced a sharp INWARD DIMPLE there: plotted in polar form (radius=R,
 * angle=D), the ring traced a heart/cardioid shape -- two rounded lobes at
 * the anchors pinched together by a notch at the seam -- not the convex
 * ovoid the model is supposed to produce. Switching to the closed-ring
 * solver above removes the seam, and therefore that entire failure mode,
 * by construction. See "WHY R IS CLAMPED, THEN CONVEXIFIED" below for the
 * remaining shape guarantee this doesn't cover on its own, and
 * test-cylinder-ring-convexity.js for the confirming sweep.)
 *
 * minChroma is applied AFTER the solve, as a floor on every free
 * (non-anchor) point -- never as a pin anywhere on the ring.
 *
 * ---------------------------------------------------------------------------
 * THE Z AXIS: THE LINE MODEL, AS A SEPARATE 10-LEVEL STACK
 * ---------------------------------------------------------------------------
 * Z is NOT one value per D-index -- it's a separate array of `numZLevels`
 * (10) discrete heights, computed via the exact line.html model: the four
 * raw values [minL, anchorOne.Z, anchorTwo.Z, maxL] are sorted ascending
 * (so minL and maxL -- whichever ends up smaller/larger -- land at index 0
 * and numZLevels-1, and anchorOne.Z/anchorTwo.Z land wherever their sorted
 * rank places them, exactly line.html's "identity reassigns by sorted
 * value" behavior) via computeSortedPinPlacement + computeLineDeformation
 * from line-deform.js, both reused unmodified. minL/maxL are user-adjustable
 * (an earlier version hardcoded these to 0 and 1).
 *
 * ---------------------------------------------------------------------------
 * THE R TAPER: WHY THE CYLINDER IS A LITTLE EGG-SHAPED
 * ---------------------------------------------------------------------------
 * The D-ring's R (from computeCylinderR above) is the chroma at the
 * "equator" for each hue -- but chroma shouldn't stay constant all the way
 * up and down a column of the same hue at different lightnesses: near
 * black (Z close to 0) and near white (Z close to 1) there's very little
 * room for any chroma at all (the sRGB gamut genuinely narrows there).
 * computeCylinderRGrid runs a SECOND curve per D-index, this time along Z
 * instead of D: pinned to `minChroma` at the top and bottom of the column,
 * with a single interior anchor pinned to that hue's ring value from
 * computeCylinderR. So R becomes a full 12x10 grid (one value per point),
 * not just 12 values repeated at every level -- see its doc for why the
 * anchor columns need special handling to keep their own reproduced color
 * exact.
 *
 * ---------------------------------------------------------------------------
 * WHY R IS CLAMPED, THEN CONVEXIFIED
 * ---------------------------------------------------------------------------
 * R is not a free coordinate like D or Z -- it's a relative chroma fraction,
 * physically meaningful only in [0, 1] (0 = achromatic center, 1 = sitting
 * exactly on the gamut boundary), and the whole point of a "cylinder" is
 * that plotting R against D (ignoring Z entirely) should look like a
 * smooth, convex ovoid -- the same "convex" intent as the Z-taper's egg
 * shape (see computeCylinderRGrid's doc), just around the ring instead of
 * up a column. Minimum-bending-energy interpolation (a natural cubic
 * spline, in the continuum view) guarantees neither property on its own --
 * it only minimizes curvature -- so left alone it can fail in two
 * DIFFERENT ways, each needing its own fix:
 *
 *  1. LEAVE [0, 1] ENTIRELY (undershoot below 0, or overshoot above 1).
 *     Undershoot is the more serious failure: OKLab's a=C*cos(H),
 *     b=C*sin(H) treat negative C as positive chroma at the OPPOSITE hue
 *     (H+180), so a dip below zero doesn't render as "a little less
 *     saturated" -- it silently renders the WRONG COLOR, and the point's
 *     on-screen radius goes negative too (a visible dent cutting through
 *     the cylinder's core). This is common, not a rare edge case: sweeping
 *     every anchor index pair on a 12-point ring with even moderately
 *     different R values shows a meaningful fraction of configurations
 *     undershoot below 0, worst near anchors 1-2 native slots apart with
 *     very different R -- exactly the "two close, differently saturated
 *     colors" case a real user would pick.
 *
 *     FIX: clamp every free (non-pinned) point to [minChroma, 1] right
 *     after the solve. `minChroma` is documented as the floor for the
 *     whole ring, so every free point should honor it, not just whichever
 *     one happens to be pinned. The two anchor pins are the one exception:
 *     an anchor's own picked chroma can legitimately be lower than
 *     whatever minChroma the user separately set (exact color reproduction
 *     always wins over the floor), so pinned positions are left untouched.
 *
 *  2. STAY PERFECTLY IN-DOMAIN AND STILL TRACE A NON-CONVEX POLAR SHAPE.
 *     This is a genuinely separate bug from (1), found AFTER fixing it: a
 *     value can sit anywhere inside [0,1] and the ring's outline can still
 *     have an inward dimple -- reported as "the ring looks like a
 *     furrowed heart, not an ovoid." In the earlier seam-based design (see
 *     "THE R AXIS" above) this happened almost everywhere, because the
 *     seam was a single point pinned far below its neighbors. Even with
 *     the seam removed, minimum-curvature interpolation can still "ring"
 *     past a pin's value before turning back (the same overshoot/
 *     undershoot behavior natural cubic splines are known for between two
 *     nearby, differently-valued data points), which can leave a smaller
 *     dimple right next to an anchor. Confirmed by sweeping every anchor
 *     placement in test-cylinder-ring-convexity.js.
 *
 *     FIX: convexifyRing() -- after the floor from (1) is applied, walk
 *     the ring and find every "concave" point (one that makes the polar
 *     outline bend the wrong way, via the standard cross-product turning
 *     test used to detect non-hull points). Push each one radially
 *     outward, along its own fixed angle, to sit exactly on the chord
 *     between its two current neighbors -- the minimal change that removes
 *     that one concavity. Fixing one dimple can reveal or resolve another
 *     next to it (a neighbor just moved), so this repeats to a fixed
 *     point; with only a handful of points per ring it converges in a few
 *     passes. Anchor points are exempt for the same reason as the floor:
 *     an anchor's own exact chroma might legitimately sit below the convex
 *     hull of everything else (a real, unavoidable dimple at that ONE
 *     point, not a defect) -- convexifyRing never moves a pinned point, so
 *     exact reproduction is preserved. Every other point ends up sitting
 *     exactly on the convex hull of the final shape, by construction, so
 *     the ring can never be non-convex anywhere except possibly at the two
 *     anchors themselves.
 *
 * ---------------------------------------------------------------------------
 * COMBINING THEM: INDEPENDENT AXES COMBINED, NOT A COUPLED 3D SOLVE
 * ---------------------------------------------------------------------------
 * The final structure has one point per (Z-level, D-index) pair: point
 * (k, i) for Z-level k=0..9 and D-index i=0..11 has D=D[i], R=RGrid[k][i],
 * Z=zLevels[k] -- 10*12 = 120 points total. D, the Z-level stack, and each
 * column's R-taper are all computed independently (D and the "equatorial"
 * ring R don't depend on Z; the R-taper only depends on D and Z, not on D's
 * own bending-energy solve) and then combined, which is what "combine the
 * three demos" means here rather than a single coupled 3D energy
 * minimization. Because every pinned value along the way -- Z-levels, ring
 * R, and each column's taper -- is pinned EXACTLY where an anchor needs it,
 * one specific (k, i) combination exactly reproduces each original anchor
 * point in full 3D (D, Z, R) -- see isAnchor in computeCylinderPoints().
 * ===========================================================================
 */


/**
 * Generalized circular minimum-bending-energy solver: X points on a ring,
 * an arbitrary set of pinned {index, value} displacements, everything else
 * relaxes to minimize circular discrete bending energy.
 *
 * @param {number} X     total number of points around the ring, X >= 5
 * @param {{index: number, value: number}[]} pins  at least one pin required;
 *   indices must be distinct integers in [0, X)
 * @returns {number[]} displacement field u, length X, exact at every pin
 */
export function computeCircularBendingDisplacements(X, pins) {
  if (!Number.isInteger(X) || X < 5) {
    throw new Error('X must be an integer >= 5 for the biharmonic stencil to be well-defined.');
  }
  if (!Array.isArray(pins) || pins.length === 0) {
    throw new Error('At least one pin is required (a circle with zero pins has no unique solution).');
  }
  const pinMap = new Map();
  for (const p of pins) {
    if (!Number.isInteger(p.index) || p.index < 0 || p.index >= X) {
      throw new Error(`Pin index must be an integer in [0, ${X}); got ${p.index}.`);
    }
    if (pinMap.has(p.index)) {
      throw new Error(`Duplicate pin at index ${p.index}.`);
    }
    pinMap.set(p.index, p.value);
  }

  const matrix = Array.from({ length: X }, () => new Array(X).fill(0));
  const vector = new Array(X).fill(0);
  const mod = (k) => ((k % X) + X) % X;

  for (let i = 0; i < X; i++) {
    if (pinMap.has(i)) {
      matrix[i][i] = 1;
      vector[i] = pinMap.get(i);
    } else {
      matrix[i][mod(i - 2)] += 1;
      matrix[i][mod(i - 1)] += -4;
      matrix[i][mod(i)] += 6;
      matrix[i][mod(i + 1)] += -4;
      matrix[i][mod(i + 2)] += 1;
      vector[i] = 0;
    }
  }

  const u = solveLinearSystem(matrix, vector);
  for (const [idx, val] of pinMap) u[idx] = val; // exact against round-off
  return u;
}

/**
 * Nearest still-available native slot to a target angle, excluding every
 * index already claimed by an earlier anchor (so two anchors can never
 * collide on the same point).
 */
export function findNearestAvailableSlot(nativeD, targetD, usedIndices) {
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < nativeD.length; i++) {
    if (usedIndices.includes(i)) continue;
    const dist = Math.abs(circularDelta(nativeD[i], targetD));
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  if (bestIdx === -1) {
    throw new Error('No available slot left to assign this anchor to (more anchors than points?).');
  }
  return bestIdx;
}

/**
 * Compute the D coordinate of all X points given a list of anchors, each
 * specifying a target D.
 *
 * @param {number} X
 * @param {{D: number}[]} anchors  at least one anchor required
 * @returns {{
 *   D: number[],           // final D (degrees, [0,360)) for every point
 *   nativeD: number[],     // the original evenly-spaced D before deformation
 *   anchorIndices: number[], // the index each anchors[k] was assigned to
 *   u: number[],           // raw angular displacement applied to each point
 * }}
 */
export function computeCylinderD(X, anchors) {
  const nativeD = Array.from({ length: X }, (_, i) => (i * 360) / X);
  const usedIndices = [];
  const pins = [];
  const anchorIndices = [];

  for (const anchor of anchors) {
    const idx = findNearestAvailableSlot(nativeD, anchor.D, usedIndices);
    usedIndices.push(idx);
    anchorIndices.push(idx);
    pins.push({ index: idx, value: circularDelta(nativeD[idx], anchor.D) });
  }

  const u = computeCircularBendingDisplacements(X, pins);
  const D = nativeD.map((d, i) => normalizeDegrees(d + u[i]));
  return { D, nativeD, anchorIndices, u };
}

/** Clamp a free (non-pinned) relative-chroma value to the user's floor. */
function clampToFloor(v, floor) {
  return Math.min(1, Math.max(floor, v));
}

/** Polar (angle in degrees, radius) -> Cartesian [x, y]. */
export function polarToXY(angleDeg, radius) {
  const rad = (angleDeg * Math.PI) / 180;
  return [radius * Math.cos(rad), radius * Math.sin(rad)];
}

/**
 * The radius at which the ray from the origin at `angleDeg` crosses the
 * (infinite) line through polar points (angle1, r1) and (angle2, r2) --
 * i.e. "if this angle's point sat exactly on the chord between its two
 * neighbors, what radius would that be." Used by convexifyRing to push a
 * concave point out to that chord. Falls back to the larger of the two
 * neighbor radii in the degenerate case where the ray is parallel to the
 * chord (near-zero denominator) -- shouldn't arise for an angle strictly
 * between angle1 and angle2, but keeps the function total.
 */
export function chordRadiusAtAngle(angle1, r1, angle2, r2, angleDeg) {
  const [x1, y1] = polarToXY(angle1, r1);
  const [x2, y2] = polarToXY(angle2, r2);
  const rad = (angleDeg * Math.PI) / 180;
  const cosT = Math.cos(rad);
  const sinT = Math.sin(rad);
  const denom = (x2 - x1) * sinT - (y2 - y1) * cosT;
  if (Math.abs(denom) < 1e-12) return Math.max(r1, r2);
  return ((x2 - x1) * y1 - (y2 - y1) * x1) / denom;
}

/**
 * Push every non-exempt point of a closed polar ring radially outward
 * until the whole ring is convex. See module doc "WHY R IS CLAMPED, THEN
 * CONVEXIFIED" for the full reasoning.
 *
 * @param {number[]} angles  each point's fixed angle in degrees
 * @param {number[]} values  each point's radius (not mutated; a corrected
 *   copy is returned)
 * @param {Set<number>} exemptIndices  never moved (e.g. the two anchor
 *   pins, which must keep their exact value even if that leaves a
 *   legitimate dimple right at that one point)
 * @returns {number[]} radii, same length as `values`, convex everywhere
 *   except possibly at an exempt index
 */
export function convexifyRing(angles, values, exemptIndices) {
  const n = values.length;
  const R = values.slice();
  let changed = true;
  let iterations = 0;
  // A handful of points per ring converges in a few passes in practice --
  // see test-cylinder-ring-convexity.js for empirical convergence well
  // under this bound across thousands of swept configurations.
  const MAX_ITERATIONS = n * n;
  while (changed && iterations < MAX_ITERATIONS) {
    changed = false;
    iterations++;
    for (let i = 0; i < n; i++) {
      if (exemptIndices.has(i)) continue;
      const prev = (i - 1 + n) % n;
      const next = (i + 1) % n;
      const [x0, y0] = polarToXY(angles[prev], R[prev]);
      const [x1, y1] = polarToXY(angles[i], R[i]);
      const [x2, y2] = polarToXY(angles[next], R[next]);
      // Cross product of the incoming and outgoing edge vectors: for a
      // convex polygon walked in a consistent direction (here,
      // counterclockwise / increasing angle) this is the same sign at
      // every vertex. Negative means THIS vertex bends the wrong way --
      // concave, a dimple pointing toward the center.
      const cross = (x1 - x0) * (y2 - y1) - (y1 - y0) * (x2 - x1);
      if (cross < -1e-9) {
        const target = chordRadiusAtAngle(angles[prev], R[prev], angles[next], R[next], angles[i]);
        if (Number.isFinite(target) && target > R[i] + 1e-9) {
          R[i] = target;
          changed = true;
        }
      }
    }
  }
  return R;
}

/**
 * Compute R for all X D-indices: a closed ring (computeCircularBendingDisplacements,
 * the SAME solver the D axis itself uses), pinned at exactly the two
 * anchors' D-indices to their own R. `minChroma` is then applied as a
 * floor on every free (non-anchor) point, and the whole ring is
 * convexified so its polar outline (radius=R, angle=D) is a smooth convex
 * ovoid rather than a heart/cardioid shape. See module doc "WHY R IS
 * CLAMPED, THEN CONVEXIFIED" for why both steps are needed.
 *
 * @param {number} X
 * @param {number} anchorOneIndex
 * @param {number} anchorTwoIndex
 * @param {number} anchorOneR
 * @param {number} anchorTwoR
 * @param {number} minChroma  floor for every point except the two anchors
 * @returns {number[]} R value for every D-index, length X
 */
export function computeCylinderR(X, anchorOneIndex, anchorTwoIndex, anchorOneR, anchorTwoR, minChroma) {
  const base = computeCircularBendingDisplacements(X, [
    { index: anchorOneIndex, value: anchorOneR },
    { index: anchorTwoIndex, value: anchorTwoR },
  ]);

  const exempt = new Set([anchorOneIndex, anchorTwoIndex]);
  const floored = base.map((v, i) => (exempt.has(i) ? v : clampToFloor(v, minChroma)));

  const nativeD = Array.from({ length: X }, (_, i) => (i * 360) / X);
  return convexifyRing(nativeD, floored, exempt);
}

/**
 * Taper R with Z, per D-index ("shade column"), so the cylinder is a
 * little egg-shaped: chroma bulges out to each hue's ring value (from
 * computeCylinderR) somewhere in the middle of the column and reduces back
 * down toward `minChroma` at the very top and bottom, instead of staying
 * constant all the way up/down every column.
 *
 * For each D-index i, this runs its OWN 3-pin open curve along Z (the same
 * curve-model shape line.html/curve.html use): First (zIndex 0) and Last
 * (zIndex numZLevels-1) pinned to `minChroma`, with a single interior
 * anchor pinned to ringR[i] -- exactly anchorOne.r, anchorTwo.r, or the
 * imputed ring value between them, whichever belongs to that hue.
 *
 * WHERE the interior anchor sits (which Z-index) matters for one important
 * reason: the two D-indices that ARE anchorOne/anchorTwo must use THEIR
 * OWN anchor's Z-index, not some generic middle one -- otherwise the point
 * that's supposed to exactly reproduce an anchor's picked color would land
 * on the tapered curve's value at the wrong height instead of the anchor's
 * actual chroma, breaking color fidelity for the very swatch you picked.
 * Every OTHER column (not an anchor's own hue) uses the midpoint between
 * the two anchors' Z-indices as a representative "equator."
 *
 * @param {number[]} ringR  length-X result of computeCylinderR (one value
 *   per D-index -- the "equatorial" chroma for that hue)
 * @param {number} numZLevels
 * @param {number} minChroma  pinned at the top and bottom of every column
 * @param {number[]} anchorIndices  [anchorOneIndex, anchorTwoIndex]
 * @param {number[]} anchorZIndices [anchorOneZIndex, anchorTwoZIndex]
 * @returns {number[][]} RGrid[zIndex][dIndex], the final R for every point
 */
export function computeCylinderRGrid(ringR, numZLevels, minChroma, anchorIndices, anchorZIndices) {
  const X = ringR.length;
  let sharedEquator = Math.round((anchorZIndices[0] + anchorZIndices[1]) / 2);
  sharedEquator = Math.min(Math.max(sharedEquator, 1), numZLevels - 2);
  const RGrid = Array.from({ length: numZLevels }, () => new Array(X));

  for (let i = 0; i < X; i++) {
    const isAnchorColumn = i === anchorIndices[0] || i === anchorIndices[1];
    let equatorZIndex = sharedEquator;
    if (i === anchorIndices[0]) equatorZIndex = anchorZIndices[0];
    else if (i === anchorIndices[1]) equatorZIndex = anchorZIndices[1];

    // A non-anchor column's own interior pin is floored to minChroma here
    // too (not just its solved free points below) -- computeCylinderR
    // already guarantees ringR[i] >= minChroma away from its two anchors,
    // but re-asserting it at the one place it becomes a pin keeps this
    // function correct on its own, without silently depending on that
    // upstream guarantee holding.
    const equatorValue = isAnchorColumn ? ringR[i] : Math.max(ringR[i], minChroma);
    const pins = [
      { index: 0, value: minChroma },
      { index: numZLevels - 1, value: minChroma },
      { index: equatorZIndex, value: equatorValue },
    ];
    const pinnedZ = new Set([0, numZLevels - 1, equatorZIndex]);
    const column = computeLineBendingDisplacements(numZLevels, pins);
    for (let k = 0; k < numZLevels; k++) {
      if (pinnedZ.has(k)) {
        // An anchor's own EQUATOR point is the one place its exact chroma
        // may legitimately sit below minChroma (see computeCylinderR's doc)
        // -- reproducing the picked color exactly always wins over the
        // floor, but only at this single pinned position.
        RGrid[k][i] = column[k];
      } else {
        // Every other free point is floored to minChroma, including free
        // points elsewhere in an anchor's OWN column: being "an anchor
        // column" only excuses the one pinned equator point above, not the
        // whole column. Left unfloored, a minimum-bending-energy curve
        // reacting to that one low pin can undershoot toward zero at other
        // Z-levels in the same column -- e.g. a faint anchor's hue showing
        // up as an unintended near-zero dip on a completely different
        // shade row's ring, nowhere near that anchor's own position.
        RGrid[k][i] = clampToFloor(column[k], minChroma);
      }
    }
  }
  return RGrid;
}

/**
 * Compute the Z-level stack: `numZLevels` heights spanning [minL, maxL],
 * with anchorOne.Z and anchorTwo.Z pinned exactly among them (identity
 * assigned by sorted value, per line.html's model). See module doc.
 *
 * @param {number} numZLevels
 * @param {number} anchorOneZ
 * @param {number} anchorTwoZ
 * @param {number} minL  pinned at whichever end of the sorted stack is lowest
 * @param {number} maxL  pinned at whichever end of the sorted stack is highest
 * @returns {{
 *   zLevels: number[],       // length numZLevels, ascending
 *   anchorOneZIndex: number, // which zLevels[] index equals anchorOneZ exactly
 *   anchorTwoZIndex: number, // which zLevels[] index equals anchorTwoZ exactly
 * }}
 */
export function computeCylinderZLevels(numZLevels, anchorOneZ, anchorTwoZ, minL, maxL) {
  const pinValues = [minL, anchorOneZ, anchorTwoZ, maxL];
  const { sortedValues, indices, rankOf } = computeSortedPinPlacement(numZLevels, pinValues);
  const pins = indices.map((idx, k) => ({ index: idx, position: sortedValues[k] }));
  const { deformed } = computeLineDeformation(numZLevels, pins);
  return {
    zLevels: deformed,
    anchorOneZIndex: indices[rankOf(1)],
    anchorTwoZIndex: indices[rankOf(2)],
  };
}

/**
 * Build the full cylinder: numZLevels stacked copies of the X-point D ring,
 * with R tapered per column via computeCylinderRGrid (see its doc -- this
 * is what makes the cylinder a little egg-shaped: chroma reduces toward
 * `minChroma` as Z approaches the top/bottom of the stack instead of
 * staying constant all the way up/down). The two points that exactly match
 * an original anchor's full (D, Z, R) are flagged isAnchor.
 *
 * @param {number} X
 * @param {number} numZLevels
 * @param {[{D:number,Z:number,R:number}, {D:number,Z:number,R:number}]} anchors
 *   exactly two anchors, [anchorOne, anchorTwo]
 * @param {number} minChroma  boundary value for both the D-ring seam (see
 *   computeCylinderR) and the top/bottom of every Z-column (see
 *   computeCylinderRGrid)
 * @param {number} minL  low end of the Z-level stack (see computeCylinderZLevels)
 * @param {number} maxL  high end of the Z-level stack (see computeCylinderZLevels)
 * @returns {{
 *   points: {dIndex:number, zIndex:number, D:number, Z:number, R:number, isAnchor:boolean, anchorPos:(number|null)}[],
 *   D: number[], R: number[][], zLevels: number[],
 *   anchorIndices: number[], anchorZIndices: number[],
 * }}
 */
export function computeCylinderPoints(X, numZLevels, anchors, minChroma, minL, maxL) {
  if (anchors.length !== 2) {
    throw new Error('computeCylinderPoints requires exactly two anchors: [anchorOne, anchorTwo].');
  }
  const [anchorOne, anchorTwo] = anchors;
  const { D, anchorIndices } = computeCylinderD(X, anchors);
  const ringR = computeCylinderR(X, anchorIndices[0], anchorIndices[1], anchorOne.R, anchorTwo.R, minChroma);
  const { zLevels, anchorOneZIndex, anchorTwoZIndex } = computeCylinderZLevels(numZLevels, anchorOne.Z, anchorTwo.Z, minL, maxL);
  const anchorZIndices = [anchorOneZIndex, anchorTwoZIndex];
  const R = computeCylinderRGrid(ringR, numZLevels, minChroma, anchorIndices, anchorZIndices);

  const points = [];
  for (let k = 0; k < numZLevels; k++) {
    for (let i = 0; i < X; i++) {
      let isAnchor = false;
      let anchorPos = null;
      for (let a = 0; a < 2; a++) {
        if (i === anchorIndices[a] && k === anchorZIndices[a]) {
          isAnchor = true;
          anchorPos = a;
        }
      }
      points.push({ dIndex: i, zIndex: k, D: D[i], Z: zLevels[k], R: R[k][i], isAnchor, anchorPos });
    }
  }

  return { points, D, R, zLevels, anchorIndices, anchorZIndices };
}

/** Discrete bending energy E = sum (u[i+1] - 2u[i] + u[i-1])^2, circular. */
export function bendingEnergy(u) {
  const X = u.length;
  let E = 0;
  for (let i = 0; i < X; i++) {
    const d2 = u[(i + 1) % X] - 2 * u[i] + u[(i - 1 + X) % X];
    E += d2 * d2;
  }
  return E;
}

