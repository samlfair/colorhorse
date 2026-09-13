/**
 * Validates the SHAPE of the R (chroma) axis produced by cylinder-deform.js:
 * every column of the cylinder (one hue, chroma varying with lightness)
 * should look like a "convex ovoid" -- a single smooth bulge from
 * `minChroma` at the bottom, up to a peak, back down to `minChroma` at the
 * top, the "egg-shaped" behavior the module doc describes. This file exists
 * because the bending-energy model has no built-in notion of R's physical
 * domain [0, 1] (see cylinder-deform.js's "WHY R IS CLAMPED" doc) and, left
 * unclamped, can dip below 0 -- a literal furrow cut into the cylinder,
 * which (worse than just "looking wrong") flips the rendered hue, since
 * OKLab treats negative chroma as positive chroma at the opposite hue -- or
 * dip below the user's own `minChroma` floor at hues that are neither
 * anchor, a second, subtler furrow that's still visibly wrong even though
 * it stays non-negative.
 *
 * Three different shape properties are checked, because they apply to
 * different axes/positions for different reasons:
 *
 *  - DOMAIN (0 <= R <= 1): must hold EVERYWHERE -- both the D-ring
 *    (computeCylinderR) and every Z-taper column (computeCylinderRGrid).
 *    An R value outside its physical range is always wrong.
 *
 *  - FLOOR (R >= minChroma): must hold everywhere EXCEPT at the two anchor
 *    positions (an anchor's own picked chroma can legitimately be lower
 *    than the floor the user separately set -- exact color reproduction
 *    always wins over the floor). `minChroma` is documented as the floor
 *    for the whole cylinder, not just the single seam/boundary point it
 *    happens to be pinned at exactly.
 *
 *  - UNIMODALITY (rises to a single peak, then falls -- the "convex ovoid"
 *    shape): only asserted for NON-ANCHOR Z-taper columns. Each such column
 *    is built from exactly 3 pins, all >= minChroma (both ends AT
 *    minChroma, interior floored to it too), so it should always bulge
 *    upward, never pinch. An anchor's OWN column is allowed to pinch
 *    (single valley) instead, if that anchor's chroma is below minChroma --
 *    that's the FLOOR exception above, expressed as a shape. The D-ring
 *    itself is not held to single-peak unimodality either: it has two
 *    independently-placed anchor peaks, so a real dip between two
 *    differently-hued peaks is an expected feature (two bulges), not a
 *    furrow -- only its DOMAIN and FLOOR are checked.
 *
 * Run with: node test-cylinder-chroma-shape.js
 */

import {
  computeCylinderR,
  computeCylinderRGrid,
  computeCylinderPoints,
} from './cylinder-deform.js';
import { computeLineBendingDisplacements } from './line-deform.js';

import { describe, it, expect } from 'vitest';

