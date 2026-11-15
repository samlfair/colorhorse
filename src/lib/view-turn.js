/**
 * Turning the 3D colorspace view by dragging and scrolling. Every input goes
 * through turnView, so rotation always wraps to 0-360° and tilt stays
 * within the Tilt slider's range.
 */

export const TILT_RANGE = [-80, 80];

// Degrees per pixel: a drag across the graphic turns it about half a
// revolution; a wheel or trackpad scroll turns it more gently.
export const DRAG_DEGREES_PER_PIXEL = 0.4;
export const WHEEL_DEGREES_PER_PIXEL = 0.15;

// WheelEvent.deltaMode: 0 is pixels, 1 is lines, 2 is pages.
const PIXELS_PER_DELTA_UNIT = [1, 16, 400];

/**
 * @param {{azimuth: number, elevation: number}} view  degrees
 * @param {number} rotateBy  degrees to add to the rotation
 * @param {number} tiltBy  degrees to add to the tilt
 * @returns {{azimuth: number, elevation: number}}
 */
export function turnView({ azimuth, elevation }, rotateBy, tiltBy) {
	return {
		azimuth: (((azimuth + rotateBy) % 360) + 360) % 360,
		elevation: Math.min(Math.max(elevation + tiltBy, TILT_RANGE[0]), TILT_RANGE[1]),
	};
}

/**
 * A wheel event's movement in pixels, whatever unit the device reports.
 * @param {{deltaX: number, deltaY: number, deltaMode: number}} wheelEvent
 * @returns {{x: number, y: number}}
 */
export function wheelPixels({ deltaX, deltaY, deltaMode }) {
	const pixelsPerUnit = PIXELS_PER_DELTA_UNIT[deltaMode] ?? 1;
	return { x: deltaX * pixelsPerUnit, y: deltaY * pixelsPerUnit };
}
