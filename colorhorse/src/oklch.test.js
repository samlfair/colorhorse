/**
 * Plain-node test suite (no test framework) for the OKLCH -> sRGB
 * conversion + gamut mapping in oklch.js.
 *
 * These are deliberately STRUCTURAL properties (achromatic exactness, gamut
 * boundedness, hue periodicity, monotonic clamping) rather than "exact hex
 * value" fixtures -- there's no browser available in this environment to
 * cross-check third-party reference colors byte-for-byte, so the tests
 * instead verify the mathematical properties the conversion MUST have if
 * it's implemented correctly.
 *
 * Run with: node test-oklch.js
 */

import {
  oklchToLinearSrgb,
  oklchToSrgb,
  maxInGamutChroma,
  relativeChromaToAbsolute,
  srgbToOklch,
  hexToOklch,
  OKLCH_MAX_CHROMA,
} from './oklch.js';

import { describe, it, expect } from 'vitest';

describe('oklch', () => {
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
    // 1. L=1, C=0 is exactly white, for any hue (the LMS->RGB matrix rows each
    //    sum to 1, so an achromatic L=1 must map to r=g=b=1 exactly).
    // ---------------------------------------------------------------------------
    for (const H of [0, 47, 123.4, 359.9]) {
      const { r, g, b } = oklchToSrgb(1, 0, H);
      assert(r === 255 && g === 255 && b === 255, `oklchToSrgb(1,0,${H}) is exactly white, got (${r},${g},${b})`);
    }

    // ---------------------------------------------------------------------------
    // 2. L=0, C=0 is exactly black, for any hue.
    // ---------------------------------------------------------------------------
    for (const H of [0, 90, 200]) {
      const { r, g, b } = oklchToSrgb(0, 0, H);
      assert(r === 0 && g === 0 && b === 0, `oklchToSrgb(0,0,${H}) is exactly black, got (${r},${g},${b})`);
    }

    // ---------------------------------------------------------------------------
    // 3. Achromatic property: for C=0, linear r=g=b=L^3 exactly, for ANY L and
    //    ANY H (hue is meaningless at zero chroma) -- this falls straight out
    //    of the matrices (their rows each sum to 1) and is a strong correctness
    //    check independent of any specific reference color.
    // ---------------------------------------------------------------------------
    for (const L of [0.1, 0.3, 0.5, 0.7, 0.95]) {
      for (const H of [0, 120, 275]) {
        const lin = oklchToLinearSrgb(L, 0, H);
        const expected = L * L * L;
        assertClose(lin.r, expected, 1e-9, `linear r = L^3 at L=${L}, H=${H}`);
        assertClose(lin.g, expected, 1e-9, `linear g = L^3 at L=${L}, H=${H}`);
        assertClose(lin.b, expected, 1e-9, `linear b = L^3 at L=${L}, H=${H}`);
      }
    }
    // And after full sRGB conversion, C=0 still gives an exactly neutral gray
    // (r===g===b) at every H.
    for (const H of [0, 47, 210]) {
      const { r, g, b } = oklchToSrgb(0.6, 0, H);
      assert(r === g && g === b, `oklchToSrgb(0.6,0,${H}) is a neutral gray (r=g=b), got (${r},${g},${b})`);
    }

    // ---------------------------------------------------------------------------
    // 4. Hue periodicity: H and H+360 (and H-360) give identical results.
    // ---------------------------------------------------------------------------
    {
      const a = oklchToSrgb(0.6, 0.15, 40);
      const b = oklchToSrgb(0.6, 0.15, 400);
      const c = oklchToSrgb(0.6, 0.15, -320);
      assert(a.hex === b.hex, `H=40 and H=400 give the same color (${a.hex} vs ${b.hex})`);
      assert(a.hex === c.hex, `H=40 and H=-320 give the same color (${a.hex} vs ${c.hex})`);
    }

    // ---------------------------------------------------------------------------
    // 5. Every result is a valid, finite 0-255 integer per channel, across a
    //    wide sweep of L/C/H including many out-of-gamut requests.
    // ---------------------------------------------------------------------------
    {
      let allValid = true;
      for (let Li = 0; Li <= 10; Li++) {
        for (let Ci = 0; Ci <= 8; Ci++) {
          for (let Hi = 0; Hi < 360; Hi += 45) {
            const { r, g, b } = oklchToSrgb(Li / 10, Ci / 10, Hi);
            const valid = [r, g, b].every((v) => Number.isInteger(v) && v >= 0 && v <= 255);
            if (!valid) allValid = false;
          }
        }
      }
      assert(allValid, 'every (L,C,H) in a wide sweep produces valid 0-255 integer channels');
    }

    // ---------------------------------------------------------------------------
    // 6. Gamut mapping never INCREASES chroma, and never returns a chroma
    //    greater than what was requested.
    // ---------------------------------------------------------------------------
    {
      const { clampedC, wasClamped } = oklchToSrgb(0.5, 0.35, 140); // likely out of gamut
      assert(clampedC <= 0.35 + 1e-9, `clampedC (${clampedC}) never exceeds the requested chroma`);
      assert(clampedC >= 0, 'clampedC is never negative');
      if (wasClamped) assert(clampedC < 0.35, 'wasClamped=true implies clampedC is strictly less than requested');
    }

    // A small, safely in-gamut chroma should NOT be clamped at all.
    {
      const { clampedC, wasClamped } = oklchToSrgb(0.5, 0.02, 30);
      assertClose(clampedC, 0.02, 1e-6, 'a small in-gamut chroma is returned unclamped');
      assert(wasClamped === false, 'a small in-gamut chroma is not flagged as clamped');
    }

    // ---------------------------------------------------------------------------
    // 7. Once chroma is large enough to be clamped to the gamut boundary,
    //    requesting even MORE chroma at the same L/H produces the SAME output
    //    color (both converge to the same boundary point via binary search).
    // ---------------------------------------------------------------------------
    {
      const a = oklchToSrgb(0.6, 0.5, 200);
      const b = oklchToSrgb(0.6, 5, 200);
      assert(a.wasClamped && b.wasClamped, 'both large-chroma requests are actually clamped (test premise)');
      assert(a.hex === b.hex, `two different out-of-gamut chroma requests clamp to the same boundary color (${a.hex} vs ${b.hex})`);
    }

    // ---------------------------------------------------------------------------
    // 8. OKLCH_MAX_CHROMA is a sane, documented practical ceiling.
    // ---------------------------------------------------------------------------
    assert(OKLCH_MAX_CHROMA > 0 && OKLCH_MAX_CHROMA < 1, 'OKLCH_MAX_CHROMA is a small positive fraction, not a raw 0-1 misunderstanding of chroma scale');

    // ---------------------------------------------------------------------------
    // 9. srgbToOklch / hexToOklch: round-trip consistency is the primary
    //    correctness check here (no browser available to cross-check
    //    third-party reference values byte-for-byte). Converting a color
    //    forward and back should reproduce it exactly (sRGB is a discrete
    //    0-255 grid, so exact hex equality is achievable, not just "close").
    // ---------------------------------------------------------------------------
    for (const hex of ['#ff0000', '#00ff00', '#0000ff', '#850044', '#4e1d00', '#808080', '#ffffff', '#000000', '#123456']) {
      const { L, C, H } = hexToOklch(hex);
      const back = oklchToSrgb(L, C, H);
      assert(back.hex === hex, `round-trip hexToOklch -> oklchToSrgb reproduces ${hex} exactly, got ${back.hex}`);
    }

    // White and black have C~0 (achromatic) after the inverse conversion.
    {
      const white = hexToOklch('#ffffff');
      assertClose(white.L, 1, 1e-6, 'white has L=1');
      assertClose(white.C, 0, 1e-6, 'white has C=0 (achromatic)');
      const black = hexToOklch('#000000');
      assertClose(black.L, 0, 1e-6, 'black has L=0');
      assertClose(black.C, 0, 1e-6, 'black has C=0 (achromatic)');
    }

    // Pure red should have a hue near 29 degrees (the commonly-cited OKLCH hue
    // for sRGB red) and a chroma near the commonly-cited 0.2577.
    {
      const red = hexToOklch('#ff0000');
      assertClose(red.H, 29.23, 0.5, 'pure red has OKLCH hue near 29.23 degrees');
      assertClose(red.C, 0.2577, 0.005, 'pure red has OKLCH chroma near 0.2577');
      assertClose(red.L, 0.628, 0.01, 'pure red has OKLCH lightness near 0.628');
    }

    // ---------------------------------------------------------------------------
    // 10. maxInGamutChroma / relativeChromaToAbsolute: the "nutelch"-style
    //     cusp-relative chroma scale.
    // ---------------------------------------------------------------------------
    {
      // At the very top/bottom of lightness, only a razor-thin sliver of
      // chroma is displayable (cubing in the OKLab->LMS step suppresses small
      // perturbations near L=0/1, so the true boundary isn't EXACTLY zero, but
      // it's small compared to the ~0.1-0.3 headroom available at mid lightness).
      assert(maxInGamutChroma(0, 40) < 0.05, 'max in-gamut chroma is tiny at L=0 (black has almost no room for color)');
      assert(maxInGamutChroma(1, 40) < 0.05, 'max in-gamut chroma is tiny at L=1 (white has almost no room for color)');
      // Somewhere in the middle there should be real headroom.
      assert(maxInGamutChroma(0.6, 30) > 0.1, 'max in-gamut chroma is substantial at a mid lightness');

      // relative=1 sits exactly on the boundary: oklchToSrgb at that chroma
      // should report essentially no further clamping was needed.
      const L = 0.55, H = 260;
      const boundary = maxInGamutChroma(L, H);
      const atBoundary = oklchToSrgb(L, boundary, H);
      assert(atBoundary.clampedC >= boundary - 1e-3, `chroma at the computed boundary needs no further reduction (clampedC=${atBoundary.clampedC}, boundary=${boundary})`);

      // relative=0 is always achromatic (gray), regardless of L/H.
      assertClose(relativeChromaToAbsolute(0, 0.5, 123), 0, 1e-9, 'relativeChromaToAbsolute(0, ...) is exactly 0');

      // relativeChromaToAbsolute(1, L, H) should never be clamped further
      // (it's already sitting on the gamut boundary by construction).
      const abs = relativeChromaToAbsolute(1, L, H);
      const result = oklchToSrgb(L, abs, H);
      assert(!result.wasClamped || Math.abs(result.clampedC - abs) < 1e-3, 'relativeChromaToAbsolute(1, L, H) lands on the boundary, needing no further clamping');
    }

    // ---------------------------------------------------------------------------

    expect(failed, failed + ' assertion(s) failed -- see console output above for FAIL: details').toBe(0);
  });
});
