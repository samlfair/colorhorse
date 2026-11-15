/**
 * The page runs the palette math from $lib itself rather than calling
 * colorhorse's getScheme(), so check that the two still agree on both
 * wheels and gamuts, using the same steps the page takes.
 */
import { describe, it, expect } from "vitest";
import { getScheme, getWheel, getGamut } from "colorhorse";
import { computeCylinderD, computeCylinderPoints } from "./cylinder-deform.js";
import { hexToOklch, oklchToSrgb } from "./oklch.js";
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

function pageScheme(colorOne, colorTwo, wheelName, gamutName, colorTwoSlot, shadeCount = 10, roleModel = 2) {
  const hueWheel = getWheel(wheelName);
  const chromaGamut = getGamut(gamutName);
  const anchors = [colorOne, colorTwo].map((hex) => {
    const { L, C, H } = hexToOklch(hex);
    const maxC = chromaGamut.maxChroma(L, H);
    return { D: hueWheel.toWheel(H), Z: L, R: maxC > 1e-9 ? Math.min(1, C / maxC) : 0, L, C, H };
  });
  const cyl = computeCylinderPoints(12, shadeCount, anchors, 0.2, 0.1, 0.98, 0, colorTwoSlot);
  const ringHues = cyl.D.map(hueWheel.toHue);
  const nearest = computeCylinderD(12, anchors).anchorIndices;
  const colorTwoOnNearestSlot = colorTwoSlot === undefined || colorTwoSlot === (nearest[1] - nearest[0] + 12) % 12;
  const scheme = computeColorScheme(ringHues, cyl.anchorIndices[0], cyl.anchorIndices[1], { model: roleModel, colorTwoOnNearestSlot });
  const result = {};
  for (const [roleKey, roleName] of Object.entries(ROLE_NAMES)) {
    if (!(roleKey in scheme.roles)) continue;
    const hueIndex = scheme.roles[roleKey];
    result[roleName] = cyl.points
      .filter((point) => point.dIndex === hueIndex)
      .map((point) => oklchToSrgb(point.Z, point.R * chromaGamut.maxChroma(point.Z, ringHues[hueIndex]), ringHues[hueIndex]).hex);
  }
  return result;
}

describe("parity with colorhorse", () => {
  it("all assertions pass", () => {
    let failed = 0;
    const pairs = [["#3366cc", "#cc6633"], ["#e4572e", "#29335c"], ["#ffcc00", "#7a2fb5"]];
    for (const [colorOne, colorTwo] of pairs) {
      for (const wheelName of ["rgb", "ryb"]) {
        for (const gamutName of ["srgb", "print"]) {
          for (const colorTwoSlot of [undefined, 1, 4, 7, 11]) {
            for (const roleModel of [1, 2]) {
              const fromPage = JSON.stringify(pageScheme(colorOne, colorTwo, wheelName, gamutName, colorTwoSlot, 10, roleModel));
              const fromPackage = JSON.stringify(getScheme(colorOne, colorTwo, { wheel: wheelName, gamut: gamutName, colorTwoSlot, roleModel }));
              if (fromPage !== fromPackage) {
                failed++;
                console.error(`FAIL: ${colorOne}/${colorTwo} on the ${wheelName} wheel, ${gamutName} gamut, slot ${colorTwoSlot}, role model ${roleModel}, differs from getScheme()`);
              }
            }
          }
        }
      }
      for (const shadeCount of [4, 7, 20]) {
        const fromPage = JSON.stringify(pageScheme(colorOne, colorTwo, "rgb", "srgb", 5, shadeCount));
        const fromPackage = JSON.stringify(getScheme(colorOne, colorTwo, { colorTwoSlot: 5, shadeCount }));
        if (fromPage !== fromPackage) {
          failed++;
          console.error(`FAIL: ${colorOne}/${colorTwo} with ${shadeCount} shades differs from getScheme()`);
        }
      }
    }
    expect(failed, failed + " assertion(s) failed -- see console output above for FAIL: details").toBe(0);
  });
});
