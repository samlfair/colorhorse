# colorhorse

Generate a full, smoothly-related OKLCH color scheme from two anchor colors.

> Try it out: [color.horse](https://color.horse)

Give it two hex colors and it places 10 more hues around a color wheel between
them (minimum-bending-energy relaxed, so the spacing bends smoothly instead of
jumping), tapers each of the 12 hues into a lightness/chroma ramp, and
classifies 8 of them into named roles (`primary`, `secondary`, `tertiary`,
`accent`, `success`, `info`, `warning`, `danger`) by hue distance to reference
red/green/blue/yellow. Zero runtime dependencies.

This is a minimal initial release: `getScheme` is the main export, covering
the package's core promised functionality. A fuller release may add
formatting/utility helpers (raw palette grids, ready-made CSS output, WCAG
contrast, etc.) on top of this once there's real demand for them.

## Install

```sh
npm install colorhorse
```

## Quick start

```js
import { getScheme } from "colorhorse";

getScheme("#3366cc", "#cc6633");
// { primary: ["#...", ... 10 hex], secondary: [...], tertiary: [...],
//   accent: [...], success: [...], info: [...], warning: [...], danger: [...] }
// -- 80 colors total with the default 10 shades per role
```

`getScheme()` works with no arguments too -- it falls back to a built-in
default color pair. Give it just `colorOne` and it fills in `colorTwo` for
you, 45 degrees around the hue wheel from your color -- a fixed, harmonious
adjacency, not a random or unrelated pick:

```js
getScheme("#3366cc");
// same as getScheme("#3366cc", "<#3366cc's hue + 45deg, same L/C>")
```

Options tune the result. `wheel: "ryb"` spaces the hues around the painter's
red-yellow-blue wheel for warmer, more traditional palettes, and
`gamut: "print"` keeps every color printable in CMYK:

```js
getScheme("#3366cc", "#cc6633", { wheel: "ryb", gamut: "print", contrast: 0.4 });
```

## API

- **`getScheme(colorOne?, colorTwo?, options?)`** — role name → hex array
  (80 colors total by default).
  - `colorOne`, `colorTwo`: `"#rrggbb"` hex strings. Both must have nonzero
    chroma (not pure gray/black/white) -- the whole scheme is built by
    smoothly relaxing 12 hues between two real hues. `colorTwo` is optional:
    omit it (with `colorOne` given) for the one-color fallback above; omit
    both for the built-in default pair.
  - `options`: `{ minLightness = 0.1, maxLightness = 0.98, minChroma = 0.2, contrast = 0, shadeCount = 10, wheel = "rgb", gamut = "srgb" }`.
    Hue count is fixed at 12 -- the palette's internal harmony classification
    (square, analagous, tertiary, ...) is only meaningful for a 12-slot wheel.
  - `minChroma` is kept between 0.01 and the less saturated input color's
    own relative chroma, so the floor never sits above either anchor.
  - `contrast` (0 to 1) biases each ramp's shades toward the light and dark
    ends. 0 spreads them evenly. Both input colors still appear exactly, but
    one may move to a different shade as contrast rises, so the effect
    arrives partly in a step; more shades (`shadeCount`) make it smoother.
    Throws a `RangeError` outside 0 to 1.
  - `wheel` (`"rgb"` or `"ryb"`) picks the hue wheel the 12 hues are spaced
    around. `"rgb"` is the OKLCH hue circle. `"ryb"` is the painter's
    red-yellow-blue wheel (Itten's, via
    [RYBitten](https://github.com/meodai/RYBitten)): more of the wheel goes
    to reds, oranges and yellows, and complements are the traditional pairs
    (red/green, yellow/violet), which gives warmer, more traditional-looking
    palettes. Only hue placement changes; lightness, chroma and the anchors
    themselves are the same. Throws a `RangeError` for any other value.
  - `gamut` (`"srgb"` or `"print"`) sets how saturated colors may be.
    `"srgb"` is what a standard screen shows. `"print"` also keeps every
    color inside what CMYK offset printing on coated paper can reproduce
    (FOGRA39 / ISO Coated v2), so the palette converts to CMYK without
    its blues, violets, magentas and bright greens being clipped. The whole
    palette is reshaped to the smaller gamut, not just clipped at its edge.
    An input color outside the print gamut is desaturated to its edge, so
    it no longer appears exactly. Throws a `RangeError` for any other value.
- **`WHEELS`**, **`getWheel(name)`**, **`rybToOklchHue(angle)`**,
  **`oklchHueToRyb(hue)`** — the wheel names and their hue conversions
  (degrees in, `[0, 360)` out; `getWheel` returns `{ toWheel, toHue }`), for
  drawing or labelling the wheel yourself.
- **`GAMUTS`**, **`getGamut(name)`**, **`maxInPrintChroma(L, H)`** — the
  gamut names, a gamut's chroma limit (`getGamut` returns
  `{ maxChroma(L, H) }` in OKLCH), and the print limit on its own.
  `scripts/build-print-gamut-table.js` (in the repository, not the published
  package) regenerates the print table from any CMYK ICC profile.

## Where this came from

This package is the color-scheme engine extracted from the
[Color Horse](https://github.com/) SvelteKit demo app in this repository —
see `../src/routes` for interactive visualizations of the same
minimum-bending-energy model this package computes (the hue ring, the
lightness stack, and the chroma taper each have their own standalone demo).
The math itself (`src/*.js` here, minus `index.js`) is copied unmodified from
that app's `src/lib`, including its test suites.
