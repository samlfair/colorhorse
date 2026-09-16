import { circularDelta } from './hue-deform.js';
import { hexToOklch } from './oklch.js';

/**
 * Dynamic color scheme generator: picks 8 named roles (Primary, Secondary,
 * Tertiary, Accent, Tip, Info, Warning, Danger) out of the cylinder's
 * 12-hue D-ring, and classifies which classic color-harmony "scheme" the
 * current Primary/Secondary hues correspond to.
 *
 * ---------------------------------------------------------------------------
 * ROLE ASSIGNMENT (greedy, in a fixed order -- order matters, since each
 * pick removes that hue from the pool the next pick draws from)
 * ---------------------------------------------------------------------------
 *   1. Primary   = anchorOne's D-ring index
 *   2. Secondary = anchorTwo's D-ring index
 *   3. Tip       = closest remaining hue to a reference GREEN
 *   4. Info      = closest remaining hue to a reference BLUE
 *   5. Warning   = closest remaining hue to a reference YELLOW
 *   6. Danger    = closest remaining hue to a reference RED
 *   (six hues remain at this point)
 *   7. Tertiary  = closest of the six remaining hues to Primary
 *   8. Accent    = farthest of the six remaining hues from Primary
 *   (four hues are left over, unused by any role)
 *
 * "Closest"/"farthest" hue is measured as ordinary circular hue distance in
 * degrees (via circularDelta from hue-deform.js), not wheel-index steps --
 * "most green" is a continuous-hue notion, not a discrete-slot one. The
 * reference R/G/B hues are computed from the actual OKLCH conversion of
 * pure sRGB red/green/blue (oklch.js's hexToOklch), not eyeballed, so
 * they're exact for this project's own color math.
 *
 * Yellow is the deliberate exception. sRGB's yellow secondary (#ffff00) sits
 * at OKLCH hue ~110, which is the GREEN edge of what reads as yellow: every
 * mid or dark shade at that hue has G >= R in sRGB, i.e. it renders as olive
 * (#94953a, #666726...), and on an evenly-spaced 12-hue ring the nearest slot
 * is 120, where Tailwind's *lime* lives (lime-400 = ~129). The Warning role
 * leans on exactly those mid/dark shades (border, heading, text), which is
 * why it looked green rather than yellow. Design-system yellows/ambers used
 * for "warning" cluster around hue 85-100 instead (Tailwind yellow-400 ~92,
 * Material/Bootstrap amber ~85, Radix yellow-9 ~101, CSS gold ~95), so the
 * reference is #ffcc00 (~90, the middle of that cluster). At 90 the dark
 * shades come out gold/brown (#ad8a3a, #795f25), which is what a warning
 * ramp is expected to look like.
 *
 * ---------------------------------------------------------------------------
 * SCHEME CLASSIFICATION
 * ---------------------------------------------------------------------------
 * The task's scheme table gives each scheme as 4 positions on a 12-hue
 * clock, always starting with Primary at position 1:
 *
 *   square         (1,4,7,10)
 *   tertiary       (1,5,7,9)
 *   analagous      (1,2,7,12)
 *   antianalagous  (1,6,7,8)
 *   antitertiary   (1,3,7,11)
 *
 * Position 7 is common to all five -- it's exactly opposite position 1 on a
 * 12-slot wheel (Primary's complement), not a role, just a fixed reference
 * point the other three positions are defined relative to. The SECOND
 * position in each tuple is what actually varies, and its wheel-index
 * distance from 1 is what distinguishes the five schemes:
 *
 *   distance 1 (position 2)  -> analagous
 *   distance 2 (position 3)  -> antitertiary
 *   distance 3 (position 4)  -> square
 *   distance 4 (position 5)  -> tertiary
 *   distance 5 (position 6)  -> antianalagous
 *
 * So the scheme is classified purely from the wheel-index distance between
 * Primary's and Secondary's D-ring indices (a 12-slot ring, so distance
 * runs 1-6). Distance 6 (Secondary exactly opposite Primary) has no entry
 * in the given table -- exactly the gap the task's own note flags ("We
 * might need to introduce more schemes to cover all cases"). This adds
 * "complementary" for that case, the standard color-theory name for hues
 * exactly opposite each other, rather than leaving it unclassified.
 * ===========================================================================
 */


