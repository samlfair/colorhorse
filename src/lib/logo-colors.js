/**
 * Which palette color each region of the logo mark takes: a hue, counted
 * around the ring from color one's (hue 1 is color one's own), and a shade
 * from 1 (darkest) to 10 (lightest). Developed on the /logo page.
 */
export const LOGO_REGIONS = [
	{ key: "background", label: "Background", hue: 1, shade: 9 },
	{ key: "backgroundDark", label: "Background (Dark Mode)", hue: 1, shade: 5 },
	{ key: "headOutside", label: "Head Outside Circles", hue: 1, shade: 7 },
	{ key: "circleOne", label: "Circle One", hue: 5, shade: 7 },
	{ key: "circleTwo", label: "Circle Two", hue: 9, shade: 7 },
	{ key: "overlap", label: "Overlap", hue: 7, shade: 8 },
	{ key: "headOne", label: "Head in Circle One", hue: 3, shade: 8 },
	{ key: "headTwo", label: "Head in Circle Two", hue: 11, shade: 8 },
	{ key: "headOverlap", label: "Head in Overlap", hue: 1, shade: 10 },
];

// The link-preview image's regions: the logo's, plus the surface it sits
// on, which fills the rest of the image.
export const OG_IMAGE_REGIONS = [
	...LOGO_REGIONS,
	{ key: "ogSurface", label: "Preview Image Surface", hue: 7, shade: 9 },
];

/**
 * @param {{shades: string[]}[]} huesFromColorOne  hues starting from color one's
 *   (see hue-palette.js's huesFromColorOne)
 * @param {{key: string, hue: number, shade: number}[]} [regions]
 * @returns {Record<string, string>}  region key -> hex, ready to spread onto LogoMark
 */
export function logoColors(huesFromColorOne, regions = LOGO_REGIONS) {
	return Object.fromEntries(regions.map((region) => [region.key, huesFromColorOne[region.hue - 1].shades[region.shade - 1]]));
}
