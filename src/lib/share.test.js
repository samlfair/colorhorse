import { describe, it, expect } from "vitest";
import { shareId, sharedPalette, SHARE_ID_PATTERN, PLACEHOLDER_SHARE_ID } from "./share.js";
import { encodeUrlState, URL_STATE_DEFAULTS } from "./url-state.js";
import { huePalette, huesFromColorOne } from "./hue-palette.js";
import { logoColors, OG_IMAGE_REGIONS } from "./logo-colors.js";

describe("share", () => {
	it("all assertions pass", () => {
		let passed = 0;
		let failed = 0;

		function assert(condition, message) {
			if (condition) {
				passed++;
			} else {
				failed++;
				console.error(`FAIL: ${message}`);
			}
		}

		const query = encodeUrlState({ colorOne: "#ff0000", colorTwo: "#0000ff", ...URL_STATE_DEFAULTS });

		// Ids: a digit and 7 base-36 digits, the same for the same settings, different
		// for different ones.
		{
			const id = shareId(query);
			assert(SHARE_ID_PATTERN.test(id), `an id is a digit and 7 lowercase letters or digits, got "${id}"`);
			assert(shareId(query) === id, "the same query gives the same id");
			assert(SHARE_ID_PATTERN.test(shareId("")), "an empty query still gives a valid id");
			assert(SHARE_ID_PATTERN.test(PLACEHOLDER_SHARE_ID), "the placeholder id is a valid id");
			const ids = new Set();
			for (let index = 0; index < 2000; index++) ids.add(shareId(query.replace("ff0000", index.toString(16).padStart(6, "0"))));
			assert(ids.size === 2000, `2000 different queries give 2000 different ids, got ${ids.size}`);
			for (const notId of ["logo", "wheel", "overview", "0000000", "000000000", "abcdefgh", "a0000000", "1BCDEFGH", "1bc-efgh"]) {
				assert(!SHARE_ID_PATTERN.test(notId), `"${notId}" isn't an id`);
			}
		}

		// The palette behind a share link.
		{
			const shared = sharedPalette(`?${query}`);
			const expected = logoColors(huesFromColorOne(huePalette("#ff0000", "#0000ff")).hues, OG_IMAGE_REGIONS);
			assert(shared.query === query, `the query is re-encoded unchanged, got "${shared.query}"`);
			assert(JSON.stringify(shared.imageColors) === JSON.stringify(expected), "the default settings give the default image colors");
			assert(sharedPalette("a=ff0000") === null, "a query without color two has no palette");
			assert(sharedPalette("") === null, "an empty query has no palette");

			const spread = sharedPalette(query.replace("slot=nearest", "slot=4"));
			const spreadExpected = logoColors(huesFromColorOne(huePalette("#ff0000", "#0000ff", { colorTwoSlot: 4 })).hues, OG_IMAGE_REGIONS);
			assert(JSON.stringify(spread.imageColors) === JSON.stringify(spreadExpected), "spread changes the image colors as it does on the page");

			const reordered = sharedPalette(query.split("&").reverse().join("&"));
			assert(reordered.query === query, "a reordered query re-encodes in the usual order, so it gets the same id");
		}

		expect(failed, failed + " assertion(s) failed -- see console output above for FAIL: details").toBe(0);
	});
});
