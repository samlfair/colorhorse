# Color Horse

An automatic color scheme generator. Give it two anchor colors and it
generates a full, smoothly-related 80-color OKLCH palette: 12 hues bent
gradually between your two colors (never an abrupt jump in spacing), each
tapered into a 10-shade lightness/chroma ramp, with 8 of the hues classified
into named roles (primary, secondary, tertiary, accent, success, info,
warning, danger).

<!-- TODO: add a link to the live site once one exists. -->

## What's in this repo

- **The SvelteKit app** (`src/`) — the interactive Color Horse site: pick two
  colors, watch the palette build itself, and see the underlying
  minimum-bending-energy model that drives it.
- **`colorhorse/`** — the palette-generation math, extracted as its own
  minimal, zero-dependency npm package (`getScheme(colorOne, colorTwo)` in,
  an 80-color palette out). See `colorhorse/README.md`.

## Development

```sh
npm install
npm run dev      # local dev server
npm run build    # prerender the static site to build/
npm run preview  # serve the built output
npm run test     # run the app's Vitest suite
```

`colorhorse/` is an npm workspace with its own test suite:

```sh
cd colorhorse
npm test
```

## AI Statement

<!-- Starter text -- flesh this out with your own disclosure/policy. -->

This project was built collaboratively with AI assistance (Claude, via
Claude Code), including implementation, refactoring, and parts of this
documentation. [Describe here how much of the design/decision-making was
yours vs. AI-assisted, what you reviewed or verified yourself, and any
policy you want readers to know about how AI was used in this project.]

## License

<!-- TODO: pick and add a LICENSE file; colorhorse/package.json currently says MIT. -->
