/**
 * Plain-node test suite (no test framework) for the curve deformation model
 * in curve-deform.js. Run with: node test-curve-deform.js
 */

import { computeCurveDeformation, bendingEnergy } from './curve-deform.js';

import { describe, it, expect } from 'vitest';

describe('curve-deform', () => {
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
    // 1. Endpoints are always exactly 0, anchor lands exactly on its offset.
    // ---------------------------------------------------------------------------
    {
      const X = 21;
      const { y, firstIndex, lastIndex, anchorIndex } = computeCurveDeformation(X, 10, 50);
      assertClose(y[firstIndex], 0, 1e-9, 'first point stays exactly on the baseline');
      assertClose(y[lastIndex], 0, 1e-9, 'last point stays exactly on the baseline');
      assertClose(y[anchorIndex], 50, 1e-9, 'anchor lands exactly on its requested offset');
    }

    // ---------------------------------------------------------------------------
    // 2. Zero offset -> every point stays on the baseline (a flat line is the
    //    trivial zero-energy solution, same as the affine-ramp check in the
    //    other two models).
    // ---------------------------------------------------------------------------
    {
      const X = 25;
      const { y } = computeCurveDeformation(X, 12, 0);
      for (let i = 0; i < X; i++) assertClose(y[i], 0, 1e-9, `y[${i}] is exactly 0 when the anchor offset is 0`);
      assertClose(bendingEnergy(y), 0, 1e-12, 'a flat curve has zero bending energy');
    }

    // ---------------------------------------------------------------------------
    // 3. Symmetric anchor placement (dead center) with a nonzero offset should
    //    produce a curve symmetric about the center index.
    // ---------------------------------------------------------------------------
    {
      const X = 21; // center index = 10
      const { y } = computeCurveDeformation(X, 10, 80);
      for (let i = 0; i < X; i++) {
        assertClose(y[i], y[X - 1 - i], 1e-9, `curve is symmetric: y[${i}] === y[${X - 1 - i}]`);
      }
    }

    // ---------------------------------------------------------------------------
    // 4. Smoothness: no abrupt jump in curvature anywhere along the curve, for
    //    an off-center anchor (the harder case, since the two sides of the
    //    anchor have different numbers of points to relax over).
    // ---------------------------------------------------------------------------
    {
      const X = 25;
      const { y } = computeCurveDeformation(X, 6, 60); // anchor much closer to the start
      const curvature = [];
      for (let i = 1; i < X - 1; i++) curvature.push(y[i + 1] - 2 * y[i] + y[i - 1]);
      let maxJump = 0;
      for (let i = 1; i < curvature.length; i++) maxJump = Math.max(maxJump, Math.abs(curvature[i] - curvature[i - 1]));
      assert(maxJump < 0.2 * 60, `curvature changes gradually along the curve (maxJump=${maxJump})`);
      for (let i = 0; i < X; i++) assert(Number.isFinite(y[i]), `y[${i}] is finite`);
    }

    // ---------------------------------------------------------------------------
    // 5. The curve should be monotonically increasing in |y| from each fixed
    //    end toward the anchor (no wiggle/overshoot past the anchor's own
    //    offset) for a simple single-bump case -- sanity check that this
    //    behaves like a smooth bow, not something ringing past its target.
    // ---------------------------------------------------------------------------
    {
      const X = 21;
      const { y } = computeCurveDeformation(X, 10, 100);
      const maxAbs = Math.max(...y.map(Math.abs));
      assertClose(maxAbs, 100, 1e-6, 'the anchor itself is the point of maximum displacement (no overshoot past it)');
    }

    // ---------------------------------------------------------------------------
    // 6. Input validation.
    // ---------------------------------------------------------------------------
    {
      let threw = false;
      try { computeCurveDeformation(21, 0, 10); } catch (e) { threw = true; }
      assert(threw, 'rejects an anchor at the first index (must be strictly interior)');

      threw = false;
      try { computeCurveDeformation(21, 20, 10); } catch (e) { threw = true; }
      assert(threw, 'rejects an anchor at the last index (must be strictly interior)');

      threw = false;
      try { computeCurveDeformation(2, 1, 10); } catch (e) { threw = true; }
      assert(threw, 'rejects X < 3 (no room for an interior anchor)');
    }

    // ---------------------------------------------------------------------------
    // 7. FirstPoint and LastPoint are user-defined (not hardcoded to 0): both
    //    land exactly on their requested values, and the curve remains smooth.
    // ---------------------------------------------------------------------------
    {
      const X = 21;
      const { y, firstIndex, lastIndex, anchorIndex } = computeCurveDeformation(X, 10, 50, -30, 40);
      assertClose(y[firstIndex], -30, 1e-9, 'First Point lands exactly on its requested (nonzero) value');
      assertClose(y[lastIndex], 40, 1e-9, 'Last Point lands exactly on its requested (nonzero) value');
      assertClose(y[anchorIndex], 50, 1e-9, 'anchor still lands exactly on its requested offset with nonzero endpoints');

      const curvature = [];
      for (let i = 1; i < X - 1; i++) curvature.push(y[i + 1] - 2 * y[i] + y[i - 1]);
      let maxJump = 0;
      for (let i = 1; i < curvature.length; i++) maxJump = Math.max(maxJump, Math.abs(curvature[i] - curvature[i - 1]));
      assert(maxJump < 0.2 * 80, `curve stays smooth with nonzero First/Last points (maxJump=${maxJump})`);
    }

    // ---------------------------------------------------------------------------
    // 8. If First, Anchor, and Last are all collinear (an affine progression),
    //    the whole curve should be the exact straight line through them, with
    //    zero bending energy -- same sanity check used in line-deform.js.
    // ---------------------------------------------------------------------------
    {
      const X = 21;
      const anchorIndex = 10;
      const firstValue = 5;
      const lastValue = 65;
      const slope = (lastValue - firstValue) / (X - 1);
      const anchorValue = firstValue + slope * anchorIndex;
      const { y } = computeCurveDeformation(X, anchorIndex, anchorValue, firstValue, lastValue);
      for (let i = 0; i < X; i++) {
        assertClose(y[i], firstValue + slope * i, 1e-7, `collinear First/Anchor/Last gives an exact straight line at ${i}`);
      }
      assertClose(bendingEnergy(y), 0, 1e-10, 'collinear First/Anchor/Last gives zero bending energy');
    }

    // ---------------------------------------------------------------------------
    // 9. Default firstValue/lastValue are still 0 when omitted (backward
    //    compatible with the original always-flat-baseline behavior).
    // ---------------------------------------------------------------------------
    {
      const { y, firstIndex, lastIndex } = computeCurveDeformation(21, 10, 25);
      assertClose(y[firstIndex], 0, 1e-9, 'firstValue defaults to 0 when omitted');
      assertClose(y[lastIndex], 0, 1e-9, 'lastValue defaults to 0 when omitted');
    }

    // ---------------------------------------------------------------------------

    expect(failed, failed + ' assertion(s) failed -- see console output above for FAIL: details').toBe(0);
  });
});
