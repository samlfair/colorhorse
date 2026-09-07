import { describe, it, expect } from 'vitest';
import { buildAseFile } from './ase.js';

// Minimal decoder, independent of buildAseFile's own internals, so the test
// actually verifies the on-disk byte layout rather than just mirroring the
// encoder's own arithmetic back at itself.
function decodeAseFile(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  const signature = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  offset += 4;
  const versionMajor = view.getUint16(offset, false);
  offset += 2;
  const versionMinor = view.getUint16(offset, false);
  offset += 2;
  const blockCount = view.getUint32(offset, false);
  offset += 4;

  function readUtf16BEWithNull(unitCount) {
    let name = '';
    for (let unitIndex = 0; unitIndex < unitCount - 1; unitIndex++) {
      name += String.fromCharCode(view.getUint16(offset, false));
      offset += 2;
    }
    offset += 2; // trailing null unit
    return name;
  }

  const groups = [];
  let currentGroup = null;
  let blocksRead = 0;

  while (offset < bytes.byteLength) {
    const blockType = view.getUint16(offset, false);
    offset += 2;
    const blockDataLength = view.getUint32(offset, false);
    offset += 4;
    const blockDataStart = offset;
    blocksRead++;

    if (blockType === 0xc001) {
      const nameUnitCount = view.getUint16(offset, false);
      offset += 2;
      const name = readUtf16BEWithNull(nameUnitCount);
      currentGroup = { name, colors: [] };
      groups.push(currentGroup);
    } else if (blockType === 0xc002) {
      currentGroup = null;
    } else if (blockType === 0x0001) {
      const nameUnitCount = view.getUint16(offset, false);
      offset += 2;
      const name = readUtf16BEWithNull(nameUnitCount);
      const colorModel = String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3),
      );
      offset += 4;
      const r = view.getFloat32(offset, false);
      offset += 4;
      const g = view.getFloat32(offset, false);
      offset += 4;
      const b = view.getFloat32(offset, false);
      offset += 4;
      const colorType = view.getUint16(offset, false);
      offset += 2;
      currentGroup.colors.push({ name, colorModel, r, g, b, colorType });
    }

    offset = blockDataStart + blockDataLength;
  }

  return { signature, versionMajor, versionMinor, blockCount, blocksRead, groups };
}

function unitRgbToHex(r, g, b) {
  const toByteHex = (channel) => Math.round(channel * 255).toString(16).padStart(2, '0');
  return `#${toByteHex(r)}${toByteHex(g)}${toByteHex(b)}`;
}

describe('ase.js', () => {
  it('all assertions pass', () => {
    let passed = 0;
    let failed = 0;

    function assert(cond, message) {
      if (cond) {
        passed++;
      } else {
        failed++;
        console.error(`FAIL: ${message}`);
      }
    }

    const groups = [
      { name: 'Primary', colors: [
        { name: 'primary-01', hex: '#000000' },
        { name: 'primary-10', hex: '#ffffff' },
      ] },
      { name: 'Danger', colors: [
        { name: 'danger-05', hex: '#a1b2c3' },
      ] },
    ];

    const bytes = buildAseFile(groups);
    assert(bytes instanceof Uint8Array, 'buildAseFile returns a Uint8Array');

    const decoded = decodeAseFile(bytes);
    assert(decoded.signature === 'ASEF', 'file starts with the ASEF signature');
    assert(decoded.versionMajor === 1 && decoded.versionMinor === 0, 'version is 1.0');
    // 2 groups x (group start + group end) + 3 total colors = 7 blocks
    assert(decoded.blockCount === 7, `block count header is 7 (got ${decoded.blockCount})`);
    assert(decoded.blocksRead === decoded.blockCount, 'every declared block was actually readable from the bytes');

    assert(decoded.groups.length === 2, 'decoded 2 groups');
    assert(decoded.groups[0].name === 'Primary', 'first group name round-trips');
    assert(decoded.groups[1].name === 'Danger', 'second group name round-trips');
    assert(decoded.groups[0].colors.length === 2, 'first group has 2 colors');
    assert(decoded.groups[1].colors.length === 1, 'second group has 1 color');

    for (const [groupIndex, group] of groups.entries()) {
      for (const [colorIndex, color] of group.colors.entries()) {
        const decodedColor = decoded.groups[groupIndex].colors[colorIndex];
        assert(decodedColor.name === color.name, `color name round-trips for ${color.name}`);
        assert(decodedColor.colorModel === 'RGB ', `color model is "RGB " for ${color.name}`);
        assert(decodedColor.colorType === 2, `color type is 2 (Normal) for ${color.name}`);
        assert(
          unitRgbToHex(decodedColor.r, decodedColor.g, decodedColor.b) === color.hex,
          `RGB float triplet round-trips to ${color.hex} exactly (got ${unitRgbToHex(decodedColor.r, decodedColor.g, decodedColor.b)})`,
        );
      }
    }

    // An empty group list should still produce a well-formed, tiny header.
    const emptyFile = buildAseFile([]);
    const decodedEmpty = decodeAseFile(emptyFile);
    assert(decodedEmpty.signature === 'ASEF', 'an empty group list still starts with ASEF');
    assert(decodedEmpty.blockCount === 0, 'an empty group list has 0 blocks');
    assert(emptyFile.length === 12, 'an empty group list is exactly the 12-byte header');

    expect(failed, failed + ' assertion(s) failed -- see console output above for FAIL: details').toBe(0);
  });
});
