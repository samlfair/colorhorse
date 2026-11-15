// Builds static/og-image.png, the preview image for links to the site: the
// logo for #ff0000 and #0000ff, square, on its own background color.
//
//   node scripts/build-og-image.js
//
// It renders the site's own LogoMark to SVG, then draws that SVG itself,
// so the image follows the logo and needs nothing installed. (ImageMagick's
// built-in SVG renderer ignores clip paths, which the logo is made of.) The
// drawing covers what LogoMark uses: rect, circle, path (relative m, l, c,
// q, z), g, use, transform and clip-path, with every fill opaque.
//
// Link previews often crop a square image to about 1.91:1 around its
// middle. At 1200 square, that crop keeps the middle 628px, so the logo is
// 520px, centered, with room to spare.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { crc32, deflateSync } from "node:zlib";
import { compile } from "svelte/compiler";
import { render } from "svelte/server";
import { huePalette, huesFromColorOne } from "../src/lib/hue-palette.js";
import { logoColors } from "../src/lib/logo-colors.js";

const IMAGE_SIZE = 1200;
const LOGO_SIZE = 520;
const COLOR_ONE = "#ff0000";
const COLOR_TWO = "#0000ff";
// Samples per pixel along each side, for smooth edges.
const SUPERSAMPLE = 4;

const libDirectory = fileURLToPath(new URL("../src/lib/", import.meta.url));
const outputPath = fileURLToPath(new URL("../static/og-image.png", import.meta.url));

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

// --- Reading the SVG -------------------------------------------------------

function parseSvg(markup) {
	const root = { name: "#root", attributes: {}, children: [] };
	const stack = [root];
	for (const [, closing, name, attributeText, selfClosing] of markup.matchAll(/<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g)) {
		if (closing) {
			stack.pop();
			continue;
		}
		const attributes = Object.fromEntries([...attributeText.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]));
		const element = { name, attributes, children: [] };
		stack.at(-1).children.push(element);
		if (!selfClosing) stack.push(element);
	}
	return root.children[0];
}

// Affine transforms as [a, b, c, d, e, f]: x' = ax + cy + e, y' = bx + dy + f.
const IDENTITY = [1, 0, 0, 1, 0, 0];

function multiply([a1, b1, c1, d1, e1, f1], [a2, b2, c2, d2, e2, f2]) {
	return [a1 * a2 + c1 * b2, b1 * a2 + d1 * b2, a1 * c2 + c1 * d2, b1 * c2 + d1 * d2, a1 * e2 + c1 * f2 + e1, b1 * e2 + d1 * f2 + f1];
}

function parseTransform(text = "") {
	let matrix = IDENTITY;
	for (const [, kind, argumentText] of text.matchAll(/(\w+)\(([^)]*)\)/g)) {
		const [x, y] = argumentText.trim().split(/[\s,]+/).map(Number);
		if (kind === "translate") matrix = multiply(matrix, [1, 0, 0, 1, x, y ?? 0]);
		else if (kind === "scale") matrix = multiply(matrix, [x, 0, 0, y ?? x, 0, 0]);
		else throw new Error(`Unsupported transform: ${kind}`);
	}
	return matrix;
}

function apply([a, b, c, d, e, f], [x, y]) {
	return [a * x + c * y + e, b * x + d * y + f];
}

// --- Shapes, as closed polygons --------------------------------------------

const CURVE_STEPS = 24;

function circlePolygon({ cx, cy, r }) {
	const steps = 720;
	return [Array.from({ length: steps }, (_, step) => {
		const angle = (step / steps) * 2 * Math.PI;
		return [Number(cx) + Number(r) * Math.cos(angle), Number(cy) + Number(r) * Math.sin(angle)];
	})];
}

function roundedRectPolygon({ x, y, width, height, rx = 0 }) {
	[x, y, width, height, rx] = [x, y, width, height, rx].map(Number);
	const corners = [
		[x + width - rx, y + rx, -Math.PI / 2],
		[x + width - rx, y + height - rx, 0],
		[x + rx, y + height - rx, Math.PI / 2],
		[x + rx, y + rx, Math.PI],
	];
	const points = [];
	for (const [centerX, centerY, startAngle] of corners) {
		for (let step = 0; step <= CURVE_STEPS; step++) {
			const angle = startAngle + (step / CURVE_STEPS) * (Math.PI / 2);
			points.push([centerX + rx * Math.cos(angle), centerY + rx * Math.sin(angle)]);
		}
	}
	return [points];
}

