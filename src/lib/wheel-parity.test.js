/**
 * The page runs the palette math from $lib itself rather than calling
 * colorhorse's getScheme(), so check that the two still agree on both
 * wheels, using the same steps the page takes.
 */
import { describe, it, expect } from "vitest";
import { getScheme, getWheel } from "colorhorse";
import { computeCylinderPoints } from "./cylinder-deform.js";
import { hexToOklch, oklchToSrgb, maxInGamutChroma } from "./oklch.js";
import { computeColorScheme } from "./scheme.js";

const ROLE_NAMES = {
  Primary: "primary",
  Secondary: "secondary",
  Tertiary: "tertiary",
  Accent: "accent",
  Tip: "success",
  Info: "info",
  Warning: "warning",
  Danger: "danger",
};

function pageScheme(colorOne, colorTwo, wheelName) {
  const hueWheel = getWheel(wheelName);
  const anchors = [colorOne, colorTwo].map((hex) => {
    const { L, C, H } = hexToOklch(hex);
    const maxC = maxInGamutChroma(L, H);
    return { D: hueWheel.toWheel(H), Z: L, R: maxC > 1e-9 ? Math.min(1, C / maxC) : 0, L, C, H };
  });
  const cyl = computeCylinderPoints(12, 10, anchors, 0.2, 0.1, 0.98, 0);
  const ringHues = cyl.D.map(hueWheel.toHue);
  const scheme = computeColorScheme(ringHues, cyl.anchorIndices[0], cyl.anchorIndices[1]);
  const result = {};
  for (const [roleKey, roleName] of Object.entries(ROLE_NAMES)) {
    const hueIndex = scheme.roles[roleKey];
    result[roleName] = cyl.points
      .filter((point) => point.dIndex === hueIndex)
      .map((point) => oklchToSrgb(point.Z, point.R * maxInGamutChroma(point.Z, ringHues[hueIndex]), ringHues[hueIndex]).hex);
  }
  return result;
}

describe("wheel parity with colorhorse", () => {
  it("all assertions pass", () => {
    let failed = 0;
    const pairs = [["#3366cc", "#cc6633"], ["#e4572e", "#29335c"], ["#ffcc00", "#7a2fb5"]];
    for (const [colorOne, colorTwo] of pairs) {
      for (const wheelName of ["rgb", "ryb"]) {
        const fromPage = JSON.stringify(pageScheme(colorOne, colorTwo, wheelName));
        const fromPackage = JSON.stringify(getScheme(colorOne, colorTwo, { wheel: wheelName }));
        if (fromPage !== fromPackage) {
          failed++;
          console.error(`FAIL: ${colorOne}/${colorTwo} on the ${wheelName} wheel differs from getScheme()`);
        }
      }
    }
    expect(failed, failed + " assertion(s) failed -- see console output above for FAIL: details").toBe(0);
  });
});
