/**
 * colorhorse: given two anchor colors, generate a full, smoothly-related
 * OKLCH color scheme -- 12 hues around a ring (bending-energy relaxed
 * between the two anchors, same model as the /circle demo), each with a
 * lightness/chroma taper of `shadeCount` shades (same model as /line and
 * /curve), classified into 8 named roles: primary/secondary/tertiary/
 * accent, which form a color harmony, plus success/info/warning/danger,
 * each kept inside its own hue family (see scheme.js, model 2; model 1 is
 * the 0.6 assignment, by plain hue distance).
 *
 * All the underlying math (deform.js, hue-deform.js, line-deform.js,
 * cylinder-deform.js, scheme.js, oklch.js) is unchanged from the SvelteKit
 * app this package was extracted from -- this file is only the public API
 * layer tying those modules together and shaping their output.
 *
 * This is a minimal initial release: the main public export is `getScheme`,
 * the package's core promised functionality (two colors in, a full 80-color
 * named-role scheme out), plus the hue-wheel conversions it uses. The formatting/utility helpers a fuller release
 * might add (raw palette grids, CSS output, WCAG contrast, etc.) aren't
 * part of this surface yet.
 */
import { hexToOklch, oklchToSrgb } from "./oklch.js";
import { computeCylinderD, computeCylinderPoints } from "./cylinder-deform.js";
import { computeColorScheme } from "./scheme.js";
import { getWheel } from "./ryb-wheel.js";
import { getGamut } from "./gamut.js";

const HUE_COUNT = 12; // fixed: computeColorScheme's harmony-name table (square/
// analagous/tertiary/...) is defined specifically for a 12-slot wheel -- a
// different hue count wouldn't have a meaningful scheme name to report.

const DEFAULTS = {
	colorOne: "#4da3ff",
	colorTwo: "#ff6b4d",
	minLightness: 0.1,
	maxLightness: 0.98,
	minChroma: 0.2,
	contrast: 0,
	shadeCount: 10,
	wheel: "rgb",
	gamut: "srgb",
};

// One-color fallback: when only colorOne is given, colorTwo is synthesized
// rather than falling back to the unrelated built-in DEFAULTS pair, so the
// scheme still visibly relates to the one color the caller actually chose.
// +45deg (an eighth of the wheel) reads as a neighboring, harmonious hue
// rather than the muddier near-duplicate a smaller offset would give, or
// the jarring high-contrast pairing a wide offset (e.g. complementary,
// +180deg) would give -- and it's deliberately NOT a multiple of 360/12=30,
// so it doesn't land exactly on a native D-ring slot and trigger a
// zero-bending-energy (i.e. perfectly evenly-spaced, same as no anchoring
// at all) special case -- see cylinder-deform.js's "THE D AXIS" doc.
const ADJACENT_HUE_OFFSET_DEG = 45;

/** Same lightness/chroma as `hex`, rotated ADJACENT_HUE_OFFSET_DEG around `wheel`. */
function adjacentHex(hex, wheel) {
	const { L, C, H } = hexToOklch(hex);
	return oklchToSrgb(L, C, wheel.toHue(wheel.toWheel(H) + ADJACENT_HUE_OFFSET_DEG)).hex;
}

// scheme.js's own role keys (kept as-is so its tests/logic stay untouched --
// "Tip" is what its hue-picking math calls the role closest to reference
// green) are renamed once, here, to the names this package's consumers see.
const ROLE_ORDER = ["Primary", "Secondary", "Tertiary", "Accent", "Tip", "Info", "Warning", "Danger"];
const PUBLIC_ROLE_NAME = {
	Primary: "primary",
	Secondary: "secondary",
	Tertiary: "tertiary",
	Accent: "accent",
	Tip: "success",
	Info: "info",
	Warning: "warning",
	Danger: "danger",
};

function resolveColors(colorOne, colorTwo, wheel) {
	const colorOneGiven = colorOne !== undefined;
	colorOne = colorOneGiven ? colorOne : DEFAULTS.colorOne;
	assertValidHex(colorOne, "colorOne");
	if (colorTwo === undefined) {
		colorTwo = colorOneGiven ? adjacentHex(colorOne, wheel) : DEFAULTS.colorTwo;
	}
	assertValidHex(colorTwo, "colorTwo");
	return { colorOne, colorTwo };
}

