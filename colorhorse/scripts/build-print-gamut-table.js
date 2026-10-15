/**
 * Regenerates src/print-gamut-table.js: the largest OKLCH chroma a CMYK
 * print condition can reproduce at each (lightness, hue), measured with
 * LittleCMS. lcms-wasm isn't a dependency (it drags in ~130 packages for
 * one offline script), so install it unsaved first:
 *
 *   npm install --no-save lcms-wasm@1
 *   node scripts/build-print-gamut-table.js path/to/profile.icc
 *
 * The shipped table comes from ISO Coated v2 300% (basICColor), i.e.
 * FOGRA39 / ISO 12647-2 coated offset, as distributed with Apache PDFBox:
 * https://raw.githubusercontent.com/apache/pdfbox/trunk/pdfbox/src/test/resources/org/apache/pdfbox/resources/icc/ISOcoated_v2_300_bas.icc
 * Any CMYK output profile works (e.g. PSO Coated v3 / FOGRA51, or
 * GRACoL 2013 / CRPC6) -- regenerate with that file to retarget.
 *
 * A color counts as printable when it survives Lab -> CMYK -> Lab within
 * MAX_ROUND_TRIP_DELTA_E: out-of-gamut colors get clipped on the way to
 * CMYK and come back noticeably different. Both directions use relative
 * colorimetric with black point compensation, the usual setting for
 * converting graphics to print, so paper white is white and the press's
 * darkest black stands in for black instead of everything below it being
 * unprintable.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
	instantiate,
	INTENT_RELATIVE_COLORIMETRIC,
	cmsFLAGS_BLACKPOINTCOMPENSATION,
	cmsInfoDescription,
} from "lcms-wasm";
import { oklchToLinearSrgb } from "../src/oklch.js";
import { LIGHTNESS_STEPS, HUE_STEPS, CHROMA_CEILING } from "../src/print-gamut-grid.js";

const MAX_ROUND_TRIP_DELTA_E = 1;
const SEARCH_ITERATIONS = 20;

// LittleCMS pixel formats, FLOAT_SH(1) | COLORSPACE_SH(pt) | CHANNELS_SH(n) | BYTES_SH(4).
// 32-bit floats: lcms-wasm's cmsDoTransform mishandles 64-bit (_DBL) buffers.
const TYPE_LAB_FLT = (1 << 22) | (10 << 16) | (3 << 3) | 4;
const TYPE_CMYK_FLT = (1 << 22) | (6 << 16) | (4 << 3) | 4;

const profilePath = process.argv[2];
if (!profilePath) {
	console.error("usage: node scripts/build-print-gamut-table.js path/to/profile.icc");
	process.exit(1);
}

const lcms = await instantiate();
const profileBytes = readFileSync(profilePath);
const cmykProfile = lcms.cmsOpenProfileFromMem(new Uint8Array(profileBytes), profileBytes.byteLength);
if (!cmykProfile || lcms.cmsGetColorSpaceASCII(cmykProfile) !== "CMYK") {
	throw new Error(`${profilePath} is not a CMYK profile`);
}
const profileName = lcms.cmsGetProfileInfoASCII(cmykProfile, cmsInfoDescription, "en", "US");
const labProfile = lcms.cmsCreateLab4Profile(null); // D50
const flags = cmsFLAGS_BLACKPOINTCOMPENSATION;
const labToCmyk = lcms.cmsCreateTransform(labProfile, TYPE_LAB_FLT, cmykProfile, TYPE_CMYK_FLT, INTENT_RELATIVE_COLORIMETRIC, flags);
const cmykToLab = lcms.cmsCreateTransform(cmykProfile, TYPE_CMYK_FLT, labProfile, TYPE_LAB_FLT, INTENT_RELATIVE_COLORIMETRIC, flags);

// OKLCH -> CIELAB (D50), the profile connection space. Linear sRGB is
// unclamped here, so it reaches colors outside sRGB too.
const D50_WHITE = [0.96422, 1, 0.82521];
function oklchToLabD50(L, C, H) {
	const { r, g, b } = oklchToLinearSrgb(L, C, H);
	const x65 = 0.4123908 * r + 0.3575843 * g + 0.1804808 * b;
	const y65 = 0.2126390 * r + 0.7151687 * g + 0.0721923 * b;
	const z65 = 0.0193308 * r + 0.1191948 * g + 0.9505322 * b;
	// Bradford chromatic adaptation, D65 -> D50.
	const xyz = [
		1.0479298 * x65 + 0.0229469 * y65 - 0.0501923 * z65,
		0.0296278 * x65 + 0.9904344 * y65 - 0.0170738 * z65,
		-0.0092430 * x65 + 0.0150552 * y65 + 0.7518743 * z65,
	];
	const [fx, fy, fz] = xyz.map((value, axis) => {
		const t = value / D50_WHITE[axis];
		return t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
	});
	return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const samples = [];
for (let lightnessIndex = 0; lightnessIndex < LIGHTNESS_STEPS; lightnessIndex++) {
	for (let hueIndex = 0; hueIndex < HUE_STEPS; hueIndex++) {
		samples.push({
			L: lightnessIndex / (LIGHTNESS_STEPS - 1),
			H: (hueIndex * 360) / HUE_STEPS,
			low: 0,
			high: CHROMA_CEILING,
		});
	}
}

function printable(chromas) {
	const labs = samples.flatMap((sample, index) => oklchToLabD50(sample.L, chromas[index], sample.H));
	const cmyk = lcms.cmsDoTransform(labToCmyk, labs, samples.length);
	const back = lcms.cmsDoTransform(cmykToLab, cmyk, samples.length);
	return samples.map((_, index) => {
		const offset = index * 3;
		const deltaE = Math.hypot(labs[offset] - back[offset], labs[offset + 1] - back[offset + 1], labs[offset + 2] - back[offset + 2]);
		return deltaE <= MAX_ROUND_TRIP_DELTA_E;
	});
}

// Gray itself can fail at the very ends (e.g. L=0 is darker than the
// press's black): those slices get a max chroma of 0.
const grayPrintable = printable(samples.map(() => 0));
for (let iteration = 0; iteration < SEARCH_ITERATIONS; iteration++) {
	const midpoints = samples.map((sample) => (sample.low + sample.high) / 2);
	printable(midpoints).forEach((isPrintable, index) => {
		if (isPrintable) samples[index].low = midpoints[index];
		else samples[index].high = midpoints[index];
	});
}

// One byte per sample, rounded down so the table never overstates the gamut.
const bytes = Uint8Array.from(samples, (sample, index) =>
	grayPrintable[index] ? Math.floor((sample.low / CHROMA_CEILING) * 255) : 0,
);

writeFileSync(
	new URL("../src/print-gamut-table.js", import.meta.url),
	`// Generated by scripts/build-print-gamut-table.js -- do not edit.
// Profile: ${profileName}
// Max printable OKLCH chroma on the grid in print-gamut-grid.js, one byte
// per sample (lightness-major, value / 255 * CHROMA_CEILING), base64.
export const PRINT_GAMUT_PROFILE = ${JSON.stringify(profileName)};
export const PRINT_GAMUT_TABLE = "${Buffer.from(bytes).toString("base64")}";
`,
);
console.log(`${profileName}: ${samples.length} samples`);
