// Sampling grid shared by scripts/build-print-gamut-table.js and gamut.js:
// lightness 0..1 in 0.01 steps, hue 0..358 in 2 degree steps, chroma
// stored in 1/255ths of CHROMA_CEILING (~0.0016, below a visible step).
export const LIGHTNESS_STEPS = 101;
export const HUE_STEPS = 180;
export const CHROMA_CEILING = 0.4;
