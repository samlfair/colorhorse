// Builds the link-preview images: worker/og-image-data.js, which the
// Worker turns into any palette's image (see worker/og-image.js), and from
// it static/og-image.png, the image for #ff0000 and #0000ff that the home
// page itself uses.
//
//   node scripts/build-og-image.js
//
// It renders the site's own LogoMark to SVG, with a stand-in color for each
// of the logo's regions, then samples that SVG with svg-raster.js to learn
// which region each pixel shows. A pixel on an edge between two regions
// becomes a mix of the two: one of the share steps below. Run it again
// after changing the logo.
//
// Link previews often crop a square image to about 1.91:1 around its
// middle. At 1200 square, that crop keeps the middle 628px, so the logo is
// 520px, centered, with room to spare.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compile } from "svelte/compiler";
import { render } from "svelte/server";
import { huePalette, huesFromColorOne } from "../src/lib/hue-palette.js";
import { logoColors, OG_IMAGE_REGIONS } from "../src/lib/logo-colors.js";
import { crc32, deflateSync } from "node:zlib";
import { sampleSvg } from "./svg-raster.js";

const IMAGE_SIZE = 1200;
const LOGO_SIZE = 520;
const COLOR_ONE = "#ff0000";
const COLOR_TWO = "#0000ff";
// The regions the image shows: first the surface, which fills all but the
// logo (and so is entry 0, the rows' starting value), then the logo's.
const REGIONS = ["ogSurface", "background", "headOutside", "circleOne", "circleTwo", "overlap", "headOne", "headTwo", "headOverlap"];
// A PNG's color table holds at most 256 colors.
const MAX_ENTRIES = 256;

const libDirectory = fileURLToPath(new URL("../src/lib/", import.meta.url));
const dataPath = fileURLToPath(new URL("../worker/og-image-data.js", import.meta.url));
const imagePath = fileURLToPath(new URL("../static/og-image.png", import.meta.url));

// --- The logo, as the site renders it --------------------------------------

async function renderLogoSvg(props) {
	const workDirectory = mkdtempSync(join(tmpdir(), "og-image-"));
	try {
		// Compiled for the server, with its imports pointed at real files so
		// it runs from a temporary directory.
		const source = readFileSync(join(libDirectory, "LogoMark.svelte"), "utf8")
			.replaceAll('"$lib/', `"${pathToFileURL(libDirectory).href}`);
		const { js } = compile(source, { generate: "server", filename: "LogoMark.svelte" });
		const code = js.code.replace(/from ['"](svelte[^'"]*)['"]/g, (_, specifier) => `from "${import.meta.resolve(specifier)}"`);
		const componentPath = join(workDirectory, "LogoMark.js");
		writeFileSync(componentPath, code);
		const { default: LogoMark } = await import(pathToFileURL(componentPath).href);
		return render(LogoMark, { props }).body.replace(/<!--[^>]*-->/g, "");
	} finally {
		rmSync(workDirectory, { recursive: true, force: true });
	}
}

// --- Which region each pixel shows --------------------------------------------

// Stand-in fills, one per logo region, so a sample's fill names its region.
const standIns = Object.fromEntries(REGIONS.slice(1).map((key, index) => [key, `#0000${(index + 1).toString(16).padStart(2, "0")}`]));
const logoSvg = await renderLogoSvg({ ...standIns, square: true, size: LOGO_SIZE, decorative: true });
const { width, height, supersample, fills, samples } = sampleSvg(logoSvg, LOGO_SIZE);
const fillRegion = fills.map((fill) => REGIONS.indexOf(Object.keys(standIns).find((key) => standIns[key] === fill)));
const samplesPerPixel = supersample ** 2;

