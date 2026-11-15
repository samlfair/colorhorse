/**
 * Share links: each palette's page lives at /{id}?{settings}, where the id
 * is a hash of the settings. The query string still carries the palette
 * (a hash can't be turned back into settings); the id gives each palette
 * its own path, so link previews made for one palette aren't reused for
 * another, and sends the request to the Worker (worker/index.js), which
 * fills in that palette's preview image. "/" itself stays a static page.
 */
import { decodeUrlState, encodeUrlState, URL_STATE_DEFAULTS } from "./url-state.js";
import { huePalette, huesFromColorOne } from "./hue-palette.js";
import { logoColors, OG_IMAGE_REGIONS } from "./logo-colors.js";

// A digit, then 7 lowercase letters or digits: starting with a digit, an id
// can't spell a page's name (like "overview") or a typo of one.
export const SHARE_ID_PATTERN = /^[0-9][0-9a-z]{7}$/;

// The id the build prerenders the share page at; the Worker serves that
// page for every other id.
export const PLACEHOLDER_SHARE_ID = "00000000";

/**
 * A short, stable id for a settings query: the same settings always give
 * the same id. cyrb53, a fast 53-bit string hash, taken down to a digit and
 * 7 base-36 digits (about 780 billion ids).
 *
 * @param {string} query  a query string, without the leading "?"
 * @returns {string}
 */
export function shareId(query) {
	let h1 = 0xdeadbeef;
	let h2 = 0x41c6ce57;
	for (let i = 0; i < query.length; i++) {
		const code = query.charCodeAt(i);
		h1 = Math.imul(h1 ^ code, 2654435761);
		h2 = Math.imul(h2 ^ code, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
	const rest = Math.floor(hash / 10) % 36 ** 7;
	return `${hash % 10}${rest.toString(36).padStart(7, "0")}`;
}

/**
 * The palette a share link's query describes, for its preview image.
 *
 * @param {string} search  a query string, with or without the leading "?"
 * @returns {{query: string, imageColors: Record<string, string>} | null}
 *   query is the settings re-encoded (so equal palettes get equal
 *   queries); null when the query lacks either color
 */
export function sharedPalette(search) {
	const settings = { ...URL_STATE_DEFAULTS, ...decodeUrlState(search) };
	if (!settings.colorOne || !settings.colorTwo) return null;
	const palette = huePalette(settings.colorOne, settings.colorTwo, {
		minChroma: settings.sat,
		minLightness: settings.dark,
		maxLightness: settings.light,
		contrast: settings.contrast,
		wheel: settings.wheel,
		gamut: settings.gamut,
		colorTwoSlot: settings.slot === "nearest" ? undefined : settings.slot,
	});
	return {
		query: encodeUrlState(settings),
		imageColors: logoColors(huesFromColorOne(palette).hues, OG_IMAGE_REGIONS),
	};
}
