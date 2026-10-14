/**
 * Hue wheels: where hues sit around colorhorse's 12-slot ring.
 *
 * "rgb" (the default) is the OKLCH hue circle itself. "ryb" is the
 * painter's red-yellow-blue wheel (Johannes Itten's, via rybitten): the
 * ring is laid out in RYB angles and each slot is converted to an OKLCH
 * hue only on the way out. Everything else (bending-energy spacing,
 * lightness, chroma, harmony roles) is unchanged; only the angle space
 * the ring lives in differs.
 *
 * The effect is that warm hues get more of the wheel than cool ones (RYB
 * 0-90, red through orange to yellow, covers only ~60 degrees of OKLCH
 * hue), and complements become the traditional painter's pairs: red
 * against green rather than red against cyan.
 *
 * The mapping is a lookup table (ryb-hue-table.js) sampled at every whole
 * RYB degree, linearly interpolated between samples. It's strictly
 * increasing, so the inverse is the same piecewise-linear curve read the
 * other way, and a hue converted to RYB and back returns to itself (up to
 * floating-point error), which keeps anchor colors exact.
 */
import { RYB_HUE_TABLE } from "./ryb-hue-table.js";
import { normalizeHue } from "./hue-deform.js";

export const WHEELS = ["rgb", "ryb"];

const SAMPLES = RYB_HUE_TABLE.length;

function tableAt(i) {
	return i < SAMPLES ? RYB_HUE_TABLE[i] : RYB_HUE_TABLE[0] + 360;
}

/** RYB wheel angle (degrees, any real number) -> OKLCH hue in [0, 360). */
export function rybToOklchHue(angle) {
	const a = normalizeHue(angle);
	const i = Math.floor(a);
	const t = a - i;
	return normalizeHue(tableAt(i) + t * (tableAt(i + 1) - tableAt(i)));
}

/** OKLCH hue (degrees, any real number) -> RYB wheel angle in [0, 360). */
export function oklchHueToRyb(hue) {
	const h = RYB_HUE_TABLE[0] + normalizeHue(hue - RYB_HUE_TABLE[0]);
	let lo = 0;
	let hi = SAMPLES; // invariant: tableAt(lo) <= h < tableAt(hi)
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		if (tableAt(mid) <= h) lo = mid;
		else hi = mid;
	}
	return normalizeHue(lo + (h - tableAt(lo)) / (tableAt(hi) - tableAt(lo)));
}

/**
 * The two conversions for a named wheel: `toWheel` takes an OKLCH hue to
 * a ring angle, `toHue` takes a ring angle back to an OKLCH hue.
 */
export function getWheel(name) {
	if (name === "rgb") return { toWheel: normalizeHue, toHue: normalizeHue };
	if (name === "ryb") return { toWheel: oklchHueToRyb, toHue: rybToOklchHue };
	throw new RangeError(`wheel must be one of ${WHEELS.map((w) => JSON.stringify(w)).join(", ")}, got ${JSON.stringify(name)}`);
}
