/**
 * Minimum-bending-energy deformation of points evenly spaced on a LINE
 * (an open path from 0 to 1), with an arbitrary subset of points pinned at
 * user-chosen positions -- this demo uses four pins, but the solver below
 * places no restriction on how many there are or where they sit.
 *
 * ---------------------------------------------------------------------------
 * THE MODEL
 * ---------------------------------------------------------------------------
 * X points start evenly spaced along [0, 1]:
 *
 *   value[i] = i / (X - 1),   i = 0..X-1
 *
 * A chosen subset of indices ("pins") are fixed at arbitrary target values.
 * Every other point should settle into the position that makes the line
 * behave like a bent semi-rigid pole: no kinks, no abrupt change in point
 * spacing, smooth curvature everywhere -- exactly the same physical picture
 * as deform.js's circular model, just on an open path instead of a ring.
 *
 * Let u[i] be the displacement of point i from its ORIGINAL value, so the
 * new value is value[i] + u[i]. Because this is an open path, not every
 * point has two neighbors to form a curvature term: the bending energy can
 * only be measured at points that have a point on each side, i.e. indices
 * 1 .. X-2. The sum has no wraparound term (unlike the circular case):
 *
 *   E = sum_{i=1}^{X-2} ( u[i+1] - 2*u[i] + u[i-1] )^2
 *
 * We minimize E subject to one hard constraint per pin:
 *
 *   u[p] = target displacement of p,   for every pinned index p
 *
 * ---------------------------------------------------------------------------
 * SOLVING IT: WHY THE CIRCULAR SHORTCUT DOESN'T CARRY OVER DIRECTLY
 * ---------------------------------------------------------------------------
 * As in deform.js, E is a quadratic form in the free u[i], so its minimum
 * satisfies dE/du[j] = 0 for every free index j. Writing
 * T[i] = u[i-1] - 2*u[i] + u[i+1] for each i in [1, X-2] (the curvature at
 * i), differentiating gives:
 *
 *   dE/du[j] = 2 * ( T[j-1] - 2*T[j] + T[j+1] ) = 0
 *
 * -- but with T[i] simply ABSENT (not a term, not zero-forced -- just not
 * summed) whenever i falls outside [1, X-2], because there is no such
 * bending-energy term to differentiate there. On the circle every point
 * has two neighbors, so every T[i] always exists and the same 5-point
 * biharmonic stencil [1,-4,6,-4,1] applies at every free row. On an open
 * line, the near-boundary rows (j close to 0 or X-1) lose one or two of
 * their T terms, which truncates the stencil -- e.g. at j=0 only T[1]
 * survives, giving u[0] - 2*u[1] + u[2] = 0 (zero curvature at the free
 * end), and at j=1 only T[1] and T[2] survive, giving a different
 * 4-term stencil. These truncated rows are exactly the natural (free)
 * boundary conditions of a real semi-rigid pole whose ends aren't pinned:
 * a physical rod with nothing pushing on its tip settles into zero
 * curvature there, not into whatever the interior stencil would demand.
 *
 * Rather than hand-deriving every boundary case (and every case for pins
 * that happen to sit near a boundary, which also truncates neighboring
 * rows), buildRowCoefficients() below builds each row MECHANICALLY from
 * that same stationarity condition. This handles interior points,
 * near-boundary points, near-pin points, and true endpoints uniformly and
 * correctly, for any placement of any number of pins.
 *
 * The only functions with zero bending energy on an open path are affine
 * ramps (u[i] = a + b*i) -- unlike the circular case, a straight ramp does
 * not need to "close up," so it survives here too. Pinning any two points
 * at distinct indices removes both degrees of freedom in that 2D null
 * space, so as few as two pins already make the system well-posed; four
 * pins (this demo) just adds more constraints on top of an already unique
 * solution.
 *
 * ---------------------------------------------------------------------------
 * NUMERICAL STABILITY
 * ---------------------------------------------------------------------------
 * The system matrix is sparse (at most 5 non-zero entries per row) and is
 * built and solved with dense Gaussian elimination using partial pivoting,
 * the same approach deform.js uses -- numerically stable for the small
 * point counts (tens of points) this visualization targets.
 */


/**
 * Solve the linear system A x = b via Gaussian elimination with partial
 * pivoting. Does not mutate the caller's matrix/vector.
 *
 * @param {number[][]} matrix  n x n coefficient matrix
 * @param {number[]} vector    n-length right-hand side
 * @returns {number[]} solution vector x, length n
 */
