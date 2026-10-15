/**
 * Gamuts: how much chroma each (lightness, hue) may have.
 *
 * "srgb" (the default) is what a standard screen can show. "print" is
 * additionally limited to what CMYK offset printing on coated paper can
 * reproduce (FOGRA39 / ISO 12647-2, see print-gamut-table.js), so the
 * palette survives conversion to CMYK without saturated colors being
 * clipped: the blues, violets, magentas and bright greens a screen shows
 * but ink can't.
 *
 * Print is the smaller of the two limits at every point. CMYK reaches a
 * little beyond sRGB in the cyans, but the palette is still delivered as
 * sRGB hex, so those colors couldn't be shown anyway.
 *
 * Everything downstream works in relative chroma (0 = gray, 1 = this
 * gamut's edge), so swapping the limit reshapes the whole palette to the
 * new boundary rather than just clipping the colors that cross it.
 */
import { maxInGamutChroma } from "./oklch.js";
import { normalizeHue } from "./hue-deform.js";
import { LIGHTNESS_STEPS, HUE_STEPS, CHROMA_CEILING } from "./print-gamut-grid.js";
import { PRINT_GAMUT_TABLE } from "./print-gamut-table.js";

export const GAMUTS = ["srgb", "print"];

let printChromaGrid = null;

function printChromaAt(lightnessIndex, hueIndex) {
	if (printChromaGrid === null) {
		const binary = atob(PRINT_GAMUT_TABLE);
		printChromaGrid = Uint8Array.from(binary, (character) => character.charCodeAt(0));
	}
	return (printChromaGrid[lightnessIndex * HUE_STEPS + (hueIndex % HUE_STEPS)] / 255) * CHROMA_CEILING;
}

/**
 * The largest OKLCH chroma the print condition can reproduce at (L, H),
 * bilinearly interpolated between table samples. Not limited to sRGB; see
 * getGamut("print") for the combined limit.
 */
export function maxInPrintChroma(L, H) {
	const lightnessPosition = Math.min(Math.max(L, 0), 1) * (LIGHTNESS_STEPS - 1);
	const huePosition = (normalizeHue(H) / 360) * HUE_STEPS;
	const lightnessIndex = Math.min(Math.floor(lightnessPosition), LIGHTNESS_STEPS - 2);
	const hueIndex = Math.floor(huePosition);
	const lightnessFraction = lightnessPosition - lightnessIndex;
	const hueFraction = huePosition - hueIndex;
	const lower = printChromaAt(lightnessIndex, hueIndex) * (1 - hueFraction) + printChromaAt(lightnessIndex, hueIndex + 1) * hueFraction;
	const upper = printChromaAt(lightnessIndex + 1, hueIndex) * (1 - hueFraction) + printChromaAt(lightnessIndex + 1, hueIndex + 1) * hueFraction;
	return lower * (1 - lightnessFraction) + upper * lightnessFraction;
}

/** `{ maxChroma(L, H) }` for a named gamut. */
export function getGamut(name) {
	if (name === "srgb") return { maxChroma: maxInGamutChroma };
	if (name === "print") return { maxChroma: (L, H) => Math.min(maxInGamutChroma(L, H), maxInPrintChroma(L, H)) };
	throw new RangeError(`gamut must be one of ${GAMUTS.map((gamut) => JSON.stringify(gamut)).join(", ")}, got ${JSON.stringify(name)}`);
}
