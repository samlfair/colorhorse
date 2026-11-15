import { describe, it, expect } from "vitest";
import { getScheme } from "colorhorse";
import { huePalette, huesFromColorOne, HUE_COUNT } from "./hue-palette.js";

describe("hue-palette", () => {
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

		const pairs = [
			["#4da3ff", "#ff6b4d"],
			["#e4572e", "#29335c"],
			["#2e8b57", "#ffd700"],
			["#8a2be2", "#ff1493"],
		];

		for (const [colorOne, colorTwo] of pairs) {
			const palette = huePalette(colorOne, colorTwo);
			const label = `${colorOne}/${colorTwo}`;
			assert(palette.hues.length === HUE_COUNT, `${label}: 12 hues`);
			assert(palette.hues.every((hue) => hue.shades.length === 10 && hue.shades.every((hex) => /^#[0-9a-f]{6}$/.test(hex))), `${label}: 10 hex shades per hue`);
			assert(palette.colorOneIndex !== palette.colorTwoIndex, `${label}: the two colors sit on different hues`);

			// Every role in getScheme is one of these hues, shade for shade.
			const scheme = getScheme(colorOne, colorTwo);
			for (const [roleName, roleShades] of Object.entries(scheme)) {
				const match = palette.hues.findIndex((hue) => hue.shades.join() === roleShades.join());
				assert(match !== -1, `${label}: ${roleName} is one of the hues`);
			}
			assert(scheme.primary.join() === palette.hues[palette.colorOneIndex].shades.join(), `${label}: primary is color one's hue`);
			assert(scheme.secondary.join() === palette.hues[palette.colorTwoIndex].shades.join(), `${label}: secondary is color two's hue`);
		}

		// Reordered from color one: hue 1 is color one's, and the ring order holds.
		for (const [colorOne, colorTwo] of pairs) {
			const palette = huePalette(colorOne, colorTwo);
			const { hues, colorTwoPosition } = huesFromColorOne(palette);
			const label = `${colorOne}/${colorTwo}`;
			assert(hues.length === HUE_COUNT, `${label}: still 12 hues`);
			assert(hues[0] === palette.hues[palette.colorOneIndex], `${label}: hue 1 is color one's`);
			assert(hues[colorTwoPosition] === palette.hues[palette.colorTwoIndex], `${label}: colorTwoPosition is color two's hue`);
			assert(new Set(hues).size === HUE_COUNT, `${label}: every hue appears once`);
			for (let position = 0; position < HUE_COUNT; position++) {
				const next = palette.hues.indexOf(hues[(position + 1) % HUE_COUNT]);
				const current = palette.hues.indexOf(hues[position]);
				assert(next === (current + 1) % HUE_COUNT, `${label}: position ${position + 1} is followed by the next hue around the ring`);
			}
		}

		// Other shade counts.
		{
			const palette = huePalette("#4da3ff", "#ff6b4d", { shadeCount: 6 });
			assert(palette.hues.every((hue) => hue.shades.length === 6), "a shade count of 6 gives 6 shades per hue");
		}

		expect(failed, failed + " assertion(s) failed -- see console output above for FAIL: details").toBe(0);
	});
});
