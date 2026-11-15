/**
 * Geometry for the two-circle logo mark.
 *
 * Two circles of the same radius overlap so that a given fraction of each
 * circle's arc lies inside the other. The arc of circle one inside circle
 * two runs between the two intersection points, which sit at ±θ from the
 * line joining the centers, where cos θ = (distance / 2) / radius. That arc
 * spans 2θ, so for an arc fraction f, 2θ = f · 2π, θ = f · π, and
 * distance = 2 · radius · cos(f · π). At f = 0.3, θ = 54° and the centers
 * sit about 1.18 radii apart.
 *
 * The centers lie on a line through the origin, `axisDegrees` clockwise from
 * north; circle one sits at the southwest end, circle two at the northeast.
 * SVG's y axis points down, so north is -y.
 */

// Space around the circles, as a fraction of the radius: a quarter all round.
export const LOGO_PADDING = { top: 0.25, inline: 0.25, bottom: 0.25 };

// The background's corner radius, as a fraction of the circles' radius.
export const LOGO_CORNER_RADIUS = 0.25;

// The logo's own overlap and axis (see logoGeometry), shared by LogoMark
// and the favicon.
export const LOGO_SHAPE = { overlapArcFraction: 0.42, axisDegrees: 30 };

// The point on the horse (in the original logo's coordinates) that the
// horse's placement is measured from: the center of the eye, the small
// circle cut out of HORSE_BODY. At (0, 0), it sits midway between the
// circles' centers.
export const HORSE_EYE = { x: 87.83, y: 29.24 };

/**
 * @param {{radius?: number, overlapArcFraction?: number, axisDegrees?: number, padding?: {top: number, inline: number, bottom: number}, square?: boolean}} [options]
 *   padding, in radii, is added around the circles in the view box; square
 *   widens the view box to the right until it's as wide as it is tall
 * @returns {{radius: number, distance: number, circleOne: {x: number, y: number}, circleTwo: {x: number, y: number}, viewBox: {x: number, y: number, width: number, height: number}}}
 */
export function logoGeometry({ radius = 50, overlapArcFraction = 0.3, axisDegrees = 30, padding = { top: 0, inline: 0, bottom: 0 }, square = false } = {}) {
	const distance = 2 * radius * Math.cos(overlapArcFraction * Math.PI);
	const axisRadians = (axisDegrees * Math.PI) / 180;
	const axis = { x: Math.sin(axisRadians), y: -Math.cos(axisRadians) };
	const circleOne = { x: (-axis.x * distance) / 2, y: (-axis.y * distance) / 2 };
	const circleTwo = { x: (axis.x * distance) / 2, y: (axis.y * distance) / 2 };
	const minX = Math.min(circleOne.x, circleTwo.x) - radius - padding.inline * radius;
	const minY = Math.min(circleOne.y, circleTwo.y) - radius - padding.top * radius;
	const maxY = Math.max(circleOne.y, circleTwo.y) + radius + padding.bottom * radius;
	const paddedMaxX = Math.max(circleOne.x, circleTwo.x) + radius + padding.inline * radius;
	const maxX = square ? Math.max(paddedMaxX, minX + maxY - minY) : paddedMaxX;
	return {
		radius,
		distance,
		circleOne,
		circleTwo,
		viewBox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
	};
}

/**
 * An SVG transform that mirrors the horse to face left and places its face
 * (HORSE_EYE) at (x, y), scaled by `scale`.
 */
export function horseTransform({ scale, x, y }) {
	return `translate(${x} ${y}) scale(${-scale} ${scale}) translate(${-HORSE_EYE.x} ${-HORSE_EYE.y})`;
}