export const REFERENCE_HUES = {
  red: hexToOklch('#ff0000').H,
  green: hexToOklch('#00ff00').H,
  blue: hexToOklch('#0000ff').H,
  // Not #ffff00 -- see the "Yellow is the deliberate exception" note above.
  yellow: hexToOklch('#ffcc00').H,
};

export const SCHEME_NAMES_BY_DISTANCE = {
  1: 'analagous',
  2: 'antitertiary',
  3: 'square',
  4: 'tertiary',
  5: 'antianalagous',
  6: 'complementary',
};

/** Shortest hue distance in degrees, always >= 0. */
export function circularHueDistance(a, b) {
  return Math.abs(circularDelta(a, b));
}

/** Shortest distance between two indices on an X-slot ring. */
export function wheelIndexDistance(a, b, X) {
  const diff = Math.abs(a - b) % X;
  return Math.min(diff, X - diff);
}

/**
 * @param {number[]} hues  D-ring hues in degrees, one per D-index (length X)
 * @param {number} anchorOneIndex   Primary's D-index
 * @param {number} anchorTwoIndex   Secondary's D-index
 * @returns {{
 *   schemeName: string,
 *   wheelDistance: number,
 *   roles: {Primary:number, Secondary:number, Tertiary:number, Accent:number,
 *           Tip:number, Info:number, Warning:number, Danger:number},
 *   unusedIndices: number[],
 * }}
 */
export function computeColorScheme(hues, anchorOneIndex, anchorTwoIndex) {
  const X = hues.length;
  if (!Number.isInteger(anchorOneIndex) || !Number.isInteger(anchorTwoIndex) || anchorOneIndex < 0 || anchorTwoIndex < 0 || anchorOneIndex >= X || anchorTwoIndex >= X) {
    throw new Error(`anchorOneIndex and anchorTwoIndex must be integers in [0, ${X}).`);
  }
  if (anchorOneIndex === anchorTwoIndex) {
    throw new Error('anchorOneIndex and anchorTwoIndex must be distinct.');
  }
  if (X < 8) {
    throw new Error('computeColorScheme needs at least 8 hues to fill all 8 roles.');
  }

  const remaining = new Set();
  for (let i = 0; i < X; i++) {
    if (i !== anchorOneIndex && i !== anchorTwoIndex) remaining.add(i);
  }

  function pickClosestToReference(referenceHue) {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (const i of remaining) {
      const d = circularHueDistance(hues[i], referenceHue);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    remaining.delete(bestIdx);
    return bestIdx;
  }

  const tipIndex = pickClosestToReference(REFERENCE_HUES.green);
  const infoIndex = pickClosestToReference(REFERENCE_HUES.blue);
  const warningIndex = pickClosestToReference(REFERENCE_HUES.yellow);
  const dangerIndex = pickClosestToReference(REFERENCE_HUES.red);

  const primaryHue = hues[anchorOneIndex];
  let tertiaryIndex = -1;
  let tertiaryDist = Infinity;
  let accentIndex = -1;
  let accentDist = -Infinity;
  for (const i of remaining) {
    const d = circularHueDistance(hues[i], primaryHue);
    if (d < tertiaryDist) {
      tertiaryDist = d;
      tertiaryIndex = i;
    }
    if (d > accentDist) {
      accentDist = d;
      accentIndex = i;
    }
  }
  remaining.delete(tertiaryIndex);
  remaining.delete(accentIndex);

  const wheelDistance = wheelIndexDistance(anchorOneIndex, anchorTwoIndex, X);
  const schemeName = SCHEME_NAMES_BY_DISTANCE[wheelDistance] || 'custom';

  return {
    schemeName,
    wheelDistance,
    roles: {
      Primary: anchorOneIndex,
      Secondary: anchorTwoIndex,
      Tertiary: tertiaryIndex,
      Accent: accentIndex,
      Tip: tipIndex,
      Info: infoIndex,
      Warning: warningIndex,
      Danger: dangerIndex,
    },
    unusedIndices: Array.from(remaining),
  };
}

