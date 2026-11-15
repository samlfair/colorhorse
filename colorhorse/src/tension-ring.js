import { solveLinearSystem } from "./deform.js";
import { normalizeHue } from "./hue-deform.js";

/**
 * A hue ring where the second anchor lands on a CHOSEN slot, not just the
 * nearest one.
 *
 * Work with the steps between neighbouring slots rather than with slot
 * displacements. Step k runs from slot (anchorOneIndex + k) to the next
 * one. The first `slot` steps make up the arc from anchor one to anchor
 * two (going up in slot number), so together they must cover `gap`
 * degrees. The remaining steps cover the other 360 - gap.
 *
 * deform.js's bending energy, sum (u[i+1] - 2u[i] + u[i-1])^2, is exactly
 * sum (step[k+1] - step[k])^2: it penalises changes in ENGINEERING strain
 * (step - restStep). That stays well behaved while every step is near its
 * rest length, but once an arc has to hold many more or many fewer slots
 * than its share, the cheapest smooth answer drives some steps to zero or
 * below, and slots cross.
 *
 * Here the same energy is measured in LOGARITHMIC (true, Hencky) strain:
 *
 *   strain[k] = ln(step[k] / restStep)
 *   E = sum (strain[k+1] - strain[k])^2      (circular)
 *
 * subject to each arc's steps summing to its length. That gives:
 *
 *  - Order, by construction. step = restStep * e^strain is positive for any
 *    finite strain, so no slot can reach or pass its neighbour.
 *  - Graduated spacing. At the minimum, every step satisfies
 *    2 * (2 strain[k] - strain[k-1] - strain[k+1]) = lambda_arc * step[k],
 *    so the strain curves in proportion to the local step size. In the
 *    squeezed arc it bows smoothly down to a minimum mid-arc, and in the
 *    stretched arc it bows up. Spacing changes continuously across both
 *    anchors (strain, not just position, is shared across the seam), so
 *    neither arc ends up evenly spaced on its own.
 *  - The current behaviour for small bends. Near rest, ln(step/restStep) is
 *    about (step - restStep) / restStep, so this energy is the old one up
 *    to a constant factor, and the nearest slot gives almost the same
 *    ring as computeCylinderD.
 *
 * The constraints are nonlinear in strain, so the minimum is found with
 * Newton's method on the Lagrange conditions. For robustness it starts
 * from the unbent ring (where gap = slot * restStep and every strain is 0)
 * and walks the gap toward its target in small stages, using each stage's
 * answer as the start for the next. Each stage is a small (slotCount + 2)
 * square system solved with deform.js's pivoted Gaussian elimination.
 */

const CONTINUATION_STAGES = 16;
const MAX_NEWTON_ITERATIONS = 50;
const NEWTON_TOLERANCE = 1e-12;
// Below this, the anchors share a hue (e.g. #ff0000 and #800000), and there
// is no arc for the slots between them to sit in.
export const MIN_GAP = 1e-6;

/** Inverse of the arc split used for continuation: log(gap / (360 - gap)). */
function gapFromLogRatio(logRatio) {
	return 360 / (1 + Math.exp(-logRatio));
}

/**
 * The slotCount steps around the ring, starting at anchor one. The first
 * `slot` steps sum to `gap` exactly, and the rest sum to 360 - gap.
 *
 * @param {number} slotCount  integer >= 3
 * @param {number} slot       integer in [1, slotCount - 1]
 * @param {number} gap        degrees in (0, 360)
 * @returns {number[]} positive step sizes in degrees, length slotCount
 */