function validColorTwoSlot(colorTwoSlot) {
	if (colorTwoSlot === undefined) return undefined;
	if (!Number.isInteger(colorTwoSlot) || colorTwoSlot < 1 || colorTwoSlot > HUE_COUNT - 1) {
		throw new RangeError(`colorTwoSlot must be an integer from 1 to ${HUE_COUNT - 1}, got ${JSON.stringify(colorTwoSlot)}`);
	}
	return colorTwoSlot;
}

const ROLE_MODELS = [1, 2];
const DEFAULT_ROLE_MODEL = 2;

function validRoleModel(roleModel) {
	if (roleModel === undefined) return DEFAULT_ROLE_MODEL;
	if (!ROLE_MODELS.includes(roleModel)) {
		throw new RangeError(`roleModel must be 1 or 2, got ${JSON.stringify(roleModel)}`);
	}
	return roleModel;
}

/** Scheme.js's role keys renamed to the public names; absent roles left out. */
function publicRoleIndices(schemeRoles) {
	const roles = {};
	for (const roleKey of ROLE_ORDER) {
		if (roleKey in schemeRoles) roles[PUBLIC_ROLE_NAME[roleKey]] = schemeRoles[roleKey];
	}
	return roles;
}

const HEX_PATTERN = /^#?[0-9a-fA-F]{6}$/;

// Pure grays come out of hexToOklch with round-off chroma (~1e-8), never an
// exact 0 (at most ~4e-8); a barely tinted #888889 is ~1.5e-3.
const GRAY_CHROMA = 1e-6;

function assertValidHex(hex, label) {
	if (typeof hex !== "string" || !HEX_PATTERN.test(hex)) {
		throw new TypeError(`${label} must be a "#rrggbb" hex string, got ${JSON.stringify(hex)}`);
	}
}

// D is the anchor's angle on the ring (in `wheel`'s angle space); H is its
// OKLCH hue. R is relative to `gamut`, capped at its edge.
function anchorFromHex(hex, wheel, gamut) {
	const { L, C, H } = hexToOklch(hex);
	const maxChroma = gamut.maxChroma(L, H);
	const relativeChroma = maxChroma > 1e-9 ? Math.min(1, C / maxChroma) : 0;
	return { D: wheel.toWheel(H), Z: L, R: relativeChroma, L, C, H };
}

/**
 * Compute the full color scheme for one or two anchor colors. If colorTwo
 * is omitted (colorOne given on its own), it's synthesized via adjacentHex
 * rather than falling back to DEFAULTS.colorTwo -- see ADJACENT_HUE_OFFSET_DEG.
 * If BOTH are omitted, DEFAULTS' own built-in pair is used, unchanged from
 * before this fallback existed.
 *
 * @param {string} [colorOne] "#rrggbb" hex
 * @param {string} [colorTwo] "#rrggbb" hex
 * @param {{minLightness?: number, maxLightness?: number, minChroma?: number, contrast?: number, shadeCount?: number, wheel?: "rgb" | "ryb", gamut?: "srgb" | "print", colorTwoSlot?: number}} [options]
 *   contrast: 0..1, biases shades toward the light and dark ends of each
 *   ramp (0 = evenly spread); throws a RangeError outside that range
 *   wheel: the hue wheel the 12 hues are spaced around (see ryb-wheel.js);
 *   throws a RangeError for anything else
 *   gamut: the chroma limit (see gamut.js); with "print", an input color
 *   outside the print gamut is desaturated to its edge, so it no longer
 *   appears exactly; throws a RangeError for anything else
 *   colorTwoSlot: 1..11, how many slots after colorOne's slot colorTwo lands,
 *   counting up the wheel (see tension-ring.js); omit for the nearest slot.
 *   Throws a RangeError outside that range or when both hues are equal
 *   roleModel: 2 (the default) keeps success/info/warning/danger in their
 *   hue families; on a slot other than the nearest one, a role with no
 *   hue near its family is left out. 1 is the 0.6 assignment, where every
 *   role is always present
 * @returns {{
 *   schemeName: string, harmonyName: string, wheelDistance: number,
 *   anchors: {colorOne: object, colorTwo: object},
 *   hueCount: number, shadeCount: number,
 *   shadeGrid: object[][],   // [shadeIndex][hueIndex] -> {hue, lightness, chroma, hex, rgb, isAnchor}
 *   roles: Record<string, object[]>,  // role name -> shadeCount-length array of the same point shape; absent roles are left out
 * }}
 */
