/**
 * Validates a specific shape property of the D-ring's chroma profile,
 * IGNORING the Z axis entirely: plotted in polar form (radius = R, angle =
 * D), the ring should trace a "convex ovoid" -- a smooth, egg/circle-like
 * outline with no inward dimple -- for every point except possibly the two
 * anchors themselves (an anchor's own exact picked chroma is allowed to
 * sit below the convex hull of everything else; see cylinder-deform.js's
 * module doc, "WHY R IS CLAMPED, THEN CONVEXIFIED").
 *
 * This file previously confirmed a real bug here: an earlier version of
 * computeCylinderR unrolled the ring into an open curve with a third
 * "seam" pin held at `minChroma`, and that single point -- yanked far
 * below its smoothly-varying neighbors -- produced a sharp inward dimple,
 * i.e. the ring traced a heart/cardioid shape (two rounded anchor lobes
 * pinched by a notch at the seam), not an ovoid. Section 1 below still
 * reproduces that historical bug (via a frozen copy of the removed
 * seam-placement logic) purely as before/after documentation. Sections 2+
 * are the actual regression coverage: the CURRENT computeCylinderR (a
 * closed-ring solve with no seam, floored to minChroma, then explicitly
 * convexified) must be free of any non-anchor concave vertex, always.
 *
 * This is a DIFFERENT property from what test-cylinder-chroma-shape.js
 * checks (values leaving their valid [0,1]/[minChroma,1] domain). A value
 * can be perfectly in-domain and the polar shape can still be non-convex --
 * domain-correctness says nothing about the SILHOUETTE.
 *
 * ---------------------------------------------------------------------------
 * HOW CONVEXITY IS TESTED
 * ---------------------------------------------------------------------------
 * Convert each ring point (D[i], R[i]) to Cartesian (R[i]*cos(D[i]),
 * R[i]*sin(D[i])), sort by angle (the natural order around the ring), and
 * walk the resulting closed polygon. At every vertex, compute the cross
 * product of the incoming and outgoing edge vectors -- for a convex
 * polygon this sign is the SAME at every vertex (every turn bends the same
 * way, e.g. always left). A vertex where the sign flips is a concave
 * vertex: the polygon bends inward there, i.e. a dimple/notch pointing
 * toward the center. This is the standard, textbook test for polygon
 * convexity (used e.g. by convex-hull algorithms to detect non-hull
 * points) -- no approximation or fudge factor involved beyond a small
 * epsilon for near-collinear points. It is intentionally the SAME test
 * (independently reimplemented here, not imported) that motivated
 * convexifyRing's own internal logic in cylinder-deform.js, so this file
 * is a genuine outside check, not a tautology.
 *
 * Run with: node test-cylinder-ring-convexity.js
 */

import { computeCylinderD, computeCylinderR, convexifyRing, chordRadiusAtAngle, polarToXY } from './cylinder-deform.js';
import { computeLineBendingDisplacements } from './line-deform.js';

import { describe, it, expect } from 'vitest';

