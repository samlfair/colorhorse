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
  computeChromaFloor,
  computeColumnPeak,
  contrastCurve,
  computeEquatorZRing,
  MIN_CHROMA_FLOOR,
  bendingEnergy,
} from './cylinder-deform.js';

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
        assert(v >= minChroma - 1e-9, `R[${i}]=${v} respects the minChroma floor`);
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

    // A floor requested above both anchors is pulled down to the lower
    // anchor's R: the anchors stay exact and nothing anywhere sits below them.
    {
      const R = computeCylinderR(X, 3, 8, 0.05, 0.08, 0.15);
      assertClose(R[3], 0.05, 1e-9, 'R at anchorOne\'s D-index (3) is exact');
      assertClose(R[8], 0.08, 1e-9, 'R at anchorTwo\'s D-index (8) is exact');
      assert(R.every((v) => v >= 0.05 - 1e-9), 'no R falls below the lower anchor, which is now the floor');
      assert(R.every((v) => v < 0.15), 'the requested 0.15 floor no longer applies -- it sat above both anchors');
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
      const RGrid = computeCylinderRGrid(ringR, numZ, minChroma, anchorIndices, anchorZIndices);

      assert(RGrid.length === numZ, `RGrid has ${numZ} rows (Z-levels), got ${RGrid.length}`);
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
      const { points, D, R, zLevels, anchorIndices, anchorZIndices } = computeCylinderPoints(X, 10, [anchorOne, anchorTwo], 0.2, 0, 1);
      assert(points.length === 120, `computeCylinderPoints returns 120 points, got ${points.length}`);
      assert(D.length === X, 'D has 12 values');
      assert(R.length === 10 && R.every((row) => row.length === X), 'R is a 10x12 grid (Z-levels x D-indices)');
      assert(zLevels.length === 10, 'zLevels has 10 values');

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
    // 11. computeColumnPeak: the peak sits mid-column until it would have to
    //     exceed the gamut ceiling, then slides toward the shade the column
    //     must pass through, reaching it exactly when that chroma is 1.
    // ---------------------------------------------------------------------------
    {
      const numZ = 10;
      const mid = (numZ - 1) / 2;
      const floor = 0.1;
      const column = (z, value) => {
        const { peakZ, peakValue } = computeColumnPeak(numZ, z, value, floor);
        const grid = computeCylinderRGrid([value, floor, floor, floor, floor], numZ, floor, [0, 1], [z, z]);
        return { peakZ, peakValue, values: grid.map((row) => row[0]) };
      };

      for (const z of [2, 7]) {
        const low = column(z, 0.4);
        assertClose(low.peakZ, mid, 1e-9, `z=${z}, low chroma: the peak stays mid-column`);
        assert(low.peakValue > 0.4 && low.peakValue < 1, `z=${z}, low chroma: the mid-column peak (${low.peakValue.toFixed(3)}) is above the anchor and below the ceiling`);

        const sliding = column(z, 0.88);
        assertClose(sliding.peakValue, 1, 1e-9, `z=${z}, high chroma: the peak is capped at the ceiling`);
        assert(Math.abs(sliding.peakZ - mid) > 0.1 && Math.abs(sliding.peakZ - z) > 0.1 && (sliding.peakZ - mid) * (z - mid) > 0, `z=${z}, high chroma: the peak (${sliding.peakZ.toFixed(3)}) has moved from mid-column toward the anchor, but not reached it`);

        const full = column(z, 1);
        assertClose(full.peakZ, z, 1e-9, `z=${z}, chroma 1: the anchor's own shade is the peak`);
        assert(full.values[Math.round(mid)] < 1 - 0.01, `z=${z}, chroma 1: the middle shade is no longer special (${full.values[Math.round(mid)].toFixed(3)})`);

        for (const [label, c] of [['low', low], ['sliding', sliding], ['full', full]]) {
          const v = c.values;
          assertClose(v[z], label === 'low' ? 0.4 : label === 'sliding' ? 0.88 : 1, 1e-9, `z=${z}, ${label}: the column passes exactly through the anchor`);
          // Only the end farther from the peak is pinned to the floor.
          const peakZ = c.peakZ;
          const [farEnd, nearEnd] = peakZ >= mid ? [0, numZ - 1] : [numZ - 1, 0];
          assertClose(v[farEnd], floor, 1e-9, `z=${z}, ${label}: the end farther from the peak is the floor`);
          if (Math.abs(peakZ - mid) < 1e-9) {
            assertClose(v[nearEnd], floor, 1e-9, `z=${z}, ${label}: a centred peak puts both ends at the floor`);
          } else {
            assert(v[nearEnd] > floor + 1e-3, `z=${z}, ${label}: an off-centre peak leaves the nearer end above the floor (${v[nearEnd].toFixed(3)})`);
          }
          // Symmetric about the peak: shades equidistant from it match.
          for (let d = 1; peakZ - d >= 0 && peakZ + d <= numZ - 1; d++) {
            if (Number.isInteger(peakZ)) assertClose(v[peakZ - d], v[peakZ + d], 1e-9, `z=${z}, ${label}: shades ${d} either side of the peak match`);
          }
          assert(v.every((x) => x >= floor - 1e-9 && x <= 1 + 1e-9), `z=${z}, ${label}: every shade within [floor, 1]`);
          // Strictly rises then strictly falls: no plateau of repeated shades.
          // (A peak exactly between two shades makes those two equal; that
          // one tie is allowed.)
          const top = v.indexOf(Math.max(...v));
          let unimodal = true;
          for (let k = 1; k <= top; k++) if (!(v[k] > v[k - 1])) unimodal = false;
          for (let k = top + 1; k < numZ; k++) {
            const tieAtPeak = k === top + 1 && Math.abs(v[k] - v[top]) < 1e-9;
            if (!(v[k] < v[k - 1]) && !tieAtPeak) unimodal = false;
          }
          assert(unimodal, `z=${z}, ${label}: the column strictly rises to one peak and strictly falls, got ${v.map((x) => x.toFixed(2)).join(',')}`);
        }
      }

      // Continuity: sweeping the anchor's chroma through all three phases,
      // the column never jumps. (It is steepest just below chroma 1: the
      // bump is flat at its peak, so the last sliver of chroma moves the
      // peak -- and with it the nearer end -- the furthest. Hence the fine
      // step.)
      for (const z of [1, 3, 6, 8]) {
        let previous = null;
        let maxStep = 0;
        for (let value = floor; value <= 1 + 1e-9; value += 0.0001) {
          const { values } = column(z, Math.min(value, 1));
          if (previous) maxStep = Math.max(maxStep, ...values.map((x, k) => Math.abs(x - previous[k])));
          previous = values;
        }
        assert(maxStep < 0.02, `z=${z}: a 0.0001 chroma step never moves any shade by more than 0.02 (max ${maxStep.toFixed(4)})`);
      }

      // An anchor at the very end of the column is fine: at full chroma it
      // becomes the peak, and the bump tapers to the floor at the other end.
      for (const z of [0, numZ - 1]) {
        const { values, peakZ } = column(z, 1);
        assertClose(peakZ, z, 1e-9, `an anchor at end shade ${z} with chroma 1 is the peak`);
        assertClose(values[z], 1, 1e-9, `...and is reproduced exactly`);
        assertClose(values[numZ - 1 - z], floor, 1e-9, `...and the opposite end is the floor`);
      }

      let threw = false;
      try { computeColumnPeak(numZ, -0.5, 0.5, floor); } catch (e) { threw = true; }
      assert(threw, 'rejects an equator outside the column');
    }

    // ---------------------------------------------------------------------------
    // 12. The chroma floor: within [MIN_CHROMA_FLOOR, the lower anchor's R].
    // ---------------------------------------------------------------------------
    {
      assertClose(computeChromaFloor(0.2, [0.7, 0.6]), 0.2, 1e-12, 'an in-range request is used as-is');
      assertClose(computeChromaFloor(0.5, [0.7, 0.3]), 0.3, 1e-12, 'a request above an anchor is pulled down to that anchor');
      assertClose(computeChromaFloor(0, [0.7, 0.6]), MIN_CHROMA_FLOOR, 1e-12, 'a request below the minimum is raised to it');
      assertClose(computeChromaFloor(0.2, [0.7, 0.004]), 0.004, 1e-12, 'a near-gray anchor drags the floor below the minimum');

      const gray = { D: 0, Z: 0.5, R: 0.03 };
      const vivid = { D: 150, Z: 0.4, R: 0.8 };
      const { R, points } = computeCylinderPoints(12, 10, [gray, vivid], 0.2, 0, 1);
      assert(R.every((row) => row.every((v) => v >= 0.03 - 1e-9)), 'no shade anywhere sits below the grayer anchor');
      assertClose(points.find((p) => p.anchorPos === 0).R, 0.03, 1e-9, 'the gray anchor is reproduced exactly');
      assertClose(R[0][5], 0.03, 1e-9, 'the floor at the end of every column is the gray anchor\'s chroma');
    }

    // ---------------------------------------------------------------------------
    // 13. Full palette with an extreme anchor (near-white, at the gamut
    //     ceiling): every column still tapers to the floor at both ends --
    //     the regression this model replaced, where such an anchor flattened
    //     its own column (and its neighbours) to full chroma everywhere.
    //     (Only the end farther from each column's peak is pinned to the
    //     floor; the nearer end follows the symmetric curve.)
    // ---------------------------------------------------------------------------
    {
      const numZ = 10;
      const minChroma = 0.1;
      const extremeAnchor = { D: 30, Z: 0.85, R: 1.0 };
      const mildAnchor = { D: 210, Z: 0.5, R: 0.55 };
      const cyl = computeCylinderPoints(12, numZ, [extremeAnchor, mildAnchor], minChroma, 0.05, 0.97);
      const [extremeIndex] = cyl.anchorIndices;
      const extremeZ = cyl.anchorZIndices[0];

      for (let i = 0; i < 12; i++) {
        const column = cyl.R.map((row) => row[i]);
        assertClose(Math.min(column[0], column[numZ - 1]), minChroma, 1e-9, `column ${i} reaches the floor at one end`);
        assert(Math.max(column[0], column[numZ - 1]) < Math.max(...column), `column ${i}'s other end still tapers below the peak`);
        assert(column.every((v) => v <= 1 + 1e-9), `column ${i} never exceeds the ceiling`);
        assert(column.filter((v) => v > 1 - 1e-6).length <= 1, `column ${i} has no plateau at the ceiling`);
      }
      const extremeColumn = cyl.R.map((row) => row[extremeIndex]);
      assertClose(Math.max(...extremeColumn), 1, 1e-9, 'the extreme anchor\'s column peaks at the ceiling...');
      assert(extremeColumn.indexOf(Math.max(...extremeColumn)) === extremeZ, '...at the anchor\'s own shade');

      // Neighbouring hues change gradually: no cliff between adjacent
      // columns. The nearer end is the steepest place -- it rides on how far
      // each hue's peak has slid -- so this bound is looser than the shapes'.
      for (let i = 0; i < 12; i++) {
        const j = (i + 1) % 12;
        const maxDiff = Math.max(...cyl.R.map((row) => Math.abs(row[i] - row[j])));
        assert(maxDiff < 0.5, `columns ${i} and ${j} differ by at most 0.5 at any shade (got ${maxDiff.toFixed(3)})`);
      }

      // equatorZ is imputed between the anchors' shades, and grades around the ring.
      const equatorZ = computeEquatorZRing(12, cyl.anchorIndices, cyl.anchorZIndices);
      const lowZ = Math.min(...cyl.anchorZIndices);
      const highZ = Math.max(...cyl.anchorZIndices);
      assert(equatorZ[cyl.anchorIndices[0]] === cyl.anchorZIndices[0] && equatorZ[cyl.anchorIndices[1]] === cyl.anchorZIndices[1], 'anchor columns keep their own shade exactly');
      assert(equatorZ.every((z) => z >= lowZ && z <= highZ), `every equatorZ is between the anchors' shades (${lowZ}..${highZ}), got ${equatorZ.map((z) => z.toFixed(2)).join(',')}`);
      assert(new Set(equatorZ.map((z) => z.toFixed(6))).size > 2, 'equatorZ grades around the ring rather than being shared');

      const tiny = computeEquatorZRing(2, [1, 1], [3, 3]);
      assert(tiny.every((z) => z === 3), 'a ring with one anchor column gives every column that anchor\'s shade');
    }

    // ---------------------------------------------------------------------------
    // 14. Contrast: biases the Z-level stack's free shades toward both ends.
    // ---------------------------------------------------------------------------
    {
      const numZ = 10;
      const [minL, maxL] = [0.05, 0.97];

      // contrastCurve: identity at 0, symmetric S-curve at 1.
      for (const t of [0, 0.1, 0.3, 0.5, 0.8, 1]) {
        assertClose(contrastCurve(t, 0), t, 1e-12, `contrastCurve(${t}, 0) is the identity`);
        assertClose(contrastCurve(t, 1) + contrastCurve(1 - t, 1), 1, 1e-12, `contrastCurve(., 1) is symmetric about 0.5 at t=${t}`);
      }

      // REGRESSION: contrast 0 reproduces the plain line model exactly. (These
      // values are the pre-contrast implementation's output.)
      {
        const { zLevels, anchorOneZIndex, anchorTwoZIndex } = computeCylinderZLevels(numZ, 0.62, 0.35, minL, maxL, 0);
        const expected = [0.05, 0.15, 0.25, 0.35, 0.44, 0.53, 0.62, 0.73, 0.85, 0.97];
        zLevels.forEach((z, i) => assertClose(z, expected[i], 0.006, `contrast 0: zLevels[${i}] matches the plain line model`));
        assert(anchorOneZIndex === 6 && anchorTwoZIndex === 3, 'contrast 0: anchors keep their plain-model slots');
      }

      // Rising contrast: anchors and ends stay exact, the stack stays
      // strictly increasing, and the shades just inside each end move
      // further out toward that end.
      {
        let previous = null;
        for (const contrast of [0, 0.25, 0.5, 0.75, 1]) {
          const { zLevels, anchorOneZIndex, anchorTwoZIndex } = computeCylinderZLevels(numZ, 0.62, 0.35, minL, maxL, contrast);
          assertClose(zLevels[0], minL, 1e-12, `contrast ${contrast}: the darkest shade is exactly minL`);
          assertClose(zLevels[numZ - 1], maxL, 1e-12, `contrast ${contrast}: the lightest shade is exactly maxL`);
          assertClose(zLevels[anchorOneZIndex], 0.62, 1e-12, `contrast ${contrast}: anchorOne lands exactly`);
          assertClose(zLevels[anchorTwoZIndex], 0.35, 1e-12, `contrast ${contrast}: anchorTwo lands exactly`);
          for (let i = 1; i < numZ; i++) assert(zLevels[i] > zLevels[i - 1], `contrast ${contrast}: Z-levels stay strictly increasing (${i})`);
          if (previous) {
            assert(zLevels[1] <= previous[1] + 1e-12, `contrast ${contrast}: shade 1 is no lighter than at lower contrast (${zLevels[1].toFixed(3)} vs ${previous[1].toFixed(3)})`);
            assert(zLevels[numZ - 2] >= previous[numZ - 2] - 1e-12, `contrast ${contrast}: shade ${numZ - 2} is no darker than at lower contrast (${zLevels[numZ - 2].toFixed(3)} vs ${previous[numZ - 2].toFixed(3)})`);
          }
          previous = zLevels;
        }
        const flat = computeCylinderZLevels(numZ, 0.62, 0.35, minL, maxL, 0).zLevels;
        assert(previous[numZ - 2] - flat[numZ - 2] > 0.05, `full contrast moves the second-lightest shade noticeably toward white (${flat[numZ - 2].toFixed(3)} -> ${previous[numZ - 2].toFixed(3)})`);
      }

      // Symmetric: mirroring every input mirrors the stack.
      {
        const a = computeCylinderZLevels(numZ, 0.3, 0.6, 0.1, 0.9, 0.6).zLevels;
        const b = computeCylinderZLevels(numZ, 0.7, 0.4, 0.1, 0.9, 0.6).zLevels;
        a.forEach((z, i) => assertClose(z, 1 - b[numZ - 1 - i], 1e-9, `mirrored inputs give a mirrored stack at shade ${i}`));
      }

      // Threads through computeCylinderPoints, anchors still exact in full 3D.
      {
        const { points, zLevels } = computeCylinderPoints(12, numZ, [anchorOne, anchorTwo], 0.2, 0, 1, 0.8);
        const p1 = points.find((p) => p.anchorPos === 0);
        const p2 = points.find((p) => p.anchorPos === 1);
        assertClose(p1.Z, anchorOne.Z, 1e-12, 'with contrast, anchorOne\'s point keeps its exact Z');
        assertClose(p2.Z, anchorTwo.Z, 1e-12, 'with contrast, anchorTwo\'s point keeps its exact Z');
        assertClose(p1.R, anchorOne.R, 1e-9, 'with contrast, anchorOne\'s point keeps its exact R');
        const plain = computeCylinderPoints(12, numZ, [anchorOne, anchorTwo], 0.2, 0, 1).zLevels;
        assert(zLevels.some((z, i) => Math.abs(z - plain[i]) > 0.01), 'contrast actually changes the palette\'s Z-levels');
      }
    }

    // ---------------------------------------------------------------------------

    expect(failed, failed + ' assertion(s) failed -- see console output above for FAIL: details').toBe(0);
  });
});
