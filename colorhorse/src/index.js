/**
 * colorhorse: given two anchor colors, generate a full, smoothly-related
 * OKLCH color scheme -- 12 hues around a ring (bending-energy relaxed
 * between the two anchors, same model as the /circle demo), each with a
 * lightness/chroma taper of `shadeCount` shades (same model as /line and
 * /curve), classified into 8 named roles (primary/secondary/tertiary/accent
 * plus success/info/warning/danger) by hue distance to reference red/green/
 * blue/yellow.
 *
 * All the underlying math (deform.js, hue-deform.js, line-deform.js,
 * cylinder-deform.js, scheme.js, oklch.js) is unchanged from the SvelteKit
 * app this package was extracted from -- this file is only the public API
 * layer tying those modules together and shaping their output.
 *
 * This is a minimal initial release: the one public export is `getScheme`,
 * the package's core promised functionality (two colors in, a full 80-color
 * named-role scheme out). The formatting/utility helpers a fuller release
 * might add (raw palette grids, CSS output, WCAG contrast, etc.) aren't
 * part of this surface yet.
 */
import { hexToOklch, oklchToSrgb, maxInGamutChroma } from "./oklch.js";
import { computeCylinderPoints } from "./cylinder-deform.js";
import { computeColorScheme } from "./scheme.js";

const HUE_COUNT = 12; // fixed: computeColorScheme's harmony-name table (square/
// analagous/tertiary/...) is defined specifically for a 12-slot wheel -- a
// different hue count wouldn't have a meaningful scheme name to report.

const DEFAULTS = {
	colorOne: "#4da3ff",
	colorTwo: "#ff6b4d",
	minLightness: 0.1,
	maxLightness: 0.98,
	minChroma: 0.2,
	shadeCount: 10,
};

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

const HEX_PATTERN = /^#?[0-9a-fA-F]{6}$/;

function assertValidHex(hex, label) {
	if (typeof hex !== "string" || !HEX_PATTERN.test(hex)) {
		throw new TypeError(`${label} must be a "#rrggbb" hex string, got ${JSON.stringify(hex)}`);
	}
}

function anchorFromHex(hex) {
	const { L, C, H } = hexToOklch(hex);
	const maxChroma = maxInGamutChroma(L, H);
	const relativeChroma = maxChroma > 1e-9 ? Math.min(1, C / maxChroma) : 0;
	return { D: H, Z: L, R: relativeChroma, L, C };
}

/**
 * Compute the full color scheme for two anchor colors.
 *
 * @param {string} colorOne "#rrggbb" hex
 * @param {string} colorTwo "#rrggbb" hex
 * @param {{minLightness?: number, maxLightness?: number, minChroma?: number, shadeCount?: number}} [options]
 * @returns {{
 *   schemeName: string, wheelDistance: number,
 *   anchors: {colorOne: object, colorTwo: object},
 *   hueCount: number, shadeCount: number,
 *   shadeGrid: object[][],   // [shadeIndex][hueIndex] -> {hue, lightness, chroma, hex, rgb, isAnchor}
 *   roles: Record<string, object[]>,  // role name -> shadeCount-length array of the same point shape
 * }}
 */
function generatePalette(colorOne = DEFAULTS.colorOne, colorTwo = DEFAULTS.colorTwo, options = {}) {
	assertValidHex(colorOne, "colorOne");
	assertValidHex(colorTwo, "colorTwo");
	const {
		minLightness = DEFAULTS.minLightness,
		maxLightness = DEFAULTS.maxLightness,
		minChroma = DEFAULTS.minChroma,
		shadeCount = DEFAULTS.shadeCount,
	} = options;

	const anchorOne = anchorFromHex(colorOne);
	if(anchorOne.C === 0) throw new Error("colorOne has a chroma of zero. Both input colors must have a chroma greater than zero.")
	const anchorTwo = anchorFromHex(colorTwo);
	if(anchorTwo.C === 0) throw new Error("colorTwo has a chroma of zero. Both input colors must have a chroma greater than zero.")
	const cylinder = computeCylinderPoints(HUE_COUNT, shadeCount, [anchorOne, anchorTwo], minChroma, minLightness, maxLightness);
	const scheme = computeColorScheme(cylinder.D, cylinder.anchorIndices[0], cylinder.anchorIndices[1]);

	const enrichedPoints = cylinder.points.map((point) => {
		const absoluteChroma = point.R * maxInGamutChroma(point.Z, point.D);
		const srgb = oklchToSrgb(point.Z, absoluteChroma, point.D);
		return {
			hueIndex: point.dIndex,
			shadeIndex: point.zIndex,
			hue: point.D,
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
	for (const roleKey of ROLE_ORDER) {
		const hueIndex = scheme.roles[roleKey];
		roles[PUBLIC_ROLE_NAME[roleKey]] = shadeGrid.map((hueRow) => hueRow[hueIndex]);
	}

	return {
		schemeName: scheme.schemeName,
		wheelDistance: scheme.wheelDistance,
		anchors: {
			colorOne: { hex: colorOne, hue: anchorOne.D, lightness: anchorOne.L, chroma: anchorOne.C },
			colorTwo: { hex: colorTwo, hue: anchorTwo.D, lightness: anchorTwo.L, chroma: anchorTwo.C },
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

/** The 8-role scheme as hex strings (8*shadeCount colors, 80 with the default shadeCount). */
export function getScheme(colorOne, colorTwo, options) {
	return paletteToHexScheme(generatePalette(colorOne, colorTwo, options));
}
