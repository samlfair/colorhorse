/**
 * Tests for the public API layer (index.js) -- getScheme(), the one
 * exported function. The underlying math modules each have their own
 * dedicated test file (oklch.test.js, cylinder-deform.test.js,
 * scheme.test.js, ...); this only covers the shaping layer index.js adds
 * on top of them.
 */
import { getScheme, getHueRing, assignRoles, maxInPrintChroma } from './index.js';
import { computeColorScheme } from './scheme.js';
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
		// gamut option: "srgb" is the default; "print" keeps every color inside
		// the print gamut, moving out-of-gamut anchors to its edge.
		// ---------------------------------------------------------------------------
		{
			// Hex rounding can push a color just past the boundary it was placed on.
			const HEX_ROUNDING_CHROMA = 0.004;
			function withinPrint(hex) {
				const { L, C, H } = hexToOklch(hex);
				return C <= maxInPrintChroma(L, H) + HEX_ROUNDING_CHROMA;
			}

			const plain = getScheme('#3366cc', '#cc6633');
			assert(JSON.stringify(plain) === JSON.stringify(getScheme('#3366cc', '#cc6633', { gamut: 'srgb' })), 'gamut defaults to "srgb"');
			assert(!Object.values(plain).flat().every(withinPrint), 'the sRGB palette has colors outside print (so the next checks mean something)');

			const pairs = [['#3366cc', '#cc6633'], ['#0000ff', '#ff00ff'], ['#00ff00', '#e4572e'], ['#29335c', '#ffcc00']];
			for (const [one, two] of pairs) {
				for (const wheel of ['rgb', 'ryb']) {
					const scheme = getScheme(one, two, { gamut: 'print', wheel, contrast: 0.5 });
					const outside = Object.values(scheme).flat().filter((hex) => !withinPrint(hex));
					assert(outside.length === 0, `print ${one}/${two} on ${wheel} stays in the print gamut (outside: ${outside.join(' ')})`);
				}
			}

			const muted = ['#8a6a50', '#4f6b5e'];
			assert(muted.every(withinPrint), 'the muted test anchors are printable');
			const mutedScheme = getScheme(muted[0], muted[1], { gamut: 'print' });
			assert(mutedScheme.primary.includes(muted[0]) && mutedScheme.secondary.includes(muted[1]), 'printable anchors still appear exactly');

			const blue = getScheme('#0000ff', '#e4572e', { gamut: 'print' });
			assert(!blue.primary.includes('#0000ff'), 'an unprintable anchor is not reproduced exactly');
			const anchorHue = hexToOklch('#0000ff').H;
			assert(blue.primary.some((hex) => Math.abs(hexToOklch(hex).H - anchorHue) < 3), 'but its hue survives, desaturated to the print edge');

			for (const badGamut of ['cmyk', 'SRGB', '', null, 1]) {
				let threw = false;
				try {
					getScheme('#3366cc', '#cc6633', { gamut: badGamut });
				} catch (error) {
					threw = error instanceof RangeError;
				}
				assert(threw, `getScheme throws a RangeError for gamut ${JSON.stringify(badGamut)}`);
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

		// ---------------------------------------------------------------------------
		// roleModel (0.7): model 2 is the default, model 1 is the 0.6 assignment.
		// ---------------------------------------------------------------------------
		{
			const pairs = [['#3366cc', '#cc6633'], ['#e4572e', '#29335c'], ['#ffcc00', '#7a2fb5'], ['#2e86de', '#5f27cd']];
			const allRoles = ['primary', 'secondary', 'tertiary', 'accent', 'success', 'info', 'warning', 'danger'];
			for (const [colorOne, colorTwo] of pairs) {
				const label = `${colorOne}/${colorTwo}`;
				assert(
					JSON.stringify(getScheme(colorOne, colorTwo)) === JSON.stringify(getScheme(colorOne, colorTwo, { roleModel: 2 })),
					`${label}: roleModel 2 is the default`,
				);

				// Model 1 picks exactly the hues the 0.6 assignment does.
				const ring = getHueRing(colorOne, colorTwo);
				const modelOne = computeColorScheme(ring.hues, ring.colorOneIndex, ring.colorTwoIndex);
				const assignedOne = assignRoles(ring.hues, ring.colorOneIndex, ring.colorTwoIndex, { roleModel: 1 });
				assert(assignedOne.roles.success === modelOne.roles.Tip && assignedOne.roles.danger === modelOne.roles.Danger, `${label}: roleModel 1 matches the 0.6 roles`);

				// On the nearest slot, both models give all 8 roles on 8 distinct hues.
				for (const roleModel of [1, 2]) {
					const scheme = getScheme(colorOne, colorTwo, { roleModel });
					assert(allRoles.every((roleName) => roleName in scheme), `${label}: roleModel ${roleModel} has all 8 roles on the nearest slot`);
					const assigned = assignRoles(ring.hues, ring.colorOneIndex, ring.colorTwoIndex, { roleModel });
					assert(new Set(Object.values(assigned.roles)).size === 8, `${label}: roleModel ${roleModel} uses 8 distinct hues`);
					assert(typeof assigned.harmonyName === 'string' && assigned.harmonyName.length > 0, `${label}: assignRoles names the harmony`);
				}

				// Naming the nearest slot explicitly keeps the nearest-slot role
				// rules (the ring itself is laid out by tension-ring.js, so its
				// hues differ slightly from the default ring).
				const nearestSlot = (ring.colorTwoIndex - ring.colorOneIndex + 12) % 12;
				const explicitNearest = getScheme(colorOne, colorTwo, { colorTwoSlot: nearestSlot });
				assert(allRoles.every((roleName) => roleName in explicitNearest), `${label}: colorTwoSlot set to the nearest slot keeps all 8 roles`);
			}

			// On a moved slot, model 2 may leave a semantic role out; model 1 never does.
			let leftOut = 0;
			for (const [colorOne, colorTwo] of pairs) {
				for (let colorTwoSlot = 1; colorTwoSlot < 12; colorTwoSlot++) {
					const modelTwo = getScheme(colorOne, colorTwo, { colorTwoSlot });
					const modelOne = getScheme(colorOne, colorTwo, { colorTwoSlot, roleModel: 1 });
					assert(Object.keys(modelOne).length === 8, `${colorOne}/${colorTwo} slot ${colorTwoSlot}: roleModel 1 keeps every role`);
					assert(['primary', 'secondary', 'tertiary', 'accent'].every((roleName) => roleName in modelTwo), `${colorOne}/${colorTwo} slot ${colorTwoSlot}: the harmony roles are always present`);
					leftOut += 8 - Object.keys(modelTwo).length;
				}
			}
			assert(leftOut > 0, 'some moved slot leaves a semantic role out under roleModel 2');

			for (const badModel of [0, 3, '2', null]) {
				let threw = false;
				try {
					getScheme('#3366cc', '#cc6633', { roleModel: badModel });
				} catch (error) {
					threw = error instanceof RangeError;
				}
				assert(threw, `roleModel ${JSON.stringify(badModel)} throws a RangeError`);
			}
			let threw = false;
			try {
				assignRoles([0, 30, 60], 0, 1);
			} catch (error) {
				threw = error instanceof RangeError;
			}
			assert(threw, 'assignRoles needs 12 hues');
		}

		expect(failed, failed + ' assertion(s) failed -- see console output above for FAIL: details').toBe(0);
	});
});
