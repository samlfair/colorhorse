import { describe, it, expect } from "vitest";
import { turnView, wheelPixels, TILT_RANGE } from "./view-turn.js";

describe("view-turn", () => {
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

		const close = (a, b) => Math.abs(a - b) < 1e-9;

		// Rotation adds and wraps to 0-360.
		{
			assert(close(turnView({ azimuth: 30, elevation: 0 }, 20, 0).azimuth, 50), "rotation adds");
			assert(close(turnView({ azimuth: 350, elevation: 0 }, 20, 0).azimuth, 10), "rotation wraps past 360");
			assert(close(turnView({ azimuth: 10, elevation: 0 }, -20, 0).azimuth, 350), "rotation wraps below 0");
			assert(close(turnView({ azimuth: 0, elevation: 0 }, 720, 0).azimuth, 0), "whole turns wrap away");
		}

		// Tilt adds and stays within the slider's range.
		{
			assert(close(turnView({ azimuth: 0, elevation: 18 }, 0, 10).elevation, 28), "tilt adds");
			assert(turnView({ azimuth: 0, elevation: 70 }, 0, 50).elevation === TILT_RANGE[1], "tilt stops at its maximum");
			assert(turnView({ azimuth: 0, elevation: -70 }, 0, -50).elevation === TILT_RANGE[0], "tilt stops at its minimum");
			const both = turnView({ azimuth: 100, elevation: 0 }, 5, -5);
			assert(close(both.azimuth, 105) && close(both.elevation, -5), "rotation and tilt change together");
		}

		// Wheel deltas come back in pixels.
		{
			const pixels = wheelPixels({ deltaX: 3, deltaY: -4, deltaMode: 0 });
			assert(pixels.x === 3 && pixels.y === -4, "pixel deltas are unchanged");
			const lines = wheelPixels({ deltaX: 0, deltaY: 3, deltaMode: 1 });
			assert(lines.y === 48, "line deltas are 16px each");
			const pages = wheelPixels({ deltaX: 1, deltaY: 0, deltaMode: 2 });
			assert(pages.x === 400, "page deltas are 400px each");
		}

		expect(failed, failed + " assertion(s) failed -- see console output above for FAIL: details").toBe(0);
	});
});
