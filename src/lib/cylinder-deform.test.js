/**
 * Plain-node test suite (no test framework) for the cylinder deformation
 * model in cylinder-deform.js -- currently the D (circular) axis only.
 * Run with: node test-cylinder-deform.js
 */

import {
  computeCircularBendingDisplacements,
  findNearestAvailableSlot,
  computeCylinderD,
  computeCylinderR,
  computeCylinderRGrid,
  computeCylinderZLevels,
  computeCylinderPoints,
  computeAdaptiveChromaFloor,
  bendingEnergy,
} from './cylinder-deform.js';
import { computeLineBendingDisplacements } from './line-deform.js';

import { describe, it, expect } from 'vitest';

describe('cylinder-deform', () => {
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

    const X = 12;
    const anchorOne = { D: 0.0, Z: 0.4, R: 0.7 };
    const anchorTwo = { D: 47.0, Z: 0.3, R: 0.6 };

    // ---------------------------------------------------------------------------
    // 1. computeCircularBendingDisplacements: pin constraints satisfied exactly,
    //    works with an arbitrary number of pins (not just a hardcoded A/N pair).
    // ---------------------------------------------------------------------------
    {
      const u = computeCircularBendingDisplacements(X, [
        { index: 0, value: 0 },
        { index: 5, value: 25 },
      ]);
      assertClose(u[0], 0, 1e-9, 'pin at index 0 satisfied exactly');
      assertClose(u[5], 25, 1e-9, 'pin at index 5 satisfied exactly');
      assert(u.every(Number.isFinite), 'all displacements finite');
    }

    // A single pin is enough to make the circular system well-posed (unlike
    // the open line, which needs two -- a constant is the only zero-energy
    // field on a ring, a 1D null space).
    {
      const u = computeCircularBendingDisplacements(X, [{ index: 3, value: 10 }]);
      assertClose(u[3], 10, 1e-9, 'single-pin circular system solves and satisfies its one constraint');
      assert(u.every(Number.isFinite), 'single-pin case: all displacements finite');
    }

    // ---------------------------------------------------------------------------
    // 2. Zero-displacement anchors (both exactly on their native slot) should
    //    leave every point exactly at its native D, with zero bending energy --
    //    same sanity check pattern used throughout this project.
    // ---------------------------------------------------------------------------
    {
      const { D, nativeD, u } = computeCylinderD(X, [{ D: 0 }, { D: 180 }]);
      for (let i = 0; i < X; i++) {
        assertClose(D[i], nativeD[i], 1e-9, `D[${i}] stays at its native angle when anchors add no displacement`);
      }
      assertClose(bendingEnergy(u), 0, 1e-12, 'zero-displacement anchors give zero bending energy');
    }

    // ---------------------------------------------------------------------------
    // 3. The example data from the task: anchorOne (D=0.0) lands exactly on
    //    native index 0 (already a perfect match); anchorTwo (D=47.0) is
    //    nearest to native index 2 (60 degrees, native index 1 is 30 degrees --
    //    |60-47|=13 vs |30-47|=17, so index 2 wins) and is pinned there exactly.
    // ---------------------------------------------------------------------------
    {
      const { D, anchorIndices } = computeCylinderD(X, [anchorOne, anchorTwo]);
      assert(anchorIndices[0] === 0, `anchorOne (D=0.0) assigned to native index 0, got ${anchorIndices[0]}`);
      assert(anchorIndices[1] === 2, `anchorTwo (D=47.0) assigned to nearest available index 2, got ${anchorIndices[1]}`);
      assertClose(D[anchorIndices[0]], 0.0, 1e-9, 'anchorOne lands exactly on its requested D');
      assertClose(D[anchorIndices[1]], 47.0, 1e-9, 'anchorTwo lands exactly on its requested D');
      assert(D.every((d) => d >= 0 && d < 360), 'every D is normalized into [0, 360)');
      assert(D.every(Number.isFinite), 'every D is finite (no NaN)');
    }

    // ---------------------------------------------------------------------------
    // 4. Smoothness: no abrupt jump in curvature anywhere around the ring.
    // ---------------------------------------------------------------------------
    {
      const { u } = computeCylinderD(X, [anchorOne, anchorTwo]);
      const curvature = [];
      for (let i = 0; i < X; i++) {
        curvature.push(u[(i + 1) % X] - 2 * u[i] + u[(i - 1 + X) % X]);
      }
      let maxJump = 0;
      for (let i = 0; i < curvature.length; i++) {
        maxJump = Math.max(maxJump, Math.abs(curvature[i] - curvature[(i - 1 + curvature.length) % curvature.length]));
      }
      const scale = Math.max(...u.map(Math.abs)) || 1;
      assert(maxJump < 0.5 * scale, `curvature changes gradually around the ring (maxJump=${maxJump}, scale=${scale})`);
    }

    // ---------------------------------------------------------------------------
    // 5. findNearestAvailableSlot excludes already-used indices, so two close
    //    anchors don't collide on the same slot.
    // ---------------------------------------------------------------------------
    {
      const nativeD = Array.from({ length: X }, (_, i) => (i * 360) / X); // 0,30,60,...
      const first = findNearestAvailableSlot(nativeD, 5, []); // nearest to 0
      assert(first === 0, `first anchor near D=5 takes index 0, got ${first}`);
      const second = findNearestAvailableSlot(nativeD, 5, [first]); // same target, but 0 is taken
      assert(second !== first, 'second anchor with a near-duplicate target is NOT assigned the same slot');
      assert(second === 1 || second === 11, `second anchor takes the next-nearest available slot, got ${second}`);
    }

    // ---------------------------------------------------------------------------
    // 6. computeCylinderR: a CLOSED ring (computeCircularBendingDisplacements,
    //    no artificial "seam" pin -- see cylinder-deform.js's module doc for
    //    why an earlier seam-based design was replaced), pinned at exactly the
    //    two anchors' own R, floored to minChroma elsewhere, then convexified.
    //    Full convexity (the "heart shape" bug and its fix) has its own
    //    dedicated sweep in test-cylinder-ring-convexity.js; this section
    //    covers computeCylinderR's basic value contract.
    // ---------------------------------------------------------------------------
    {
      const minChroma = 0.2;
      const R = computeCylinderR(X, 0, 2, anchorOne.R, anchorTwo.R, minChroma);
      assert(R.length === X, `computeCylinderR returns ${X} values, got ${R.length}`);
      assertClose(R[0], anchorOne.R, 1e-9, 'R at anchorOne\'s D-index (0) is exactly anchorOne\'s value');
      assertClose(R[2], 0.6, 1e-9, 'R at anchorTwo\'s D-index (2) is exact');
      assert(R.every(Number.isFinite), 'every R value is finite');
      assert(R.every((v) => v >= 0 && v <= 1 + 1e-9), 'every R value stays within [0,1]');
      R.forEach((v, i) => {
        if (i === 0 || i === 2) return; // the two anchors -- exempt from the floor
        assert(v >= minChroma - 1e-9, `R[${i}]=${v} respects the minChroma floor away from the anchors`);
      });
    }

    // There is no longer a privileged "seam" index anywhere in the model --
    // computeCylinderR is fully determined by the two anchors' own positions
    // and values, so which native D-index ends up lowest should just track
    // where minChroma's floor binds, not any fixed index. Direct regression
    // for the original "last hue before 360 always has minimum chroma" report:
    // sweep every anchor index pair and confirm D-index X-1 isn't
    // disproportionately forced to the ring's minimum.
    {
      let lastIndexAtMinCount = 0;
      let totalConfigs = 0;
      for (let a1 = 0; a1 < X; a1++) {
        for (let a2 = 0; a2 < X; a2++) {
          if (a1 === a2) continue;
          totalConfigs++;
          const R = computeCylinderR(X, a1, a2, 0.7, 0.6, 0.2);
          if (Math.abs(R[X - 1] - Math.min(...R)) < 1e-6) lastIndexAtMinCount++;
        }
      }
      const lastIndexMinShare = lastIndexAtMinCount / totalConfigs;
      assert(lastIndexMinShare < 0.15, `the last D-index (X-1) is the ring's exact minimum in fewer than 15% of configs (no index is structurally privileged any more), got ${(lastIndexMinShare * 100).toFixed(1)}%`);
    }

    // Away from both anchors, R is exactly minChroma when neither anchor's own
    // value pulls it any higher (both anchors far below minChroma).
    {
      const R = computeCylinderR(X, 3, 8, 0.05, 0.05, 0.15);
      assertClose(R[0], 0.15, 1e-9, 'R away from both anchors floors to exactly minChroma');
      assertClose(R[3], 0.05, 1e-9, 'R at anchorOne\'s D-index (3) is exact even though it is below the floor');
      assertClose(R[8], 0.05, 1e-9, 'R at anchorTwo\'s D-index (8) is exact even though it is below the floor');
    }

    // Zero-energy sanity check: if minChroma and both anchors' R all share the
    // same value, the whole ring should be exactly flat (constant R) -- a
    // degenerate circle with zero bending energy, already convex.
    {
      const R = computeCylinderR(X, 3, 8, 0.5, 0.5, 0.5);
      R.forEach((v, i) => assertClose(v, 0.5, 1e-9, `R[${i}] is exactly 0.5 when minChroma and both anchors are all 0.5`));
    }

    // An anchor at native D-index 0 no longer needs any special-case handling
    // (there's no seam to collide with) -- its own value still lands exactly.
    {
      const R = computeCylinderR(X, 5, 0, 0.3, 0.9, 0.1);
      assertClose(R[0], 0.9, 1e-9, 'anchorTwo at D-index 0 lands exactly on its own value');
      assertClose(R[5], 0.3, 1e-9, 'anchorOne (not at index 0) lands exactly on its own value');
    }

    // REGRESSION: minChroma must have a real, visible effect even when an
    // anchor sits at native D-index 0 (the exact scenario that silently broke
    // it in an earlier seam-based design -- see cylinder-deform.js's module
    // doc). Changing minChroma must change SOME non-anchor R value.
    {
      const Ra = computeCylinderR(X, 0, 2, anchorOne.R, anchorTwo.R, 0.1);
      const Rb = computeCylinderR(X, 0, 2, anchorOne.R, anchorTwo.R, 0.9);
      const anyDifferent = Ra.some((v, i) => Math.abs(v - Rb[i]) > 1e-6);
      assert(anyDifferent, 'changing minChroma changes at least one R value, even when anchorOne sits at D-index 0');
    }

    // ---------------------------------------------------------------------------
    // 7. computeCylinderZLevels: 10-level stack bounded by user-adjustable
    //    minL/maxL (not hardcoded 0/1), both anchor Z values land exactly.
    // ---------------------------------------------------------------------------
    {
      const { zLevels, anchorOneZIndex, anchorTwoZIndex } = computeCylinderZLevels(10, anchorOne.Z, anchorTwo.Z, 0, 1);
      assert(zLevels.length === 10, `computeCylinderZLevels returns 10 levels, got ${zLevels.length}`);
      assertClose(zLevels[0], 0, 1e-9, 'the lowest Z-level is exactly minL (0)');
      assertClose(zLevels[9], 1, 1e-9, 'the highest Z-level is exactly maxL (1)');
      assertClose(zLevels[anchorOneZIndex], anchorOne.Z, 1e-9, 'anchorOne.Z lands exactly at its assigned level');
      assertClose(zLevels[anchorTwoZIndex], anchorTwo.Z, 1e-9, 'anchorTwo.Z lands exactly at its assigned level');
      for (let i = 1; i < zLevels.length; i++) assert(zLevels[i] > zLevels[i - 1], 'Z-levels are strictly increasing');

      // anchorTwo.Z (0.3) < anchorOne.Z (0.4), so anchorTwo's level must come
      // BEFORE anchorOne's in the sorted stack -- this is the "identity
      // assigned by sorted value" behavior, not by input order.
      assert(anchorTwoZIndex < anchorOneZIndex, 'the smaller Z value (anchorTwo) lands at a lower level than the larger one (anchorOne)');
    }

    // Custom (non-default) minL/maxL bounds are honored exactly, and an anchor
    // Z value outside [minL, maxL] is still handled gracefully (it just becomes
    // the new extreme via the sorted-value reassignment, same as line.html's
    // Pin One/Four behavior).
    {
      const { zLevels, anchorOneZIndex } = computeCylinderZLevels(10, 0.9, 0.5, 0.2, 0.8);
      assertClose(zLevels[0], 0.2, 1e-9, 'the lowest Z-level is exactly the custom minL (0.2)');
      assertClose(zLevels[9], 0.9, 1e-9, 'anchorOne.Z (0.9), being outside [0.2,0.8], becomes the new highest level instead of maxL');
      assert(anchorOneZIndex === 9, 'anchorOne.Z is reassigned to the top slot when it exceeds maxL');
    }

    // If anchorOne.Z > anchorTwo.Z (the opposite order from the example data),
    // the level assignment should flip accordingly -- proving it's driven by
    // value, not which anchor is "first".
    {
      const { anchorOneZIndex, anchorTwoZIndex } = computeCylinderZLevels(10, 0.8, 0.2, 0, 1);
      assert(anchorTwoZIndex < anchorOneZIndex, 'when anchorTwo.Z < anchorOne.Z, anchorTwo still lands lower, regardless of which anchor is "one" or "two"');
    }

    // ---------------------------------------------------------------------------
    // 8. computeCylinderRGrid: chroma tapers per column, bulging to the ring
    //    value at each anchor's own Z-index and reducing toward minChroma at
    //    the very top/bottom -- the "egg-shaped" behavior.
    // ---------------------------------------------------------------------------
    {
      const ringR = [0.7, 0.5, 0.6, 0.4, 0.3, 0.5, 0.6, 0.4, 0.3, 0.5, 0.6, 0.4];
      const anchorIndices = [0, 2];
      const anchorZIndices = [6, 3]; // anchorOne at zIndex 6, anchorTwo at zIndex 3
      const minChroma = 0.15;
      const numZ = 10;
      const { RGrid, maxedOutColumns } = computeCylinderRGrid(ringR, numZ, minChroma, anchorIndices, anchorZIndices);

      assert(RGrid.length === numZ, `RGrid has ${numZ} rows (Z-levels), got ${RGrid.length}`);
      assert(maxedOutColumns.length === ringR.length, `maxedOutColumns has one entry per D-index, got ${maxedOutColumns.length}`);
      assert(maxedOutColumns.every((v) => v === false), 'none of these mild, centered anchors need the floor raised');
      assert(RGrid.every((row) => row.length === ringR.length), 'every RGrid row has one value per D-index');

      // Top and bottom of every column are pinned exactly to minChroma.
      for (let i = 0; i < ringR.length; i++) {
        assertClose(RGrid[0][i], minChroma, 1e-9, `column ${i} is exactly minChroma at the bottom (zIndex 0)`);
        assertClose(RGrid[numZ - 1][i], minChroma, 1e-9, `column ${i} is exactly minChroma at the top (zIndex ${numZ - 1})`);
      }

      // Each anchor's own column lands exactly on its ring value at its OWN
      // Z-index (not some generic shared equator) -- this is what preserves
      // exact color reproduction for the anchor points.
      assertClose(RGrid[anchorZIndices[0]][anchorIndices[0]], ringR[anchorIndices[0]], 1e-9, 'anchorOne\'s column hits its ring value exactly at anchorOne\'s own Z-index');
      assertClose(RGrid[anchorZIndices[1]][anchorIndices[1]], ringR[anchorIndices[1]], 1e-9, 'anchorTwo\'s column hits its ring value exactly at anchorTwo\'s own Z-index');

      // A non-anchor column should be smaller near the top/bottom than at its
      // interior peak -- the actual "egg" taper.
      const col = RGrid.map((row) => row[5]);
      const peak = Math.max(...col);
      assert(col[0] < peak && col[numZ - 1] < peak, 'a non-anchor column tapers down toward the top and bottom relative to its interior peak');
    }

    // ---------------------------------------------------------------------------
    // 9. computeCylinderPoints: full 120-point structure (10 Z-levels x 12
    //    D-indices), and the two points that exactly reproduce the original
    //    anchors in full (D, Z, R), even with the R-taper applied.
    // ---------------------------------------------------------------------------
    {
      const { points, D, R, zLevels, anchorIndices, anchorZIndices, chromaMaxedOut, maxedOutColumns } = computeCylinderPoints(X, 10, [anchorOne, anchorTwo], 0.2, 0, 1);
      assert(points.length === 120, `computeCylinderPoints returns 120 points, got ${points.length}`);
      assert(D.length === X, 'D has 12 values');
      assert(R.length === 10 && R.every((row) => row.length === X), 'R is a 10x12 grid (Z-levels x D-indices)');
      assert(zLevels.length === 10, 'zLevels has 10 values');
      assert(chromaMaxedOut === false, 'these mild, mid-stack anchors (R=0.7/0.6, Z=0.4/0.3) never need the floor raised');
      assert(maxedOutColumns.length === X && maxedOutColumns.every((v) => v === false), 'maxedOutColumns agrees, entry per D-index');

      const anchorPoints = points.filter((p) => p.isAnchor);
      assert(anchorPoints.length === 2, `exactly 2 of the 120 points are flagged as anchors, got ${anchorPoints.length}`);

      const p1 = anchorPoints.find((p) => p.anchorPos === 0);
      assertClose(p1.D, anchorOne.D, 1e-9, 'the anchorOne point has the exact requested D');
      assertClose(p1.Z, anchorOne.Z, 1e-9, 'the anchorOne point has the exact requested Z');
      assertClose(p1.R, anchorOne.R, 1e-9, 'the anchorOne point has the exact requested R, even with per-column tapering applied');
      assert(p1.dIndex === anchorIndices[0] && p1.zIndex === anchorZIndices[0], 'the anchorOne point sits at the expected (dIndex, zIndex)');

      const p2 = anchorPoints.find((p) => p.anchorPos === 1);
      assertClose(p2.D, anchorTwo.D, 1e-9, 'the anchorTwo point has the exact requested D');
      assertClose(p2.Z, anchorTwo.Z, 1e-9, 'the anchorTwo point has the exact requested Z');
      assertClose(p2.R, anchorTwo.R, 1e-9, 'the anchorTwo point has the exact requested R, even with per-column tapering applied');

      const nonAnchors = points.filter((p) => !p.isAnchor);
      assert(nonAnchors.length === 118, `118 non-anchor points, got ${nonAnchors.length}`);
      assert(nonAnchors.every((p) => Number.isFinite(p.D) && Number.isFinite(p.Z) && Number.isFinite(p.R)), 'every point (D, Z, R) is a real, finite number -- no null placeholders remain');

      // Every point pulls its R from the RGrid at its own (zIndex, dIndex).
      for (let k = 0; k < 10; k++) {
        for (let i = 0; i < X; i++) {
          const p = points[k * X + i];
          assertClose(p.D, D[i], 1e-9, `point (zIndex=${k}, dIndex=${i}) has the ring's D value`);
          assertClose(p.R, R[k][i], 1e-9, `point (zIndex=${k}, dIndex=${i}) has RGrid[k][i]`);
          assertClose(p.Z, zLevels[k], 1e-9, `point (zIndex=${k}, dIndex=${i}) has that level's Z value`);
        }
      }

      // The bottom and top Z-levels should be substantially less saturated
      // (closer to minChroma) than the middle levels, for a typical column --
      // the visible "egg" shape.
      const midColumn = points.filter((p) => p.dIndex === 6).sort((a, b) => a.zIndex - b.zIndex).map((p) => p.R);
      assert(midColumn[0] < Math.max(...midColumn), 'the bottom of a column is less saturated than its peak');
      assert(midColumn[9] < Math.max(...midColumn), 'the top of a column is less saturated than its peak');
    }

    // ---------------------------------------------------------------------------
    // 10. Input validation.
    // ---------------------------------------------------------------------------
    {
      let threw = false;
      try { computeCircularBendingDisplacements(X, []); } catch (e) { threw = true; }
      assert(threw, 'rejects zero pins (no unique solution on a ring with nothing fixed)');

      threw = false;
      try {
        computeCircularBendingDisplacements(X, [{ index: 0, value: 1 }, { index: 0, value: 2 }]);
      } catch (e) { threw = true; }
      assert(threw, 'rejects duplicate pin indices');

      threw = false;
      try { computeCircularBendingDisplacements(4, [{ index: 0, value: 1 }]); } catch (e) { threw = true; }
      assert(threw, 'rejects X < 5');
    }

    // ---------------------------------------------------------------------------
    // 11. EXPERIMENTAL: computeAdaptiveChromaFloor prevents the Z-column
    //     overshoot/plateau bug that shows up when an anchor's equator pin
    //     sits close to one end of the stack with a high chroma value.
    // ---------------------------------------------------------------------------
    {
      const numZ = 10;

      // A centered, mild equator: no correction should be needed at all --
      // the whole point of doing this per-column instead of raising a
      // global floor is that ordinary palettes are untouched.
      {
        const requestedFloor = 0.15;
        const { floor, maxedOut } = computeAdaptiveChromaFloor(numZ, 0.6, 5, requestedFloor);
        assertClose(floor, requestedFloor, 1e-9, 'a centered, mild equator needs no floor correction');
        assert(maxedOut === false, 'and is not flagged as maxed out');
      }

      // The documented worst case: equator one step in from the end, at the
      // gamut ceiling. Confirm the UNCORRECTED column actually overshoots
      // past 1 (the bug this exists to fix), then confirm the corrected
      // floor brings the whole column back to within [requestedFloor, 1].
      {
        const requestedFloor = 0.05;
        const equatorValue = 1.0;
        const equatorZIndex = 1;

        const uncorrected = computeLineBendingDisplacements(numZ, [
          { index: 0, value: requestedFloor },
          { index: numZ - 1, value: requestedFloor },
          { index: equatorZIndex, value: equatorValue },
        ]);
        assert(Math.max(...uncorrected) > 1, `sanity check: the naive column really does overshoot past 1 (got ${Math.max(...uncorrected).toFixed(3)}), confirming this test exercises the bug`);

        const { floor, maxedOut } = computeAdaptiveChromaFloor(numZ, equatorValue, equatorZIndex, requestedFloor);
        assert(maxedOut === true, 'this configuration is correctly flagged as needing the floor raised');
        assert(floor > requestedFloor && floor <= 1, `the corrected floor (${floor.toFixed(3)}) is raised above the request but never past the ceiling`);

        const corrected = computeLineBendingDisplacements(numZ, [
          { index: 0, value: floor },
          { index: numZ - 1, value: floor },
          { index: equatorZIndex, value: equatorValue },
        ]);
        assert(Math.max(...corrected) <= 1 + 1e-6, `the corrected column no longer overshoots past 1 (max ${Math.max(...corrected).toFixed(6)})`);

        // The correction should be the SMALLEST floor that works -- a
        // slightly smaller floor should still overshoot (otherwise this
        // isn't finding the minimal fix, just an over-cautious one).
        const almostEnough = computeLineBendingDisplacements(numZ, [
          { index: 0, value: floor - 0.01 },
          { index: numZ - 1, value: floor - 0.01 },
          { index: equatorZIndex, value: equatorValue },
        ]);
        assert(Math.max(...almostEnough) > 1 + 1e-6, 'a floor just below the corrected value still overshoots, confirming the correction is minimal, not merely sufficient');
      }

      // computeCylinderPoints propagates the flag end to end: an anchor
      // picked at a near-extreme lightness with high chroma should trip
      // chromaMaxedOut for the full palette.
      {
        const extremeAnchor = { D: 0, Z: 0.02, R: 0.98 };
        const mildAnchor = { D: 150, Z: 0.5, R: 0.4 };
        const { chromaMaxedOut } = computeCylinderPoints(12, numZ, [extremeAnchor, mildAnchor], 0.05, 0, 1);
        assert(chromaMaxedOut === true, 'a near-white/black, highly saturated anchor trips the palette-wide maxed-out flag');
      }
    }

    // ---------------------------------------------------------------------------

    expect(failed, failed + ' assertion(s) failed -- see console output above for FAIL: details').toBe(0);
  });
});
