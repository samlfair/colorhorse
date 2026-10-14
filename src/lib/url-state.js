/**
 * Palette settings <-> URL query string, so a palette can be bookmarked and
 * shared, e.g. `?a=e4572e&b=29335c&dark=0.1&light=0.98&sat=0.2&contrast=0.6&wheel=ryb`.
 *
 *   a, b      the two anchors, hex without the "#" (which would start the
 *             URL fragment)
 *   dark      darkest shade (minL)
 *   light     lightest shade (maxL)
 *   sat       minimum saturation (minChroma)
 *   contrast  contrast
 *   wheel     hue wheel, "rgb" or "ryb"
 *   v         model version; omitted for the current one
 *
 * Every setting is always written, defaults included, so a link keeps
 * meaning the same palette even if the defaults change later. Decoding is
 * forgiving: a malformed or missing value is simply absent from the result
 * (the caller keeps its own default), and numbers are clamped to their
 * slider's range, so a hand-edited link can't break the page.
 */

export const URL_STATE_VERSION = 1;

export const URL_STATE_DEFAULTS = {
  dark: 0.1,
  light: 0.98,
  sat: 0.2,
  contrast: 0,
  wheel: "rgb",
};

const NUMBER_SETTINGS = {
  dark: { range: [0, 1], decimals: 3 },
  light: { range: [0, 1], decimals: 3 },
  sat: { range: [0.01, 1], decimals: 2 },
  contrast: { range: [0, 1], decimals: 2 },
};

const WHEEL_VALUES = ["rgb", "ryb"];

const HEX_PATTERN = /^#?([0-9a-fA-F]{6})$/;

function roundTo(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * @param {{colorOne: string, colorTwo: string, dark: number, light: number, sat: number, contrast: number, wheel: string}} settings
 *   colors as "#rrggbb"
 * @returns {string} query string without the leading "?" (empty when
 *   there's nothing to encode)
 */
export function encodeUrlState(settings) {
  const params = new URLSearchParams();
  for (const [key, color] of [["a", settings.colorOne], ["b", settings.colorTwo]]) {
    const match = HEX_PATTERN.exec(color ?? "");
    if (match) params.set(key, match[1].toLowerCase());
  }
  for (const [key, { decimals }] of Object.entries(NUMBER_SETTINGS)) {
    const value = settings[key];
    if (Number.isFinite(value)) params.set(key, String(roundTo(value, decimals)));
  }
  if (WHEEL_VALUES.includes(settings.wheel)) params.set("wheel", settings.wheel);
  return params.toString();
}

/**
 * @param {string} search  a query string, with or without the leading "?"
 * @returns {{version: number, colorOne?: string, colorTwo?: string, dark?: number, light?: number, sat?: number, contrast?: number, wheel?: string}}
 *   colors as lowercase "#rrggbb"; only the settings actually present and
 *   valid in `search` are included
 */
export function decodeUrlState(search) {
  const params = new URLSearchParams(search);
  const parsedVersion = Number.parseInt(params.get("v") ?? "", 10);
  const decoded = { version: Number.isFinite(parsedVersion) ? parsedVersion : URL_STATE_VERSION };

  for (const [key, field] of [["a", "colorOne"], ["b", "colorTwo"]]) {
    const match = HEX_PATTERN.exec(params.get(key) ?? "");
    if (match) decoded[field] = `#${match[1].toLowerCase()}`;
  }
  for (const [key, { range }] of Object.entries(NUMBER_SETTINGS)) {
    const raw = params.get(key);
    if (raw === null || raw.trim() === "") continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    decoded[key] = Math.min(Math.max(value, range[0]), range[1]);
  }
  const wheel = params.get("wheel")?.toLowerCase();
  if (WHEEL_VALUES.includes(wheel)) decoded.wheel = wheel;
  return decoded;
}