function generatePalette(colorOne, colorTwo, options = {}) {
	const wheel = getWheel(options.wheel === undefined ? DEFAULTS.wheel : options.wheel);
	const gamut = getGamut(options.gamut === undefined ? DEFAULTS.gamut : options.gamut);
	({ colorOne, colorTwo } = resolveColors(colorOne, colorTwo, wheel));
	const colorTwoSlot = validColorTwoSlot(options.colorTwoSlot);
	const roleModel = validRoleModel(options.roleModel);
	const {
		minLightness = DEFAULTS.minLightness,
		maxLightness = DEFAULTS.maxLightness,
		minChroma = DEFAULTS.minChroma,
		contrast = DEFAULTS.contrast,
		shadeCount = DEFAULTS.shadeCount,
	} = options;
	if (typeof contrast !== "number" || !(contrast >= 0 && contrast <= 1)) {
		throw new RangeError(`contrast must be a number from 0 to 1, got ${JSON.stringify(contrast)}`);
	}

	const anchorOne = anchorFromHex(colorOne, wheel, gamut);
	if(anchorOne.C < GRAY_CHROMA) throw new Error("colorOne has a chroma of zero. Both input colors must have a chroma greater than zero.")
	const anchorTwo = anchorFromHex(colorTwo, wheel, gamut);
	if(anchorTwo.C < GRAY_CHROMA) throw new Error("colorTwo has a chroma of zero. Both input colors must have a chroma greater than zero.")
	const cylinder = computeCylinderPoints(
		HUE_COUNT,
		shadeCount,
		[anchorOne, anchorTwo],
		minChroma,
		minLightness,
		maxLightness,
		contrast,
		colorTwoSlot,
	);
	// Choosing the nearest slot explicitly is the same as omitting it.
	const nearestRing = computeCylinderD(HUE_COUNT, [anchorOne, anchorTwo]);
	const nearestSlot = (nearestRing.anchorIndices[1] - nearestRing.anchorIndices[0] + HUE_COUNT) % HUE_COUNT;
	const colorTwoOnNearestSlot = colorTwoSlot === undefined || colorTwoSlot === nearestSlot;
	// Semantic roles pick by OKLCH hue, so the scheme sees real hues, not
	// ring angles.
	const scheme = computeColorScheme(cylinder.D.map(wheel.toHue), cylinder.anchorIndices[0], cylinder.anchorIndices[1], {
		model: roleModel,
		colorTwoOnNearestSlot,
	});

	const enrichedPoints = cylinder.points.map((point) => {
		const hue = wheel.toHue(point.D);
		const absoluteChroma = point.R * gamut.maxChroma(point.Z, hue);
		const srgb = oklchToSrgb(point.Z, absoluteChroma, hue);
		return {
			hueIndex: point.dIndex,
			shadeIndex: point.zIndex,
			hue,
			lightness: point.Z,
			chroma: absoluteChroma,
			hex: srgb.hex,
			rgb: { r: srgb.r, g: srgb.g, b: srgb.b },
			isAnchor: point.isAnchor,
		};
	});

	const shadeGrid = [];
	for (let shadeIndex = 0; shadeIndex < shadeCount; shadeIndex++) {
		shadeGrid.push(enrichedPoints.slice(shadeIndex * HUE_COUNT, shadeIndex * HUE_COUNT + HUE_COUNT));
	}

	const roles = {};
	for (const [roleName, hueIndex] of Object.entries(publicRoleIndices(scheme.roles))) {
		roles[roleName] = shadeGrid.map((hueRow) => hueRow[hueIndex]);
	}

	return {
		schemeName: scheme.schemeName,
		harmonyName: scheme.harmonyName ?? "primary axis",
		wheelDistance: scheme.wheelDistance,
		anchors: {
			colorOne: { hex: colorOne, hue: anchorOne.H, lightness: anchorOne.L, chroma: anchorOne.C },
			colorTwo: { hex: colorTwo, hue: anchorTwo.H, lightness: anchorTwo.L, chroma: anchorTwo.C },
		},
		hueCount: HUE_COUNT,
		shadeCount,
		shadeGrid,
		roles,
	};
}

