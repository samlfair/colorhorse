// A palette's link-preview image: the logo in the palette's colors, as an
// indexed-color PNG.
//
// The logo's shape never changes, only its colors, so scripts/
// build-og-image.js draws it once and stores which color each pixel takes
// (og-image-data.js): one of the logo's regions, or an edge pixel's mix of
// two. Here, only the PNG's color table (PLTE) is built from the palette;
// the compressed pixels are reused as they are, so an image takes well
// under a millisecond.

import { REGIONS, ENTRIES, PNG_HEAD, PNG_TAIL } from "./og-image-data.js";

export const OG_IMAGE_SIZE = 1200;

function fromBase64(text) {
	const binary = atob(text);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

const head = fromBase64(PNG_HEAD);
const tail = fromBase64(PNG_TAIL);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});

function crc32(bytes) {
	let crc = 0xffffffff;
	for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

function hexToRgb(hex) {
	return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
}

/**
 * @param {Record<string, string>} colors  region key -> "#rrggbb", as
 *   logo-colors.js's logoColors gives them for OG_IMAGE_REGIONS
 * @returns {Uint8Array}  the PNG file
 */
export function ogImagePng(colors) {
	const regionColors = REGIONS.map((key) => hexToRgb(colors[key]));
	// The chunk as written: length, then type and data, then their checksum.
	const chunk = new Uint8Array(12 + ENTRIES.length * 3);
	const view = new DataView(chunk.buffer);
	view.setUint32(0, ENTRIES.length * 3);
	chunk.set([0x50, 0x4c, 0x54, 0x45], 4); // "PLTE"
	ENTRIES.forEach(([from, to, share], entry) => {
		for (let channel = 0; channel < 3; channel++) {
			const mixed = regionColors[from][channel] * (1 - share) + regionColors[to][channel] * share;
			chunk[8 + entry * 3 + channel] = Math.round(mixed);
		}
	});
	view.setUint32(chunk.length - 4, crc32(chunk.subarray(4, chunk.length - 4)));

	const png = new Uint8Array(head.length + chunk.length + tail.length);
	png.set(head, 0);
	png.set(chunk, head.length);
	png.set(tail, head.length + chunk.length);
	return png;
}
