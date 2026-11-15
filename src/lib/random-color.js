// Two of the three RGB channels are pushed away from 127.5 in one
// direction and the third is pushed the same distance in the opposite
// direction, which keeps every random color near an edge of the RGB
// cube -- near the sRGB gamut boundary -- instead of near its muddy
// grey/brown center, whichever hue falls out. A lower power skews channel
// magnitudes further toward that boundary (more vivid); raise it toward 1
// for weaker, more muted colors.
const RANDOM_COLOR_POWER = 0.8;

/** A random vivid color as "#rrggbb". */
export function randomAnchorHex(random = Math.random) {
	const sign = Math.sign(random() - 0.5) || 1;
	const n1 = sign * Math.floor(1 + random() ** RANDOM_COLOR_POWER * 127);
	const n2 = sign * Math.floor(1 + random() ** RANDOM_COLOR_POWER * 127);
	const n3 = -sign * Math.floor(1 + random() ** RANDOM_COLOR_POWER * 127);
	const oddOneOut = Math.floor(random() * 3);
	const offsets = [n1, n2];
	offsets.splice(oddOneOut, 0, n3);
	const [r, g, b] = offsets.map((offset) => Math.round(127.5 + offset));
	return "#" + [r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("");
}

// A native <input type="color">'s own popup (Chrome and Edge's hex field in
// particular) fires `input` on every keystroke, including incomplete values
// like "#3" or "#33bb". Only a complete hex should reach the palette math.
export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
