# colorhorse

Generate a full, smoothly-related OKLCH color scheme from two anchor colors.

Give it two hex colors and it places 10 more hues around a color wheel between
them (minimum-bending-energy relaxed, so the spacing bends smoothly instead of
jumping), tapers each of the 12 hues into a lightness/chroma ramp, and
classifies 8 of them into named roles (`primary`, `secondary`, `tertiary`,
`accent`, `success`, `info`, `warning`, `danger`) by hue distance to reference
red/green/blue/yellow. Zero runtime dependencies.

This is a minimal initial release: `getScheme` is the one export, covering
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
default color pair.

## API

- **`getScheme(colorOne?, colorTwo?, options?)`** — role name → hex array
  (80 colors total by default).
  - `colorOne`, `colorTwo`: `"#rrggbb"` hex strings. Both must have nonzero
    chroma (not pure gray/black/white) -- the whole scheme is built by
    smoothly relaxing 12 hues between two real hues.
  - `options`: `{ minLightness = 0.1, maxLightness = 0.98, minChroma = 0.2, shadeCount = 10 }`.
    Hue count is fixed at 12 -- the palette's internal harmony classification
    (square, analagous, tertiary, ...) is only meaningful for a 12-slot wheel.

## Where this came from

This package is the color-scheme engine extracted from the
[Color Horse](https://github.com/) SvelteKit demo app in this repository —
see `../src/routes` for interactive visualizations of the same
minimum-bending-energy model this package computes (the hue ring, the
lightness stack, and the chroma taper each have their own standalone demo).
The math itself (`src/*.js` here, minus `index.js`) is copied unmodified from
that app's `src/lib`, including its test suites.
