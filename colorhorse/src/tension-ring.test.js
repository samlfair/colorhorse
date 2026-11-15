/**
 * Tests for choosing which slot colorTwo lands on (tension-ring.js, and the
 * colorTwoSlot option on getScheme/getHueRing).
 */
import { computeTensionRingSteps, computeTensionRing } from "./tension-ring.js";
import { computeCylinderD } from "./cylinder-deform.js";
import { getScheme, getHueRing, getWheel } from "./index.js";
import { hexToOklch, oklchToSrgb } from "./oklch.js";

import { describe, it, expect } from "vitest";

const SLOT_COUNT = 12;

function sum(values) {
	return values.reduce((total, value) => total + value, 0);
}

/** Steps between neighbouring ring angles, walking up from startIndex. */
function stepsFrom(angles, startIndex) {
	return angles.map((_, offset) => {
		const from = angles[(startIndex + offset) % angles.length];
		const to = angles[(startIndex + offset + 1) % angles.length];
		return (((to - from) % 360) + 360) % 360;
	});
}

describe("tension ring", () => {
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

		// ---------------------------------------------------------------------------
		// Steps: positive, each arc exact, and graduated the way a bent material is.
		// ---------------------------------------------------------------------------
		for (const gap of [0.5, 5, 10, 45, 70, 90, 150, 175, 180, 185, 270, 330, 355, 359.5]) {
			for (let slot = 1; slot < SLOT_COUNT; slot++) {
				const label = `gap ${gap}, slot ${slot}`;
				const steps = computeTensionRingSteps(SLOT_COUNT, slot, gap);
				assert(steps.every((step) => step > 0), `${label}: every step is positive`);
				assert(Math.abs(sum(steps.slice(0, slot)) - gap) < 1e-9, `${label}: arc one covers the gap`);
				assert(Math.abs(sum(steps) - 360) < 1e-9, `${label}: steps go once round the ring`);

				// The Lagrange condition: within each arc, the strain curves the same
				// way at every step (bowing down in a squeezed arc and up in a
				// stretched one), so spacing is graduated rather than even.
				const strains = steps.map((step) => Math.log(step / (360 / SLOT_COUNT)));
				const curvature = strains.map(
					(strain, stepIndex) =>
						2 * strain - strains[(stepIndex + SLOT_COUNT - 1) % SLOT_COUNT] - strains[(stepIndex + 1) % SLOT_COUNT],
				);
				const naturalGap = (slot * 360) / SLOT_COUNT;
				if (Math.abs(gap - naturalGap) > 1) {
					for (const arcSteps of [curvature.slice(0, slot), curvature.slice(slot)]) {
						const allPositive = arcSteps.every((value) => value > 0);
						const allNegative = arcSteps.every((value) => value < 0);
						assert(allPositive || allNegative, `${label}: strain bows one way across each arc`);
					}
					const squeezedArc = gap < naturalGap ? steps.slice(0, slot) : steps.slice(slot);
					if (squeezedArc.length >= 3) {
						assert(
							Math.max(...squeezedArc) / Math.min(...squeezedArc) > 1.01,
							`${label}: the squeezed arc is not evenly spaced`,
						);
					}
				}
			}
		}

		// At the natural gap nothing needs to bend.
		{
			const steps = computeTensionRingSteps(SLOT_COUNT, 4, 120);
			assert(steps.every((step) => Math.abs(step - 30) < 1e-9), "gap = slot * 30 leaves the ring evenly spaced");
		}

		// ---------------------------------------------------------------------------
		// The 10 / 80 example, in ring angles.
		// ---------------------------------------------------------------------------
		for (let slot = 1; slot < SLOT_COUNT; slot++) {
			const angles = computeTensionRing(SLOT_COUNT, 0, 10, 80, slot);
			assert(angles[0] === 10, `10/80 slot ${slot}: anchor one exact`);
			assert(angles[slot] === 80, `10/80 slot ${slot}: anchor two exact`);
			assert(stepsFrom(angles, 0).every((step) => step > 0), `10/80 slot ${slot}: slots in order`);
			assert(Math.abs(sum(stepsFrom(angles, 0)) - 360) < 1e-9, `10/80 slot ${slot}: one lap`);
		}

		// Both anchors exact through computeCylinderD, wherever anchor one sits
		// and whichever way round the anchors are.
		for (const [angleOne, angleTwo] of [[10, 80], [80, 10], [355, 5], [200, 20], [123.4, 300.1]]) {
			for (let slot = 1; slot < SLOT_COUNT; slot++) {
				const ring = computeCylinderD(SLOT_COUNT, [{ D: angleOne }, { D: angleTwo }], slot);
				const [indexOne, indexTwo] = ring.anchorIndices;
				const label = `D ${angleOne} -> ${angleTwo}, slot ${slot}`;
				assert(ring.D[indexOne] === angleOne && ring.D[indexTwo] === angleTwo, `${label}: anchors exact`);
				assert(indexTwo === (indexOne + slot) % SLOT_COUNT, `${label}: anchor two on the chosen slot`);
				assert(stepsFrom(ring.D, indexOne).every((step) => step > 0), `${label}: slots in order`);
			}
		}

		// ---------------------------------------------------------------------------
		// Public API: getHueRing, both wheels, anchor pairs close / ~90 / nearly opposite.
		// ---------------------------------------------------------------------------
		const hexAtHue = (hue) => oklchToSrgb(0.65, 0.1, hue).hex;
		const anchorPairs = [];
		for (const baseHue of [15, 140, 260]) {
			for (const separation of [8, 20, 90, -90, 172, -172]) {
				anchorPairs.push([hexAtHue(baseHue), hexAtHue(baseHue + separation)]);
			}
		}

		for (const wheelName of ["rgb", "ryb"]) {
			const wheel = getWheel(wheelName);
			for (const [colorOne, colorTwo] of anchorPairs) {
				const hueOne = hexToOklch(colorOne).H;
				const hueTwo = hexToOklch(colorTwo).H;
				// The anchors' hues after the trip into ring angles and back, which
				// is what the default (nearest-slot) ring lands them on too.
				const expectedOne = wheel.toHue(wheel.toWheel(hueOne));
				const expectedTwo = wheel.toHue(wheel.toWheel(hueTwo));
				const nearest = getHueRing(colorOne, colorTwo, { wheel: wheelName });
				const nearestSlot = (nearest.colorTwoIndex - nearest.colorOneIndex + SLOT_COUNT) % SLOT_COUNT;

				for (let slot = 1; slot < SLOT_COUNT; slot++) {
					const label = `${wheelName} ${colorOne} ${colorTwo} slot ${slot}`;
					const ring = getHueRing(colorOne, colorTwo, { wheel: wheelName, colorTwoSlot: slot });
					assert(ring.hues.length === SLOT_COUNT, `${label}: 12 hues`);
					assert(ring.hues[ring.colorOneIndex] === expectedOne, `${label}: colorOne lands exactly`);
					assert(ring.hues[ring.colorTwoIndex] === expectedTwo, `${label}: colorTwo lands exactly`);
					assert(Math.abs(ring.hues[ring.colorOneIndex] - hueOne) < 1e-6, `${label}: colorOne's own hue`);
					assert(Math.abs(ring.hues[ring.colorTwoIndex] - hueTwo) < 1e-6, `${label}: colorTwo's own hue`);
					assert(
						(ring.colorTwoIndex - ring.colorOneIndex + SLOT_COUNT) % SLOT_COUNT === slot,
						`${label}: colorTwo on the chosen slot`,
					);
					// Order is a property of the ring angles: the RYB mapping is
					// monotonic, so order there is order in hue too.
					const angles = ring.hues.map(wheel.toWheel);
					const steps = stepsFrom(angles, ring.colorOneIndex);
					assert(steps.every((step) => step > 0), `${label}: slots in order`);
					assert(Math.abs(sum(steps) - 360) < 1e-6, `${label}: one lap, no slot passes another`);
				}

				// Choosing the nearest slot explicitly stays close to the default,
				// wherever the default isn't already squeezing a step hard (there
				// the two models part ways by design: see tension-ring.js).
				const defaultSteps = stepsFrom(nearest.hues.map(wheel.toWheel), nearest.colorOneIndex);
				if (Math.min(...defaultSteps) < 20) continue;
				const explicit = getHueRing(colorOne, colorTwo, { wheel: wheelName, colorTwoSlot: nearestSlot });
				const largestDifference = Math.max(
					...explicit.hues.map((hue, hueIndex) => {
						const difference = Math.abs(wheel.toWheel(hue) - wheel.toWheel(nearest.hues[hueIndex])) % 360;
						return Math.min(difference, 360 - difference);
					}),
				);
				assert(largestDifference < 5, `${wheelName} ${colorOne} ${colorTwo}: nearest slot within 5deg of default (${largestDifference.toFixed(3)})`);
			}
		}

		// ---------------------------------------------------------------------------
		// getScheme: the option is accepted for every slot, and both anchors
		// still appear exactly.
		// ---------------------------------------------------------------------------
		for (const wheelName of ["rgb", "ryb"]) {
			for (let slot = 1; slot < SLOT_COUNT; slot++) {
				const scheme = getScheme("#3366cc", "#cc6633", { wheel: wheelName, colorTwoSlot: slot });
				const allHexes = Object.values(scheme).flat();
				assert(allHexes.every((hex) => /^#[0-9a-f]{6}$/i.test(hex)), `getScheme ${wheelName} slot ${slot}: valid hexes`);
				assert(allHexes.includes("#3366cc"), `getScheme ${wheelName} slot ${slot}: colorOne appears`);
				assert(allHexes.includes("#cc6633"), `getScheme ${wheelName} slot ${slot}: colorTwo appears`);
			}
		}

		// Default output is untouched.
		assert(
			JSON.stringify(getScheme("#3366cc", "#cc6633")) === JSON.stringify(getScheme("#3366cc", "#cc6633", { colorTwoSlot: undefined })),
			"omitting colorTwoSlot is the default",
		);

		// ---------------------------------------------------------------------------
		// Validation.
		// ---------------------------------------------------------------------------
		for (const badSlot of [0, 12, -1, 1.5, "3", null]) {
			let threw = false;
			try {
				getScheme("#3366cc", "#cc6633", { colorTwoSlot: badSlot });
			} catch (error) {
				threw = error instanceof RangeError;
			}
			assert(threw, `colorTwoSlot ${JSON.stringify(badSlot)} throws a RangeError`);
		}
		{
			let threw = false;
			try {
				computeTensionRing(SLOT_COUNT, 0, 40, 40, 3);
			} catch (error) {
				threw = error instanceof RangeError;
			}
			assert(threw, "equal anchor hues throw a RangeError when a slot is chosen");
		}

		console.log(`tension-ring: ${passed} passed, ${failed} failed`);
		expect(failed).toBe(0);
	});
});