export function computeTensionRingSteps(slotCount, slot, gap) {
	if (!Number.isInteger(slotCount) || slotCount < 3) {
		throw new RangeError(`slotCount must be an integer >= 3, got ${slotCount}`);
	}
	if (!Number.isInteger(slot) || slot < 1 || slot > slotCount - 1) {
		throw new RangeError(`slot must be an integer from 1 to ${slotCount - 1}, got ${slot}`);
	}
	if (!(gap >= MIN_GAP && gap <= 360 - MIN_GAP)) {
		throw new RangeError(`gap must be between ${MIN_GAP} and ${360 - MIN_GAP} degrees, got ${gap}`);
	}

	const restStep = 360 / slotCount;
	const arcOfStep = (stepIndex) => (stepIndex < slot ? 0 : 1);
	const wrap = (stepIndex) => (stepIndex + slotCount) % slotCount;
	const strains = new Array(slotCount).fill(0);
	const multipliers = [0, 0];

	const startLogRatio = Math.log(slot / (slotCount - slot));
	const targetLogRatio = Math.log(gap / (360 - gap));

	for (let stage = 1; stage <= CONTINUATION_STAGES; stage++) {
		const stageGap = gapFromLogRatio(startLogRatio + (stage / CONTINUATION_STAGES) * (targetLogRatio - startLogRatio));
		const arcLengths = [stageGap, 360 - stageGap];
		let converged = false;

		for (let iteration = 0; iteration < MAX_NEWTON_ITERATIONS && !converged; iteration++) {
			const size = slotCount + 2;
			const jacobian = Array.from({ length: size }, () => new Array(size).fill(0));
			const residual = new Array(size).fill(0);
			// Each arc's constraint is divided by its length, so a very short arc
			// doesn't leave a near-zero row for the elimination to pivot on.
			residual[slotCount] = -1;
			residual[slotCount + 1] = -1;

			for (let stepIndex = 0; stepIndex < slotCount; stepIndex++) {
				const arc = arcOfStep(stepIndex);
				const step = restStep * Math.exp(strains[stepIndex]);
				const previous = wrap(stepIndex - 1);
				const next = wrap(stepIndex + 1);
				residual[stepIndex] = 2 * (2 * strains[stepIndex] - strains[previous] - strains[next]) - multipliers[arc] * step;
				jacobian[stepIndex][stepIndex] += 4 - multipliers[arc] * step;
				jacobian[stepIndex][previous] += -2;
				jacobian[stepIndex][next] += -2;
				jacobian[stepIndex][slotCount + arc] = -step;
				residual[slotCount + arc] += step / arcLengths[arc];
				jacobian[slotCount + arc][stepIndex] = step / arcLengths[arc];
			}

			const correction = solveLinearSystem(
				jacobian,
				residual.map((value) => -value),
			);
			let largestStrainCorrection = 0;
			for (let stepIndex = 0; stepIndex < slotCount; stepIndex++) {
				strains[stepIndex] += correction[stepIndex];
				largestStrainCorrection = Math.max(largestStrainCorrection, Math.abs(correction[stepIndex]));
			}
			multipliers[0] += correction[slotCount];
			multipliers[1] += correction[slotCount + 1];
			converged = largestStrainCorrection < NEWTON_TOLERANCE;
		}
		if (!converged || strains.some((strain) => !Number.isFinite(strain))) {
			throw new Error(`Tension ring did not converge (slotCount ${slotCount}, slot ${slot}, gap ${gap})`);
		}
	}

	// Rescale each arc so it sums exactly to its length, not just to within
	// Newton's tolerance, so anchor two lands exactly.
	const steps = strains.map((strain) => restStep * Math.exp(strain));
	const arcLengths = [gap, 360 - gap];
	for (const arc of [0, 1]) {
		const stepIndices = steps.map((_, stepIndex) => stepIndex).filter((stepIndex) => arcOfStep(stepIndex) === arc);
		const total = stepIndices.reduce((sum, stepIndex) => sum + steps[stepIndex], 0);
		for (const stepIndex of stepIndices) steps[stepIndex] *= arcLengths[arc] / total;
	}
	return steps;
}

/** normalizeHue, but leaves an angle already in [0, 360) bit-for-bit alone. */
function normalizeAngle(angle) {
	return angle >= 0 && angle < 360 ? angle : normalizeHue(angle);
}

/**
 * Ring angles (degrees, [0, 360)) for every slot, with anchor one on
 * `anchorOneIndex` and anchor two on `anchorOneIndex + slot` (mod slotCount).
 * Anchor two is always reached going up in slot number: the gap is measured
 * from anchorOneAngle to anchorTwoAngle in that direction, never the
 * shortest way round.
 */
export function computeTensionRing(slotCount, anchorOneIndex, anchorOneAngle, anchorTwoAngle, slot) {
	const gap = normalizeHue(anchorTwoAngle - anchorOneAngle);
	if (gap < MIN_GAP || gap > 360 - MIN_GAP) {
		throw new RangeError("The two anchors have the same hue, so there is no gap to place a slot in.");
	}
	const steps = computeTensionRingSteps(slotCount, slot, gap);
	const angles = new Array(slotCount);
	let angle = anchorOneAngle;
	for (let stepIndex = 0; stepIndex < slotCount; stepIndex++) {
		angles[(anchorOneIndex + stepIndex) % slotCount] = normalizeAngle(angle);
		angle += steps[stepIndex];
	}
	angles[(anchorOneIndex + slot) % slotCount] = normalizeAngle(anchorTwoAngle);
	return angles;
}
