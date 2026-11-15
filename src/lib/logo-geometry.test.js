import { describe, it, expect } from "vitest";
import { logoGeometry, horseTransform, LOGO_PADDING, LOGO_CORNER_RADIUS } from "./logo-geometry.js";

describe("logo-geometry", () => {
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

		const close = (a, b, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;

		// Fraction of `circle`'s circumference inside `other`, by sampling.
		function arcFractionInside(circle, other, radius, samples = 100000) {
			let inside = 0;
			for (let k = 0; k < samples; k++) {
				const angle = ((k + 0.5) / samples) * 2 * Math.PI;
				const x = circle.x + radius * Math.cos(angle);
				const y = circle.y + radius * Math.sin(angle);
				if ((x - other.x) ** 2 + (y - other.y) ** 2 <= radius * radius) inside++;
			}
			return inside / samples;
		}

		// Defaults: 30% of each arc inside the other, on a 30° axis.
		{
			const geometry = logoGeometry();
			const { radius, circleOne, circleTwo, distance } = geometry;
			assert(close(Math.hypot(circleTwo.x - circleOne.x, circleTwo.y - circleOne.y), distance), "the centers are `distance` apart");
			assert(close(distance, 2 * 50 * Math.cos((54 * Math.PI) / 180)), `30% overlap puts the centers 2r·cos 54° apart, got ${distance}`);
			const fractionOne = arcFractionInside(circleOne, circleTwo, radius);
			const fractionTwo = arcFractionInside(circleTwo, circleOne, radius);
			assert(close(fractionOne, 0.3, 1e-3), `30% of circle one's arc is inside circle two, got ${fractionOne}`);
			assert(close(fractionTwo, 0.3, 1e-3), `30% of circle two's arc is inside circle one, got ${fractionTwo}`);

			// North is -y; 30° clockwise from north points up and to the right.
			const bearing = (Math.atan2(circleTwo.x - circleOne.x, -(circleTwo.y - circleOne.y)) * 180) / Math.PI;
			assert(close(bearing, 30), `circle two is 30° clockwise from north of circle one, got ${bearing}`);
			assert(circleOne.x < circleTwo.x && circleOne.y > circleTwo.y, "circle one is southwest, circle two northeast");
			assert(close(circleOne.x, -circleTwo.x) && close(circleOne.y, -circleTwo.y), "the pair is centered on the origin");
		}

		// The view box fits both circles exactly.
		{
			const { radius, circleOne, circleTwo, viewBox } = logoGeometry();
			for (const circle of [circleOne, circleTwo]) {
				assert(circle.x - radius >= viewBox.x - 1e-9 && circle.x + radius <= viewBox.x + viewBox.width + 1e-9, "each circle fits the view box horizontally");
				assert(circle.y - radius >= viewBox.y - 1e-9 && circle.y + radius <= viewBox.y + viewBox.height + 1e-9, "each circle fits the view box vertically");
			}
			assert(close(viewBox.x, circleOne.x - radius) && close(viewBox.y, circleTwo.y - radius), "the view box starts at the circles' outer edges");
		}

		// Square: the view box widens to the right only, to match its height.
		{
			const padded = logoGeometry({ padding: LOGO_PADDING });
			const square = logoGeometry({ padding: LOGO_PADDING, square: true });
			assert(close(square.viewBox.width, square.viewBox.height), "square is as wide as it is tall");
			assert(close(square.viewBox.x, padded.viewBox.x) && close(square.viewBox.y, padded.viewBox.y), "square keeps the left and top edges");
			assert(close(square.viewBox.height, padded.viewBox.height), "square keeps the height");
			assert(square.viewBox.width >= padded.viewBox.width - 1e-9, "square only adds space");
		}

		// Padding, in radii, is added around the circles.
		{
			const plain = logoGeometry();
			const padded = logoGeometry({ padding: LOGO_PADDING });
			const radius = plain.radius;
			assert(close(LOGO_PADDING.top, 0.25) && close(LOGO_PADDING.inline, 0.25) && close(LOGO_PADDING.bottom, 0.25), "the logo's padding is a quarter radius all round");
			assert(close(LOGO_CORNER_RADIUS, 0.25), "the corners are rounded by a quarter radius");
			assert(close(plain.viewBox.y - padded.viewBox.y, radius / 4), "a quarter radius above");
			assert(close(plain.viewBox.x - padded.viewBox.x, radius / 4), "a quarter radius on the left");
			assert(close(padded.viewBox.width - plain.viewBox.width, radius / 2), "a quarter radius on each side");
			assert(close(padded.viewBox.height - plain.viewBox.height, radius / 2), "a quarter radius above and below");
			const uneven = logoGeometry({ padding: { top: 0.5, inline: 0.25, bottom: 1 } });
			assert(close(plain.viewBox.y - uneven.viewBox.y, radius / 2) && close(uneven.viewBox.height - plain.viewBox.height, radius * 1.5), "uneven padding: half a radius above, a radius below");
			assert(close(padded.circleOne.x, plain.circleOne.x) && close(padded.circleTwo.y, plain.circleTwo.y), "padding doesn't move the circles");
		}

		// Other settings: the overlap and axis follow their options.
		{
			for (const overlapArcFraction of [0.1, 0.25, 0.4]) {
				const { radius, circleOne, circleTwo } = logoGeometry({ overlapArcFraction });
				const fraction = arcFractionInside(circleOne, circleTwo, radius);
				assert(close(fraction, overlapArcFraction, 1e-3), `overlap ${overlapArcFraction} gives that arc fraction, got ${fraction}`);
			}
			const { circleOne, circleTwo } = logoGeometry({ axisDegrees: 90 });
			assert(close(circleOne.y, 0) && circleOne.x < circleTwo.x, "a 90° axis runs west to east");
		}

		// The horse transform mirrors it and puts the face at (x, y).
		{
			const transform = horseTransform({ scale: 2, x: 5, y: -3 });
			assert(transform === "translate(5 -3) scale(-2 2) translate(-87.83 -29.24)", `horse transform, got "${transform}"`);
		}

		expect(failed, failed + " assertion(s) failed -- see console output above for FAIL: details").toBe(0);
	});
});
