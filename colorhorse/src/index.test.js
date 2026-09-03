/**
 * Tests for the public API layer (index.js) -- generatePalette() and the
 * formatters/utilities built on top of it. The underlying math modules each
 * have their own dedicated test file (oklch.test.js, cylinder-deform.test.js,
 * scheme.test.js, ...); these tests only cover the shaping/formatting layer
 * this package adds on top.
 */
import {
	DEFAULTS,
	generatePalette,
	paletteToHexGrid,
	paletteToRgbGrid,
	paletteToHexScheme,
	paletteToRgbScheme,
	paletteToCss,
	getFullPalette,
	getScheme,
	hexToRgb,
	rgbToHex,
	relativeLuminance,
	contrastRatio,
} from './index.js';

import { describe, it, expect } from 'vitest';

describe('colorhorse public API', () => {
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

		function assertClose(actual, expected, tol, message) {
			assert(Math.abs(actual - expected) <= tol, `${message} (expected ${expected}, got ${actual}, tol ${tol})`);
		}

		const HEX_RE = /^#[0-9a-f]{6}$/i;

		// ---------------------------------------------------------------------------
		// generatePalette: defaults, shape, role naming.
		// ---------------------------------------------------------------------------
		{
			const palette = generatePalette();
			assert(typeof palette.schemeName === 'string' && palette.schemeName.length > 0, 'default call has a schemeName');
			assert(palette.hueCount === 12, 'hueCount is 12');
			assert(palette.shadeCount === DEFAULTS.shadeCount, 'shadeCount defaults to DEFAULTS.shadeCount');
			assert(palette.shadeGrid.length === DEFAULTS.shadeCount, 'shadeGrid has shadeCount rows');
			assert(palette.shadeGrid.every((row) => row.length === 12), 'every shadeGrid row has 12 hues');

			const roleNames = Object.keys(palette.roles).sort();
			assert(
				roleNames.join(',') === ['accent', 'danger', 'info', 'primary', 'secondary', 'success', 'tertiary', 'warning'].join(','),
				'roles are the 8 public names, including "success" (not "Tip")'
			);
			for (const shadeList of Object.values(palette.roles)) {
				assert(shadeList.length === DEFAULTS.shadeCount, 'each role has shadeCount shades');
			}

			const hueIndicesUsed = new Set(Object.values(palette.roles).map((shadeList) => shadeList[0].hueIndex));
			assert(hueIndicesUsed.size === 8, 'the 8 roles land on 8 distinct hue indices');
		}

		// ---------------------------------------------------------------------------
		// Anchor colors round-trip: the two input hexes should reappear exactly
		// among the isAnchor points.
		// ---------------------------------------------------------------------------
		{
			const colorOne = '#3366cc';
			const colorTwo = '#cc6633';
			const palette = generatePalette(colorOne, colorTwo);
			const anchorHexes = palette.shadeGrid
				.flat()
				.filter((point) => point.isAnchor)
				.map((point) => point.hex.toLowerCase());
			assert(anchorHexes.length === 2, 'exactly 2 points are flagged as anchors');
			assert(anchorHexes.includes(colorOne), 'colorOne reappears exactly among the anchor points');
			assert(anchorHexes.includes(colorTwo), 'colorTwo reappears exactly among the anchor points');
			assert(palette.anchors.colorOne.hex === colorOne, 'anchors.colorOne.hex echoes the input');
			assert(palette.anchors.colorTwo.hex === colorTwo, 'anchors.colorTwo.hex echoes the input');
		}

		// ---------------------------------------------------------------------------
		// custom shadeCount.
		// ---------------------------------------------------------------------------
		{
			const palette = generatePalette('#3366cc', '#cc6633', { shadeCount: 5 });
			assert(palette.shadeCount === 5, 'shadeCount option is honored');
			assert(palette.shadeGrid.length === 5, 'shadeGrid has 5 rows');
			assert(Object.values(palette.roles).every((shadeList) => shadeList.length === 5), 'every role has 5 shades');
		}

		// ---------------------------------------------------------------------------
		// paletteToHexGrid / paletteToRgbGrid.
		// ---------------------------------------------------------------------------
		{
			const palette = generatePalette('#3366cc', '#cc6633');
			const hexGrid = paletteToHexGrid(palette);
			const rgbGrid = paletteToRgbGrid(palette);
			assert(hexGrid.length === 12 * DEFAULTS.shadeCount, 'paletteToHexGrid returns hueCount*shadeCount hex strings');
			assert(hexGrid.every((hex) => HEX_RE.test(hex)), 'every entry from paletteToHexGrid is a valid hex string');
			assert(rgbGrid.length === hexGrid.length, 'paletteToRgbGrid has the same length as paletteToHexGrid');
			assert(
				rgbGrid.every((rgb) => Number.isInteger(rgb.r) && Number.isInteger(rgb.g) && Number.isInteger(rgb.b)),
				'every rgb entry has integer channels'
			);
		}

		// ---------------------------------------------------------------------------
		// paletteToHexScheme / paletteToRgbScheme / getFullPalette / getScheme
		// one-shot convenience wrappers match the two-step equivalent.
		// ---------------------------------------------------------------------------
		{
			const colorOne = '#3366cc';
			const colorTwo = '#cc6633';
			const palette = generatePalette(colorOne, colorTwo);
			const hexScheme = paletteToHexScheme(palette);
			const rgbScheme = paletteToRgbScheme(palette);
			assert(Object.keys(hexScheme).length === 8, 'paletteToHexScheme has 8 role keys');
			assert(
				Object.values(hexScheme).reduce((total, shades) => total + shades.length, 0) === 8 * DEFAULTS.shadeCount,
				'paletteToHexScheme totals 8*shadeCount hex strings (80 with the default shadeCount)'
			);
			assert(Object.keys(rgbScheme).length === 8, 'paletteToRgbScheme has 8 role keys');

			assert(
				JSON.stringify(getFullPalette(colorOne, colorTwo)) === JSON.stringify(paletteToHexGrid(palette)),
				'getFullPalette(colors) matches paletteToHexGrid(generatePalette(colors))'
			);
			assert(
				JSON.stringify(getScheme(colorOne, colorTwo)) === JSON.stringify(hexScheme),
				'getScheme(colors) matches paletteToHexScheme(generatePalette(colors))'
			);
		}

		// ---------------------------------------------------------------------------
		// paletteToCss.
		// ---------------------------------------------------------------------------
		{
			const palette = generatePalette('#3366cc', '#cc6633');
			const css = paletteToCss(palette);
			assert(css.startsWith('/*'), 'paletteToCss starts with a scheme-name comment');
			assert(css.includes(':root {'), 'paletteToCss defaults to a :root selector');
			assert(css.includes('--primary-01:'), 'paletteToCss includes a --primary-01 declaration');
			assert(css.includes('--success-10:') === (DEFAULTS.shadeCount === 10), 'paletteToCss shade numbering matches shadeCount');
			const customCss = paletteToCss(palette, { selector: '.theme', prefix: '--ch-' });
			assert(customCss.includes('.theme {'), 'paletteToCss honors a custom selector');
			assert(customCss.includes('--ch-primary-01:'), 'paletteToCss honors a custom prefix');
		}

		// ---------------------------------------------------------------------------
		// hexToRgb / rgbToHex round-trip.
		// ---------------------------------------------------------------------------
		{
			const rgb = hexToRgb('#a1b2c3');
			assert(rgb.r === 0xa1 && rgb.g === 0xb2 && rgb.b === 0xc3, 'hexToRgb parses channels correctly');
			assert(rgbToHex(rgb) === '#a1b2c3', 'rgbToHex is the exact inverse of hexToRgb');
			assert(rgbToHex({ r: -10, g: 128, b: 400 }) === '#0080ff', 'rgbToHex clamps out-of-range channels');
		}

		// ---------------------------------------------------------------------------
		// relativeLuminance / contrastRatio: known WCAG reference values.
		// ---------------------------------------------------------------------------
		{
			assertClose(relativeLuminance('#ffffff'), 1, 1e-6, 'white has relative luminance 1');
			assertClose(relativeLuminance('#000000'), 0, 1e-6, 'black has relative luminance 0');
			assertClose(contrastRatio('#000000', '#ffffff'), 21, 1e-6, 'black/white contrast ratio is exactly 21');
			assertClose(contrastRatio('#3366cc', '#3366cc'), 1, 1e-6, 'a color against itself has contrast ratio 1');
			assert(contrastRatio('#ffffff', '#000000') === contrastRatio('#000000', '#ffffff'), 'contrastRatio is symmetric');
		}

		// ---------------------------------------------------------------------------
		// input validation.
		// ---------------------------------------------------------------------------
		{
			let threw = false;
			try {
				generatePalette('not-a-color', '#ffffff');
			} catch (error) {
				threw = error instanceof TypeError;
			}
			assert(threw, 'generatePalette throws a TypeError on an invalid colorOne');

			threw = false;
			try {
				hexToRgb('#zzzzzz');
			} catch (error) {
				threw = error instanceof TypeError;
			}
			assert(threw, 'hexToRgb throws a TypeError on an invalid hex string');
		}

		expect(failed, failed + ' assertion(s) failed -- see console output above for FAIL: details').toBe(0);
	});
});
