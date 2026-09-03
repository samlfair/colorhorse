/**
 * Minimum-bending-energy deformation of points evenly spaced on a circle.
 *
 * ---------------------------------------------------------------------------
 * THE MODEL
 * ---------------------------------------------------------------------------
 * X points start evenly spaced around a circle, at original angles
 *   theta[i] = i * (2*pi / X),   i = 0..X-1
 *
 * Point A is pinned at its original angle. Point N is pinned at a new angle
 * (equivalently, given an angular displacement dN). We want every other
 * point to settle into the position that makes the ring behave like a bent
 * semi-rigid pole: no kinks, no abrupt change in point spacing, smooth
 * curvature everywhere.
 *
 * Let u[i] be the angular displacement of point i from its ORIGINAL angle,
 * so the new angle is theta[i] + u[i]. "Semi-rigid pole" behavior is
 * captured by minimizing the discrete bending energy:
 *
 *   E = sum_i ( u[i+1] - 2*u[i] + u[i-1] )^2      (indices mod X, circular)
 *
 * The term (u[i+1] - 2*u[i] + u[i-1]) is the discrete second derivative
 * (curvature) of the displacement field at point i. Squaring and summing it
 * penalizes sharp changes in curvature, which is exactly what keeps
 * neighboring points from developing an abrupt jump in spacing -- the same
 * energy a discrete "elastica" / thin flexible rod minimizes when bent
 * between two fixed points.
 *
 * We minimize E subject to two hard constraints:
 *   u[A] = 0                  (point A never moves)
 *   u[N] = dN                 (point N is pinned at its new displacement)
 *
 * ---------------------------------------------------------------------------
 * SOLVING IT: WHY A SIMPLE LINEAR SYSTEM FALLS OUT
 * ---------------------------------------------------------------------------
 * E is a quadratic form in the free u[i] values, so its minimum is found by
 * setting dE/du[i] = 0 for every FREE index i (every i except A and N).
 *
 * u[i] appears in exactly three terms of the sum: the ones centered at
 * i-1, i, and i+1 (with coefficients 1, -2, and 1 respectively, since
 * that's how it appears in each second-difference term). Differentiating:
 *
 *   dE/du[i] = 2 * [ 1*(Lu)[i-1] - 2*(Lu)[i] + 1*(Lu)[i+1] ] = 0
 *
 * where (Lu)[k] = u[k+1] - 2*u[k] + u[k-1] is the discrete Laplacian
 * (second-difference) operator. The bracketed expression is itself the
 * discrete second difference of (Lu), i.e. applying L twice:
 *
 *   (L(Lu))[i] = 0   for every free index i
 *
 * Expanding (L(Lu))[i] gives the classic 5-point discrete-biharmonic
 * stencil:
 *
 *   u[i-2] - 4*u[i-1] + 6*u[i] - 4*u[i+1] + u[i+2] = 0
 *
 * This is the discrete analogue of the Euler-Bernoulli beam equation
 * d^4u/dx^4 = 0 -- exactly the equation a physical elastic rod satisfies
 * away from its constrained points. It is also the same condition that
 * defines a natural cubic spline between control points. That's why the
 * result "looks like" a smoothly bent pole: it mathematically IS the
 * discrete/circular equivalent of one.
 *
 * So we get one such biharmonic equation per free point (X - 2 equations),
 * plus the two constraint equations u[A] = 0 and u[N] = dN, for a total of
 * X linear equations in X unknowns u[0..X-1]. Because the ring is a single
 * closed loop, the biharmonic stencil naturally spans across whichever
 * "side" of the ring a point sits on relative to A and N -- there is no
 * need to treat the two arcs separately, and no artificial seam is
 * introduced. The circular indexing (mod X) is what keeps the two arcs
 * coupled into one smooth solution instead of two independently-uniform
 * segments.
 *
 * The only functions in the kernel of the circular second-difference
 * operator L are constants (u[i] = c for all i); a non-zero linear ramp
 * cannot close up around a loop. Pinning u[A] = 0 removes that last
 * degree of freedom, so the linear system below has a unique solution
 * (bar degenerate inputs like X < 5 or A === N).
 *
 * ---------------------------------------------------------------------------
 * NUMERICAL STABILITY
 * ---------------------------------------------------------------------------
 * The system matrix is sparse (at most 5 non-zero entries per row) and
 * diagonally-dominant-ish but not symmetric-positive-definite once rows are
 * overwritten by the two constraint equations. We solve it with dense
 * Gaussian elimination using partial pivoting (largest-magnitude pivot in
 * each column), which is numerically stable for the small-to-moderate X
 * (tens to low hundreds of points) this visualization targets.
 */


