/**
 * Plain-node test suite (no test framework) for the open-line
 * minimum-bending-energy deformation model in line-deform.js.
 * Run with: node test-line-deform.js
 */

import {
  computeLineBendingDisplacements,
  computeLineDeformation,
  bendingEnergy,
  apportion,
  computeSortedPinPlacement,
} from './line-deform.js';

import { describe, it, expect } from 'vitest';

describe('line-deform', () => {
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
    // 1. Pin constraints are satisfied exactly.
    // ---------------------------------------------------------------------------
    {
      const X = 20;
      const pins = [
        { index: 2, value: 0.03 },
        { index: 7, value: -0.05 },
        { index: 12, value: 0.08 },
        { index: 17, value: -0.02 },
      ];
      const u = computeLineBendingDisplacements(X, pins);
      for (const p of pins) {
        assertClose(u[p.index], p.value, 1e-9, `pin at ${p.index} satisfied exactly`);
      }
    }

    // ---------------------------------------------------------------------------
    // 2. Zero displacement at all pins => zero displacement everywhere.
    // ---------------------------------------------------------------------------
    {
      const X = 16;
      const pins = [
        { index: 1, value: 0 },
        { index: 5, value: 0 },
        { index: 10, value: 0 },
        { index: 14, value: 0 },
      ];
      const u = computeLineBendingDisplacements(X, pins);
      for (let i = 0; i < X; i++) {
        assertClose(u[i], 0, 1e-9, `u[${i}] is zero when all pins are zero`);
      }
    }

    // ---------------------------------------------------------------------------
    // 3. Only the two endpoints pinned => affine ramp is in the null space of
    //    the bending energy, so the exact-zero-energy straight-line solution
    //    should be recovered, and E should be numerically zero.
    // ---------------------------------------------------------------------------
    {
      const X = 25;
      const pins = [
        { index: 0, value: 0.1 },
        { index: X - 1, value: -0.2 },
      ];
      const u = computeLineBendingDisplacements(X, pins);
      // Expected affine ramp: u[i] = pins[0].value + i*(pins[1].value-pins[0].value)/(X-1)
      const slope = (pins[1].value - pins[0].value) / (X - 1);
      for (let i = 0; i < X; i++) {
        const expected = pins[0].value + i * slope;
        assertClose(u[i], expected, 1e-8, `endpoint-only pin gives affine ramp at ${i}`);
      }
      assertClose(bendingEnergy(u), 0, 1e-12, 'affine ramp has zero bending energy');
    }

    // ---------------------------------------------------------------------------
    // 4. Four pins that all lie exactly on a common affine ramp => the affine
    //    ramp is still the (unique) minimizer, energy should be zero.
    // ---------------------------------------------------------------------------
    {
      const X = 18;
      const a = 0.05;
      const b = 0.01; // slope
      const idxs = [0, 3, 9, 17];
      const pins = idxs.map((i) => ({ index: i, value: a + b * i }));
      const u = computeLineBendingDisplacements(X, pins);
      for (let i = 0; i < X; i++) {
        assertClose(u[i], a + b * i, 1e-7, `collinear pins recover affine ramp at ${i}`);
      }
      assertClose(bendingEnergy(u), 0, 1e-10, 'collinear pins give zero bending energy');
    }

    // ---------------------------------------------------------------------------
    // 5. Smoothness: with four pins NOT collinear, the point spacing should
    //    change gradually -- no abrupt jump between one "uniformly spaced"
    //    group and another. We check this by verifying that the second
    //    difference of u (discrete curvature) itself varies smoothly, i.e. the
    //    difference between adjacent curvature values is small compared to the
    //    overall displacement scale, everywhere -- not just within one segment.
    // ---------------------------------------------------------------------------
    {
      const X = 30;
      const pins = [
        { index: 3, value: 0.15 },
        { index: 10, value: -0.05 },
        { index: 18, value: 0.1 },
        { index: 25, value: -0.1 },
      ];
      const u = computeLineBendingDisplacements(X, pins);
      const curvature = [];
      for (let i = 1; i < X - 1; i++) {
        curvature.push(u[i + 1] - 2 * u[i] + u[i - 1]);
      }
      let maxJump = 0;
      for (let i = 1; i < curvature.length; i++) {
        maxJump = Math.max(maxJump, Math.abs(curvature[i] - curvature[i - 1]));
      }
      const scale = Math.max(...pins.map((p) => Math.abs(p.value)));
      assert(
        maxJump < 0.15 * scale,
        `curvature changes gradually (maxJump=${maxJump}, scale=${scale})`
      );

      // Sanity: no NaNs, all displacements finite.
      for (let i = 0; i < X; i++) {
        assert(Number.isFinite(u[i]), `u[${i}] is finite`);
      }
    }

    // ---------------------------------------------------------------------------
    // 6. Spacing does NOT split into two abruptly-different uniform groups: the
    //    spacing sequence should not have a single large jump while being flat
    //    on both sides of it (the exact failure mode called out in the model
    //    description). We check that the largest single-step CHANGE in spacing
    //    is not dramatically larger than the average step-to-step change.
    // ---------------------------------------------------------------------------
    {
      const X = 24;
      const pins = [
        { index: 1, position: 1 / (X - 1) },
        { index: 6, position: 6 / (X - 1) + 0.2 },
        { index: 15, position: 15 / (X - 1) - 0.1 },
        { index: 22, position: 22 / (X - 1) },
      ];
      const { deformed } = computeLineDeformation(X, pins);
      const spacing = [];
      for (let i = 1; i < X; i++) spacing.push(deformed[i] - deformed[i - 1]);
      const spacingChanges = [];
      for (let i = 1; i < spacing.length; i++) {
        spacingChanges.push(Math.abs(spacing[i] - spacing[i - 1]));
      }
      const maxChange = Math.max(...spacingChanges);
      const avgChange = spacingChanges.reduce((a, b) => a + b, 0) / spacingChanges.length;
      assert(
        maxChange < 6 * avgChange + 1e-9,
        `no single abrupt spacing jump dominates (max=${maxChange}, avg=${avgChange})`
      );
    }

    // ---------------------------------------------------------------------------
    // 7. computeLineDeformation: original positions are evenly spaced 0..1 and
    //    deformed positions match original + u, with pins landing exactly on
    //    their requested absolute position.
    // ---------------------------------------------------------------------------
    {
      const X = 12;
      const pins = [
        { index: 0, position: 0.05 },
        { index: 4, position: 0.5 },
        { index: 7, position: 0.55 },
        { index: 11, position: 0.9 },
      ];
      const { original, deformed, u } = computeLineDeformation(X, pins);
      for (let i = 0; i < X; i++) {
        assertClose(original[i], i / (X - 1), 1e-12, `original[${i}] evenly spaced`);
        assertClose(deformed[i], original[i] + u[i], 1e-12, `deformed[${i}] = original + u`);
      }
      for (const p of pins) {
        assertClose(deformed[p.index], p.position, 1e-9, `pin ${p.index} lands exactly on requested position`);
      }
    }

    // ---------------------------------------------------------------------------
    // 8. Single pin (degenerate but should not crash): with only one pin, the
    //    null space (2D affine ramps) is not fully removed, but since a
    //    pentadiagonal/gaussian solve of the *free* subsystem after moving the
    //    one pinned column to the RHS may still be singular (there remains a
    //    genuine 1-parameter family of equal-energy solutions once you fix a
    //    single point on a 2D null space MINUS one constraint = 1D remaining
    //    freedom in the null space of the reduced system). We only require
    //    that with >= 2 non-degenerate pins the system solves without error;
    //    that's exercised throughout. This test just documents expected usage
    //    (>=2 pins) and is skipped from strict solvability assertions.
    // ---------------------------------------------------------------------------
    {
      const X = 10;
      let threw = false;
      try {
        computeLineBendingDisplacements(X, [{ index: 4, value: 0.1 }]);
      } catch (e) {
        threw = true;
      }
      // Either it throws (singular, expected) or it returns *a* valid minimum
      // via pivoting picking one particular solution -- both are acceptable;
      // we just assert it doesn't hang or return NaNs if it doesn't throw.
      if (!threw) {
        const u = computeLineBendingDisplacements(X, [{ index: 4, value: 0.1 }]);
        assert(u.every(Number.isFinite), 'single-pin case: finite results if it does not throw');
      } else {
        assert(true, 'single-pin case: throws on singular system as expected');
      }
    }

    // ---------------------------------------------------------------------------
    // 9. apportion(): counts sum to total, proportional to weights, and the
    //    zero-weight fallback splits evenly instead of crashing.
    // ---------------------------------------------------------------------------
    {
      const counts = apportion(13, [1, 1, 1]);
      assert(counts.reduce((a, b) => a + b, 0) === 13, 'apportion: counts sum to the requested total');
      assert(Math.max(...counts) - Math.min(...counts) <= 1, 'apportion: equal weights stay within 1 of each other');

      const evenCounts = apportion(12, [1, 1, 1]);
      assert(evenCounts.every((c) => c === 4), 'apportion: equal weights split exactly evenly when the total divides evenly');

      const skewed = apportion(13, [8, 1, 1]);
      assert(skewed[0] > skewed[1] && skewed[0] > skewed[2], 'apportion: larger weight gets more points');
      assert(skewed.reduce((a, b) => a + b, 0) === 13, 'apportion (skewed): still sums to total');

      const degenerate = apportion(13, [0, 0, 0]);
      assert(degenerate.reduce((a, b) => a + b, 0) === 13, 'apportion: zero-weight fallback still sums to total');
    }

    // ---------------------------------------------------------------------------
    // 10. computeSortedPinPlacement(): identity comes from sorted VALUE, not
    //     input position; extremes always land at 0 and numPoints-1.
    // ---------------------------------------------------------------------------
    {
      const { sortedValues, indices, rankOf } = computeSortedPinPlacement(10, [0, 0.4, 0.3, 1]);
      assert(sortedValues.join(',') === '0,0.3,0.4,1', 'sortedValues are ascending regardless of input order');
      assert(indices[0] === 0, 'smallest value always lands at index 0');
      assert(indices[indices.length - 1] === 9, 'largest value always lands at index numPoints-1');
      for (let i = 1; i < indices.length; i++) assert(indices[i] > indices[i - 1], 'indices are strictly increasing');

      // Input order was [0, 0.4, 0.3, 1] -> sorted order is [0, 0.3, 0.4, 1],
      // so input position 1 (value 0.4) has sorted rank 2, and input position 2
      // (value 0.3) has sorted rank 1 -- this is exactly the "identity swaps
      // when values cross" behavior from line.html.
      assert(rankOf(0) === 0, 'rankOf: the 0-value (input position 0) has sorted rank 0');
      assert(rankOf(1) === 2, 'rankOf: input position 1 (value 0.4) has sorted rank 2 (it is the 3rd-smallest)');
      assert(rankOf(2) === 1, 'rankOf: input position 2 (value 0.3) has sorted rank 1 (it is the 2nd-smallest)');
      assert(rankOf(3) === 3, 'rankOf: the 1-value (input position 3) has sorted rank 3');

      // Combined with computeLineDeformation, this should reproduce exactly the
      // behavior line.html relies on: every pin lands exactly on its value.
      const pins = indices.map((idx, k) => ({ index: idx, position: sortedValues[k] }));
      const { deformed } = computeLineDeformation(10, pins);
      pins.forEach((p) => assertClose(deformed[p.index], p.position, 1e-9, `pin at index ${p.index} lands exactly on its value`));
    }

    // Degenerate/edge case: a single pin value (n=1) should not crash (no gaps
    // to apportion), placing it at index 0 trivially.
    {
      const { indices } = computeSortedPinPlacement(5, [0.5]);
      assert(indices.length === 1 && indices[0] === 0, 'a single pin value places at index 0 with no crash');
    }

    // ---------------------------------------------------------------------------

    expect(failed, failed + ' assertion(s) failed -- see console output above for FAIL: details').toBe(0);
  });
});