function pathPolygons(d) {
	const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g);
	const argumentCounts = { m: 2, l: 2, c: 6, q: 4, z: 0 };
	const polygons = [];
	let polygon = null;
	let x = 0, y = 0, startX = 0, startY = 0, command = null, index = 0;
	while (index < tokens.length) {
		if (/[a-zA-Z]/.test(tokens[index])) command = tokens[index++];
		if (!(command in argumentCounts)) throw new Error(`Unsupported path command: ${command}`);
		if (command === "z") {
			x = startX;
			y = startY;
			command = null;
			continue;
		}
		const values = tokens.slice(index, index + argumentCounts[command]).map(Number);
		index += argumentCounts[command];
		if (command === "m") {
			x += values[0];
			y += values[1];
			startX = x;
			startY = y;
			polygon = [[x, y]];
			polygons.push(polygon);
			command = "l";
		} else if (command === "l") {
			x += values[0];
			y += values[1];
			polygon.push([x, y]);
		} else {
			const controls = [];
			for (let i = 0; i < values.length; i += 2) controls.push([x + values[i], y + values[i + 1]]);
			const [x0, y0] = [x, y];
			for (let step = 1; step <= CURVE_STEPS; step++) {
				const t = step / CURVE_STEPS, u = 1 - t;
				if (command === "q") {
					const [[x1, y1], [x2, y2]] = controls;
					polygon.push([u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2]);
				} else {
					const [[x1, y1], [x2, y2], [x3, y3]] = controls;
					polygon.push([
						u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
						u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
					]);
				}
			}
			[x, y] = controls.at(-1);
		}
	}
	return polygons;
}

// Every polygon an element draws, in its own coordinates.
function elementPolygons(element, definitions) {
	switch (element.name) {
		case "circle":
			return circlePolygon(element.attributes);
		case "rect":
			return roundedRectPolygon(element.attributes);
		case "path":
			return pathPolygons(element.attributes.d);
		case "use":
			return elementPolygons(definitions[element.attributes.href.slice(1)], definitions);
		case "g": {
			const matrix = parseTransform(element.attributes.transform);
			return element.children.flatMap((child) => elementPolygons(child, definitions))
				.map((polygon) => polygon.map((point) => apply(matrix, point)));
		}
		default:
			throw new Error(`Unsupported element: ${element.name}`);
	}
}

// --- Filling -----------------------------------------------------------------

// A coverage mask, one byte per sample, for polygons under the nonzero rule
// (the eye is a hole because its subpath winds the other way).
function fillMask(polygons, matrix, size) {
	const edges = [];
	for (const polygon of polygons) {
		const points = polygon.map((point) => apply(matrix, point));
		for (let i = 0; i < points.length; i++) {
			const [x0, y0] = points[i];
			const [x1, y1] = points[(i + 1) % points.length];
			if (y0 !== y1) edges.push({ x0, y0, x1, y1, winding: y1 > y0 ? 1 : -1, top: Math.min(y0, y1), bottom: Math.max(y0, y1) });
		}
	}
	const mask = new Uint8Array(size * size);
	for (let row = 0; row < size; row++) {
		const sampleY = row + 0.5;
		const crossings = [];
		for (const edge of edges) {
			if (sampleY < edge.top || sampleY >= edge.bottom) continue;
			const t = (sampleY - edge.y0) / (edge.y1 - edge.y0);
			crossings.push({ x: edge.x0 + t * (edge.x1 - edge.x0), winding: edge.winding });
		}
		crossings.sort((first, second) => first.x - second.x);
		let winding = 0;
		for (let i = 0; i < crossings.length - 1; i++) {
			winding += crossings[i].winding;
			if (winding === 0) continue;
			const from = Math.max(0, Math.ceil(crossings[i].x - 0.5));
			const to = Math.min(size - 1, Math.ceil(crossings[i + 1].x - 0.5) - 1);
			mask.fill(1, row * size + from, row * size + to + 1);
		}
	}
	return mask;
}

