/**
 * Plain-node test suite (no test framework) for the color scheme generator
 * in scheme.js. Run with: node test-scheme.js
 */

import {
  computeColorScheme,
  circularHueDistance,
  wheelIndexDistance,
  REFERENCE_HUES,
  SCHEME_NAMES_BY_DISTANCE,
} from './scheme.js';

import { describe, it, expect } from 'vitest';

describe('scheme', () => {
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
    // 1. circularHueDistance / wheelIndexDistance: basic correctness.
    // ---------------------------------------------------------------------------
    assertClose(circularHueDistance(10, 350), 20, 1e-9, 'circularHueDistance wraps around 0/360 correctly');
    assertClose(circularHueDistance(10, 190), 180, 1e-9, 'circularHueDistance: exact opposite hues are 180 apart');
    assertClose(circularHueDistance(45, 45), 0, 1e-9, 'circularHueDistance: identical hues are 0 apart');

    assert(wheelIndexDistance(0, 6, 12) === 6, 'wheelIndexDistance: opposite indices on a 12-ring are 6 apart');
    assert(wheelIndexDistance(0, 1, 12) === 1, 'wheelIndexDistance: adjacent indices are 1 apart');
    assert(wheelIndexDistance(0, 11, 12) === 1, 'wheelIndexDistance: wraps around (0 and 11 are adjacent on a 12-ring)');
    assert(wheelIndexDistance(1, 8, 12) === 5, 'wheelIndexDistance: takes the shorter direction around the ring');

    // ---------------------------------------------------------------------------
    // 2. Reference hues are derived from actual OKLCH conversions of pure
    //    sRGB primaries, not guessed -- sanity-check they're in the expected
    //    neighborhoods (red near 0/360, green ~140s, blue ~260s, yellow ~110s).
    // ---------------------------------------------------------------------------
    assert(REFERENCE_HUES.red < 40 || REFERENCE_HUES.red > 340, `red reference hue is near 0/360, got ${REFERENCE_HUES.red}`);
    assert(REFERENCE_HUES.green > 100 && REFERENCE_HUES.green < 180, `green reference hue is in the green range, got ${REFERENCE_HUES.green}`);
    assert(REFERENCE_HUES.blue > 230 && REFERENCE_HUES.blue < 290, `blue reference hue is in the blue range, got ${REFERENCE_HUES.blue}`);
    assert(REFERENCE_HUES.yellow > 80 && REFERENCE_HUES.yellow < 140, `yellow reference hue is in the yellow range, got ${REFERENCE_HUES.yellow}`);

    // ---------------------------------------------------------------------------
    // 3. Full worked example, hand-verified: 12 evenly-spaced hues (0,30,...,330),
    //    Primary at index 0 (hue 0), Secondary at index 6 (hue 180, exactly
    //    opposite -> wheelDistance 6 -> the newly-added "complementary" scheme).
    // ---------------------------------------------------------------------------
    {
      const hues = Array.from({ length: 12 }, (_, i) => i * 30); // 0,30,60,...,330
      const result = computeColorScheme(hues, 0, 6);

      assert(result.wheelDistance === 6, `wheelDistance is 6 for exactly-opposite anchors, got ${result.wheelDistance}`);
      assert(result.schemeName === 'complementary', `scheme name is "complementary" for distance 6, got ${result.schemeName}`);

      const { roles } = result;
      assert(roles.Primary === 0, 'Primary is anchorOneIndex');
      assert(roles.Secondary === 6, 'Secondary is anchorTwoIndex');
      // Hand-verified by walking the greedy algorithm (see scheme.js test plan):
      // Tip (closest to green ref ~142.5) picks hue 150 (index 5).
      assert(roles.Tip === 5, `Tip picks index 5 (hue 150, closest to green), got ${roles.Tip}`);
      // Info (closest to blue ref ~264.05) picks hue 270 (index 9).
      assert(roles.Info === 9, `Info picks index 9 (hue 270, closest to blue), got ${roles.Info}`);
      // Warning (closest to yellow ref ~109.77) picks hue 120 (index 4).
      assert(roles.Warning === 4, `Warning picks index 4 (hue 120, closest to yellow), got ${roles.Warning}`);
      // Danger (closest to red ref ~29.23) picks hue 30 (index 1).
      assert(roles.Danger === 1, `Danger picks index 1 (hue 30, closest to red), got ${roles.Danger}`);
      // Remaining 6 at this point: indices 2,3,7,8,10,11 (hues 60,90,210,240,300,330).
      // Distances from Primary (hue 0): 60,90,150,120,60,30 -> min=30 (index 11), max=150 (index 7).
      assert(roles.Tertiary === 11, `Tertiary picks index 11 (hue 330, closest to Primary), got ${roles.Tertiary}`);
      assert(roles.Accent === 7, `Accent picks index 7 (hue 210, farthest from Primary), got ${roles.Accent}`);

      assert(result.unusedIndices.length === 4, `4 indices are left unused, got ${result.unusedIndices.length}`);
      const unusedSet = new Set(result.unusedIndices);
      assert(unusedSet.has(2) && unusedSet.has(3) && unusedSet.has(8) && unusedSet.has(10), `unused indices are exactly {2,3,8,10}, got ${result.unusedIndices.join(',')}`);

      // All 8 roles are distinct indices.
      const roleIndices = Object.values(roles);
      assert(new Set(roleIndices).size === 8, 'all 8 assigned roles use distinct hue indices');
    }

    // ---------------------------------------------------------------------------
    // 4. Scheme name mapping matches the task's own table for every distance
    //    the table actually covers (1-5), by construction.
    // ---------------------------------------------------------------------------
    {
      const hues = Array.from({ length: 12 }, (_, i) => i * 30);
      const expected = { 1: 'analagous', 2: 'antitertiary', 3: 'square', 4: 'tertiary', 5: 'antianalagous', 6: 'complementary' };
      for (let dist = 1; dist <= 6; dist++) {
        const result = computeColorScheme(hues, 0, dist);
        assert(result.wheelDistance === dist, `wheelDistance ${dist} computed correctly for secondary at index ${dist}`);
        assert(result.schemeName === expected[dist], `distance ${dist} maps to scheme "${expected[dist]}", got "${result.schemeName}"`);
        assert(SCHEME_NAMES_BY_DISTANCE[dist] === expected[dist], `SCHEME_NAMES_BY_DISTANCE[${dist}] matches expected table`);
      }
    }

    // Distance is symmetric and direction-independent -- placing Secondary on
    // the OTHER side of Primary at the same wheel-distance gives the same scheme.
    {
      const hues = Array.from({ length: 12 }, (_, i) => i * 30);
      const forward = computeColorScheme(hues, 0, 3); // distance 3 going "up"
      const backward = computeColorScheme(hues, 0, 9); // distance 3 going "down" (12-9=3)
      assert(forward.schemeName === backward.schemeName, 'scheme classification is direction-independent (same distance either way around the ring)');
    }

    // ---------------------------------------------------------------------------
    // 5. Input validation.
    // ---------------------------------------------------------------------------
    {
      const hues = Array.from({ length: 12 }, (_, i) => i * 30);
      let threw = false;
      try { computeColorScheme(hues, 0, 0); } catch (e) { threw = true; }
      assert(threw, 'rejects anchorOneIndex === anchorTwoIndex');

      threw = false;
      try { computeColorScheme(hues, 0, 12); } catch (e) { threw = true; }
      assert(threw, 'rejects an out-of-range index');

      threw = false;
      try { computeColorScheme([0, 30, 60], 0, 1); } catch (e) { threw = true; }
      assert(threw, 'rejects fewer than 8 hues (not enough to fill all 8 roles)');
    }

    // ---------------------------------------------------------------------------
    // 6. Non-evenly-spaced, realistic hues (matching how the cylinder's D-ring
    //    actually looks after bending-energy deformation) still produce 8
    //    distinct valid role indices without crashing.
    // ---------------------------------------------------------------------------
    {
      const hues = [0, 23.5, 47, 74.05, 103.93, 135.94, 169.36, 203.5, 237.64, 271.06, 303.07, 332.95];
      const result = computeColorScheme(hues, 0, 2);
      const roleIndices = Object.values(result.roles);
      assert(roleIndices.every((i) => i >= 0 && i < 12), 'every role resolves to a valid D-ring index');
      assert(new Set(roleIndices).size === 8, 'all 8 roles are distinct on realistic, unevenly-spaced hues too');
      assert(result.unusedIndices.length === 4, '4 unused indices remain');
    }

    // ---------------------------------------------------------------------------

    expect(failed, failed + ' assertion(s) failed -- see console output above for FAIL: details').toBe(0);
  });
});
