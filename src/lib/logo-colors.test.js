import { describe, it, expect } from "vitest";
import { LOGO_REGIONS, logoColors } from "./logo-colors.js";
import { huePalette, huesFromColorOne } from "./hue-palette.js";

describe("logo-colors", () => {
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

		const keys = ["background", "backgroundDark", "headOutside", "circleOne", "circleTwo", "overlap", "headOne", "headTwo", "headOverlap"];

		// The nine regions, each a valid hue and shade.
		assert(LOGO_REGIONS.map((region) => region.key).join() === keys.join(), "the nine regions, in painting order");
		assert(LOGO_REGIONS.every((region) => Number.isInteger(region.hue) && region.hue >= 1 && region.hue <= 12), "hues are 1-12");
		assert(LOGO_REGIONS.every((region) => Number.isInteger(region.shade) && region.shade >= 1 && region.shade <= 10), "shades are 1-10");

		// Each region's color is its hue and shade, counted from color one.
		{
			const { hues } = huesFromColorOne(huePalette("#4da3ff", "#ff6b4d"));
			const colors = logoColors(hues);
			assert(Object.keys(colors).join() === keys.join(), "a color for every region");
			for (const region of LOGO_REGIONS) {
				assert(colors[region.key] === hues[region.hue - 1].shades[region.shade - 1], `${region.key} is hue ${region.hue}, shade ${region.shade}`);
			}
			const custom = logoColors(hues, [{ key: "circleOne", hue: 1, shade: 1 }]);
			assert(custom.circleOne === hues[0].shades[0], "custom regions work too");
		}

		expect(failed, failed + " assertion(s) failed -- see console output above for FAIL: details").toBe(0);
	});
});
