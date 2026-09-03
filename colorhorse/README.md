# colorhorse

Generate a full, smoothly-related OKLCH color scheme from two anchor colors.

Give it two hex colors and it places 10 more hues around a color wheel between
them (minimum-bending-energy relaxed, so the spacing bends smoothly instead of
jumping), tapers each of the 12 hues into a lightness/chroma ramp, and
classifies 8 of them into named roles (`primary`, `secondary`, `tertiary`,
`accent`, `success`, `info`, `warning`, `danger`) by hue distance to reference
red/green/blue/yellow. Zero runtime dependencies.

## Install

```sh
npm install colorhorse
```

## Quick start

```js
import { getScheme, getFullPalette } from "colorhorse";

getScheme("#3366cc", "#cc6633");
// { primary: ["#...", ... 10 hex], secondary: [...], tertiary: [...],
//   accent: [...], success: [...], info: [...], warning: [...], danger: [...] }
// -- 80 colors total with the default 10 shades per role

getFullPalette("#3366cc", "#cc6633");
// [ "#...", ... 120 hex ]  -- every hue x shade combination, not just the 8 roles
```

Both work with no arguments too -- `getScheme()` / `getFullPalette()` fall
back to a built-in default color pair.

## The full result: `generatePalette`

`getScheme`/`getFullPalette` are one-shot convenience wrappers around
`generatePalette`, which does the actual computation once and returns
everything -- reach for it directly if you want more than one output shape
without recomputing:

```js
import { generatePalette, paletteToHexScheme, paletteToCss } from "colorhorse";

const palette = generatePalette("#3366cc", "#cc6633", {
	minLightness: 0.1, // darkest shade's lightness, 0-1
	maxLightness: 0.98, // lightest shade's lightness, 0-1
	minChroma: 0.2, // floor on saturation, 0-1 (relative to the sRGB gamut boundary)
	shadeCount: 10, // shades per role/hue
});

palette.schemeName; // e.g. "analagous", "square", "complementary", ...
palette.wheelDistance; // 1-6, how far apart the two anchors landed on the 12-hue wheel
palette.roles.primary[0]; // { hue, lightness, chroma, hex, rgb, hueIndex, shadeIndex, isAnchor }

paletteToHexScheme(palette); // same shape as getScheme(), from an already-computed palette
paletteToCss(palette); // "--primary-01: #...; ..." ready for a <style> block
```

## API

- **`generatePalette(colorOne?, colorTwo?, options?)`** — the core computation.
  Returns `{ schemeName, wheelDistance, anchors, hueCount, shadeCount, shadeGrid, roles }`.
  `shadeGrid[shadeIndex][hueIndex]` and every entry in `roles` are the same
  point shape: `{ hue, lightness, chroma, hex, rgb, hueIndex, shadeIndex, isAnchor }`.
- **`getFullPalette(colorOne?, colorTwo?, options?)`** — `hueCount * shadeCount` hex strings (120 by default).
- **`getScheme(colorOne?, colorTwo?, options?)`** — role name → hex array (80 colors total by default).
- **`paletteToHexGrid(palette)`** / **`paletteToRgbGrid(palette)`** — format an existing `generatePalette()` result as flat hex/`{r,g,b}` arrays.
- **`paletteToHexScheme(palette)`** / **`paletteToRgbScheme(palette)`** — format an existing result as role → hex/`{r,g,b}` array.
- **`paletteToCss(palette, { selector = ":root", prefix = "--" })`** — CSS custom properties text.
- **`hexToRgb(hex)`** / **`rgbToHex({r, g, b})`** — plain sRGB conversion.
- **`relativeLuminance(hex)`** / **`contrastRatio(hexA, hexB)`** — WCAG luminance/contrast (1-21; 4.5+ passes AA for normal text).
- **`hexToOklch`**, **`oklchToSrgb`**, **`maxInGamutChroma`** — the underlying OKLCH primitives, re-exported for anyone who wants to work below the generated-palette level.

`options` on any of the above: `{ minLightness = 0.1, maxLightness = 0.98, minChroma = 0.2, shadeCount = 10 }`.
Hue count is fixed at 12 — the harmony names in `schemeName` (square,
analagous, tertiary, antianalagous, antitertiary, complementary) are only
meaningful for a 12-slot wheel.

## Where this came from

This package is the color-scheme engine extracted from the
[Color Horse](https://github.com/) SvelteKit demo app in this repository —
see `../src/routes` for interactive visualizations of the same
minimum-bending-energy model this package computes (the hue ring, the
lightness stack, and the chroma taper each have their own standalone demo).
The math itself (`src/*.js` here, minus `index.js`) is copied unmodified from
that app's `src/lib`, including its test suites.
