/**
 * Tests for gamut.js: the print chroma table and getGamut().
 */
import { GAMUTS, getGamut, maxInPrintChroma } from './gamut.js';
import { PRINT_GAMUT_TABLE } from './print-gamut-table.js';
import { LIGHTNESS_STEPS, HUE_STEPS, CHROMA_CEILING } from './print-gamut-grid.js';
import { maxInGamutChroma } from './oklch.js';

import { describe, it, expect } from 'vitest';

describe('gamut', () => {
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

		const bytes = Uint8Array.from(atob(PRINT_GAMUT_TABLE), (character) => character.charCodeAt(0));
		assert(bytes.length === LIGHTNESS_STEPS * HUE_STEPS, 'table has one byte per grid sample');

		// Grid points come back exactly; in between is interpolated.
		for (const [lightnessIndex, hueIndex] of [[50, 0], [30, 132], [70, 55], [100, 179]]) {
			const expected = (bytes[lightnessIndex * HUE_STEPS + hueIndex] / 255) * CHROMA_CEILING;
			const actual = maxInPrintChroma(lightnessIndex / (LIGHTNESS_STEPS - 1), (hueIndex * 360) / HUE_STEPS);
			assert(Math.abs(actual - expected) < 1e-9, `maxInPrintChroma hits grid sample (${lightnessIndex}, ${hueIndex})`);
		}
		const between = maxInPrintChroma(0.505, 265);
		const corners = [[0.5, 264], [0.5, 266], [0.51, 264], [0.51, 266]].map(([L, H]) => maxInPrintChroma(L, H));
		assert(between >= Math.min(...corners) - 1e-12 && between <= Math.max(...corners) + 1e-12, 'interpolated values sit between their grid corners');
		assert(Math.abs(maxInPrintChroma(0.6, 359.999) - maxInPrintChroma(0.6, 0)) < 1e-3, 'hue wraps smoothly at 360');
		assert(maxInPrintChroma(0.6, -40) === maxInPrintChroma(0.6, 320), 'hue is periodic');
		assert(maxInPrintChroma(1.5, 100) === maxInPrintChroma(1, 100) && maxInPrintChroma(-1, 100) === maxInPrintChroma(0, 100), 'lightness is clamped to 0..1');

		// The print limit never exceeds sRGB anywhere.
		const print = getGamut('print');
		const srgb = getGamut('srgb');
		let worstExcess = 0;
		for (let L = 0; L <= 1; L += 0.0125) {
			for (let H = 0; H < 360; H += 7.5) {
				worstExcess = Math.max(worstExcess, print.maxChroma(L, H) - srgb.maxChroma(L, H));
			}
		}
		assert(worstExcess <= 0, `print is never wider than sRGB (worst excess ${worstExcess})`);
		assert(srgb.maxChroma === maxInGamutChroma, 'srgb is the plain sRGB limit');

		// The shape of coated offset printing: saturated blue, violet and
		// green are well beyond ink; mid cyans reach past sRGB.
		assert(maxInPrintChroma(0.5, 264) < 0.6 * maxInGamutChroma(0.5, 264), 'mid blue loses much of its sRGB chroma in print');
		assert(maxInPrintChroma(0.5, 328) < 0.8 * maxInGamutChroma(0.5, 328), 'mid magenta loses chroma in print');
		assert(maxInPrintChroma(0.9, 142) < 0.5 * maxInGamutChroma(0.9, 142), 'light bright green loses most of its chroma in print');
		assert(maxInPrintChroma(0.5, 195) > maxInGamutChroma(0.5, 195), 'mid cyan reaches past sRGB');
		assert(print.maxChroma(0.5, 195) === maxInGamutChroma(0.5, 195), 'so the combined print limit there is sRGB');
		assert(print.maxChroma(0.5, 50) > 0.08, 'mid oranges and reds keep most of their chroma');

		assert(GAMUTS.join(',') === 'srgb,print', 'GAMUTS lists srgb and print');
		for (const bad of ['sRGB', 'cmyk', 'p3', '', null, 0]) {
			let threw = false;
			try {
				getGamut(bad);
			} catch (error) {
				threw = error instanceof RangeError;
			}
			assert(threw, `getGamut(${JSON.stringify(bad)}) throws a RangeError`);
		}

		expect(failed, failed + ' assertion(s) failed -- see console output above for FAIL: details').toBe(0);
	});
});