/**
 * Solve the linear system A x = b via Gaussian elimination with partial
 * pivoting. A is mutated (used as scratch space via a local copy); the
 * caller's array is not touched.
 *
 * @param {number[][]} matrix  n x n coefficient matrix
 * @param {number[]} vector    n-length right-hand side
 * @returns {number[]} solution vector x, length n
 */
export function solveLinearSystem(matrix, vector) {
  const n = vector.length;
  // Work on deep copies so the caller's data is never mutated.
  const A = matrix.map((row) => row.slice());
  const b = vector.slice();

  for (let col = 0; col < n; col++) {
    // Partial pivoting: swap in the row with the largest magnitude entry
    // in this column, to avoid dividing by a near-zero pivot.
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
          'check that A and N are distinct valid indices and X is large enough.'
      );
    }
    if (pivotRow !== col) {
      [A[col], A[pivotRow]] = [A[pivotRow], A[col]];
      [b[col], b[pivotRow]] = [b[pivotRow], b[col]];
    }

    // Eliminate this column from all rows below.
    for (let row = col + 1; row < n; row++) {
      const factor = A[row][col] / A[col][col];
      if (factor === 0) continue;
      for (let k = col; k < n; k++) {
        A[row][k] -= factor * A[col][k];
      }
      b[row] -= factor * b[col];
    }
  }

  // Back-substitution.
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
 * Compute the minimum-bending-energy angular displacement field u[0..X-1]
 * for X points evenly spaced on a circle, with point A pinned at u[A] = 0
 * and point N pinned at u[N] = dN.
 *
 * @param {number} X   total number of points (must be >= 5)
 * @param {number} A   index of the fixed point, 0 <= A < X
 * @param {number} N   index of the moved point, 0 <= N < X, N !== A
 * @param {number} dN  angular displacement (radians) applied to point N
 * @returns {number[]} displacement field u, length X, with u[A] === 0 and
 *                      u[N] === dN exactly
 */
export function computeBendingDisplacements(X, A, N, dN) {
  if (!Number.isInteger(X) || X < 5) {
    throw new Error('X must be an integer >= 5 for the biharmonic stencil to be well-defined.');
  }
  if (!Number.isInteger(A) || A < 0 || A >= X) {
    throw new Error(`A must be an integer index in [0, ${X}).`);
  }
  if (!Number.isInteger(N) || N < 0 || N >= X) {
    throw new Error(`N must be an integer index in [0, ${X}).`);
  }
  if (A === N) {
    throw new Error('A and N must be distinct points.');
  }

  // Build the X x X system. Row i is either:
  //   - a pinning constraint (identity row), for i === A or i === N, or
  //   - the 5-point biharmonic stencil [1, -4, 6, -4, 1] centered at i,
  //     with circular (mod X) neighbor indices.
  const matrix = Array.from({ length: X }, () => new Array(X).fill(0));
  const vector = new Array(X).fill(0);

  const mod = (k) => ((k % X) + X) % X;

  for (let i = 0; i < X; i++) {
    if (i === A) {
      matrix[i][A] = 1;
      vector[i] = 0;
    } else if (i === N) {
      matrix[i][N] = 1;
      vector[i] = dN;
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

  // Guarantee the pinned values are exact (protects against floating-point
  // round-off from the elimination process leaking into the constraints).
  u[A] = 0;
  u[N] = dN;
  return u;
}

/** Normalize an angle in radians to the range [0, 2*pi). */
export function normalizeAngle(theta) {
  const twoPi = 2 * Math.PI;
  return ((theta % twoPi) + twoPi) % twoPi;
}

/**
 * Compute original and deformed angular positions for X points evenly
 * spaced on a circle, given a pinned point A and a point N moved by dN
 * radians.
 *
 * @returns {{original: number[], deformed: number[], u: number[]}}
 */
export function computeDeformedAngles(X, A, N, dN) {
  const original = Array.from({ length: X }, (_, i) => (i * 2 * Math.PI) / X);
  const u = computeBendingDisplacements(X, A, N, dN);
  const deformed = original.map((theta, i) => normalizeAngle(theta + u[i]));
  return { original, deformed, u };
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

