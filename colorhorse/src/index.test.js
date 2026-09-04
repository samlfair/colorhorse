/**
 * Tests for the public API layer (index.js) -- getScheme(), the one
 * exported function. The underlying math modules each have their own
 * dedicated test file (oklch.test.js, cylinder-deform.test.js,
 * scheme.test.js, ...); this only covers the shaping layer index.js adds
 * on top of them.
 */
import { getScheme } from './index.js';

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

		expect(failed, failed + ' assertion(s) failed -- see console output above for FAIL: details').toBe(0);
	});
});
