// A small SVG rasterizer and PNG/ICO writer for the build scripts (the OG
// image and the favicon), so they need nothing installed. (ImageMagick's
// built-in SVG renderer ignores clip paths, which the logo is made of.)
//
// It draws what the logo uses: rect (with rx), circle, path (relative m,
// l, c, q, z), g, use, transform (translate, scale) and clip-path, with
// every fill opaque. Edges are smoothed by sampling each pixel several
// times; a pixel's opacity is the share of its samples that are covered.

import { crc32, deflateSync } from "node:zlib";

const SUPERSAMPLE = 4;
const CURVE_STEPS = 24;

// --- Reading the SVG ---------------------------------------------------------

function parseSvg(markup) {
	const root = { name: "#root", attributes: {}, children: [] };
	const stack = [root];
	for (const [, closing, name, attributeText, selfClosing] of markup.replace(/<!--.*?-->/gs, "").matchAll(/<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g)) {
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

// --- Shapes, as closed polygons ----------------------------------------------

function circlePolygon({ cx, cy, r }) {
	const steps = 720;
	return [Array.from({ length: steps }, (_, step) => {
		const angle = (step / steps) * 2 * Math.PI;
		return [Number(cx) + Number(r) * Math.cos(angle), Number(cy) + Number(r) * Math.sin(angle)];
	})];
}

function roundedRectPolygon({ x = 0, y = 0, width, height, rx = 0 }) {
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

// --- Filling -------------------------------------------------------------------

// A coverage mask, one byte per sample, for polygons under the nonzero rule
// (the horse's eye is a hole because its subpath winds the other way).
function fillMask(polygons, matrix, width, height) {
	const edges = [];
	for (const polygon of polygons) {
		const points = polygon.map((point) => apply(matrix, point));
		for (let i = 0; i < points.length; i++) {
			const [x0, y0] = points[i];
			const [x1, y1] = points[(i + 1) % points.length];
			if (y0 !== y1) edges.push({ x0, y0, x1, y1, winding: y1 > y0 ? 1 : -1, top: Math.min(y0, y1), bottom: Math.max(y0, y1) });
		}
	}
	const mask = new Uint8Array(width * height);
	for (let row = 0; row < height; row++) {
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
			const to = Math.min(width - 1, Math.ceil(crossings[i + 1].x - 0.5) - 1);
			if (to >= from) mask.fill(1, row * width + from, row * width + to + 1);
		}
	}
	return mask;
}

// The painted elements in order, each with its own polygons and the clip
// paths on it or its ancestors.
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

export function hexToRgb(hex) {
	return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
}

/**
 * Samples an SVG at `width` pixels across (its height follows its view
 * box), SUPERSAMPLE by SUPERSAMPLE samples a pixel.
 * @returns {{width: number, height: number, supersample: number, fills: string[], samples: Int16Array}}
 *   samples, row by row, hold the index in `fills` of the fill painted
 *   last at each sample, or -1 where nothing is
 */
export function sampleSvg(markup, width) {
	const svg = parseSvg(markup);
	const [viewX, viewY, viewWidth, viewHeight] = svg.attributes.viewBox.split(/[\s,]+/).map(Number);
	const height = Math.round((width * viewHeight) / viewWidth);
	const [sampleWidth, sampleHeight] = [width * SUPERSAMPLE, height * SUPERSAMPLE];
	const scale = sampleWidth / viewWidth;
	const toSamples = [scale, 0, 0, scale, -viewX * scale, -viewY * scale];

	const { painted, definitions } = paintOrder(svg);
	const clipMasks = new Map();
	const clipMask = (clipPath) => {
		if (!clipMasks.has(clipPath)) {
			const polygons = clipPath.children.flatMap((child) => elementPolygons(child, definitions));
			clipMasks.set(clipPath, fillMask(polygons, toSamples, sampleWidth, sampleHeight));
		}
		return clipMasks.get(clipPath);
	};

	// Opaque fills, so each sample takes the last fill that covers it.
	const samples = new Int16Array(sampleWidth * sampleHeight).fill(-1);
	const fills = [];
	for (const { fill, polygons, clips } of painted) {
		const fillIndex = fills.push(fill) - 1;
		const masks = [fillMask(polygons, toSamples, sampleWidth, sampleHeight), ...clips.map(clipMask)];
		for (let i = 0; i < samples.length; i++) {
			if (masks.every((mask) => mask[i])) samples[i] = fillIndex;
		}
	}
	return { width, height, supersample: SUPERSAMPLE, fills, samples };
}

/**
 * Draws an SVG at `width` pixels across (its height follows its view box).
 * @returns {{width: number, height: number, rgba: Buffer}}
 */
export function rasterizeSvg(markup, width) {
	const { height, fills: fillHexes, samples: sampleColor } = sampleSvg(markup, width);
	const fills = fillHexes.map(hexToRgb);
	const sampleWidth = width * SUPERSAMPLE;

	// Each pixel: the average color of its covered samples, as opaque as
	// the share of them that are covered.
	const rgba = Buffer.alloc(width * height * 4);
	for (let pixelY = 0; pixelY < height; pixelY++) {
		for (let pixelX = 0; pixelX < width; pixelX++) {
			const total = [0, 0, 0];
			let covered = 0;
			for (let sampleY = 0; sampleY < SUPERSAMPLE; sampleY++) {
				for (let sampleX = 0; sampleX < SUPERSAMPLE; sampleX++) {
					const fillIndex = sampleColor[(pixelY * SUPERSAMPLE + sampleY) * sampleWidth + pixelX * SUPERSAMPLE + sampleX];
					if (fillIndex < 0) continue;
					covered++;
					for (let channel = 0; channel < 3; channel++) total[channel] += fills[fillIndex][channel];
				}
			}
			const index = (pixelY * width + pixelX) * 4;
			if (covered) for (let channel = 0; channel < 3; channel++) rgba[index + channel] = Math.round(total[channel] / covered);
			rgba[index + 3] = Math.round((covered / SUPERSAMPLE ** 2) * 255);
		}
	}
	return { width, height, rgba };
}

/** A solid image, `width` by `height`, of one opaque color. */
export function solidImage(width, height, hex) {
	const rgba = Buffer.alloc(width * height * 4);
	const color = [...hexToRgb(hex), 255];
	for (let i = 0; i < width * height; i++) rgba.set(color, i * 4);
	return { width, height, rgba };
}

/** Paints `source` over `target` with its top left at (x, y). */
export function paintOver(target, source, x, y) {
	for (let row = 0; row < source.height; row++) {
		for (let column = 0; column < source.width; column++) {
			const from = (row * source.width + column) * 4;
			const to = ((y + row) * target.width + x + column) * 4;
			const alpha = source.rgba[from + 3] / 255;
			const targetAlpha = target.rgba[to + 3] / 255;
			const outAlpha = alpha + targetAlpha * (1 - alpha);
			for (let channel = 0; channel < 3; channel++) {
				const blended = source.rgba[from + channel] * alpha + target.rgba[to + channel] * targetAlpha * (1 - alpha);
				target.rgba[to + channel] = outAlpha ? Math.round(blended / outAlpha) : 0;
			}
			target.rgba[to + 3] = Math.round(outAlpha * 255);
		}
	}
}

// --- Files -----------------------------------------------------------------------

/** A PNG: RGB when every pixel is opaque, RGBA otherwise. */
export function encodePng({ width, height, rgba }) {
	let opaque = true;
	for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) opaque = false;
	const channels = opaque ? 3 : 4;
	const rows = Buffer.alloc((width * channels + 1) * height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			for (let channel = 0; channel < channels; channel++) {
				rows[y * (width * channels + 1) + 1 + x * channels + channel] = rgba[(y * width + x) * 4 + channel];
			}
		}
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
	header.writeUInt8(opaque ? 2 : 6, 9); // truecolor, or truecolor with alpha
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", header),
		chunk("IDAT", deflateSync(rows, { level: 9 })),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

/** An ICO holding PNG images, each `{ size, png }`. */
export function encodeIco(images) {
	const header = Buffer.alloc(6);
	header.writeUInt16LE(0, 0);
	header.writeUInt16LE(1, 2); // icon
	header.writeUInt16LE(images.length, 4);
	let offset = 6 + 16 * images.length;
	const entries = images.map(({ size, png }) => {
		const entry = Buffer.alloc(16);
		entry.writeUInt8(size >= 256 ? 0 : size, 0);
		entry.writeUInt8(size >= 256 ? 0 : size, 1);
		entry.writeUInt16LE(1, 4); // color planes
		entry.writeUInt16LE(32, 6); // bits per pixel
		entry.writeUInt32LE(png.length, 8);
		entry.writeUInt32LE(offset, 12);
		offset += png.length;
		return entry;
	});
	return Buffer.concat([header, ...entries, ...images.map(({ png }) => png)]);
}