describe('cylinder-ring-convexity', () => {
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
      assert(Math.abs(actual - expected) <= tol, `${message} (expected ${expected}, got ${actual}, tol ${tol})`);
    }

    const CROSS_TOL = 1e-9;

    /** Polar (R, D-in-degrees) -> Cartesian. */
    function toCartesian(D, R) {
      return D.map((d, i) => polarToXY(d, R[i]));
    }

    /**
     * Returns the D-indices that are concave vertices of the polygon formed by
     * walking the ring points in angular order -- i.e. where the outline bends
     * the "wrong" way relative to the majority turn direction. An empty result
     * means the polygon is convex.
     */
    function concaveVertices(D, R) {
      const pts = toCartesian(D, R);
      const order = D.map((_, i) => i).sort((a, b) => D[a] - D[b]);
      const n = order.length;
      const cross = new Array(n);
      for (let k = 0; k < n; k++) {
        const [x0, y0] = pts[order[(k - 1 + n) % n]];
        const [x1, y1] = pts[order[k]];
        const [x2, y2] = pts[order[(k + 1) % n]];
        cross[k] = (x1 - x0) * (y2 - y1) - (y1 - y0) * (x2 - x1);
      }
      const signs = cross.filter((c) => Math.abs(c) > CROSS_TOL).map(Math.sign);
      if (signs.length === 0) return []; // degenerate (all collinear) -- not a meaningful case here
      const leftCount = signs.filter((s) => s === 1).length;
      const majority = leftCount >= signs.length - leftCount ? 1 : -1;
      const bad = [];
      cross.forEach((c, k) => {
        if (Math.abs(c) > CROSS_TOL && Math.sign(c) !== majority) bad.push(order[k]);
      });
      return bad;
    }

    /**
     * How far the point at `index` sits INSIDE the chord connecting its two
     * angular neighbors, as a fraction of the neighbor chord's own distance
     * from the origin -- a simple, interpretable "how deep is the dimple"
     * severity measure. 0 means the point sits exactly on (or outside) the
     * chord; positive means it's pulled inward.
     */
    function dimpleDepth(D, R, index) {
      const pts = toCartesian(D, R);
      const order = D.map((_, i) => i).sort((a, b) => D[a] - D[b]);
      const pos = order.indexOf(index);
      const n = order.length;
      const [xPrev, yPrev] = pts[order[(pos - 1 + n) % n]];
      const [xNext, yNext] = pts[order[(pos + 1) % n]];
      const [x, y] = pts[index];
      const midChord = [(xPrev + xNext) / 2, (yPrev + yNext) / 2];
      const chordDist = Math.hypot(midChord[0], midChord[1]);
      const pointDist = Math.hypot(x, y);
      return chordDist > 1e-9 ? (chordDist - pointDist) / chordDist : 0;
    }

    const X = 12;
    const nativeD = Array.from({ length: X }, (_, i) => (i * 360) / X);

    // A FROZEN copy of the removed seam-based computeCylinderR, kept only so
    // section 1 can document the historical bug this file used to confirm.
    // Not a claim about current behavior -- see cylinder-deform.js instead.
    function historicalCircularIndexDistance(a, b, XX) {
      const diff = Math.abs(a - b) % XX;
      return Math.min(diff, XX - diff);
    }
    function historicalChooseSeamIndex(XX, a1, a2) {
      let bestIdx = -1, bestScore = -1;
      for (let i = 0; i < XX; i++) {
        if (i === a1 || i === a2) continue;
        const score = Math.min(historicalCircularIndexDistance(i, a1, XX), historicalCircularIndexDistance(i, a2, XX));
        if (score > bestScore) { bestScore = score; bestIdx = i; }
      }
      return bestIdx;
    }
    function historicalComputeCylinderR(XX, a1idx, a2idx, a1R, a2R, minChroma) {
      const seamIndex = historicalChooseSeamIndex(XX, a1idx, a2idx);
      const nativePins = new Map([[seamIndex, minChroma], [a1idx, a1R], [a2idx, a2R]]);
      const pins = [];
      for (let k = 0; k <= XX; k++) {
        const nativeIdx = (seamIndex + k) % XX;
        if (nativePins.has(nativeIdx)) pins.push({ index: k, value: nativePins.get(nativeIdx) });
      }
      const u = computeLineBendingDisplacements(XX + 1, pins);
      const R = new Array(XX);
      for (let k = 0; k < XX; k++) R[(seamIndex + k) % XX] = u[k];
      return R;
    }

    // ---------------------------------------------------------------------------
    // 1. HISTORICAL: the old, now-removed seam-based design really was broken,
    //    at the app's own default anchors -- documented once here for context,
    //    not re-asserted anywhere else in this file.
    // ---------------------------------------------------------------------------
    {
      const a1 = { D: 359.96, R: 0.9999 }; // #850044, the app's default anchor one
      const a2 = { D: 46.72, R: 0.9995 };  // #4e1d00, the app's default anchor two
      const minChroma = 0.2;
      const { anchorIndices } = computeCylinderD(X, [a1, a2]);

      const oldR = historicalComputeCylinderR(X, anchorIndices[0], anchorIndices[1], a1.R, a2.R, minChroma);
      const oldBad = concaveVertices(nativeD, oldR);
      assert(oldBad.length > 0, `sanity check: the OLD seam-based design really did produce a concave dimple at the app's own default anchors (historical reference only) -- got ${JSON.stringify(oldBad)}`);
      if (oldBad.length > 0) {
        console.log(`  (info) historical dimple depth at default anchors: ${(dimpleDepth(nativeD, oldR, oldBad[0]) * 100).toFixed(1)}% inward pull`);
      }
    }

    // ---------------------------------------------------------------------------
    // 2. THE FIX, at the exact same default-anchor scenario: the CURRENT
    //    computeCylinderR must be fully convex there -- no dimple anywhere.
    // ---------------------------------------------------------------------------
    {
      const a1 = { D: 359.96, R: 0.9999 };
      const a2 = { D: 46.72, R: 0.9995 };
      const minChroma = 0.2;
      const { D, anchorIndices } = computeCylinderD(X, [a1, a2]);
      const R = computeCylinderR(X, anchorIndices[0], anchorIndices[1], a1.R, a2.R, minChroma);
      const bad = concaveVertices(D, R);
      assert(bad.length === 0, `the app's own DEFAULT anchors now produce a fully convex ring (no heart-shape dimple), got concave D-indices ${JSON.stringify(bad)}, R=${R.map((v) => v.toFixed(4))}`);
    }

    // ---------------------------------------------------------------------------
    // 3. THE FIX, swept exhaustively: every anchor index pair, a wide range of
    //    R combinations (including extreme/adjacent/close cases -- exactly
    //    where the old design failed most), several minChroma values. ANY
    //    concave vertex found must be at one of the two anchor indices (the
    //    documented, legitimate exception) -- never anywhere else.
    // ---------------------------------------------------------------------------
    {
      let total = 0;
      let nonAnchorConcave = 0;
      let anchorConcave = 0;
      const nonAnchorExamples = [];
      const rVals = [0.98, 0.9, 0.6, 0.3, 0.1, 0.02];
      const minChromas = [0, 0.2, 0.5, 0.8];

      for (let a1 = 0; a1 < X; a1++) {
        for (let a2 = 0; a2 < X; a2++) {
          if (a1 === a2) continue;
          for (const r1 of rVals) {
            for (const r2 of rVals) {
              for (const mc of minChromas) {
                total++;
                const R = computeCylinderR(X, a1, a2, r1, r2, mc);
                const bad = concaveVertices(nativeD, R);
                const nonAnchorBad = bad.filter((i) => i !== a1 && i !== a2);
                if (nonAnchorBad.length > 0) {
                  nonAnchorConcave++;
                  if (nonAnchorExamples.length < 5) nonAnchorExamples.push({ a1, a2, r1, r2, mc, nonAnchorBad, R: R.map((v) => +v.toFixed(4)) });
                }
                if (bad.some((i) => i === a1 || i === a2)) anchorConcave++;
              }
            }
          }
        }
      }

      assert(nonAnchorConcave === 0, `no configuration produces a concave vertex AWAY from the two anchors (${nonAnchorConcave}/${total} violated) -- examples: ${JSON.stringify(nonAnchorExamples)}`);
      console.log(`  (info) swept ${total} configs: 0 non-anchor concavities; ${anchorConcave} configs had a LEGITIMATE dimple exactly at an anchor (exact color reproduction below the local hull)`);
    }

    // ---------------------------------------------------------------------------
    // 4. convexifyRing, tested directly: a hand-built concave point gets
    //    pushed exactly onto the chord between its neighbors (not further),
    //    and an exempt index is never moved even when it's the concave one.
    // ---------------------------------------------------------------------------
    {
      // 8 points evenly spaced (45 degrees apart), all radius 1 except index 1
      // pulled sharply inward to 0.1 -- a hand-verifiable single dimple.
      // (A wider-spaced example, e.g. 4 points 90 degrees apart, turns out NOT
      // to register as concave at all here -- with few enough points spread
      // wide, pulling one radius down doesn't necessarily invert the polygon's
      // turn direction. Concavity is a genuinely global property of the
      // turning angles, not just "shorter than its neighbors"; 8 points gives
      // enough angular density to reproduce the real effect being tested.)
      const n = 8;
      const angles = Array.from({ length: n }, (_, i) => (i * 360) / n);
      const values = new Array(n).fill(1);
      values[1] = 0.1;
      assert(concaveVertices(angles, values).includes(1), 'sanity check: this hand-built configuration IS detected as concave at index 1 before any correction');

      const fixed = convexifyRing(angles, values, new Set());
      const bad = concaveVertices(angles, fixed);
      assert(bad.length === 0, `convexifyRing removes a hand-built single dimple, got remaining concave indices ${JSON.stringify(bad)}, values ${fixed.map((v) => v.toFixed(4))}`);
      assert(fixed[1] > values[1], `the dimpled point was actually pushed outward (${values[1]} -> ${fixed[1].toFixed(4)})`);

      // Its neighbors (index 0 and 2) are both at radius 1, 45 degrees on
      // either side -- by symmetry the chord between them at angle 0 sits at
      // exactly cos(45 deg) = sqrt(2)/2, hand-computable independently of
      // chordRadiusAtAngle (so this isn't just testing the helper against
      // itself).
      assertClose(fixed[1], Math.SQRT1_2, 1e-9, 'the corrected point lands exactly on the neighbor chord (cos 45deg, by symmetry)');
      const viaHelper = chordRadiusAtAngle(angles[0], fixed[0], angles[2], fixed[2], angles[1]);
      assertClose(fixed[1], viaHelper, 1e-9, 'agrees with chordRadiusAtAngle computed independently from the (now-fixed) neighbor values');

      // Exempt indices are never moved, even if concave.
      const untouched = convexifyRing(angles, values, new Set([1]));
      assert(untouched[1] === values[1], `an exempt index is left at its exact original value (${values[1]}), even though it is the concave one`);
    }

    // ---------------------------------------------------------------------------
    // 5. Sanity check on the detector itself: a TRULY convex configuration
    //    (all ring values equal -- a perfect circle) must NOT be flagged.
    // ---------------------------------------------------------------------------
    {
      const R = new Array(X).fill(0.5);
      const bad = concaveVertices(nativeD, R);
      assert(bad.length === 0, `a perfect circle (all R equal) is correctly recognized as convex, got flagged vertices ${JSON.stringify(bad)}`);
    }

    // ---------------------------------------------------------------------------

    expect(failed, failed + ' assertion(s) failed -- see console output above for FAIL: details').toBe(0);
  });
});
