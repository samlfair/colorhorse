# Color Horse

Color Horse is an automatic color scheme generator. It accepts two color inputs and generates a perceptually-harmonious palette with 8 hues and 10 shades, provided as CSS variables, JSON tokens, or Adobe swatches.

To learn how it works, visit [color.horse](https://color.horse)

## Project structure

This project contains the code for the color.horse SvelteKit website and the colorhorse npm package.

- `src/` - The SvelteKit source code
- `colorhorse/` - The npm package source code

## AI statement

I (Sam Littlefair, the human author of this project) used Claude Code in building Color Horse. I have reviewed and tested all generated code.

Initially, I manually wrote the Color Horse math and SVGs without AI. Then I prompted Claude Code to interpret and reformulate my implementation. On review, I accepted all of the generated code as it was superior to my own.

With the exception of the SVGs and some of the interactivity, I manually rewrote most of the .svelte files for the color.horse app.

As I have worked on the app and the package, I have delegated some work to Claude Code. I review all changes with the intention that I should understand the entire codebase and that I should reasonably be able to maintain all of the code myself.