// The painted elements in order, each with its own polygons and the masks
// of every clip path on it or its ancestors.
function paintOrder(svg) {
	const definitions = {};
	const clipPaths = {};
	const collect = (element) => {
		if (element.attributes.id) definitions[element.attributes.id] = element;
		if (element.name === "clipPath") clipPaths[element.attributes.id] = element;
		element.children.forEach(collect);
	};
	collect(svg);

	const painted = [];
	const walk = (element, clips) => {
		if (element.name === "defs" || element.name === "title") return;
		const clip = element.attributes["clip-path"]?.match(/url\(#(.+)\)/)?.[1];
		const allClips = clip ? [...clips, clipPaths[clip]] : clips;
		if (element.name === "g" && !element.attributes.id) {
			element.children.forEach((child) => walk(child, allClips));
		} else {
			painted.push({ fill: element.attributes.fill, polygons: elementPolygons(element, definitions), clips: allClips });
		}
	};
	svg.children.forEach((child) => walk(child, []));
	return { painted, definitions };
}

function hexToRgb(hex) {
	return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
}

function drawLogo(logoSvg) {
	const svg = parseSvg(logoSvg);
	const [viewX, viewY, viewWidth] = svg.attributes.viewBox.split(/\s+/).map(Number);
	const size = LOGO_SIZE * SUPERSAMPLE;
	const scale = size / viewWidth;
	const toSamples = [scale, 0, 0, scale, -viewX * scale, -viewY * scale];

	const { painted, definitions } = paintOrder(svg);
	const clipMasks = new Map();
	const clipMask = (clipPath) => {
		if (!clipMasks.has(clipPath)) {
			clipMasks.set(clipPath, fillMask(clipPath.children.flatMap((child) => elementPolygons(child, definitions)), toSamples, size));
		}
		return clipMasks.get(clipPath);
	};

	// Opaque fills, so each sample takes the last fill that covers it.
	const sampleColor = new Int16Array(size * size).fill(-1);
	const fills = [];
	painted.forEach(({ fill, polygons, clips }) => {
		const fillIndex = fills.push(hexToRgb(fill)) - 1;
		const masks = [fillMask(polygons, toSamples, size), ...clips.map(clipMask)];
		for (let i = 0; i < sampleColor.length; i++) {
			if (masks.every((mask) => mask[i])) sampleColor[i] = fillIndex;
		}
	});
	return { sampleColor, fills };
}

// --- The image ---------------------------------------------------------------

function encodePng(width, height, rgb) {
	const rows = Buffer.alloc((width * 3 + 1) * height);
	for (let y = 0; y < height; y++) {
		rgb.copy(rows, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
	}
	const chunk = (type, data) => {
		const length = Buffer.alloc(4);
		length.writeUInt32BE(data.length);
		const body = Buffer.concat([Buffer.from(type), data]);
		const checksum = Buffer.alloc(4);
		checksum.writeUInt32BE(crc32(body));
		return Buffer.concat([length, body, checksum]);
	};
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header.writeUInt8(8, 8); // bit depth
	header.writeUInt8(2, 9); // truecolor
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", header),
		chunk("IDAT", deflateSync(rows, { level: 9 })),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

// One background: the image has no dark mode.
const { backgroundDark, ...colors } = logoColors(huesFromColorOne(huePalette(COLOR_ONE, COLOR_TWO)).hues);
const logoSvg = await renderLogoSvg({ ...colors, square: true, size: LOGO_SIZE, decorative: true });
const { sampleColor, fills } = drawLogo(logoSvg);

const background = hexToRgb(colors.background);
const image = Buffer.alloc(IMAGE_SIZE * IMAGE_SIZE * 3);
for (let i = 0; i < IMAGE_SIZE * IMAGE_SIZE; i++) image.set(background, i * 3);

// Each logo pixel is the average of its samples.
const offset = (IMAGE_SIZE - LOGO_SIZE) / 2;
const sampleSize = LOGO_SIZE * SUPERSAMPLE;
for (let pixelY = 0; pixelY < LOGO_SIZE; pixelY++) {
	for (let pixelX = 0; pixelX < LOGO_SIZE; pixelX++) {
		const total = [0, 0, 0];
		for (let sampleY = 0; sampleY < SUPERSAMPLE; sampleY++) {
			for (let sampleX = 0; sampleX < SUPERSAMPLE; sampleX++) {
				const fillIndex = sampleColor[(pixelY * SUPERSAMPLE + sampleY) * sampleSize + pixelX * SUPERSAMPLE + sampleX];
				const color = fillIndex < 0 ? background : fills[fillIndex];
				for (let channel = 0; channel < 3; channel++) total[channel] += color[channel];
			}
		}
		const imageIndex = ((offset + pixelY) * IMAGE_SIZE + offset + pixelX) * 3;
		for (let channel = 0; channel < 3; channel++) image[imageIndex + channel] = Math.round(total[channel] / SUPERSAMPLE ** 2);
	}
}

writeFileSync(outputPath, encodePng(IMAGE_SIZE, IMAGE_SIZE, image));
console.log(`Wrote ${outputPath} (${IMAGE_SIZE}x${IMAGE_SIZE}, background ${colors.background})`);