// Each logo pixel: its two most-sampled regions and the second one's
// share of their samples (outside the rounded corners is the surface).
const pixels = [];
for (let pixelY = 0; pixelY < height; pixelY++) {
	for (let pixelX = 0; pixelX < width; pixelX++) {
		const counts = new Array(REGIONS.length).fill(0);
		for (let sampleY = 0; sampleY < supersample; sampleY++) {
			for (let sampleX = 0; sampleX < supersample; sampleX++) {
				const fill = samples[(pixelY * supersample + sampleY) * width * supersample + pixelX * supersample + sampleX];
				counts[fill < 0 ? 0 : fillRegion[fill]]++;
			}
		}
		const [first, second] = counts.map((count, region) => ({ count, region })).sort((one, two) => two.count - one.count);
		pixels.push({ first: first.region, second: second.region, share: second.count / (first.count + second.count) });
	}
}

// The color table: each region, then each pair of regions that meet, at as
// many share steps as fit. A pair is kept in region order, so its steps
// run from all of one region to all of the other.
function colorTable(steps) {
	const entries = REGIONS.map((_, region) => [region, region, 0]);
	const entryIndex = new Map(entries.map((_, region) => [`${region}`, region]));
	const indices = pixels.map(({ first, second, share }) => {
		const step = Math.round(share * steps);
		if (step === 0) return first;
		const [from, to] = first < second ? [first, second] : [second, first];
		const toStep = first < second ? step : steps - step;
		const key = `${from},${to},${toStep}`;
		if (!entryIndex.has(key)) entryIndex.set(key, entries.push([from, to, toStep / steps]) - 1);
		return entryIndex.get(key);
	});
	return { entries, indices };
}
let steps = samplesPerPixel;
let table = colorTable(steps);
while (table.entries.length > MAX_ENTRIES) table = colorTable(--steps);

// --- The PNG, without its color table ------------------------------------------

function chunk(type, data) {
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type), data]);
	const checksum = Buffer.alloc(4);
	checksum.writeUInt32BE(crc32(body));
	return Buffer.concat([length, body, checksum]);
}

const offset = (IMAGE_SIZE - LOGO_SIZE) / 2;
const rows = Buffer.alloc((IMAGE_SIZE + 1) * IMAGE_SIZE); // background: entry 0, filter byte 0
for (let pixelY = 0; pixelY < height; pixelY++) {
	for (let pixelX = 0; pixelX < width; pixelX++) {
		rows[(offset + pixelY) * (IMAGE_SIZE + 1) + 1 + offset + pixelX] = table.indices[pixelY * width + pixelX];
	}
}
const header = Buffer.alloc(13);
header.writeUInt32BE(IMAGE_SIZE, 0);
header.writeUInt32BE(IMAGE_SIZE, 4);
header.writeUInt8(8, 8); // bit depth
header.writeUInt8(3, 9); // indexed color
const pngHead = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header)]);
const pngTail = Buffer.concat([chunk("IDAT", deflateSync(rows, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);

writeFileSync(dataPath, `// Generated by scripts/build-og-image.js: don't edit.

// The logo's regions, as logo-colors.js names them.
export const REGIONS = ${JSON.stringify(REGIONS)};

// The color table: each entry mixes two regions, [from, to, share of to].
export const ENTRIES = ${JSON.stringify(table.entries)};

// The PNG before and after its color table, base64.
export const PNG_HEAD = "${pngHead.toString("base64")}";
export const PNG_TAIL = "${pngTail.toString("base64")}";
`);
console.log(`Wrote ${dataPath} (${table.entries.length} colors, ${steps} share steps, ${pngTail.length} bytes of pixels)`);

// --- The home page's image -------------------------------------------------------

const { ogImagePng } = await import("../worker/og-image.js");
const colors = logoColors(huesFromColorOne(huePalette(COLOR_ONE, COLOR_TWO)).hues, OG_IMAGE_REGIONS);
writeFileSync(imagePath, ogImagePng(colors));
console.log(`Wrote ${imagePath} (${IMAGE_SIZE}x${IMAGE_SIZE}, surface ${colors.ogSurface})`);