export function solveLinearSystem(matrix, vector) {
  const n = vector.length;
  const A = matrix.map((row) => row.slice());
  const b = vector.slice();

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let pivotMag = Math.abs(A[col][col]);
    for (let row = col + 1; row < n; row++) {
      const mag = Math.abs(A[row][col]);
      if (mag > pivotMag) {
        pivotMag = mag;
        pivotRow = row;
      }
    }
    if (pivotMag < 1e-12) {
      throw new Error(
        `Singular (or near-singular) system at column ${col}; ` +
          'check that pins are at distinct valid indices and X is large enough.'
      );
    }
    if (pivotRow !== col) {
      [A[col], A[pivotRow]] = [A[pivotRow], A[col]];
      [b[col], b[pivotRow]] = [b[pivotRow], b[col]];
    }

    for (let row = col + 1; row < n; row++) {
      const factor = A[row][col] / A[col][col];
      if (factor === 0) continue;
      for (let k = col; k < n; k++) {
        A[row][k] -= factor * A[col][k];
      }
      b[row] -= factor * b[col];
    }
  }

  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row];
    for (let k = row + 1; k < n; k++) {
      sum -= A[row][k] * x[k];
    }
    x[row] = sum / A[row][row];
  }
  return x;
}

/**
 * The stationarity equation for free row j, T[j-1] - 2*T[j] + T[j+1] = 0,
 * expanded into u-index coefficients. T[i] (curvature at i) only exists
 * for i in [1, X-2]; terms outside that range are simply dropped, which is
 * what produces the truncated stencils at and near the open ends.
 *
 * @returns {Map<number, number>} uIndex -> coefficient
 */
export function buildRowCoefficients(X, j) {
  const coeffs = new Map();
  const add = (idx, c) => coeffs.set(idx, (coeffs.get(idx) || 0) + c);
  const addCurvatureTerm = (i, weight) => {
    if (i < 1 || i > X - 2) return; // no such bending-energy term on an open path
    add(i - 1, weight * 1);
    add(i, weight * -2);
    add(i + 1, weight * 1);
  };
  addCurvatureTerm(j - 1, 1);
  addCurvatureTerm(j, -2);
  addCurvatureTerm(j + 1, 1);
  return coeffs;
}

/**
 * Compute the minimum-bending-energy displacement field u[0..X-1] for X
 * points evenly spaced on an open line, given a set of pinned indices each
 * with a required displacement.
 *
 * @param {number} X      total number of points (must be >= 2)
 * @param {{index: number, value: number}[]} pins  pinned indices and their
 *   required displacement (u[index] === value); indices must be distinct
 *   integers in [0, X)
 * @returns {number[]} displacement field u, length X, with u[p.index] ===
 *   p.value exactly for every pin
 */
