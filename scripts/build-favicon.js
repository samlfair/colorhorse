// Builds the favicons: the logo without the horse, its two overlapping
// circles centered in the rounded square, for #ff0000 and #0000ff.
//
//   node scripts/build-favicon.js
//
// Writes static/favicon.svg (sharp at any size), static/favicon.ico
// (16px and 32px, for browsers that ask for /favicon.ico) and
// static/apple-touch-icon.png (180px, full-bleed: iOS rounds it itself).

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { huePalette, huesFromColorOne } from "../src/lib/hue-palette.js";
import { logoColors } from "../src/lib/logo-colors.js";
import { logoGeometry, LOGO_CORNER_RADIUS, LOGO_PADDING, LOGO_SHAPE } from "../src/lib/logo-geometry.js";
import { encodeIco, encodePng, rasterizeSvg } from "./svg-raster.js";

const COLOR_ONE = "#ff0000";
const COLOR_TWO = "#0000ff";

const staticDirectory = fileURLToPath(new URL("../static/", import.meta.url));
const colors = logoColors(huesFromColorOne(huePalette(COLOR_ONE, COLOR_TWO)).hues);

// The circles sit either side of the origin, so a square centered there
// centers them, with the logo's padding on the longer side.
const { radius, circleOne, circleTwo, viewBox } = logoGeometry({ ...LOGO_SHAPE, padding: LOGO_PADDING });
const side = Math.max(viewBox.width, viewBox.height);
const corner = LOGO_CORNER_RADIUS * radius;

function faviconSvg({ rounded }) {
	const circle = ({ x, y }, fill, clip = "") => `<circle cx="${x}" cy="${y}" r="${radius}" fill="${fill}"${clip}/>`;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-side / 2} ${-side / 2} ${side} ${side}">
	<defs>
		<clipPath id="one">${circle(circleOne, "#000")}</clipPath>
	</defs>
	<rect x="${-side / 2}" y="${-side / 2}" width="${side}" height="${side}"${rounded ? ` rx="${corner}"` : ""} fill="${colors.background}"/>
	${circle(circleOne, colors.circleOne)}
	${circle(circleTwo, colors.circleTwo)}
	${circle(circleTwo, colors.overlap, ` clip-path="url(#one)"`)}
</svg>
`;
}

const roundedSvg = faviconSvg({ rounded: true });
writeFileSync(`${staticDirectory}favicon.svg`, roundedSvg);
writeFileSync(`${staticDirectory}favicon.ico`, encodeIco([16, 32].map((size) => ({ size, png: encodePng(rasterizeSvg(roundedSvg, size)) }))));
writeFileSync(`${staticDirectory}apple-touch-icon.png`, encodePng(rasterizeSvg(faviconSvg({ rounded: false }), 180)));
console.log(`Wrote favicon.svg, favicon.ico (16, 32) and apple-touch-icon.png (180) to ${staticDirectory}`);
