import { describe, it, expect } from "vitest";
import { randomAnchorHex, HEX_COLOR_PATTERN } from "./random-color.js";
import { hexToOklch } from "./oklch.js";

describe("random-color", () => {
	it("all assertions pass", () => {
		let passed = 0;
		let failed = 0;

		function assert(condition, message) {
			if (condition) {
				passed++;
			} else {
				failed++;
				console.error(`FAIL: ${message}`);
			}
		}

		// Random colors are valid hex and never grey.
		for (let sample = 0; sample < 2000; sample++) {
			const hex = randomAnchorHex();
			assert(HEX_COLOR_PATTERN.test(hex), `"${hex}" is a complete hex color`);
			assert(hexToOklch(hex).C > 0.02, `"${hex}" has some chroma`);
		}

		// A fixed random source gives a fixed color.
		{
			const fixedRandom = () => 0.75;
			assert(randomAnchorHex(fixedRandom) === randomAnchorHex(fixedRandom), "the same random source gives the same color");
		}

		// Only complete hex colors pass the pattern.
		for (const partial of ["#3", "#33bb", "#33bb4", "33bb44", "#33bb44f", "#33bbgg", ""]) {
			assert(!HEX_COLOR_PATTERN.test(partial), `"${partial}" is rejected`);
		}
		assert(HEX_COLOR_PATTERN.test("#33BB44"), "uppercase hex passes");

		expect(failed, failed + " assertion(s) failed -- see console output above for FAIL: details").toBe(0);
	});
});
