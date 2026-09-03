/**
 * Plain-node test suite (no test framework) for the curved-line deformation
 * model in curved-line-deform.js. Run with: node test-curved-line-deform.js
 */

import {
  computeCurvedLineShape,
  cumulativeArcLength,
  pointAtArcLength,
  computeCurvedLinePoints,
  bendingEnergy,
} from './curved-line-deform.js';

import { describe, it, expect } from 'vitest';

describe('curved-line-deform', () => {
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
    // 1. computeCurvedLineShape: midpoint always pinned at exactly 0, the two
    //    ends land exactly on their pole values.
    // ---------------------------------------------------------------------------
    {
      const { x, y, midIndex } = computeCurvedLineShape(101, -40, 25);
      assertClose(y[0], -40, 1e-9, 'Pole One lands exactly on its requested value');
      assertClose(y[y.length - 1], 25, 1e-9, 'Pole Two lands exactly on its requested value');
      assertClose(y[midIndex], 0, 1e-9, 'the fixed midpoint stays exactly at 0');
      assertClose(x[0], 0, 1e-12, 'baseline x starts at 0');
      assertClose(x[x.length - 1], 1, 1e-12, 'baseline x ends at 1');
    }

    // ---------------------------------------------------------------------------
    // 2. Both poles at 0 -> the two-pin-plus-midpoint system degenerates to a
    //    flat line (zero bending energy), same "trivial zero-energy" sanity
    //    check used by every other model in this project.
    // ---------------------------------------------------------------------------
    {
      const { y } = computeCurvedLineShape(151, 0, 0);
      for (let i = 0; i < y.length; i++) assertClose(y[i], 0, 1e-9, `y[${i}] is exactly 0 when both poles are 0`);
      assertClose(bendingEnergy(y), 0, 1e-12, 'a flat curve has zero bending energy');
    }

    // ---------------------------------------------------------------------------
    // 3. Lowering only one pole still pins the midpoint at 0 and bends smoothly
    //    (no errors, finite values, monotonic approach is not required but
    //    values must stay finite and the midpoint pin must hold regardless of
    //    asymmetry).
    // ---------------------------------------------------------------------------
    {
      const { y, midIndex } = computeCurvedLineShape(201, -80, 5);
      assertClose(y[midIndex], 0, 1e-9, 'midpoint stays pinned at 0 even with asymmetric poles');
      assert(y.every((v) => Number.isFinite(v)), 'all displacements are finite for asymmetric poles');
    }

    // ---------------------------------------------------------------------------
    // 4. cumulativeArcLength: a flat line's arc length equals its x-span
    //    exactly (no bending -> Euclidean distance reduces to |dx|).
    // ---------------------------------------------------------------------------
    {
      const x = [0, 0.25, 0.5, 0.75, 1];
      const y = [0, 0, 0, 0, 0];
      const cum = cumulativeArcLength(x, y);
      assertClose(cum[cum.length - 1], 1, 1e-12, 'a flat polyline\'s total arc length equals its x-span');
      assert(cum.every((c, i) => i === 0 || c > cum[i - 1]), 'cumulative arc length is strictly increasing');
    }

    // ---------------------------------------------------------------------------
    // 5. pointAtArcLength: exact endpoints, exact 3-4-5 triangle midpoint case.
    // ---------------------------------------------------------------------------
    {
      const x = [0, 1];
      const y = [0, 0];
      const cum = cumulativeArcLength(x, y);
      const start = pointAtArcLength(x, y, cum, 0);
      const end = pointAtArcLength(x, y, cum, cum[cum.length - 1]);
      assertClose(start.x, 0, 1e-12, 'target 0 lands exactly on the first point');
      assertClose(end.x, 1, 1e-12, 'target total lands exactly on the last point');

      // Out-of-range targets clamp to the ends rather than extrapolating.
      const before = pointAtArcLength(x, y, cum, -5);
      const after = pointAtArcLength(x, y, cum, 999);
      assertClose(before.x, 0, 1e-12, 'a negative target clamps to the first point');
      assertClose(after.x, 1, 1e-12, 'a target beyond the total clamps to the last point');
    }

    // ---------------------------------------------------------------------------
    // 6. computeCurvedLinePoints, flat case: with both poles at 0, arc-length
    //    spacing degenerates back to EXACTLY even index spacing -- this is the
    //    key sanity check that the model reduces to the ordinary flat baseline
    //    when there is no bend, not just "approximately" even.
    // ---------------------------------------------------------------------------
    {
      const N = 25;
      const { points, totalArcLength } = computeCurvedLinePoints(N, 301, 0, 0);
      assertClose(totalArcLength, 1, 1e-9, 'total arc length of a flat curve equals its x-span (1)');
      for (let i = 0; i < N; i++) {
        assertClose(points[i].x, i / (N - 1), 1e-9, `flat-curve point ${i} lands at exactly even index spacing`);
        assertClose(points[i].y, 0, 1e-9, `flat-curve point ${i} stays exactly on the baseline`);
      }
    }

    // ---------------------------------------------------------------------------
    // 7. computeCurvedLinePoints: first/last display points land exactly at the
    //    poles, and there are exactly numPoints of them.
    // ---------------------------------------------------------------------------
    {
      const N = 13;
      const { points } = computeCurvedLinePoints(N, 251, -60, 30);
      assert(points.length === N, `produces exactly ${N} points, got ${points.length}`);
      assertClose(points[0].x, 0, 1e-9, 'first display point sits at x=0');
      assertClose(points[0].y, -60, 1e-6, 'first display point lands exactly on Pole One\'s value');
      assertClose(points[N - 1].x, 1, 1e-9, 'last display point sits at x=1');
      assertClose(points[N - 1].y, 30, 1e-6, 'last display point lands exactly on Pole Two\'s value');
    }

    // ---------------------------------------------------------------------------
    // 8. THE CORE BEHAVIOR: lowering both poles symmetrically clusters points
    //    closer together near the poles (start/end) than in the middle -- this
    //    is the exact effect the ticket asks for ("lowering the anchors at
    //    either end causes points to cluster closer to the poles").
    // ---------------------------------------------------------------------------
    {
      const N = 25;
      const { points } = computeCurvedLinePoints(N, 401, -60, -60);
      const spacings = [];
      for (let i = 1; i < N; i++) spacings.push(points[i].x - points[i - 1].x);
      const firstSpacing = spacings[0];
      const lastSpacing = spacings[spacings.length - 1];
      const middleSpacing = spacings[Math.floor(spacings.length / 2)];
      assert(firstSpacing < middleSpacing, `spacing near Pole One (${firstSpacing.toFixed(4)}) is smaller than mid-curve spacing (${middleSpacing.toFixed(4)})`);
      assert(lastSpacing < middleSpacing, `spacing near Pole Two (${lastSpacing.toFixed(4)}) is smaller than mid-curve spacing (${middleSpacing.toFixed(4)})`);
    }

    // ---------------------------------------------------------------------------
    // 9. Symmetric poles produce a symmetric point layout (mirrored about the
    //    curve's midpoint in both x and y).
    // ---------------------------------------------------------------------------
    {
      const N = 15;
      const { points } = computeCurvedLinePoints(N, 301, -45, -45);
      for (let i = 0; i < N; i++) {
        const mirror = points[N - 1 - i];
        assertClose(points[i].x + mirror.x, 1, 1e-6, `point ${i} and its mirror are symmetric in x`);
        assertClose(points[i].y, mirror.y, 1e-6, `point ${i} and its mirror have equal y`);
      }
    }

    // ---------------------------------------------------------------------------
    // 10. Asymmetric poles: the more-lowered pole clusters points more tightly
    //     than the less-lowered one.
    // ---------------------------------------------------------------------------
    {
      const N = 25;
      const { points } = computeCurvedLinePoints(N, 401, -80, -10);
      const spacings = [];
      for (let i = 1; i < N; i++) spacings.push(points[i].x - points[i - 1].x);
      const firstSpacing = spacings[0]; // near the heavily-lowered Pole One
      const lastSpacing = spacings[spacings.length - 1]; // near the barely-lowered Pole Two
      assert(firstSpacing < lastSpacing, `the more-lowered pole (spacing ${firstSpacing.toFixed(4)}) clusters points more tightly than the less-lowered one (spacing ${lastSpacing.toFixed(4)})`);
    }

    // ---------------------------------------------------------------------------
    // 11. Bending can only lengthen the curve relative to the flat baseline:
    //     total arc length is always >= 1 (the flat-line length), with equality
    //     exactly at the flat case already checked in test 6.
    // ---------------------------------------------------------------------------
    {
      const cases = [
        [-10, -10], [30, -30], [-90, 90], [15, 60], [-5, 5], [0, -70],
      ];
      for (const [p1, p2] of cases) {
        const { totalArcLength } = computeCurvedLinePoints(21, 301, p1, p2);
        assert(totalArcLength >= 1 - 1e-9, `bending only ever lengthens the curve (poles ${p1},${p2}: total=${totalArcLength.toFixed(4)})`);
      }
    }

    // ---------------------------------------------------------------------------
    // 12. Monotonic x: since the fine curve is a simple function y(x) (no
    //     folding back on itself), the resulting display points' x coordinates
    //     must be strictly increasing regardless of how extreme the poles are.
    // ---------------------------------------------------------------------------
    {
      const { points } = computeCurvedLinePoints(31, 401, -120, 100);
      for (let i = 1; i < points.length; i++) {
        assert(points[i].x > points[i - 1].x, `x is strictly increasing at index ${i}`);
      }
    }

    // ---------------------------------------------------------------------------
    // 13. Error handling: invalid numPoints / fineResolution are rejected.
    // ---------------------------------------------------------------------------
    {
      let threw = false;
      try { computeCurvedLinePoints(1, 101, 0, 0); } catch (e) { threw = true; }
      assert(threw, 'numPoints < 2 throws');

      threw = false;
      try { computeCurvedLineShape(4, 0, 0); } catch (e) { threw = true; }
      assert(threw, 'fineResolution < 5 throws');

      threw = false;
      try { computeCurvedLinePoints(2.5, 101, 0, 0); } catch (e) { threw = true; }
      assert(threw, 'non-integer numPoints throws');
    }


    expect(failed, failed + ' assertion(s) failed -- see console output above for FAIL: details').toBe(0);
  });
});
