import { circularDelta } from './hue-deform.js';
import { hexToOklch } from './oklch.js';

/**
 * Dynamic color scheme generator: picks 8 named roles (Primary, Secondary,
 * Tertiary, Accent, Tip, Info, Warning, Danger) out of the cylinder's
 * 12-hue D-ring, and classifies which classic color-harmony "scheme" the
 * current Primary/Secondary hues correspond to.
 *
 * ---------------------------------------------------------------------------
 * ROLE ASSIGNMENT
 * ---------------------------------------------------------------------------
 * The four HARMONY roles are fixed by wheel geometry, in slot (D-index)
 * terms on the X-slot ring, with Primary and Secondary given:
 *
 *   1. Primary   = anchorOne's D-ring index
 *   2. Secondary = anchorTwo's D-ring index
 *   3. Tertiary  = Secondary mirrored across the Primary axis
 *                  (Primary - (Secondary - Primary), mod X)
 *   4. Accent    = Primary's complement (Primary + X/2, mod X)
 *
 * That is exactly the scheme table below read as roles: in (1,4,7,10),
 * position 10 is 4 mirrored across 1, and 7 is opposite 1. So Tertiary is
 * only adjacent to Primary in the analagous scheme (1,2,7,12), and Accent
 * is always the maximum-hue-contrast slot. The one degenerate case is
 * complementary (Secondary exactly opposite Primary): the mirror of
 * Secondary IS Secondary and so is the complement, so Tertiary/Accent
 * fall back to the two quarter-turn slots (Primary +/- X/4), i.e. the
 * pair completes a square.
 *
 * The four SEMANTIC roles are then picked greedily from the 8 slots left,
 * in a fixed order (order matters, since each pick removes that hue from
 * the pool the next pick draws from):
 *
 *   5. Tip       = closest remaining hue to a reference GREEN
 *   6. Info      = closest remaining hue to a reference BLUE
 *   7. Warning   = closest remaining hue to a reference YELLOW
 *   8. Danger    = closest remaining hue to a reference RED
 *   (four hues are left over, unused by any role)
 *
 * Harmony roles win ties on purpose: the harmony is the point of the
 * scheme, so a semantic role whose ideal slot is taken by e.g. Tertiary
 * settles for the nearest free hue instead of displacing it.
 *
 * "Closest" hue is measured as ordinary circular hue distance in degrees
 * (via circularDelta from hue-deform.js), not wheel-index steps -- "most
 * green" is a continuous-hue notion, not a discrete-slot one. The
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
 * @param {{model?: 1 | 2, colorTwoOnNearestSlot?: boolean}} [options]
 *   model: 1 (the default) is the assignment described above; 2 is
 *   computeHueFamilyScheme below. colorTwoOnNearestSlot only matters for
 *   model 2.
 * @returns {{
 *   schemeName: string,
 *   wheelDistance: number,
 *   roles: {Primary:number, Secondary:number, Tertiary:number, Accent:number,
 *           Tip:number, Info:number, Warning:number, Danger:number},
 *   unusedIndices: number[],
 * }}
 */
