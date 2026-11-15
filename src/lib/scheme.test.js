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
  SEMANTIC_ROLE_FAMILIES,
  MOVED_SLOT_ARC_TOLERANCE,
  MIN_ROLE_HUE_SEPARATION,
  HARMONY_TYPES,
  isHueInRange,
  degreesOutsideRange,
} from './scheme.js';
import { computeCylinderD } from './cylinder-deform.js';
import { getWheel } from 'colorhorse';

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
    //    sRGB primaries (yellow from #ffcc00 -- #ffff00's ~110 is olive/lime
    //    territory, see scheme.js), not guessed -- sanity-check they're in the
    //    expected neighborhoods (red near 0/360, green ~140s, blue ~260s,
    //    yellow ~90, inside the 85-100 band design-system warning yellows use).
    // ---------------------------------------------------------------------------
    assert(REFERENCE_HUES.red < 40 || REFERENCE_HUES.red > 340, `red reference hue is near 0/360, got ${REFERENCE_HUES.red}`);
    assert(REFERENCE_HUES.green > 100 && REFERENCE_HUES.green < 180, `green reference hue is in the green range, got ${REFERENCE_HUES.green}`);
    assert(REFERENCE_HUES.blue > 230 && REFERENCE_HUES.blue < 290, `blue reference hue is in the blue range, got ${REFERENCE_HUES.blue}`);
    assert(REFERENCE_HUES.yellow > 85 && REFERENCE_HUES.yellow < 100, `yellow reference hue is in the yellow (not lime) range, got ${REFERENCE_HUES.yellow}`);

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
      // Complementary is the degenerate harmony case: Secondary's mirror
      // across Primary is Secondary itself, and so is Primary's complement,
      // so Tertiary/Accent complete a square at Primary +/- 3 instead.
      assert(roles.Tertiary === 3, `Tertiary falls back to index 3 (Primary + quarter turn) for complementary, got ${roles.Tertiary}`);
      assert(roles.Accent === 9, `Accent falls back to index 9 (Primary - quarter turn) for complementary, got ${roles.Accent}`);
      // Semantic roles are picked from the 8 slots the harmony left, hand-walked:
      // Tip (closest to green ref ~142.5) picks hue 150 (index 5).
      assert(roles.Tip === 5, `Tip picks index 5 (hue 150, closest to green), got ${roles.Tip}`);
      // Info (closest to blue ref ~264.05): index 9 (hue 270) is taken by Accent,
      // so the nearest free hue is 240 (index 8).
      assert(roles.Info === 8, `Info picks index 8 (hue 240, nearest free hue to blue), got ${roles.Info}`);
      // Warning (closest to yellow ref ~90.4): index 3 (hue 90) is taken by
      // Tertiary; 60 and 120 are equidistant (30.4 vs 29.6) -> 120 (index 4).
      assert(roles.Warning === 4, `Warning picks index 4 (hue 120, nearest free hue to yellow), got ${roles.Warning}`);
      // Danger (closest to red ref ~29.23) picks hue 30 (index 1).
      assert(roles.Danger === 1, `Danger picks index 1 (hue 30, closest to red), got ${roles.Danger}`);

      assert(result.unusedIndices.length === 4, `4 indices are left unused, got ${result.unusedIndices.length}`);
      const unusedSet = new Set(result.unusedIndices);
      assert(unusedSet.has(2) && unusedSet.has(7) && unusedSet.has(10) && unusedSet.has(11), `unused indices are exactly {2,7,10,11}, got ${result.unusedIndices.join(',')}`);

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

    // Tertiary/Accent are the harmony's other two slots: Tertiary mirrors
    // Secondary across Primary, Accent is Primary's complement -- the scheme
    // table's (1,s,7,mirror-of-s) read as roles. Checked for every
    // non-degenerate distance, in both directions and from a non-zero Primary.
    {
      const hues = Array.from({ length: 12 }, (_, i) => i * 30);
      for (const primary of [0, 5]) {
        for (let dist = 1; dist <= 5; dist++) {
          for (const dir of [1, -1]) {
            const secondary = (primary + dir * dist + 12) % 12;
            const { roles } = computeColorScheme(hues, primary, secondary);
            const mirror = (primary - dir * dist + 12) % 12;
            const complement = (primary + 6) % 12;
            assert(roles.Tertiary === mirror, `Tertiary mirrors Secondary across Primary (P=${primary}, S=${secondary}): expected ${mirror}, got ${roles.Tertiary}`);
            assert(roles.Accent === complement, `Accent is Primary's complement (P=${primary}, S=${secondary}): expected ${complement}, got ${roles.Accent}`);
            assert(new Set(Object.values(roles)).size === 8, `all 8 roles distinct (P=${primary}, S=${secondary})`);
          }
        }
      }
      // Analagous is the only scheme where Tertiary sits next to Primary.
      assert(wheelIndexDistance(computeColorScheme(hues, 0, 1).roles.Tertiary, 0, 12) === 1, 'analagous: Tertiary is adjacent to Primary');
      assert(wheelIndexDistance(computeColorScheme(hues, 0, 3).roles.Tertiary, 0, 12) === 3, 'square: Tertiary is a quarter turn from Primary');
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
    // 7. Model 2: semantic roles by hue family.
    // ---------------------------------------------------------------------------
    {
      const semanticRoleNames = Object.keys(SEMANTIC_ROLE_FAMILIES);
      const halfOf = (roleName) => SEMANTIC_ROLE_FAMILIES[roleName].half;
      const farEnough = (hues, index, others) => others.every((other) => other === index || circularHueDistance(hues[index], hues[other]) >= MIN_ROLE_HUE_SEPARATION);
      // Can all four semantic roles sit inside their halves, on distinct
      // free hues kept MIN_ROLE_HUE_SEPARATION apart from every role?
      const fitsInHalves = (hues, harmonyIndices) => {
        const free = [...Array(12).keys()].filter((index) => !harmonyIndices.includes(index) && farEnough(hues, index, harmonyIndices));
        const options = semanticRoleNames.map((roleName) => free.filter((index) => isHueInRange(hues[index], halfOf(roleName))));
        return (function search(roleIndex, used) {
          if (roleIndex === options.length) return true;
          return options[roleIndex].some((index) => !used.includes(index) && farEnough(hues, index, used) && search(roleIndex + 1, [...used, index]));
        })(0, []);
      };

      // Range helpers, including a range that wraps through 0.
      assert(isHueInRange(350, [310, 120]) && isHueInRange(10, [310, 120]) && !isHueInRange(200, [310, 120]), 'isHueInRange wraps through 0');
      assertClose(degreesOutsideRange(125, [310, 120]), 5, 1e-9, 'degreesOutsideRange measures to the nearer end');
      assertClose(degreesOutsideRange(300, [310, 120]), 10, 1e-9, 'degreesOutsideRange measures to the nearer end, below');

      // Model 1 is the default and is unchanged by the option.
      {
        const hues = [0, 23.5, 47, 74.05, 103.93, 135.94, 169.36, 203.5, 237.64, 271.06, 303.07, 332.95];
        assert(
          JSON.stringify(computeColorScheme(hues, 0, 2)) === JSON.stringify(computeColorScheme(hues, 0, 2, { model: 1 })),
          'model 1 is the default',
        );
      }

      // Rings the studio actually produces: both wheels, a grid of seeds,
      // the nearest slot and every other slot.
      const X = 12;
      let nearestCount = 0;
      let movedCount = 0;
      let crossedCount = 0;
      let droppedCount = 0;
      for (const wheelName of ['rgb', 'ryb']) {
        const wheel = getWheel(wheelName);
        for (let angleOne = 0; angleOne < 360; angleOne += 11) {
          for (let angleTwo = 0; angleTwo < 360; angleTwo += 11) {
            if (angleOne === angleTwo) continue;
            const nearest = computeCylinderD(X, [{ D: angleOne }, { D: angleTwo }]);
            if (nearest.anchorIndices[0] === nearest.anchorIndices[1]) continue;
            const nearestSlot = (nearest.anchorIndices[1] - nearest.anchorIndices[0] + X) % X;
            for (let slot = 1; slot < X; slot++) {
              const onNearestSlot = slot === nearestSlot;
              if (!onNearestSlot && slot % 3 !== 0) continue;
              const ring = onNearestSlot ? nearest : computeCylinderD(X, [{ D: angleOne }, { D: angleTwo }], slot);
              const hues = ring.D.map(wheel.toHue);
              const [primary, secondary] = ring.anchorIndices;
              const label = `${wheelName} ${angleOne}/${angleTwo} slot ${slot}`;
              const result = computeColorScheme(hues, primary, secondary, { model: 2, colorTwoOnNearestSlot: onNearestSlot });
              const { roles } = result;

              assert(roles.Primary === primary && roles.Secondary === secondary, `${label}: seeds are Primary and Secondary`);
              const roleIndices = Object.values(roles);
              assert(new Set(roleIndices).size === roleIndices.length, `${label}: no two roles share a hue`);
              assert(roleIndices.every((index) => Number.isInteger(index) && index >= 0 && index < X), `${label}: valid indices`);
              assert(result.unusedIndices.length + roleIndices.length === X, `${label}: every hue is a role or unused`);

              // Tertiary and Accent are one of the listed harmony types.
              const distance = (secondary - primary + X) % X;
              const isListedHarmony = HARMONY_TYPES.some(({ name, place }) => {
                const placed = place(primary, secondary, distance, X);
                if (!placed || name !== result.harmonyName) return false;
                const pair = placed.map((index) => ((index % X) + X) % X);
                return new Set([...pair, roles.Tertiary, roles.Accent]).size === 2;
              });
              assert(isListedHarmony, `${label}: harmony is a listed type (${result.harmonyName})`);

              // Free hues in each half, for the chosen harmony.
              const taken = new Set([primary, secondary, roles.Tertiary, roles.Accent]);
              const freeIndices = [...Array(X).keys()].filter((index) => !taken.has(index));

              // No semantic role is too close in hue to any other role.
              for (const roleName of semanticRoleNames) {
                if (!(roleName in roles)) continue;
                assert(farEnough(hues, roles[roleName], roleIndices), `${label}: ${roleName} is at least ${MIN_ROLE_HUE_SEPARATION} degrees from every other role`);
              }

              if (onNearestSlot) {
                nearestCount++;
                for (const roleName of semanticRoleNames) {
                  if (roleName in roles) continue;
                  // Dropped only if every free hue is too close to a role.
                  const usable = freeIndices.filter((index) => !roleIndices.includes(index) && farEnough(hues, index, roleIndices));
                  assert(usable.length === 0, `${label}: ${roleName} is only dropped on the nearest slot when every free hue is too close to another role`);
                }
                const crossed = semanticRoleNames.filter((roleName) => roleName in roles && !isHueInRange(hues[roles[roleName]], halfOf(roleName)));
                if (crossed.length > 0) {
                  crossedCount++;
                  // Only when no harmony type lets the roles fit inside their halves.
                  const anyHarmonyFits = HARMONY_TYPES.some(({ place }) => {
                    const placed = place(primary, secondary, distance, X);
                    if (!placed) return false;
                    const pair = placed.map((index) => ((index % X) + X) % X);
                    const harmonyIndices = [...new Set([primary, secondary, ...pair])];
                    return harmonyIndices.length === 4 && fitsInHalves(hues, harmonyIndices);
                  });
                  assert(!anyHarmonyFits, `${label}: a role only crosses into the other half when no harmony leaves room (${crossed.join(', ')})`);
                }
                // Model 1's harmony is kept whenever the roles all fit their arcs with it.
                const modelOne = computeColorScheme(hues, primary, secondary);
                const modelOneFree = [...Array(X).keys()].filter((index) => ![primary, secondary, modelOne.roles.Tertiary, modelOne.roles.Accent].includes(index));
                const result2 = result;
                if (result2.harmonyName !== 'primary axis') {
                  // Then model 1's harmony must have left some role without an in-arc hue.
                  const modelOneHarmony = [primary, secondary, modelOne.roles.Tertiary, modelOne.roles.Accent];
                  const inArcOptions = semanticRoleNames.map((roleName) =>
                    modelOneFree.filter((index) => isHueInRange(hues[index], SEMANTIC_ROLE_FAMILIES[roleName].arc) && farEnough(hues, index, modelOneHarmony)),
                  );
                  const fitsInArcs = (function search(roleIndex, used) {
                    if (roleIndex === inArcOptions.length) return true;
                    return inArcOptions[roleIndex].some((index) => !used.includes(index) && farEnough(hues, index, used) && search(roleIndex + 1, [...used, index]));
                  })(0, []);
                  assert(!fitsInArcs, `${label}: model 1's harmony is only replaced when the roles don't fit their arcs`);
                }
              } else {
                movedCount++;
                for (const roleName of semanticRoleNames) {
                  const family = SEMANTIC_ROLE_FAMILIES[roleName];
                  if (roleName in roles) {
                    const hue = hues[roles[roleName]];
                    assert(isHueInRange(hue, family.half), `${label}: ${roleName} stays in its half on a moved slot`);
                    assert(degreesOutsideRange(hue, family.arc) <= MOVED_SLOT_ARC_TOLERANCE + 1e-9, `${label}: ${roleName} is within ${MOVED_SLOT_ARC_TOLERANCE} degrees of its arc`);
                  } else {
                    droppedCount++;
                    // Dropped only if every eligible free hue is already another role.
                    const eligible = freeIndices.filter((index) => isHueInRange(hues[index], family.half) && degreesOutsideRange(hues[index], family.arc) <= MOVED_SLOT_ARC_TOLERANCE && farEnough(hues, index, roleIndices));
                    assert(eligible.every((index) => roleIndices.includes(index)), `${label}: ${roleName} is only dropped when no eligible hue is free`);
                  }
                }
              }
            }
          }
        }
      }
      assert(nearestCount > 1000 && movedCount > 1000, `model 2 sweep covers enough rings (${nearestCount} nearest, ${movedCount} moved)`);
      assert(droppedCount > 0, 'some moved-slot rings drop a role');
      console.log(`model 2 sweep: ${nearestCount} nearest (${crossedCount} crossed a half), ${movedCount} moved (${droppedCount} roles dropped)`);

      // Seeds at 16 and 75 on the RGB wheel: the warm half holds only three
      // hues, two of them the seeds, so one warm role has to cross over.
      {
        const ring = computeCylinderD(X, [{ D: 16 }, { D: 75 }]);
        const [primary, secondary] = ring.anchorIndices;
        const warmHues = ring.D.filter((hue) => isHueInRange(hue, SEMANTIC_ROLE_FAMILIES.Danger.half));
        assert(warmHues.length === 3, `16/75: the warm half holds three hues (${warmHues.map((hue) => hue.toFixed(0)).join(', ')})`);
        const result = computeColorScheme(ring.D, primary, secondary, { model: 2 });
        assert(semanticRoleNames.every((roleName) => roleName in result.roles), '16/75: still all four semantic roles');
        const crossed = semanticRoleNames.filter((roleName) => !isHueInRange(ring.D[result.roles[roleName]], halfOf(roleName)));
        assert(crossed.length === 1, `16/75: exactly one role crosses into the other half (${crossed.join(', ')})`);
        const moved = computeColorScheme(ring.D, primary, secondary, { model: 2, colorTwoOnNearestSlot: false });
        assert(Object.keys(moved.roles).length === 7, '16/75 under moved-slot rules: the crossing role is dropped instead');
      }

      // Two near-identical blues: Info takes 254, so Success may not take
      // 250 beside it, and is left out on a moved slot rather than duplicate it.
      {
        const hues = [250, 254, 262, 283, 335, 66, 157, 209, 230, 238, 242, 246];
        const result = computeColorScheme(hues, 8, 2, { model: 2, colorTwoOnNearestSlot: false });
        const semanticHues = semanticRoleNames.filter((roleName) => roleName in result.roles).map((roleName) => hues[result.roles[roleName]]);
        const tooClose = semanticHues.some((hue, index) => semanticHues.some((other, otherIndex) => otherIndex !== index && circularHueDistance(hue, other) < MIN_ROLE_HUE_SEPARATION));
        assert(!tooClose, 'no two semantic roles are near-identical blues');
      }

      // The Warning example: its arc holds only the Secondary, so it steps
      // just past its edge rather than going green.
      {
        const hues = [0, 37, 74, 107, 137, 165, 191, 217, 243, 269, 297, 327];
        const result = computeColorScheme(hues, 0, 2, { model: 2 });
        assert(hues[result.roles.Warning] === 107, 'Warning steps 2 degrees past its arc to 107');
        assert(result.harmonyName === 'primary axis', "model 1's harmony is kept when nothing better fits");
      }
    }

    // ---------------------------------------------------------------------------

    expect(failed, failed + ' assertion(s) failed -- see console output above for FAIL: details').toBe(0);
  });
});
