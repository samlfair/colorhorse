/**
 * OKLCH -> sRGB conversion, with gamut mapping so every color is safely
 * displayable.
 *
 * OKLCH is a cylindrical form of OKLab (Bjorn Ottosson, 2020): L (lightness,
 * 0-1), C (chroma, unbounded but practically ~0-0.4 for sRGB), H (hue,
 * degrees). It's designed so that equal steps in L/C/H look like equal
 * perceptual steps -- which is exactly why the cylinder demo's D/Z/R axes
 * map onto it directly: D (an angle) -> H, Z (0-1) -> L, R (0-1) -> C
 * (scaled by OKLCH_MAX_CHROMA, a practical slider ceiling; the gamut-mapping
 * step below clamps any specific combination that's still out of range).
 *
 * ---------------------------------------------------------------------------
 * THE CONVERSION
 * ---------------------------------------------------------------------------
 * OKLCH -> OKLab is just polar -> Cartesian: a = C*cos(H), b = C*sin(H).
 * OKLab -> linear sRGB is a fixed pipeline (the published Ottosson
 * matrices): OKLab -> LMS' (a linear matrix) -> LMS (cube each component)
 * -> linear sRGB (another linear matrix). Linear sRGB -> sRGB is the
 * standard piecewise gamma encoding from the sRGB spec.
 *
 * ---------------------------------------------------------------------------
 * GAMUT MAPPING
 * ---------------------------------------------------------------------------
 * Not every (L, C, H) triple corresponds to a color inside the sRGB cube --
 * OKLab's gamut is larger. If the linear sRGB result has any channel
 * outside [0, 1], we hold L and H fixed and binary-search C down toward 0
 * until it lands back in gamut: reducing chroma (desaturating) while
 * keeping lightness and hue fixed is the standard, simple gamut-mapping
 * strategy for OKLCH (a simplified form of the CSS Color 4 gamut mapping
 * algorithm, which does the same chroma reduction plus a secondary clip).
 * ===========================================================================
 */


/** A practical chroma ceiling for sRGB-displayable OKLCH colors; specific
 * (L, H) combinations may still need less and get reduced by gamut mapping. */
export const OKLCH_MAX_CHROMA = 0.4;

export function oklchToLinearSrgb(L, C, H) {
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  };
}

function isInGamut(linear, eps) {
  return (
    linear.r >= -eps && linear.r <= 1 + eps &&
    linear.g >= -eps && linear.g <= 1 + eps &&
    linear.b >= -eps && linear.b <= 1 + eps
  );
}

function gammaEncode(c) {
  const clamped = Math.min(1, Math.max(0, c));
  return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
}

function to255(c) {
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
}

function toHex(r, g, b) {
  const h = (v) => v.toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b);
}

/**
 * Convert an OKLCH color to a gamut-mapped sRGB color.
 *
 * @param {number} L lightness, 0-1
 * @param {number} C chroma, >= 0 (values beyond what's displayable at this
 *   L/H get reduced automatically -- see clampedC in the result)
 * @param {number} H hue, degrees (any real number; periodic mod 360)
 * @returns {{r:number, g:number, b:number, hex:string, clampedC:number, wasClamped:boolean}}
 *   r/g/b are 0-255 integers; clampedC is the chroma actually used after
 *   gamut mapping (<= C); wasClamped is true if any reduction was needed.
 */
export function oklchToSrgb(L, C, H) {
  const EPS = 1e-5;
  let linear = oklchToLinearSrgb(L, C, H);
  let clampedC = C;

  if (C > 0 && !isInGamut(linear, EPS)) {
    let lo = 0;
    let hi = C;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      const test = oklchToLinearSrgb(L, mid, H);
      if (isInGamut(test, EPS)) lo = mid;
      else hi = mid;
    }
    clampedC = lo;
    linear = oklchToLinearSrgb(L, clampedC, H);
  }

  const r = to255(gammaEncode(linear.r));
  const g = to255(gammaEncode(linear.g));
  const b = to255(gammaEncode(linear.b));
  return { r, g, b, hex: toHex(r, g, b), clampedC, wasClamped: clampedC < C - 1e-9 };
}

/**
 * The largest chroma that's still sRGB-displayable at a given (L, H) --
 * i.e. the distance out to the gamut boundary ("cusp") in that direction.
 * Used to turn a 0-1 "relative chroma" into an absolute OKLCH chroma that's
 * always exactly in gamut by construction (relative=1 sits ON the
 * boundary, relative=0 is achromatic) -- the same idea as the `nutelch`
 * package the task named (npmjs.com/package/nutelch: "chroma relative to
 * the gamut shell/cusp in OKLCH", LUT-backed). This project takes zero
 * runtime dependencies (see every other file here), so rather than vendor
 * that package, this reuses the SAME gamut-boundary binary search
 * oklchToSrgb() already does for clamping, just searching for the boundary
 * itself instead of clamping down to it.
 */
export function maxInGamutChroma(L, H) {
  const EPS = 1e-5;
  const SEARCH_CEILING = 0.5; // safely above any sRGB OKLCH chroma boundary
  let lo = 0;
  let hi = SEARCH_CEILING;
  if (isInGamut(oklchToLinearSrgb(L, hi, H), EPS)) return hi;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (isInGamut(oklchToLinearSrgb(L, mid, H), EPS)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Turn a 0-1 relative chroma into an absolute OKLCH chroma via the
 * gamut-cusp scale above: relative=1 sits exactly on the boundary. */
export function relativeChromaToAbsolute(relativeC, L, H) {
  return Math.max(0, relativeC) * maxInGamutChroma(L, H);
}

// --------------------------- INVERSE: sRGB -> OKLCH ---------------------------

function srgbChannelToLinear(c8) {
  const c = c8 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearSrgbToOklab(linear) {
  const l = 0.4122214708 * linear.r + 0.5363325363 * linear.g + 0.0514459929 * linear.b;
  const m = 0.2119034982 * linear.r + 0.6806995451 * linear.g + 0.1073969566 * linear.b;
  const s = 0.0883024619 * linear.r + 0.2817188376 * linear.g + 0.6299787005 * linear.b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  };
}

function normalizeHueDeg(h) {
  return ((h % 360) + 360) % 360;
}

/**
 * Convert an sRGB color (0-255 channels) to OKLCH. This is the exact
 * inverse pipeline of oklchToSrgb: sRGB -> linear sRGB -> OKLab (fixed
 * matrices) -> OKLCH (Cartesian -> polar). Since the input is already a
 * valid sRGB color, the result is always in-gamut by construction -- no
 * clamping needed going this direction.
 *
 * @returns {{L:number, C:number, H:number}} H in [0, 360); H is 0 (and
 *   meaningless) when C is ~0 (an achromatic gray).
 */
export function srgbToOklch(r, g, b) {
  const linear = { r: srgbChannelToLinear(r), g: srgbChannelToLinear(g), b: srgbChannelToLinear(b) };
  const lab = linearSrgbToOklab(linear);
  const C = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  const H = C < 1e-7 ? 0 : normalizeHueDeg((Math.atan2(lab.b, lab.a) * 180) / Math.PI);
  return { L: lab.L, C, H };
}

/** Parse a "#rrggbb" (or "rrggbb") string and convert to OKLCH. */
export function hexToOklch(hex) {
  const clean = hex.replace(/^#/, '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return srgbToOklch(r, g, b);
}