export function computeColorScheme(hues, anchorOneIndex, anchorTwoIndex, { model = 1, colorTwoOnNearestSlot = true } = {}) {
  if (model === 2) return computeHueFamilyScheme(hues, anchorOneIndex, anchorTwoIndex, colorTwoOnNearestSlot);
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

  const mod = (k) => ((k % X) + X) % X;
  const offset = anchorTwoIndex - anchorOneIndex;
  let accentIndex = mod(anchorOneIndex + Math.floor(X / 2));
  if (accentIndex === anchorTwoIndex) accentIndex = mod(anchorOneIndex + Math.ceil(X / 2)); // odd X only
  let tertiaryIndex = mod(anchorOneIndex - offset);
  if (tertiaryIndex === anchorTwoIndex || tertiaryIndex === accentIndex) {
    // Complementary: Secondary is its own mirror and also the complement,
    // so complete a square instead (see ROLE ASSIGNMENT above).
    const quarter = Math.round(X / 4);
    tertiaryIndex = mod(anchorOneIndex + quarter);
    accentIndex = mod(anchorOneIndex - quarter);
  }
  const harmonyIndices = new Set([anchorOneIndex, anchorTwoIndex, tertiaryIndex, accentIndex]);

  const remaining = new Set();
  for (let i = 0; i < X; i++) {
    if (!harmonyIndices.has(i)) remaining.add(i);
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


/*
 * ===========================================================================
 * MODEL 2: SEMANTIC ROLES BY HUE FAMILY
 * ===========================================================================
 * Model 1 gives every semantic role the nearest free hue, however far that
 * is: a "green" Success can come out orange. Model 2 keeps each role inside
 * its hue family instead.
 *
 * Each role has a preferred arc, open on the side it may fall toward, and
 * a hard half of the wheel it must stay in:
 *
 *   Danger   red      arc 313-53   (warm purple to orange)   warm half
 *   Warning  amber    arc 50-105   (orange to yellow)        warm half
 *   Tip      green    arc 130-256  (falls toward blue)       cool half
 *   Info     blue     arc 230-304  (falls toward purple)     cool half
 *
 * The halves split at 120 (between yellow #ffff00 at ~110 and chartreuse
 * at ~136) and 310 (between purple #a000ff at ~304 and warm purple #c000ff
 * at ~313). So Danger and Warning are never green or cool purple, and Tip
 * and Info are never yellow or warm purple.
 *
 * Choosing roles:
 *
 *  1. The harmony picks first: Tertiary and Accent as in model 1. If all
 *     four semantic roles then fit inside their arcs, that's the scheme.
 *  2. Otherwise every harmony in HARMONY_TYPES is tried (model 1's first),
 *     and the one that leaves the semantic roles best placed wins. This is
 *     the semantic roles picking first and the harmony taking what's left.
 *  3. The four semantic roles are always chosen together, never one at a
 *     time, so one can't take the only hue another could use. Best means,
 *     in order: most roles filled; least distance past a half's boundary;
 *     least distance past an arc (worst role first, then the total); least
 *     total distance from the ideal hues.
 *
 * Roles never share a hue: a shared hue is no better than a missing role.
 * Nor does a semantic role take a hue within MIN_ROLE_HUE_SEPARATION of
 * any other role's (two near-identical blues): it's left out instead.
 *
 * With colorTwo on its nearest slot all four roles exist (unless every
 * free hue is too close to another role, which a sweep never finds). A role
 * may go past its arc anywhere within its half, and only when a half has
 * no free hue left (about 1 palette in 3,000) may it cross into the other
 * half, by as little as possible. Once colorTwo is moved to another slot
 * the ring is warped on purpose, so a role may go at most
 * MOVED_SLOT_ARC_TOLERANCE degrees past its arc (still within its half),
 * and is left out otherwise.
 */

const WARM_HALF = [310, 120];
const COOL_HALF = [120, 310];

export const SEMANTIC_ROLE_FAMILIES = {
  Tip: { ideal: hexToOklch('#00ff00').H, arc: [130, 256], half: COOL_HALF },
  Info: { ideal: hexToOklch('#0000ff').H, arc: [230, 304], half: COOL_HALF },
  Warning: { ideal: hexToOklch('#ffbf00').H, arc: [50, 105], half: WARM_HALF },
  Danger: { ideal: hexToOklch('#ff0000').H, arc: [313, 53], half: WARM_HALF },
};

export const MOVED_SLOT_ARC_TOLERANCE = 20;

// A semantic role is left out rather than take a hue this close (in OKLCH
// degrees) to any other role's: two near-identical blues are no better
// than one.
export const MIN_ROLE_HUE_SEPARATION = 15;

/** Degrees going up the wheel from `from` to `to`, in [0, 360). */
function degreesUp(from, to) {
  return (((to - from) % 360) + 360) % 360;
}

/** Whether `hue` lies on the arc going up from range[0] to range[1]. */
export function isHueInRange(hue, [from, to]) {
  return degreesUp(from, hue) <= degreesUp(from, to);
}

/** 0 inside the range, otherwise degrees to its nearer end. */
export function degreesOutsideRange(hue, [from, to]) {
  if (isHueInRange(hue, [from, to])) return 0;
  return Math.min(degreesUp(to, hue), degreesUp(hue, from));
}

/**
 * Every Tertiary/Accent pair that makes a harmony with Primary and
 * Secondary, model 1's first. `distance` is Secondary's slot offset.
 *
 * The first three are the same shape as every scheme in model 1's table:
 * an axis (a hue and its complement) plus a pair mirrored across it.
 */
export const HARMONY_TYPES = [
  { name: 'primary axis', place: (P, S, d, X) => (d === X / 2 ? [P + X / 4, P - X / 4] : [P - d, P + X / 2]) },
  { name: 'secondary axis', place: (P, S, d, X) => [S + d, S + X / 2] },
  { name: 'seeds mirrored', place: (P, S, d, X) => (d % 2 === 0 ? [P + d / 2, P + d / 2 + X / 2] : null) },
  { name: 'opposite seeds', place: (P, S, d, X) => (d === X / 2 ? [P + 2, P - 2] : null) },
  { name: 'opposite seeds', place: (P, S, d, X) => (d === X / 2 ? [P + 4, P - 4] : null) },
  { name: 'opposite seeds', place: (P, S, d, X) => (d === X / 2 ? [P + 1, P - 1] : null) },
  { name: 'opposite seeds', place: (P, S, d, X) => (d === X / 2 ? [P + 5, P - 5] : null) },
  // Two complementary pairs.
  { name: 'rectangle', place: (P, S, d, X) => [P + X / 2, S + X / 2] },
  // Keep stepping by the seeds' gap, one step out from each.
  { name: 'run', place: (P, S, d, X) => [P - d, S + d] },
];

function compareScores(first, second) {
  for (let index = 0; index < first.length; index++) {
    if (first[index] !== second[index]) return first[index] - second[index];
  }
  return 0;
}

/**
 * The best placement of the four semantic roles on the free hues.
 * Returns { indices: {roleName: index}, score } where a lower score is
 * better: [-filled, worst cross, total cross, worst past arc, total past
 * arc, total distance from ideal].
 */
function placeSemanticRoles(hues, freeIndices, harmonyIndices, colorTwoOnNearestSlot, minimumSeparation) {
  const roleNames = Object.keys(SEMANTIC_ROLE_FAMILIES);
  const tooClose = (first, second) => circularHueDistance(hues[first], hues[second]) < minimumSeparation;
  const candidatesByRole = roleNames.map((roleName) => {
    const { ideal, arc, half } = SEMANTIC_ROLE_FAMILIES[roleName];
    const candidates = [];
    for (const index of freeIndices) {
      if (harmonyIndices.some((harmonyIndex) => tooClose(index, harmonyIndex))) continue;
      const cross = degreesOutsideRange(hues[index], half);
      const pastArc = degreesOutsideRange(hues[index], arc);
      if (!colorTwoOnNearestSlot && (cross > 0 || pastArc > MOVED_SLOT_ARC_TOLERANCE)) continue;
      candidates.push({ index, cross, pastArc, distance: circularHueDistance(hues[index], ideal) });
    }
    return candidates;
  });

  let best = null;
  const chosen = new Array(roleNames.length).fill(null);
  const usedIndices = new Set();
  function search(roleIndex) {
    if (roleIndex === roleNames.length) {
      const placed = chosen.filter(Boolean);
      const score = [
        -placed.length,
        Math.max(0, ...placed.map((candidate) => candidate.cross)),
        placed.reduce((total, candidate) => total + candidate.cross, 0),
        Math.max(0, ...placed.map((candidate) => candidate.pastArc)),
        placed.reduce((total, candidate) => total + candidate.pastArc, 0),
        placed.reduce((total, candidate) => total + candidate.distance, 0),
      ];
      if (!best || compareScores(score, best.score) < 0) best = { score, chosen: [...chosen] };
      return;
    }
    for (const candidate of candidatesByRole[roleIndex]) {
      if (usedIndices.has(candidate.index)) continue;
      if ([...usedIndices].some((usedIndex) => tooClose(candidate.index, usedIndex))) continue;
      chosen[roleIndex] = candidate;
      usedIndices.add(candidate.index);
      search(roleIndex + 1);
      usedIndices.delete(candidate.index);
    }
    chosen[roleIndex] = null;
    search(roleIndex + 1);
  }
  search(0);

  const indices = {};
  roleNames.forEach((roleName, roleIndex) => {
    if (best.chosen[roleIndex]) indices[roleName] = best.chosen[roleIndex].index;
  });
  return { indices, score: best.score };
}

/**
 * Model 2 (see above). Same arguments and result as computeColorScheme,
 * plus `harmonyName`; a semantic role with no hue is absent from `roles`.
 */
export function computeHueFamilyScheme(hues, anchorOneIndex, anchorTwoIndex, colorTwoOnNearestSlot = true, minimumSeparation = MIN_ROLE_HUE_SEPARATION) {
  const X = hues.length;
  if (X !== 12) throw new Error('computeHueFamilyScheme needs exactly 12 hues.');
  if (!Number.isInteger(anchorOneIndex) || !Number.isInteger(anchorTwoIndex) || anchorOneIndex < 0 || anchorTwoIndex < 0 || anchorOneIndex >= X || anchorTwoIndex >= X) {
    throw new Error(`anchorOneIndex and anchorTwoIndex must be integers in [0, ${X}).`);
  }
  if (anchorOneIndex === anchorTwoIndex) throw new Error('anchorOneIndex and anchorTwoIndex must be distinct.');

  const mod = (k) => ((k % X) + X) % X;
  const distance = mod(anchorTwoIndex - anchorOneIndex);
  const harmonies = [];
  for (const { name, place } of HARMONY_TYPES) {
    const placed = place(anchorOneIndex, anchorTwoIndex, distance, X);
    if (!placed) continue;
    const [tertiaryIndex, accentIndex] = placed.map(mod);
    const taken = new Set([anchorOneIndex, anchorTwoIndex, tertiaryIndex, accentIndex]);
    if (taken.size < 4) continue;
    const samePair = (harmony) => new Set([harmony.tertiaryIndex, harmony.accentIndex, tertiaryIndex, accentIndex]).size === 2;
    if (harmonies.some(samePair)) continue;
    const freeIndices = [...Array(X).keys()].filter((index) => !taken.has(index));
    harmonies.push({ name, tertiaryIndex, accentIndex, freeIndices, harmonyIndices: [...taken] });
  }

  // Step 1: model 1's harmony, if the semantic roles all fit their arcs.
  const isPerfect = (score) => score[0] === -4 && score[1] === 0 && score[3] === 0;
  let chosen = { harmony: harmonies[0], placement: placeSemanticRoles(hues, harmonies[0].freeIndices, harmonies[0].harmonyIndices, colorTwoOnNearestSlot, minimumSeparation) };
  if (!isPerfect(chosen.placement.score)) {
    // Step 2: the harmony that leaves the semantic roles best placed. Ties
    // (and differences only in distance from ideal) keep the earlier type.
    const placementOnly = (score) => score.slice(0, 5);
    for (const harmony of harmonies.slice(1)) {
      const placement = placeSemanticRoles(hues, harmony.freeIndices, harmony.harmonyIndices, colorTwoOnNearestSlot, minimumSeparation);
      if (compareScores(placementOnly(placement.score), placementOnly(chosen.placement.score)) < 0) chosen = { harmony, placement };
    }
  }

  const { harmony, placement } = chosen;
  const usedIndices = new Set([anchorOneIndex, anchorTwoIndex, harmony.tertiaryIndex, harmony.accentIndex, ...Object.values(placement.indices)]);
  const wheelDistance = wheelIndexDistance(anchorOneIndex, anchorTwoIndex, X);

  return {
    schemeName: SCHEME_NAMES_BY_DISTANCE[wheelDistance] || 'custom',
    harmonyName: harmony.name,
    wheelDistance,
    roles: {
      Primary: anchorOneIndex,
      Secondary: anchorTwoIndex,
      Tertiary: harmony.tertiaryIndex,
      Accent: harmony.accentIndex,
      ...placement.indices,
    },
    unusedIndices: [...Array(X).keys()].filter((index) => !usedIndices.has(index)),
  };
}
