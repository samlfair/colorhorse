/**
 * Tests for ryb-wheel.js: the RYB <-> OKLCH hue mapping and getWheel().
 */
import { WHEELS, rybToOklchHue, oklchHueToRyb, getWheel } from './ryb-wheel.js';
import { RYB_HUE_TABLE } from './ryb-hue-table.js';
import { hexToOklch } from './oklch.js';
import { circularDelta } from './hue-deform.js';

import { describe, it, expect } from 'vitest';

describe('ryb-wheel', () => {
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

		// The table is a full, strictly increasing turn (so it's invertible).
		assert(RYB_HUE_TABLE.length === 360, 'one table entry per whole RYB degree');
		let increasing = true;
		for (let i = 1; i < RYB_HUE_TABLE.length; i++) {
			if (!(RYB_HUE_TABLE[i] > RYB_HUE_TABLE[i - 1])) increasing = false;
		}
		assert(increasing, 'table is strictly increasing');
		assert(RYB_HUE_TABLE[359] < RYB_HUE_TABLE[0] + 360, 'table spans less than one full turn before wrapping');

		// Table knots are hit exactly; results are normalized to [0, 360).
		for (const angle of [0, 1, 90, 180, 359]) {
			const expected = ((RYB_HUE_TABLE[angle] % 360) + 360) % 360;
			assert(Math.abs(rybToOklchHue(angle) - expected) < 1e-9, `rybToOklchHue(${angle}) is the table value`);
		}
		for (const angle of [-90, 360, 725.5, 1e-12]) {
			const h = rybToOklchHue(angle);
			assert(h >= 0 && h < 360, `rybToOklchHue(${angle}) lands in [0, 360)`);
			assert(Math.abs(circularDelta(h, rybToOklchHue(angle % 360 + 360))) < 1e-9, `rybToOklchHue(${angle}) is periodic`);
		}

		// Round trips both ways, including the wrap seam and the flat spots
		// at Itten's primaries/secondaries (every 60 degrees).
		let worstRyb = 0;
		for (let angle = 0; angle < 360; angle += 0.37) {
			worstRyb = Math.max(worstRyb, Math.abs(circularDelta(angle, oklchHueToRyb(rybToOklchHue(angle)))));
		}
		assert(worstRyb < 1e-6, `RYB -> OKLCH -> RYB round trip (worst ${worstRyb})`);
		let worstHue = 0;
		for (let hue = 0; hue < 360; hue += 0.29) {
			worstHue = Math.max(worstHue, Math.abs(circularDelta(hue, rybToOklchHue(oklchHueToRyb(hue)))));
		}
		assert(worstHue < 1e-9, `OKLCH -> RYB -> OKLCH round trip (worst ${worstHue})`);
		for (const hue of [RYB_HUE_TABLE[0], RYB_HUE_TABLE[0] - 1e-9, (RYB_HUE_TABLE[359] + RYB_HUE_TABLE[0] + 360) / 2 - 360]) {
			const ryb = oklchHueToRyb(hue);
			assert(ryb >= 0 && ryb < 360, `oklchHueToRyb(${hue}) lands in [0, 360) at the wrap seam`);
		}

		// Monotonic: moving forward on the RYB wheel always moves forward in hue.
		for (let angle = 0; angle < 360; angle += 0.5) {
			const step = circularDelta(rybToOklchHue(angle), rybToOklchHue(angle + 0.5));
			if (!(step > 0)) assert(false, `hue increases from RYB ${angle} to ${angle + 0.5}`);
		}

		// It is the painter's wheel: red's complement is green, yellow's is
		// violet, and warm hues get more room than on the OKLCH circle.
		const red = oklchHueToRyb(hexToOklch('#ff0000').H);
		assert(red < 15 || red > 345, `sRGB red sits near RYB 0 (got ${red})`);
		const opposite = rybToOklchHue(180);
		assert(opposite > 135 && opposite < 170, `RYB 180 (opposite red) is green, not cyan (OKLCH ${opposite})`);
		const yellow = oklchHueToRyb(hexToOklch('#ffdd00').H);
		assert(yellow > 90 && yellow < 130, `yellow sits near RYB 120 (got ${yellow})`);
		const warmSpan = circularDelta(rybToOklchHue(0), rybToOklchHue(90));
		assert(warmSpan < 75, `RYB 0-90 (red to yellow-orange) covers less than 75 OKLCH degrees (got ${warmSpan})`);

		// getWheel
		assert(WHEELS.join(',') === 'rgb,ryb', 'WHEELS lists rgb and ryb');
		const rgb = getWheel('rgb');
		assert(rgb.toWheel(-30) === 330 && rgb.toHue(400) === 40, 'rgb wheel is the OKLCH hue circle, normalized');
		const ryb = getWheel('ryb');
		assert(ryb.toHue === rybToOklchHue && ryb.toWheel === oklchHueToRyb, 'ryb wheel uses the RYB conversions');
		for (const bad of ['RYB', 'cmy', '', null, 3]) {
			let threw = false;
			try {
				getWheel(bad);
			} catch (error) {
				threw = error instanceof RangeError;
			}
			assert(threw, `getWheel(${JSON.stringify(bad)}) throws a RangeError`);
		}

		expect(failed, failed + ' assertion(s) failed -- see console output above for FAIL: details').toBe(0);
	});
});
