/**
 * Adobe Swatch Exchange (.ase) file encoding -- a small binary format for
 * sharing named color swatches with design tools (Photoshop, Illustrator,
 * InDesign, Affinity, and Figma/Sketch via a plugin). There's no official
 * published spec; this follows the long-stable, reverse-engineered layout
 * the design-tooling community has used for years: big-endian throughout,
 * color-entry and group names as UTF-16BE with a trailing null, colors as
 * three big-endian 32-bit floats in [0, 1].
 *
 * File layout:
 *   "ASEF"                           4 bytes, signature
 *   version major, minor             2x uint16
 *   block count                      uint32
 *   blocks...
 *
 * Each block is a 2-byte type, a 4-byte data length, then the data itself:
 *   0xc001  group start   -- data: name length (uint16, UTF-16 units
 *                             including the trailing null) + name (UTF-16BE)
 *   0xc002  group end     -- no data (length 0)
 *   0x0001  color entry   -- data: name length + name (as above), then a
 *                             4-byte ASCII color model ("RGB "), the
 *                             channel floats, then a 2-byte color type
 *                             (0=global, 1=spot, 2=normal -- normal is what
 *                             every mainstream app treats as an ordinary
 *                             swatch)
 */

const SIGNATURE = [0x41, 0x53, 0x45, 0x46]; // "ASEF"
const BLOCK_TYPE_GROUP_START = 0xc001;
const BLOCK_TYPE_GROUP_END = 0xc002;
const BLOCK_TYPE_COLOR_ENTRY = 0x0001;
const COLOR_TYPE_NORMAL = 2;

function utf16BEWithNull(name) {
	const bytes = new Uint8Array((name.length + 1) * 2);
	for (let charIndex = 0; charIndex < name.length; charIndex++) {
		const code = name.charCodeAt(charIndex);
		bytes[charIndex * 2] = (code >> 8) & 0xff;
		bytes[charIndex * 2 + 1] = code & 0xff;
	}
	return bytes;
}

function hexToUnitRgb(hex) {
	const cleanHex = hex.replace(/^#/, "");
	return [0, 2, 4].map((charOffset) => parseInt(cleanHex.slice(charOffset, charOffset + 2), 16) / 255);
}

function groupNameBlockDataLength(name) {
	return 2 + (name.length + 1) * 2;
}

function colorEntryBlockDataLength(name) {
	return 2 + (name.length + 1) * 2 + 4 + 12 + 2;
}

/**
 * Build an .ase file from a list of named color groups.
 *
 * @param {{ name: string, colors: { name: string, hex: string }[] }[]} groups
 * @returns {Uint8Array}
 */
export function buildAseFile(groups) {
	let blockCount = 0;
	let totalByteLength = SIGNATURE.length + 2 + 2 + 4; // signature + version + block count

	for (const group of groups) {
		blockCount += 2; // group start + group end
		totalByteLength += 2 + 4 + groupNameBlockDataLength(group.name);
		totalByteLength += 2 + 4; // group end block has no data
		for (const color of group.colors) {
			blockCount += 1;
			totalByteLength += 2 + 4 + colorEntryBlockDataLength(color.name);
		}
	}

	const buffer = new ArrayBuffer(totalByteLength);
	const view = new DataView(buffer);
	const bytes = new Uint8Array(buffer);
	let byteOffset = 0;

	bytes.set(SIGNATURE, byteOffset);
	byteOffset += SIGNATURE.length;
	view.setUint16(byteOffset, 1, false); // version major
	byteOffset += 2;
	view.setUint16(byteOffset, 0, false); // version minor
	byteOffset += 2;
	view.setUint32(byteOffset, blockCount, false);
	byteOffset += 4;

	for (const group of groups) {
		const groupNameBytes = utf16BEWithNull(group.name);
		view.setUint16(byteOffset, BLOCK_TYPE_GROUP_START, false);
		byteOffset += 2;
		view.setUint32(byteOffset, groupNameBlockDataLength(group.name), false);
		byteOffset += 4;
		view.setUint16(byteOffset, group.name.length + 1, false);
		byteOffset += 2;
		bytes.set(groupNameBytes, byteOffset);
		byteOffset += groupNameBytes.length;

		for (const color of group.colors) {
			const colorNameBytes = utf16BEWithNull(color.name);
			view.setUint16(byteOffset, BLOCK_TYPE_COLOR_ENTRY, false);
			byteOffset += 2;
			view.setUint32(byteOffset, colorEntryBlockDataLength(color.name), false);
			byteOffset += 4;
			view.setUint16(byteOffset, color.name.length + 1, false);
			byteOffset += 2;
			bytes.set(colorNameBytes, byteOffset);
			byteOffset += colorNameBytes.length;
			bytes.set([0x52, 0x47, 0x42, 0x20], byteOffset); // "RGB "
			byteOffset += 4;
			for (const channelValue of hexToUnitRgb(color.hex)) {
				view.setFloat32(byteOffset, channelValue, false);
				byteOffset += 4;
			}
			view.setUint16(byteOffset, COLOR_TYPE_NORMAL, false);
			byteOffset += 2;
		}

		view.setUint16(byteOffset, BLOCK_TYPE_GROUP_END, false);
		byteOffset += 2;
		view.setUint32(byteOffset, 0, false);
		byteOffset += 4;
	}

	return bytes;
}