/** Role name -> array of hex strings (one per shade). */
function paletteToHexScheme(palette) {
	const result = {};
	for (const [roleName, shadeList] of Object.entries(palette.roles)) {
		result[roleName] = shadeList.map((point) => point.hex);
	}
	return result;
}

/**
 * The 8-role scheme as hex strings (8*shadeCount colors, 80 with the
 * default shadeCount). colorTwo is optional: pass colorOne alone to get a
 * one-color fallback scheme (colorTwo synthesized adjacent to it -- see
 * ADJACENT_HUE_OFFSET_DEG); omit both for the built-in default pair.
 */
export function getScheme(colorOne, colorTwo, options) {
	return paletteToHexScheme(generatePalette(colorOne, colorTwo, options));
}

/**
 * The 12 ring hues (OKLCH degrees), in the same hue order as the scheme's
 * shades, plus which ring index each anchor sits on. Takes the same colors
 * and the `wheel` and `colorTwoSlot` options as getScheme.
 *
 * @returns {{hues: number[], colorOneIndex: number, colorTwoIndex: number}}
 */
export function getHueRing(colorOne, colorTwo, options = {}) {
	const wheel = getWheel(options.wheel === undefined ? DEFAULTS.wheel : options.wheel);
	({ colorOne, colorTwo } = resolveColors(colorOne, colorTwo, wheel));
	const colorTwoSlot = validColorTwoSlot(options.colorTwoSlot);
	const anchors = [colorOne, colorTwo].map((hex) => ({ D: wheel.toWheel(hexToOklch(hex).H) }));
	const ring = computeCylinderD(HUE_COUNT, anchors, colorTwoSlot);
	return {
		hues: ring.D.map(wheel.toHue),
		colorOneIndex: ring.anchorIndices[0],
		colorTwoIndex: ring.anchorIndices[1],
	};
}

/**
 * Assign the 8 roles to a ring of 12 hues you've computed yourself (e.g.
 * from getHueRing): which hue index each role uses, and the harmony the
 * tertiary and accent roles form.
 *
 * @param {number[]} hues  12 OKLCH hues in ring order
 * @param {number} colorOneIndex
 * @param {number} colorTwoIndex
 * @param {{roleModel?: 1 | 2, colorTwoOnNearestSlot?: boolean}} [options]
 *   colorTwoOnNearestSlot (default true): false when colorTwo was moved to
 *   a slot other than its nearest one, which lets roleModel 2 leave a role
 *   out
 * @returns {{schemeName: string, harmonyName: string, roles: Record<string, number>, unusedIndices: number[]}}
 */
export function assignRoles(hues, colorOneIndex, colorTwoIndex, options = {}) {
	if (!Array.isArray(hues) || hues.length !== HUE_COUNT) {
		throw new RangeError(`hues must be an array of ${HUE_COUNT} hues`);
	}
	const scheme = computeColorScheme(hues, colorOneIndex, colorTwoIndex, {
		model: validRoleModel(options.roleModel),
		colorTwoOnNearestSlot: options.colorTwoOnNearestSlot ?? true,
	});
	return {
		schemeName: scheme.schemeName,
		harmonyName: scheme.harmonyName ?? "primary axis",
		roles: publicRoleIndices(scheme.roles),
		unusedIndices: scheme.unusedIndices,
	};
}

// The wheel conversions, for callers that draw or label the wheel themselves.
export { WHEELS, getWheel, rybToOklchHue, oklchHueToRyb } from "./ryb-wheel.js";
export { GAMUTS, getGamut, maxInPrintChroma } from "./gamut.js";