export function computeLineBendingDisplacements(X, pins) {
  if (!Number.isInteger(X) || X < 2) {
    throw new Error('X must be an integer >= 2.');
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

  const freeIndices = [];
  for (let i = 0; i < X; i++) {
    if (!pinMap.has(i)) freeIndices.push(i);
  }
  const M = freeIndices.length;
  const freePos = new Map(freeIndices.map((idx, k) => [idx, k]));

  const u = new Array(X).fill(0);
  for (const [idx, val] of pinMap) u[idx] = val;

  if (M === 0) return u; // every point pinned, nothing to solve

  const matrix = Array.from({ length: M }, () => new Array(M).fill(0));
  const vector = new Array(M).fill(0);

  freeIndices.forEach((j, row) => {
    const coeffs = buildRowCoefficients(X, j);
    for (const [idx, c] of coeffs) {
      if (pinMap.has(idx)) {
        // Known term: move it to the right-hand side.
        vector[row] -= c * pinMap.get(idx);
      } else {
        matrix[row][freePos.get(idx)] += c;
      }
    }
  });

  const freeU = solveLinearSystem(matrix, vector);
  freeIndices.forEach((idx, k) => {
    u[idx] = freeU[k];
  });

  // Guarantee pinned values are exact against floating-point round-off.
  for (const [idx, val] of pinMap) u[idx] = val;
  return u;
}

/**
 * Compute original and deformed positions for X points evenly spaced on
 * [0, 1], given a set of pins specifying the NEW position (not
 * displacement) for each pinned index.
 *
 * @param {number} X  total number of points
 * @param {{index: number, position: number}[]} pins  pinned indices and
 *   their new position in [0, 1] (values outside [0,1] are allowed; the
 *   model itself does not clamp)
 * @returns {{original: number[], deformed: number[], u: number[]}}
 */
export function computeLineDeformation(X, pins) {
  const original = Array.from({ length: X }, (_, i) => i / (X - 1));
  const displacementPins = pins.map((p) => ({
    index: p.index,
    value: p.position - original[p.index],
  }));
  const u = computeLineBendingDisplacements(X, displacementPins);
  const deformed = original.map((v, i) => v + u[i]);
  return { original, deformed, u };
}

/** Discrete bending energy E = sum (u[i+1] - 2u[i] + u[i-1])^2, open path. */
export function bendingEnergy(u) {
  let E = 0;
  for (let i = 1; i < u.length - 1; i++) {
    const d2 = u[i + 1] - 2 * u[i] + u[i - 1];
    E += d2 * d2;
  }
  return E;
}

/**
 * Split `total` integer points among segments in proportion to `weights`
 * (each >= 0), using the largest-remainder method so the counts sum to
 * exactly `total` while staying as close as integer rounding allows to the
 * ideal proportional share. If every weight is ~0 (e.g. two pins at the
 * same value), falls back to splitting as evenly as possible.
 *
 * This is the "reassign points to keep spacing even" primitive used by
 * line.html: as pin values move, the number of free points apportioned to
 * each gap between them is recomputed fresh, rather than staying fixed at
 * whatever an initial even split produced.
 */
export function apportion(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 1e-9) {
    const base = Math.floor(total / weights.length);
    const rem = total - base * weights.length;
    return weights.map((_, i) => base + (i < rem ? 1 : 0));
  }
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map(Math.floor);
  const used = floors.reduce((a, b) => a + b, 0);
  const remaining = total - used;
  const order = raw
    .map((r, i) => ({ i, frac: r - floors[i] }))
    .sort((a, b) => b.frac - a.frac);
  const counts = floors.slice();
  for (let k = 0; k < remaining; k++) counts[order[k].i]++;
  return counts;
}

/**
 * Given `numPoints` total slots and a set of raw `pinValues` (any order),
 * sorts them ascending, hard-pins the smallest to index 0 and the largest
 * to index numPoints-1, and apportions the remaining free slots across the
 * gaps between consecutive sorted values proportionally (via apportion()
 * above) -- recomputed fresh from whatever pinValues are passed in, so
 * calling this again after any value changes re-derives the whole layout
 * rather than reusing a stale one.
 *
 * This is line.html's "identity is assigned by sorted value, not by which
 * slider you dragged" behavior, factored out so any caller (e.g. the
 * cylinder demo's Z axis) can reuse it without re-deriving the algorithm.
 *
 * @param {number} numPoints   total points, >= pinValues.length
 * @param {number[]} pinValues raw values in any order; identity comes from
 *   their sorted RANK, not their position in this array
 * @returns {{
 *   sortedValues: number[], // pinValues sorted ascending
 *   indices: number[],      // the index each sortedValues[k] is placed at;
 *                            // indices[0]===0, indices[last]===numPoints-1
 *   rankOf: (originalPosition: number) => number, // sorted rank of
 *                            // pinValues[originalPosition] (for identity tracking)
 * }}
 */
export function computeSortedPinPlacement(numPoints, pinValues) {
  const n = pinValues.length;
  if (!Number.isInteger(numPoints) || numPoints < n) {
    throw new Error(`numPoints must be an integer >= ${n} (the number of pins).`);
  }
  const withPosition = pinValues.map((v, position) => ({ position, v }));
  const sorted = withPosition.slice().sort((a, b) => a.v - b.v);
  const sortedValues = sorted.map((p) => p.v);

  const interiorFreeTotal = numPoints - n;
  const gaps = [];
  for (let k = 0; k < n - 1; k++) {
    gaps.push(Math.max(sortedValues[k + 1] - sortedValues[k], 0));
  }
  const counts = n > 1 ? apportion(interiorFreeTotal, gaps) : [];
  const indices = [0];
  for (let k = 0; k < counts.length; k++) {
    indices.push(indices[indices.length - 1] + 1 + counts[k]);
  }

  const rankOf = (originalPosition) => sorted.findIndex((p) => p.position === originalPosition);
  return { sortedValues, indices, rankOf };
}

