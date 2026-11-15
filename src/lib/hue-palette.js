/**
 * The whole palette by hue: all 12 hues around the ring, each with its
 * shades, before any of them is named a role. It's the same pipeline as
 * colorhorse's getScheme (the same anchors, cylinder, and gamut), so each
 * role in getScheme is one of these hues.
 */
import { hexToOklch, oklchToSrgb } from "./oklch.js";
import { computeCylinderPoints } from "./cylinder-deform.js";
import { getWheel, getGamut } from "colorhorse";

export const HUE_COUNT = 12;

/**
 * @param {string} colorOne  "#rrggbb"
 * @param {string} colorTwo  "#rrggbb"
 * @param {{shadeCount?: number, minChroma?: number, minLightness?: number, maxLightness?: number, contrast?: number, wheel?: string, gamut?: string}} [options]
 *   the same defaults as colorhorse
 * @returns {{hues: {hue: number, shades: string[]}[], colorOneIndex: number, colorTwoIndex: number}}
 *   hues in ring order; shades from darkest to lightest, as hex
 */
export function huePalette(colorOne, colorTwo, {
	shadeCount = 10,
	minChroma = 0.2,
	minLightness = 0.1,
	maxLightness = 0.98,
	contrast = 0,
	wheel = "rgb",
	gamut = "srgb",
} = {}) {
	const hueWheel = getWheel(wheel);
	const chromaGamut = getGamut(gamut);
	const anchors = [colorOne, colorTwo].map((hex) => {
		const { L, C, H } = hexToOklch(hex);
		const maxChroma = chromaGamut.maxChroma(L, H);
		return { D: hueWheel.toWheel(H), Z: L, R: maxChroma > 1e-9 ? Math.min(1, C / maxChroma) : 0, L, C, H };
	});
	const cylinder = computeCylinderPoints(HUE_COUNT, shadeCount, anchors, minChroma, minLightness, maxLightness, contrast);
	const hues = cylinder.D.map((wheelAngle) => ({ hue: hueWheel.toHue(wheelAngle), shades: [] }));
	for (const point of cylinder.points) {
		const hue = hues[point.dIndex].hue;
		const chroma = point.R * chromaGamut.maxChroma(point.Z, hue);
		hues[point.dIndex].shades[point.zIndex] = oklchToSrgb(point.Z, chroma, hue).hex;
	}
	return { hues, colorOneIndex: cylinder.anchorIndices[0], colorTwoIndex: cylinder.anchorIndices[1] };
}

/**
 * The palette's hues in ring order starting from color one's (the primary
 * seed), so hue 1 is always color one's whatever the input colors are.
 *
 * @param {{hues: {hue: number, shades: string[]}[], colorOneIndex: number, colorTwoIndex: number}} palette
 *   from huePalette
 * @returns {{hues: {hue: number, shades: string[]}[], colorTwoPosition: number}}
 *   colorTwoPosition is color two's index in the reordered hues
 */
export function huesFromColorOne(palette) {
	const hueCount = palette.hues.length;
	const hues = palette.hues.map((_, position) => palette.hues[(palette.colorOneIndex + position) % hueCount]);
	const colorTwoPosition = (palette.colorTwoIndex - palette.colorOneIndex + hueCount) % hueCount;
	return { hues, colorTwoPosition };
}
