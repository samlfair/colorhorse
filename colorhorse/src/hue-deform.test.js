/**
 * Plain-node test suite (no test framework) for hue-deform.js.
 * Run with: node test-hue-deform.js
 */

import {
  normalizeHue,
  circularDelta,
  buildOriginalHues,
  findNearestSlot,
  computeHuePalette,
  hslToHex,
} from './hue-deform.js';

import { describe, it, expect } from 'vitest';

describe('hue-deform', () => {
  it('all assertions pass', () => {
    let passed = 0;
    let failed = 0;
    function assert(cond, message) {
      if (cond) {
        passed++;
      } else {
        failed++;
        console.error('FAIL: ' + message);
      }
    }
    function assertClose(actual, expected, tol, message) {
      assert(Math.abs(actual - expected) <= tol, `${message} (expected ${expected}, got ${actual}, tol ${tol})`);
    }

    /** shortest circular distance between two hues, always >= 0 */
    function hueDist(a, b) {
      return Math.abs(circularDelta(a, b));
    }

    // ---------------------------------------------------------------------------
    // 1. normalizeHue / circularDelta basics.
    // ---------------------------------------------------------------------------
    {
      assertClose(normalizeHue(-10), 350, 1e-9, 'normalizeHue wraps negative');
      assertClose(normalizeHue(370), 10, 1e-9, 'normalizeHue wraps > 360');
      assertClose(normalizeHue(360), 0, 1e-9, 'normalizeHue(360) === 0');
      assertClose(circularDelta(350, 10), 20, 1e-9, 'circularDelta wraps forward across 0/360');
      assertClose(circularDelta(10, 350), -20, 1e-9, 'circularDelta wraps backward across 0/360');
      assertClose(circularDelta(0, 180), 180, 1e-9, 'circularDelta(0,180) === 180 (boundary)');
      assertClose(circularDelta(100, 100), 0, 1e-9, 'circularDelta of equal hues is 0');
    }

    // ---------------------------------------------------------------------------
    // 2. Primary hue is an exact fixed point of the output palette.
    // ---------------------------------------------------------------------------
    {
      for (const primary of [0, 45, 210, 359.5]) {
        for (const secondary of [90, 200, 10]) {
          const { hues, A } = computeHuePalette(12, primary, secondary);
          assertClose(hues[A], normalizeHue(primary), 1e-6, `primary=${primary},secondary=${secondary}: hues[A] matches primary`);
        }
      }
    }

    // ---------------------------------------------------------------------------
    // 3. Secondary hue is an exact fixed point of the output palette (at slot N).
    // ---------------------------------------------------------------------------
    {
      for (const primary of [0, 45, 210]) {
        for (const secondary of [90, 200, 10, 359]) {
          const { hues, N } = computeHuePalette(16, primary, secondary);
          assertClose(hueDist(hues[N], secondary), 0, 1e-6, `primary=${primary},secondary=${secondary}: hues[N] matches secondary exactly`);
        }
      }
    }

    // ---------------------------------------------------------------------------
    // 4. buildOriginalHues: evenly spaced, anchored at primary, length X.
    // ---------------------------------------------------------------------------
    {
      const X = 8;
      const primary = 30;
      const hues = buildOriginalHues(X, primary);
      assert(hues.length === X, 'buildOriginalHues returns X hues');
      assertClose(hues[0], 30, 1e-9, 'first hue is exactly the primary anchor');
      for (let i = 0; i < X; i++) {
        const expected = normalizeHue(30 + (i * 360) / X);
        assertClose(hues[i], expected, 1e-9, `hue[${i}] is evenly spaced from anchor`);
      }
    }

    // ---------------------------------------------------------------------------
    // 5. findNearestSlot picks the genuinely closest slot, excluding A, and
    //    handles wraparound near the 0/360 seam correctly.
    // ---------------------------------------------------------------------------
    {
      const original = [0, 90, 180, 270]; // X=4 grid, just for slot-picking logic
      assert(findNearestSlot(original, 100, 0) === 1, 'nearest slot to 100 is index 1 (90)');
      assert(findNearestSlot(original, 350, 0) === 0 ? false : true, 'index 0 excluded even though nearest numerically');
      // 350 is closest to 0 (dist 10) but 0 is excluded (that's A), so next
      // closest is 270 (dist 80) vs 90 (dist 100) -> should pick 270 (index 3).
      assert(findNearestSlot(original, 350, 0) === 3, 'nearest non-excluded slot to 350 is index 3 (270), respecting the 0/360 seam');
    }

    // ---------------------------------------------------------------------------
    // 6. Palette output length and hue range sanity.
    // ---------------------------------------------------------------------------
    {
      const X = 24;
      const { hues } = computeHuePalette(X, 0, 120);
      assert(hues.length === X, 'palette has X hues');
      assert(hues.every((h) => h >= 0 && h < 360), 'all hues normalized into [0, 360)');
    }

    // ---------------------------------------------------------------------------
    // 7. Trivial case: secondary snaps exactly onto an existing original slot
    //    (dN = 0) -> palette should equal the original evenly-spaced hues.
    // ---------------------------------------------------------------------------
    {
      const X = 12;
      const primary = 0;
      const original = buildOriginalHues(X, primary);
      const secondary = original[5]; // exactly on slot 5's original position
      const { hues, N, dN } = computeHuePalette(X, primary, secondary);
      assert(N === 5, 'secondary exactly on slot 5 snaps to slot 5');
      assertClose(dN, 0, 1e-6, 'zero displacement when secondary matches an original slot exactly');
      for (let i = 0; i < X; i++) {
        assertClose(hueDist(hues[i], original[i]), 0, 1e-6, `hue[${i}] unchanged when dN=0`);
      }
    }

    // ---------------------------------------------------------------------------
    // 8. Smoothness: no abrupt jump in hue spacing anywhere around the wheel
    //    (same style of check as the geometric model's test #4/#5).
    // ---------------------------------------------------------------------------
    {
      const X = 24;
      const { hues } = computeHuePalette(X, 10, 260);
      function spacing(arr) {
        const n = arr.length;
        return Array.from({ length: n }, (_, i) => {
          let d = arr[(i + 1) % n] - arr[i];
          return ((d % 360) + 360) % 360;
        });
      }
      const sp = spacing(hues);
      const diffs = sp.map((s, i) => Math.abs(sp[(i + 1) % sp.length] - s));
      const maxDiff = Math.max(...diffs);
      const meanDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      assert(
        maxDiff < meanDiff * 6,
        `no abrupt seam in hue spacing: maxDiff=${maxDiff.toFixed(3)} meanDiff=${meanDiff.toFixed(3)}`
      );
    }

    // ---------------------------------------------------------------------------
    // 9. Wraparound: primary/secondary straddling the 0/360 seam should not
    //    break anything, and displacements should stay small (short way around).
    // ---------------------------------------------------------------------------
    {
      const X = 16;
      const { hues, dN } = computeHuePalette(X, 350, 10); // 20 degrees apart, wrapping through 0
      assert(Math.abs(dN) <= 180, 'displacement across the seam takes the short way (<=180deg)');
      assert(hues.every((h) => Number.isFinite(h)), 'all hues finite across the seam case');
    }

    // ---------------------------------------------------------------------------
    // 10. hslToHex sanity: known reference colors.
    // ---------------------------------------------------------------------------
    {
      assert(hslToHex(0, 1, 0.5).toLowerCase() === '#ff0000', 'pure red');
      assert(hslToHex(120, 1, 0.5).toLowerCase() === '#00ff00', 'pure green');
      assert(hslToHex(240, 1, 0.5).toLowerCase() === '#0000ff', 'pure blue');
      assert(hslToHex(0, 0, 0.5).toLowerCase() === '#808080', 'zero saturation is gray');
      assert(hslToHex(0, 0, 1).toLowerCase() === '#ffffff', 'full lightness is white');
      assert(hslToHex(0, 0, 0).toLowerCase() === '#000000', 'zero lightness is black');
    }

    // ---------------------------------------------------------------------------
    // 11. Various X sizes stay numerically stable and internally consistent.
    // ---------------------------------------------------------------------------
    {
      for (const X of [5, 6, 8, 12, 24, 48]) {
        const { hues, A, N } = computeHuePalette(X, 15, 200);
        assert(hues.length === X, `X=${X}: correct palette length`);
        assert(hues.every(Number.isFinite), `X=${X}: all hues finite`);
        assert(A !== N, `X=${X}: A and N are distinct`);
      }
    }

    // ---------------------------------------------------------------------------
    // 12. Error handling for degenerate inputs.
    // ---------------------------------------------------------------------------
    {
      let threw = false;
      try {
        computeHuePalette(4, 0, 90); // X too small (inherited from computeBendingDisplacements)
      } catch (e) {
        threw = true;
      }
      assert(threw, 'X < 5 should throw');

      threw = false;
      try {
        computeHuePalette(12, NaN, 90);
      } catch (e) {
        threw = true;
      }
      assert(threw, 'NaN primaryHue should throw');
    }


    expect(failed, failed + ' assertion(s) failed -- see console output above for FAIL: details').toBe(0);
  });
});