describe('cylinder-chroma-shape', () => {
  it('all assertions pass', () => {
    // A FROZEN copy of the seam-placement logic an earlier version of
    // computeCylinderR used internally (see cylinder-deform.js's module doc,
    // "THE R AXIS" -- that seam-based design was replaced by a closed-ring
    // solver with no seam at all). Kept here, self-contained, only so
    // rawRing() below can still document what the OLD, now-removed code used
    // to get wrong; it is NOT a claim about current behavior.
    function historicalCircularIndexDistance(a, b, X) {
      const diff = Math.abs(a - b) % X;
      return Math.min(diff, X - diff);
    }
    function historicalChooseSeamIndex(X, a1, a2) {
      let bestIdx = -1, bestScore = -1;
      for (let i = 0; i < X; i++) {
        if (i === a1 || i === a2) continue;
        const score = Math.min(historicalCircularIndexDistance(i, a1, X), historicalCircularIndexDistance(i, a2, X));
        if (score > bestScore) { bestScore = score; bestIdx = i; }
      }
      return bestIdx;
    }

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

    // ---------------------------------------------------------------------------
    // Shape-checking helpers
    // ---------------------------------------------------------------------------

    /** Every value lies in [lo, hi] (within floating-point tolerance). */
    function inDomain(arr, lo, hi, tol) {
      return arr.every((v) => v >= lo - tol && v <= hi + tol);
    }

    /**
     * A sequence is unimodal if it (weakly) rises to a single peak and then
     * (weakly) falls -- plateaus are fine, a SECOND rise after a fall (or a
     * dip below both neighbors -- a furrow) is not. Standard "walk up, then
     * walk down, did we consume the whole array" check; `tol` absorbs
     * floating-point noise so a flat run doesn't get misread as alternating
     * micro dips/peaks.
     */
    function isUnimodal(arr, tol) {
      const n = arr.length;
      let i = 0;
      while (i < n - 1 && arr[i + 1] >= arr[i] - tol) i++;
      while (i < n - 1 && arr[i + 1] <= arr[i] + tol) i++;
      return i === n - 1;
    }

    /**
     * Diagnostic companion to isUnimodal: every interior index that is a
     * strict local minimum (a literal furrow -- lower than BOTH neighbors),
     * for use in failure messages. `wrap` treats the array as circular (for
     * the D-ring) instead of open (for a Z-column).
     */
    function findFurrows(arr, tol, wrap) {
      const n = arr.length;
      const dips = [];
      const lo = wrap ? 0 : 1;
      const hi = wrap ? n - 1 : n - 2;
      for (let i = lo; i <= hi; i++) {
        const prev = arr[(i - 1 + n) % n];
        const next = arr[(i + 1) % n];
        if (arr[i] < prev - tol && arr[i] < next - tol) dips.push(i);
      }
      return dips;
    }

    const TOL = 1e-9;

    // ---------------------------------------------------------------------------
    // 1. Documenting the bug: reproduce computeCylinderR's and
    //    computeCylinderRGrid's internal solve WITHOUT any clamp, to confirm a
    //    furrow really does occur (and quantify how often) absent the fix.
    //    These raw helpers exist ONLY in this test, mirroring the pre-fix
    //    solver -- they are what cylinder-deform.js used to return.
    // ---------------------------------------------------------------------------

    function rawRing(X, a1idx, a2idx, a1R, a2R, minChroma) {
      const seamIndex = historicalChooseSeamIndex(X, a1idx, a2idx);
      const nativePins = new Map([[seamIndex, minChroma], [a1idx, a1R], [a2idx, a2R]]);
      const pins = [];
      for (let k = 0; k <= X; k++) {
        const nativeIdx = (seamIndex + k) % X;
        if (nativePins.has(nativeIdx)) pins.push({ index: k, value: nativePins.get(nativeIdx) });
      }
      const u = computeLineBendingDisplacements(X + 1, pins);
      const R = new Array(X);
      for (let k = 0; k < X; k++) R[(seamIndex + k) % X] = u[k];
      return R;
    }

    function rawColumn(numZLevels, minChroma, ringVal, equatorZIndex) {
      const pins = [
        { index: 0, value: minChroma },
        { index: numZLevels - 1, value: minChroma },
        { index: equatorZIndex, value: ringVal },
      ];
      return computeLineBendingDisplacements(numZLevels, pins);
    }

    {
      // The exact failure this ticket is about: two anchors on ADJACENT native
      // D-indices with very different R -- a plausible real choice (two
      // similar hues, very different saturation) -- sends the unclamped ring
      // deep negative between them.
      const raw = rawRing(12, 0, 1, 0.9, 0.2, 0.2);
      const rawMin = Math.min(...raw);
      assert(rawMin < 0, `sanity check: adjacent anchors with differing R DO produce negative raw chroma without the fix (got min ${rawMin.toFixed(3)}) -- this is the bug being fixed, not a false alarm`);

      // Sweep every anchor index pair (both R-value orders) and measure how
      // often the unclamped ring dips below 0 -- quantifies the bug's real
      // frequency, not just a single cherry-picked case.
      const X = 12;
      let total = 0, undershootCount = 0, worst = 0;
      const rVals = [0.9, 0.6, 0.3];
      for (let a1 = 0; a1 < X; a1++) {
        for (let a2 = 0; a2 < X; a2++) {
          if (a1 === a2) continue;
          for (const r1 of rVals) {
            for (const r2 of rVals) {
              total++;
              const R = rawRing(X, a1, a2, r1, r2, 0.2);
              const minR = Math.min(...R);
              if (minR < -1e-9) undershootCount++;
              worst = Math.min(worst, minR);
            }
          }
        }
      }
      const rate = undershootCount / total;
      assert(rate > 0.03, `unclamped ring undershoots below 0 (a hue-flipping furrow) in a real, non-negligible fraction of configs, not just one cherry-picked case: ${(rate * 100).toFixed(1)}% of ${total}, worst ${worst.toFixed(3)}`);
      assert(worst < -0.1, `the worst unclamped undershoot is severe, not a rounding-error blip: ${worst.toFixed(3)}`);
      console.log(`  (info) pre-fix negative-chroma rate across all anchor placements: ${(rate * 100).toFixed(1)}%, worst undershoot ${worst.toFixed(3)}`);
    }

    // ---------------------------------------------------------------------------
    // 2. The fix: computeCylinderR (the actual exported function) never leaves
    //    its physical domain, and never drops below minChroma except exactly
    //    at the two anchor pins, for the configs that broke above and across a
    //    full sweep.
    // ---------------------------------------------------------------------------

    {
      const minChroma = 0.2;
      const R = computeCylinderR(12, 0, 1, 0.9, 0.2, minChroma);
      assert(inDomain(R, 0, 1, TOL), `computeCylinderR stays within [0,1] for the adjacent-anchors repro case, got ${R.map((v) => v.toFixed(3))}`);
      assert(R.every((v) => v >= 0), 'no negative (hue-flipping) chroma anywhere in the ring');
      R.forEach((v, i) => {
        if (i === 0 || i === 1) return; // the two anchor positions -- exempt from the floor
        assert(v >= minChroma - TOL, `R[${i}]=${v.toFixed(3)} respects the minChroma floor (${minChroma}) away from the anchors`);
      });

      const R2 = computeCylinderR(12, 0, 1, 0.3, 0.9, minChroma);
      assert(inDomain(R2, 0, 1, TOL), `computeCylinderR stays within [0,1] for the reversed-value repro case, got ${R2.map((v) => v.toFixed(3))}`);
    }

    {
      const X = 12;
      let total = 0, domainViolations = 0, floorViolations = 0;
      const rVals = [0.95, 0.7, 0.4, 0.1, 0.02];
      const minChromas = [0, 0.15, 0.4];
      for (let a1 = 0; a1 < X; a1++) {
        for (let a2 = 0; a2 < X; a2++) {
          if (a1 === a2) continue;
          for (const r1 of rVals) {
            for (const r2 of rVals) {
              for (const mc of minChromas) {
                total++;
                const R = computeCylinderR(X, a1, a2, r1, r2, mc);
                if (!inDomain(R, 0, 1, TOL)) domainViolations++;
                const floorBroken = R.some((v, i) => i !== a1 && i !== a2 && v < mc - TOL);
                if (floorBroken) floorViolations++;
              }
            }
          }
        }
      }
      assert(domainViolations === 0, `computeCylinderR stays within [0,1] across every anchor placement and value combo tried (${domainViolations}/${total} violated)`);
      assert(floorViolations === 0, `computeCylinderR never drops below minChroma away from the two anchor positions (${floorViolations}/${total} violated)`);
      console.log(`  (info) domain+floor-checked ${total} ring configurations, 0 violations post-fix`);
    }

    // ---------------------------------------------------------------------------
    // 3. computeCylinderRGrid: the "convex ovoid" property. Each NON-ANCHOR
    //    column must be (a) within [minChroma, 1] and (b) unimodal -- a single
    //    smooth bulge, no furrow -- across every equator position (including
    //    worst-case near-boundary placements) and a wide range of ring/min
    //    values. An ANCHOR column is only held to the [0,1] domain (it may
    //    legitimately pinch if that anchor's chroma is below minChroma).
    // ---------------------------------------------------------------------------

    {
      // The worst-case overshoot scenario found by hand: the equator (an
      // anchor's own Z-index) sitting right next to a boundary. Confirm the
      // RAW solve overshoots past the ring value substantially (documenting
      // why a taper this close to an edge is inherently aggressive)...
      const raw = rawColumn(10, 0.2, 0.7, 1);
      assert(Math.max(...raw) > 1, `sanity check: an equator adjacent to the boundary overshoots the ring value substantially without clamping (peak ${Math.max(...raw).toFixed(3)})`);
      // ...but even unclamped, this particular shape is still unimodal (one
      // bulge, just an exaggerated one).
      assert(isUnimodal(raw, TOL), 'even the extreme near-boundary-equator column is unimodal before clamping (overshoot, not a furrow)');

      // A DIFFERENT raw case -- ring value BELOW minChroma at a near-boundary
      // equator -- genuinely pinches (a real single valley, since the interior
      // pin is lower than both ends): this is the anchor-column exception, not
      // a bug, and must stay a smooth single dip (still "unimodal" in the
      // valley sense: negate it and it passes the same peak test).
      const pinchRaw = rawColumn(10, 0.2, 0.05, 1);
      assert(isUnimodal(pinchRaw.map((v) => -v), TOL), 'a ring value below minChroma produces one smooth valley, not multiple wiggles, even unclamped');

      // As a NON-ANCHOR column (floored to minChroma), the same inputs must no
      // longer pinch below the floor at all -- the floor turns the valley into
      // a flat shelf at minChroma, still a single bulge shape overall. (dIndex
      // 0 is the column under test; the "anchor" for this synthetic call sits
      // at dIndex 1, so column 0 is exercised as a non-anchor column.)
      const nonAnchorCol = computeCylinderRGrid([0.05, 0.05], 10, 0.2, [1, 1], [1, 1]).RGrid.map((row) => row[0]);
      assert(inDomain(nonAnchorCol, 0.2, 1, TOL), `a non-anchor column never drops below minChroma even when its ring value would want to, got ${nonAnchorCol.map((v) => v.toFixed(3))}`);
      assert(isUnimodal(nonAnchorCol, TOL), 'a non-anchor column stays a single bulge (no furrow) once floored');

      // As the ANCHOR's own column (dIndex 0 now IS the anchor), the pinch is
      // allowed through (exact color reproduction), but must stay within
      // [0,1] and remain a single smooth valley (not a furrow with extra
      // wiggles).
      const anchorCol = computeCylinderRGrid([0.05, 0.05], 10, 0.2, [0, 0], [1, 1]).RGrid.map((row) => row[0]);
      assertAnchorColumnClean(anchorCol);
    }

    function assertAnchorColumnClean(col) {
      assert(inDomain(col, 0, 1, TOL), `an anchor column stays within [0,1] even when pinching below minChroma, got ${col.map((v) => v.toFixed(3))}`);
      assert(isUnimodal(col, TOL) || isUnimodal(col.map((v) => -v), TOL), `an anchor column is a single smooth bulge or valley, never both (a real furrow), got ${col.map((v) => v.toFixed(3))}`);
    }

    {
      // Full sweep: every equator position, a range of ring values (including
      // ones below/above minChroma, and minChroma itself at both extremes),
      // checked as a NON-ANCHOR column (dIndex 0, anchors elsewhere) for
      // domain+floor AND unimodality (no furrow) together.
      const numZLevels = 10;
      const ringVals = [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1];
      const minChromas = [0, 0.2, 0.5];
      let total = 0, boundsViolations = 0, furrows = 0;
      const furrowExamples = [];
      for (let eq = 1; eq <= numZLevels - 2; eq++) {
        for (const ringVal of ringVals) {
          for (const mc of minChromas) {
            total++;
            // dIndex 0 is the column under test; anchors are placed at
            // dIndex 5/6 so column 0 is always a NON-anchor column.
            const { RGrid } = computeCylinderRGrid([ringVal, ringVal, ringVal, ringVal, ringVal, ringVal, ringVal], numZLevels, mc, [5, 6], [eq, eq]);
            const col = RGrid.map((row) => row[0]);
            if (!inDomain(col, mc, 1, TOL)) boundsViolations++;
            if (!isUnimodal(col, TOL)) {
              furrows++;
              if (furrowExamples.length < 3) furrowExamples.push({ eq, ringVal, mc, col, dips: findFurrows(col, TOL, false) });
            }
          }
        }
      }
      assert(boundsViolations === 0, `every non-anchor Z-taper column stays within [minChroma,1] across the full equator/ring-value/minChroma sweep (${boundsViolations}/${total} violated)`);
      assert(furrows === 0, `every non-anchor Z-taper column is unimodal (convex ovoid, no furrow) across the full sweep (${furrows}/${total} failed) -- examples: ${JSON.stringify(furrowExamples)}`);
      console.log(`  (info) shape-checked ${total} non-anchor Z-taper columns, 0 bound violations, 0 furrows post-fix`);
    }

    // ---------------------------------------------------------------------------
    // 4. End-to-end, through the full pipeline (computeCylinderPoints): for a
    //    battery of realistic anchor pairs (varying D, Z, and R together, the
    //    way real color picks would), every point's R is in-domain, every
    //    NON-anchor per-hue column (fixed dIndex, all 10 Z-levels) is unimodal
    //    and >= minChroma, and every ANCHOR column is at worst a single valley.
    // ---------------------------------------------------------------------------

    {
      const X = 12, numZLevels = 10;
      const configs = [
        { a1: { D: 0, Z: 0.4, R: 0.9 }, a2: { D: 20, Z: 0.5, R: 0.2 }, minChroma: 0.2, minL: 0, maxL: 1 }, // adjacent D, very different R
        { a1: { D: 0, Z: 0.05, R: 0.95 }, a2: { D: 180, Z: 0.95, R: 0.9 }, minChroma: 0.1, minL: 0, maxL: 1 }, // anchors near Z boundaries
        { a1: { D: 10, Z: 0.5, R: 1.0 }, a2: { D: 15, Z: 0.5, R: 0.05 }, minChroma: 0, minL: 0, maxL: 1 }, // near-coincident D, extreme R gap
        { a1: { D: 350, Z: 0.3, R: 0.7 }, a2: { D: 10, Z: 0.7, R: 0.6 }, minChroma: 0.3, minL: 0.1, maxL: 0.9 }, // wraps across 360, minChroma > 0 and narrower L band
        { a1: { D: 90, Z: 0.5, R: 0.5 }, a2: { D: 270, Z: 0.5, R: 0.5 }, minChroma: 0.2, minL: 0, maxL: 1 }, // opposite hues, equal R (baseline sanity)
        { a1: { D: 5, Z: 0.5, R: 0.05 }, a2: { D: 200, Z: 0.5, R: 0.9 }, minChroma: 0.4, minL: 0, maxL: 1 }, // anchorOne's own chroma BELOW minChroma (the floor exception)
      ];

      for (const cfg of configs) {
        const { R, D, anchorIndices } = computeCylinderPoints(X, numZLevels, [cfg.a1, cfg.a2], cfg.minChroma, cfg.minL, cfg.maxL);
        const flat = R.flat();
        assert(inDomain(flat, 0, 1, TOL), `all R values in-domain for anchors D=${cfg.a1.D}/${cfg.a2.D}, got range [${Math.min(...flat).toFixed(3)}, ${Math.max(...flat).toFixed(3)}]`);

        let anyBad = false;
        for (let i = 0; i < X; i++) {
          const col = R.map((row) => row[i]);
          const isAnchorCol = i === anchorIndices[0] || i === anchorIndices[1];
          if (isAnchorCol) {
            if (!inDomain(col, 0, 1, TOL) || !(isUnimodal(col, TOL) || isUnimodal(col.map((v) => -v), TOL))) {
              anyBad = true;
              console.error(`  bad ANCHOR column at dIndex ${i} (D=${D[i].toFixed(1)}°): ${col.map((v) => v.toFixed(3))}`);
            }
          } else {
            if (!inDomain(col, cfg.minChroma, 1, TOL) || !isUnimodal(col, TOL)) {
              anyBad = true;
              console.error(`  furrow at dIndex ${i} (D=${D[i].toFixed(1)}°) for anchors D=${cfg.a1.D}/${cfg.a2.D}: ${col.map((v) => v.toFixed(3))}, dips at ${findFurrows(col, TOL, false)}`);
            }
          }
        }
        assert(!anyBad, `every hue column is well-shaped (convex ovoid, or a legitimate single valley at an anchor) for anchors D=${cfg.a1.D}/${cfg.a2.D}, R=${cfg.a1.R}/${cfg.a2.R}`);
      }
    }

    // ---------------------------------------------------------------------------

    expect(failed, failed + ' assertion(s) failed -- see console output above for FAIL: details').toBe(0);
  });
});
