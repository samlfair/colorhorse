import { describe, it, expect } from "vitest";
import { encodeUrlState, decodeUrlState, URL_STATE_DEFAULTS, URL_STATE_VERSION } from "./url-state.js";

describe("url-state", () => {
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

    const defaults = { colorOne: "#E4572E", colorTwo: "#29335c", ...URL_STATE_DEFAULTS };

    // Every setting is written, defaults included; colors lose the "#" and
    // are lowercased.
    {
      const query = encodeUrlState(defaults);
      assert(query === `a=e4572e&b=29335c&dark=0.1&light=0.98&sat=0.2&contrast=0&shades=10&wheel=rgb&gamut=srgb&slot=nearest&v=${URL_STATE_VERSION}`, `default settings are all encoded, got "${query}"`);
    }

    // Values are rounded.
    {
      const query = encodeUrlState({ ...defaults, dark: 0.08004, light: 0.9612, sat: 0.151, contrast: 0.6 });
      assert(query === `a=e4572e&b=29335c&dark=0.08&light=0.961&sat=0.15&contrast=0.6&shades=10&wheel=rgb&gamut=srgb&slot=nearest&v=${URL_STATE_VERSION}`, `settings are encoded and rounded, got "${query}"`);
    }

    // A non-numeric setting is left out rather than written as "NaN".
    {
      const query = encodeUrlState({ ...defaults, contrast: Number.NaN });
      assert(!query.includes("contrast"), `a NaN contrast is left out, got "${query}"`);
    }

    // Round trip: decode(encode(settings)) gives the settings back.
    {
      const settings = { colorOne: "#e4572e", colorTwo: "#29335c", dark: 0.05, light: 0.97, sat: 0.15, contrast: 0.6, wheel: "ryb", gamut: "print", shades: 14, slot: 7 };
      const decoded = decodeUrlState(`?${encodeUrlState(settings)}`);
      for (const [key, value] of Object.entries(settings)) {
        assert(decoded[key] === value, `round trip preserves ${key} (expected ${value}, got ${decoded[key]})`);
      }
      assert(decoded.version === URL_STATE_VERSION, "a new link round-trips as the current version");
    }

    // Versions: links from before v= was written are version 1; a page can
    // write an older version explicitly; a fresh visit is the current one.
    {
      assert(decodeUrlState("a=e4572e&b=29335c&dark=0.1").version === 1, "a link with settings but no v= decodes as version 1");
      assert(decodeUrlState("").version === URL_STATE_VERSION, "a fresh visit decodes as the current version");
      assert(decodeUrlState(encodeUrlState({ ...defaults, version: 1 })).version === 1, "an explicit version 1 round-trips");
      assert(decodeUrlState("a=e4572e&v=0").version === 1, "an invalid v= falls back to version 1 for a link with settings");
      assert(decodeUrlState("v=7").version === 7, "an unknown future version is reported as-is, for the page to handle");
    }

    // Omitted settings are absent, so the page keeps its own defaults.
    {
      const decoded = decodeUrlState("a=e4572e");
      assert(decoded.colorOne === "#e4572e", "a lone first color decodes");
      assert(!("colorTwo" in decoded), "the missing second color is absent");
      assert(!("dark" in decoded) && !("contrast" in decoded), "missing numbers are absent");
      assert(!("wheel" in decoded), "a missing wheel is absent, so old links stay on the default wheel");
      assert(Object.keys(decodeUrlState("")).join() === "version", "an empty query decodes to nothing but the version");
    }

    // Hand-edited links: malformed values are ignored, numbers are clamped.
    {
      const decoded = decodeUrlState("a=%23E4572E&b=zzz&dark=-1&light=5&sat=0&contrast=abc&v=2");
      assert(decoded.colorOne === "#e4572e", 'an "#"-prefixed (URL-escaped) color still decodes');
      assert(!("colorTwo" in decoded), "an invalid color is ignored");
      assert(decoded.dark === 0, "dark is clamped up to 0");
      assert(decoded.light === 1, "light is clamped down to 1");
      assert(decoded.sat === 0.01, "sat is clamped up to its 0.01 minimum");
      assert(!("contrast" in decoded), "a non-numeric contrast is ignored");
      assert(decoded.version === 2, "an explicit version is reported");
      assert(!("dark" in decodeUrlState("dark=")), "an empty number is ignored rather than read as 0");
      assert(decodeUrlState("wheel=RYB").wheel === "ryb", "wheel is case-insensitive");
      assert(!("wheel" in decodeUrlState("wheel=cmyk")), "an unknown wheel is ignored");
      assert(!encodeUrlState({ ...defaults, wheel: "cmyk" }).includes("wheel"), "an unknown wheel isn't encoded");
      assert(decodeUrlState("gamut=Print").gamut === "print", "gamut is case-insensitive");
      assert(!("gamut" in decodeUrlState("gamut=cmyk")), "an unknown gamut is ignored");
      assert(!("gamut" in decodeUrlState("a=e4572e")), "a missing gamut is absent, so old links stay on sRGB");
      assert(decodeUrlState("shades=2").shades === 4, "shades is clamped up to 4");
      assert(decodeUrlState("shades=99").shades === 20, "shades is clamped down to 20");
      assert(decodeUrlState("shades=7.6").shades === 8, "shades is rounded to a whole number");
      assert(!("shades" in decodeUrlState("shades=many")), "a non-numeric shades is ignored");
      assert(!("shades" in decodeUrlState("a=e4572e")), "a missing shades is absent, so old links keep 10 shades");
      assert(decodeUrlState("slot=Nearest").slot === "nearest", "slot=nearest decodes, case-insensitively");
      assert(decodeUrlState("slot=11").slot === 11, "slot 11 decodes as a number");
      for (const badSlot of ["0", "12", "1.5", "-3", "abc", ""]) {
        assert(!("slot" in decodeUrlState(`slot=${badSlot}`)), `slot=${badSlot} is ignored`);
      }
      assert(!("slot" in decodeUrlState("a=e4572e")), "a missing slot is absent, so old links stay on the nearest slot");
      assert(!encodeUrlState({ ...defaults, slot: 12 }).includes("slot"), "an out-of-range slot isn't encoded");
    }

    expect(failed, failed + " assertion(s) failed -- see console output above for FAIL: details").toBe(0);
  });
});
