/**
 * Tests for the public API layer (index.js) -- getScheme(), the one
 * exported function. The underlying math modules each have their own
 * dedicated test file (oklch.test.js, cylinder-deform.test.js,
 * scheme.test.js, ...); this only covers the shaping layer index.js adds
 * on top of them.
 */
import { getScheme } from './index.js';
import { hexToOklch, oklchToSrgb } from './oklch.js';

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

		const HEX_RE = /^#[0-9a-f]{6}$/i;

		// ---------------------------------------------------------------------------
		// getScheme: defaults, shape, role naming.
		// ---------------------------------------------------------------------------
		{
			const scheme = getScheme();
			const roleNames = Object.keys(scheme).sort();
			assert(
				roleNames.join(',') === ['accent', 'danger', 'info', 'primary', 'secondary', 'success', 'tertiary', 'warning'].join(','),
				'roles are the 8 public names, including "success" (not "Tip")'
			);
			for (const shadeList of Object.values(scheme)) {
				assert(shadeList.length === 10, 'each role has the default 10 shades');
				assert(shadeList.every((hex) => HEX_RE.test(hex)), 'every shade is a valid hex string');
			}
		}

		// ---------------------------------------------------------------------------
		// Anchor colors round-trip: the two input hexes should reappear exactly
		// among the scheme's hex output.
		// ---------------------------------------------------------------------------
		{
			const colorOne = '#3366cc';
			const colorTwo = '#cc6633';
			const scheme = getScheme(colorOne, colorTwo);
			const allHexes = Object.values(scheme).flat().map((hex) => hex.toLowerCase());
			assert(allHexes.includes(colorOne), 'colorOne reappears exactly among the scheme hexes');
			assert(allHexes.includes(colorTwo), 'colorTwo reappears exactly among the scheme hexes');
		}

		// ---------------------------------------------------------------------------
		// custom shadeCount.
		// ---------------------------------------------------------------------------
		{
			const scheme = getScheme('#3366cc', '#cc6633', { shadeCount: 5 });
			assert(Object.values(scheme).every((shadeList) => shadeList.length === 5), 'every role has 5 shades');
		}

		// ---------------------------------------------------------------------------
		// input validation.
		// ---------------------------------------------------------------------------
		{
			let threw = false;
			try {
				getScheme('not-a-color', '#ffffff');
			} catch (error) {
				threw = error instanceof TypeError;
			}
			assert(threw, 'getScheme throws a TypeError on an invalid colorOne');

			threw = false;
			try {
				getScheme('#888888', '#ffffff');
			} catch (error) {
				threw = error instanceof Error;
			}
			assert(threw, 'getScheme throws on a zero-chroma (grayscale) colorOne');
		}

		// ---------------------------------------------------------------------------
		// contrast option: 0 is the default, other values change the ramps,
		// out-of-range values throw.
		// ---------------------------------------------------------------------------
		{
			const plain = getScheme('#3366cc', '#cc6633');
			const explicitZero = getScheme('#3366cc', '#cc6633', { contrast: 0 });
			assert(JSON.stringify(plain) === JSON.stringify(explicitZero), 'contrast defaults to 0');

			const contrasted = getScheme('#3366cc', '#cc6633', { contrast: 0.8 });
			assert(JSON.stringify(plain) !== JSON.stringify(contrasted), 'contrast 0.8 changes the scheme');
			const allHexes = Object.values(contrasted).flat().map((hex) => hex.toLowerCase());
			assert(allHexes.includes('#3366cc') && allHexes.includes('#cc6633'), 'both anchor colors still appear exactly with contrast');

			for (const badContrast of [-0.1, 1.5, Number.NaN, '0.5']) {
				let threw = false;
				try {
					getScheme('#3366cc', '#cc6633', { contrast: badContrast });
				} catch (error) {
					threw = error instanceof RangeError;
				}
				assert(threw, `getScheme throws a RangeError for contrast ${JSON.stringify(badContrast)}`);
			}
		}

		// ---------------------------------------------------------------------------
		// wheel option: "rgb" is the default, "ryb" respaces the hues but keeps
		// the anchors exact, anything else throws.
		// ---------------------------------------------------------------------------
		{
			const plain = getScheme('#3366cc', '#cc6633');
			assert(JSON.stringify(plain) === JSON.stringify(getScheme('#3366cc', '#cc6633', { wheel: 'rgb' })), 'wheel defaults to "rgb"');
			assert(JSON.stringify(plain) !== JSON.stringify(getScheme('#3366cc', '#cc6633', { wheel: 'ryb' })), 'wheel "ryb" changes the scheme');

			const pairs = [['#3366cc', '#cc6633'], ['#ff0000', '#00aa44'], ['#e4572e', '#29335c'], ['#ffcc00', '#7a2fb5'], ['#c8102e', '#ff8200']];
			for (const [one, two] of pairs) {
				for (const contrast of [0, 0.7]) {
					const scheme = getScheme(one, two, { wheel: 'ryb', contrast });
					const allHexes = Object.values(scheme).flat().map((hex) => hex.toLowerCase());
					assert(allHexes.length === 80 && allHexes.every((hex) => HEX_RE.test(hex)), `ryb ${one}/${two} gives 80 valid hexes`);
					assert(scheme.primary.includes(one) && scheme.secondary.includes(two), `ryb ${one}/${two} (contrast ${contrast}) keeps both anchors exact`);
				}
			}

			const fallback = getScheme('#3366cc', undefined, { wheel: 'ryb' });
			assert(fallback.primary.includes('#3366cc'), 'ryb one-color fallback keeps colorOne');
			assert(JSON.stringify(fallback) !== JSON.stringify(getScheme('#3366cc')), 'ryb one-color fallback differs from rgb');

			for (const badWheel of ['RYB', 'cmyk', '', null, 1]) {
				let threw = false;
				try {
					getScheme('#3366cc', '#cc6633', { wheel: badWheel });
				} catch (error) {
					threw = error instanceof RangeError;
				}
				assert(threw, `getScheme throws a RangeError for wheel ${JSON.stringify(badWheel)}`);
			}
		}

		// ---------------------------------------------------------------------------
		// one-color fallback: colorTwo omitted, colorOne given.
		// ---------------------------------------------------------------------------
		{
			const colorOne = '#3366cc';
			const scheme = getScheme(colorOne);
			const roleNames = Object.keys(scheme).sort();
			assert(
				roleNames.join(',') === ['accent', 'danger', 'info', 'primary', 'secondary', 'success', 'tertiary', 'warning'].join(','),
				'one-color fallback still returns the 8 public role names'
			);
			const allHexes = Object.values(scheme).flat().map((hex) => hex.toLowerCase());
			assert(allHexes.includes(colorOne), 'colorOne still reappears exactly among the scheme hexes');

			// colorTwo is synthesized 45deg around the wheel from colorOne, same
			// lightness/chroma -- getScheme(colorOne) should exactly match calling
			// getScheme with that synthesized colorTwo spelled out explicitly.
			const { L, C, H } = hexToOklch(colorOne);
			const adjacentHue = ((H + 45) % 360 + 360) % 360;
			const colorTwo = oklchToSrgb(L, C, adjacentHue).hex;
			const explicitScheme = getScheme(colorOne, colorTwo);
			assert(
				JSON.stringify(scheme) === JSON.stringify(explicitScheme),
				'getScheme(colorOne) matches getScheme(colorOne, colorOne-hue+45deg)'
			);

			// omitting BOTH colors is unchanged: still DEFAULTS' own built-in pair,
			// not the one-color fallback (which only applies when colorOne IS given).
			const noArgScheme = getScheme();
			const explicitDefaultScheme = getScheme('#4da3ff', '#ff6b4d');
			assert(
				JSON.stringify(noArgScheme) === JSON.stringify(explicitDefaultScheme),
				'getScheme() with no args is unaffected by the one-color fallback'
			);
		}

		expect(failed, failed + ' assertion(s) failed -- see console output above for FAIL: details').toBe(0);
	});
});
