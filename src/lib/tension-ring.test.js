/**
 * Tests for choosing which slot the second anchor lands on (tension-ring.js
 * and computeCylinderD's colorTwoSlot). colorhorse's copy of this file also
 * covers its public API.
 */
import { computeTensionRingSteps, computeTensionRing } from "./tension-ring.js";
import { computeCylinderD } from "./cylinder-deform.js";

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
		// Validation.
		// ---------------------------------------------------------------------------
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
