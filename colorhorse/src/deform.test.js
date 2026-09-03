/**
 * Plain-node test suite (no test framework) for the minimum-bending-energy
 * deformation model in deform.js. Run with: node test-deform.js
 */

import {
  computeBendingDisplacements,
  computeDeformedAngles,
  bendingEnergy,
  normalizeAngle,
} from './deform.js';

import { describe, it, expect } from 'vitest';

describe('deform', () => {
  it('all assertions pass', () => {
    let passed = 0;
    let failed = 0;

    function assert(cond, message) {
      if (cond) {
        passed++;
      } else {
        failed++;
        console.error(`FAIL: ${message}`);
      }
    }

    function assertClose(actual, expected, tol, message) {
      assert(
        Math.abs(actual - expected) <= tol,
        `${message} (expected ${expected}, got ${actual}, tol ${tol})`
      );
    }

    // ---------------------------------------------------------------------------
    // 1. Constraints are satisfied exactly.
    // ---------------------------------------------------------------------------
    {
      const X = 24;
      const A = 0;
      const N = 10;
      const dN = 0.5;
      const u = computeBendingDisplacements(X, A, N, dN);
      assert(u.length === X, 'displacement array has length X');
      assertClose(u[A], 0, 1e-9, 'u[A] must be exactly 0');
      assertClose(u[N], dN, 1e-9, 'u[N] must equal dN exactly');
    }

    // ---------------------------------------------------------------------------
    // 2. Trivial case: dN = 0 means nothing moves anywhere.
    // ---------------------------------------------------------------------------
    {
      const X = 24;
      const u = computeBendingDisplacements(X, 0, 12, 0);
      for (let i = 0; i < X; i++) {
        assertClose(u[i], 0, 1e-9, `u[${i}] should be 0 when dN=0`);
      }
    }

    // ---------------------------------------------------------------------------
    // 3. Minimality: the computed solution should have lower (or equal) bending
    //    energy than nearby perturbations that still satisfy the constraints.
    // ---------------------------------------------------------------------------
    {
      const X = 24;
      const A = 3;
      const N = 15;
      const dN = 0.8;
      const u = computeBendingDisplacements(X, A, N, dN);
      const E0 = bendingEnergy(u);

      // Try many random perturbations that keep u[A]=0 and u[N]=dN fixed.
      let seed = 42;
      function rand() {
        // simple deterministic LCG so the test is reproducible
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return (seed / 0x7fffffff) * 2 - 1;
      }

      let allHigherOrEqual = true;
      for (let trial = 0; trial < 200; trial++) {
        const perturbed = u.slice();
        for (let i = 0; i < X; i++) {
          if (i === A || i === N) continue;
          perturbed[i] += rand() * 0.05;
        }
        const Ep = bendingEnergy(perturbed);
        if (Ep < E0 - 1e-7) {
          allHigherOrEqual = false;
        }
      }
      assert(
        allHigherOrEqual,
        'no random perturbation with the same constraints should have lower bending energy'
      );
    }

    // ---------------------------------------------------------------------------
    // 4. Smoothness: no abrupt transition between a "still evenly spaced" group
    //    and a "different uniform spacing" group. We check this by verifying
    //    that the *third difference* of angular spacing (a proxy for jerk /
    //    abruptness) does not spike at some single location while being ~0
    //    elsewhere -- i.e. curvature change is spread out, not concentrated in
    //    one abrupt jump.
    // ---------------------------------------------------------------------------
    {
      const X = 24;
      const A = 0;
      const N = 12;
      const dN = 1.0;
      const { u } = computeDeformedAngles(X, A, N, dN);

      // Second differences (discrete curvature) at every point.
      const curvature = u.map((_, i) => u[(i + 1) % X] - 2 * u[i] + u[(i - 1 + X) % X]);

      // For a smooth bend, curvature should vary gradually: the max jump between
      // ADJACENT curvature values should not dominate the total variation across
      // the whole ring (which would indicate one abrupt kink).
      let maxAdjacentJump = 0;
      let totalVariation = 0;
      for (let i = 0; i < X; i++) {
        const jump = Math.abs(curvature[(i + 1) % X] - curvature[i]);
        maxAdjacentJump = Math.max(maxAdjacentJump, jump);
        totalVariation += jump;
      }
      // If the deformation had one sharp kink, a single adjacent jump would
      // account for a large fraction of the total variation around the ring.
      // For a smooth bend it should be a small, unremarkable fraction.
      const fraction = maxAdjacentJump / totalVariation;
      assert(
        fraction < 0.35,
        `no single adjacent jump should dominate total curvature variation (fraction=${fraction})`
      );
    }

    // ---------------------------------------------------------------------------
    // 5. Contrast against the "two uniform groups" anti-pattern explicitly
    //    warned against in the spec: a naive model that keeps one arc evenly
    //    spaced at the old spacing and the other arc evenly spaced at a new
    //    spacing has a genuine discontinuity in point-to-point angular spacing
    //    right at the boundary. Our solution's spacing should NOT have such a
    //    discontinuity -- spacing should change gradually across every seam.
    // ---------------------------------------------------------------------------
    {
      const X = 24;
      const A = 0;
      const N = 12;
      const dN = 1.2;
      const { deformed } = computeDeformedAngles(X, A, N, dN);

      // angular spacing between adjacent points (unwrap around the circle)
      function angularSpacing(angles) {
        const X = angles.length;
        const spacing = new Array(X);
        for (let i = 0; i < X; i++) {
          let diff = angles[(i + 1) % X] - angles[i];
          diff = ((diff % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
          spacing[i] = diff;
        }
        return spacing;
      }

      const spacing = angularSpacing(deformed);
      const meanSpacing = spacing.reduce((a, b) => a + b, 0) / X;

      // Adjacent spacing differences should be small and roughly comparable in
      // magnitude around the whole ring -- no single seam should have a jump
      // much larger than the typical jump elsewhere.
      const spacingDiffs = spacing.map((s, i) => Math.abs(spacing[(i + 1) % X] - s));
      const maxDiff = Math.max(...spacingDiffs);
      const meanDiff = spacingDiffs.reduce((a, b) => a + b, 0) / X;
      assert(
        maxDiff < meanDiff * 6,
        `max adjacent spacing-change (${maxDiff.toFixed(4)}) should not dwarf the mean ` +
          `spacing-change (${meanDiff.toFixed(4)}) -- would indicate an abrupt seam`
      );
      assert(meanSpacing > 0, 'sanity: mean spacing should be positive');
    }

    // ---------------------------------------------------------------------------
    // 6. Displacement should generally decay with graph-distance from N (both
    //    directions along the ring), consistent with "influence spreads out
    //    from the moved point and fades toward the fixed point."
    //    We check this via a monotonic-ish trend rather than strict monotonicity
    //    (cubic splines can have mild overshoot), using distance buckets.
    // ---------------------------------------------------------------------------
    {
      const X = 24;
      const A = 0;
      const N = 6;
      const dN = 1.0;
      const u = computeBendingDisplacements(X, A, N, dN);

      // Points closest to N (graph distance 1) should have larger |u| on
      // average than points closest to A (graph distance 1 from A, i.e. far
      // from N along that arc).
      const near_N = Math.abs(u[(N - 1 + X) % X]) + Math.abs(u[(N + 1) % X]);
      const near_A = Math.abs(u[(A - 1 + X) % X]) + Math.abs(u[(A + 1) % X]);
      assert(
        near_N > near_A,
        `points adjacent to N should be displaced more than points adjacent to A ` +
          `(near_N=${near_N}, near_A=${near_A})`
      );
    }

    // ---------------------------------------------------------------------------
    // 7. Symmetric configuration sanity check: X=24, A=0, N=12 (diametrically
    //    opposite, equal arc lengths both ways). The displacement pattern along
    //    one arc should mirror the pattern along the other arc.
    // ---------------------------------------------------------------------------
    {
      const X = 24;
      const A = 0;
      const N = 12;
      const dN = 1.0;
      const u = computeBendingDisplacements(X, A, N, dN);
      // Walking from A to N one way (indices 1..11) vs the other way
      // (indices 23..13, i.e. -1..-11) should give matching magnitudes since
      // the two arcs are geometrically identical (same length, same boundary
      // conditions at both ends).
      for (let k = 1; k < 12; k++) {
        const uForward = u[k];
        const uBackward = u[(X - k) % X];
        assertClose(uForward, uBackward, 1e-6, `symmetric arcs: u[${k}] should equal u[${X - k}]`);
      }
    }

    // ---------------------------------------------------------------------------
    // 8. Error handling for degenerate inputs.
    // ---------------------------------------------------------------------------
    {
      let threw = false;
      try {
        computeBendingDisplacements(24, 5, 5, 1.0); // A === N
      } catch (e) {
        threw = true;
      }
      assert(threw, 'A === N should throw');

      threw = false;
      try {
        computeBendingDisplacements(3, 0, 1, 1.0); // X too small
      } catch (e) {
        threw = true;
      }
      assert(threw, 'X < 5 should throw');
    }

    // ---------------------------------------------------------------------------
    // 9. normalizeAngle behaves correctly.
    // ---------------------------------------------------------------------------
    {
      assertClose(normalizeAngle(-0.1), 2 * Math.PI - 0.1, 1e-9, 'normalizeAngle wraps negative angles');
      assertClose(normalizeAngle(2 * Math.PI + 0.3), 0.3, 1e-9, 'normalizeAngle wraps angles > 2pi');
      assertClose(normalizeAngle(0), 0, 1e-9, 'normalizeAngle(0) === 0');
    }

    // ---------------------------------------------------------------------------
    // 10. Different X sizes and a large negative displacement, for robustness.
    // ---------------------------------------------------------------------------
    {
      for (const X of [5, 6, 8, 24, 50, 100]) {
        const A = 0;
        const N = Math.floor(X / 3);
        const dN = -1.3;
        const u = computeBendingDisplacements(X, A, N, dN);
        assertClose(u[A], 0, 1e-6, `X=${X}: u[A]=0`);
        assertClose(u[N], dN, 1e-6, `X=${X}: u[N]=dN`);
        assert(
          u.every((v) => Number.isFinite(v)),
          `X=${X}: all displacements finite (no numerical blow-up)`
        );
      }
    }


    expect(failed, failed + ' assertion(s) failed -- see console output above for FAIL: details').toBe(0);
  });
});
