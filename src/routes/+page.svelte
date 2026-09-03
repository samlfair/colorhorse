<script>
	/**
	 * OKLCH Cylinder Palette (formerly cylinder.html/cylinder.css/cylinder.js).
	 * All math is unchanged, imported from $lib -- this is the reactive
	 * rendering/theme/state layer.
	 *
	 * RANDOM ANCHOR SEED AND PRERENDERING: this route is statically
	 * prerendered (adapter-static), meaning its <script> runs once on the
	 * SERVER at BUILD TIME to produce the shipped HTML, then again in every
	 * visitor's BROWSER during hydration. If the random anchor seed were
	 * picked at the top level of this script, it would run at build time and
	 * get baked into the static HTML forever -- every visitor would see the
	 * SAME "random" colors, never re-randomized. Real per-visit randomness
	 * needs to happen in browser-only code, so it's picked inside onMount()
	 * (which Svelte guarantees never runs during SSR/prerendering, only
	 * after the component has actually mounted in a real browser).
	 *
	 * LIVE THEME AND SVELTEKIT'S CLIENT-SIDE ROUTING: the old static version
	 * set its theme tokens directly on <html> (document.documentElement),
	 * safe there because every page was a separate full page load. SvelteKit
	 * is a client-side-routed SPA after the first load -- <html> persists
	 * across navigations -- so mutating it here would leak this page's live
	 * palette into every OTHER route once you'd visited /cylinder. Instead,
	 * the 80 palette variables and the `data-theme` attribute are scoped to
	 * a wrapper <div> local to this component (see the template/style below)
	 * -- CSS custom property inheritance still works exactly the same way,
	 * it just doesn't escape the div.
	 */
	import { onMount } from "svelte";
	import { computeCylinderPoints, computeCylinderZLevels } from "colorhorse/cylinder-deform";
	import { hexToOklch, oklchToSrgb, maxInGamutChroma } from "colorhorse";
	import { computeColorScheme } from "colorhorse/scheme";
	import compileCSS from "$lib/compileCSS.js";
	import Logo from "$lib/Logo.svelte"
	import CircleDemo from "$lib/CircleDemo.svelte"
	import RadarDemo from "$lib/RadarDemo.svelte"
	import LineDemo from "$lib/LineDemo.svelte"
	import CurveDemo from "$lib/CurveDemo.svelte"
	import Shuffle from "$lib/Shuffle.svelte"
	import Contrast from "$lib/Contrast.svelte"
	import * as content from "./../lib/Content.svx"

	const NUM_D = 12;
	const NUM_Z = 10;
	const ROLE_ORDER = [
		"Primary",
		"Secondary",
		"Tertiary",
		"Accent",
		"Tip",
		"Info",
		"Warning",
		"Danger",
	];
	// Display-only renames -- scheme.js's own role keys (and the --tip-01..10
	// custom property names they drive) are left alone, since Tip's hue-picking
	// logic and scheme.test.js both refer to it as "Tip"; only the label a
	// person reads is renamed to "Success" per the docs/palette-comparisons.md
	// discussion. Add more entries here if further UI-facing renames are agreed.
	const ROLE_DISPLAY_NAMES = { Tip: "Success" };
	function displayRoleName(roleName) {
		return ROLE_DISPLAY_NAMES[roleName] || roleName;
	}

	/* ------------------------- 3D projection ------------------------- */
	const RADIUS_PX = 170;
	const HEIGHT_PX = 280;
	const FOCAL = 620;
	const CENTER = { x: 450, y: 320 };

	function cylindricalToModel(D, Z, R) {
		const rad = (D * Math.PI) / 180;
		return {
			x: R * RADIUS_PX * Math.cos(rad),
			y: (Z - 0.5) * HEIGHT_PX,
			z: R * RADIUS_PX * Math.sin(rad),
		};
	}
	function rotate(p, azimuthDeg, elevationDeg) {
		const az = (azimuthDeg * Math.PI) / 180;
		const el = (elevationDeg * Math.PI) / 180;
		const x1 = p.x * Math.cos(az) + p.z * Math.sin(az);
		const z1 = -p.x * Math.sin(az) + p.z * Math.cos(az);
		const y2 = p.y * Math.cos(el) - z1 * Math.sin(el);
		const z2 = p.y * Math.sin(el) + z1 * Math.cos(el);
		return { x: x1, y: y2, z: z2 };
	}
	function project(p) {
		const depth = FOCAL + p.z;
		const scale = FOCAL / depth;
		return {
			sx: CENTER.x + p.x * scale,
			sy: CENTER.y - p.y * scale,
			depth,
			scale,
		};
	}
	function toScreen(D, Z, R, azimuth, elevation) {
		return project(rotate(cylindricalToModel(D, Z, R), azimuth, elevation));
	}

	const AXIS_LENGTH_XZ = RADIUS_PX * 1.25;
	const AXIS_LENGTH_Y = HEIGHT_PX / 2 + 20;
	const AXES = [
		{ label: "X", color: "#e05a4e", to: { x: AXIS_LENGTH_XZ, y: 0, z: 0 } },
		{ label: "Y", color: "#4caf6a", to: { x: 0, y: AXIS_LENGTH_Y, z: 0 } },
		{ label: "Z", color: "#4a86e0", to: { x: 0, y: 0, z: AXIS_LENGTH_XZ } },
	];

	// Iconic two-hue brand color pairs for the Showcase section -- approximate,
	// widely-cited hex values, not exact brand guideline colors.
	const BRAND_SWATCHES = [
		{ name: "IKEA", colorOne: "#0058a3", colorTwo: "#ffda1a" },
		{ name: "Shell", colorOne: "#ffd500", colorTwo: "#dd1d21" },
		{ name: "FedEx", colorOne: "#4d148c", colorTwo: "#ff6600" },
		{ name: "Mastercard", colorOne: "#eb001b", colorTwo: "#f79e1b" },
		{ name: "Pepsi", colorOne: "#004b93", colorTwo: "#e32934" },
		{ name: "BP", colorOne: "#007a33", colorTwo: "#ffc72c" },
		{ name: "Burger King", colorOne: "#d62300", colorTwo: "#f3a93d" },
		{ name: "T-Mobile", colorOne: "#e20074", colorTwo: "#1a1a1a" },
	];

	function randomAnchorHex() {
		const H = Math.random() * 360;
		const L = 0.45 + Math.random() * 0.25; // avoid near-black/near-white picks
		const maxC = maxInGamutChroma(L, H);
		const C = maxC * (0.6 + Math.random() * 0.35); // vivid, not necessarily gamut-max
		return oklchToSrgb(L, C, H).hex;
	}

	/* ------------------------- state ------------------------- */
	let a1Color = $state("#cccccc"); // neutral placeholder until onMount seeds a real random pair
	let a2Color = $state("#dddddd");
	let minL = $state(0.1);
	let maxL = $state(0.98);
	let minChroma = $state(0.2);
	let azimuth = $state(30);
	let elevation = $state(18);
	let themeMode = $state("system"); // 'light' | 'dark' | 'system'
	let systemPrefersDark = $state(false);
	let seeded = $state(false);

	let DEFAULTS = {
		a1Color: "#888888",
		a2Color: "#888888",
		minL: 0.1,
		maxL: 0.98,
		minChroma: 0.2,
		azimuth: 30,
		elevation: 18,
	};

	let colorized = $state(false)

	onMount(() => {
		DEFAULTS = {
			a1Color: randomAnchorHex(),
			a2Color: randomAnchorHex(),
			minL: 0.1,
			maxL: 0.98,
			minChroma: 0.2,
			azimuth: 30,
			elevation: 18,
		};
		a1Color = DEFAULTS.a1Color;
		a2Color = DEFAULTS.a2Color;
		seeded = true;
		colorized = true

		if (window.matchMedia) {
			const mq = window.matchMedia("(prefers-color-scheme: dark)");
			systemPrefersDark = mq.matches;
			const onChange = () => {
				systemPrefersDark = mq.matches;
			};
			mq.addEventListener("change", onChange);
			return () => mq.removeEventListener("change", onChange);
		}

	});

	function resetAnchorsAndView() {
		a1Color = DEFAULTS.a1Color;
		a2Color = DEFAULTS.a2Color;
		minL = DEFAULTS.minL;
		maxL = DEFAULTS.maxL;
		minChroma = DEFAULTS.minChroma;
		azimuth = DEFAULTS.azimuth;
		elevation = DEFAULTS.elevation;
		// Theme mode is deliberately NOT reset -- it's independent of the
		// anchor/view "reset" scope, matching the old page's behavior.
	}

	/* ------------------------- derived model ------------------------- */
	function anchorFromColor(hex) {
		const { L, C, H } = hexToOklch(hex);
		const maxC = maxInGamutChroma(L, H);
		const R = maxC > 1e-9 ? Math.min(1, C / maxC) : 0;
		return { D: H, Z: L, R, L, C };
	}

	let hueOne = $derived(anchorFromColor(a1Color).D)
	let hueTwo = $derived(anchorFromColor(a2Color).D)
	let lightnessOne = $derived(anchorFromColor(a1Color).L)
	let lightnessTwo = $derived(anchorFromColor(a2Color).L)
	let chromaOne = $derived(anchorFromColor(a1Color).C)
	let chromaTwo = $derived(anchorFromColor(a2Color).C)

	let hueOneAdjusted = $state(false)
	let hueTwoAdjusted = $state(false)
	let lightnessOneAdjusted = $state(false)
	let lightnessTwoAdjusted = $state(false)
	let chromaOneAdjusted = $state(false)
	let chromaTwoAdjusted = $state(false)

	function getAnchors(a1Color, a2Color, hueOne, hueTwo) {
		let first = anchorFromColor(a1Color)
		let second = anchorFromColor(a2Color)

		if(hueOneAdjusted) first.D = hueOne 
		if(hueTwoAdjusted) second.D = hueTwo
		if(lightnessOneAdjusted) first.L = lightnessOne
		if(lightnessTwoAdjusted) second.L = lightnessTwo
		if(chromaOneAdjusted) first.C = chromaOne
		if(chromaTwoAdjusted) second.C = chromaTwo

		const adjustedColorOne = anchorFromColor(oklchToSrgb(first.L, first.C, first.D).hex)
		const adjustedColorTwo = anchorFromColor(oklchToSrgb(second.L, second.C, second.D).hex)

		// a1Color = oklchToSrgb(first.L, first.C, first.D).hex
		return [adjustedColorOne, adjustedColorTwo]
	}
	
	let anchors = $derived(getAnchors(a1Color, a2Color, hueOne, hueTwo));
	let toggleDarkMode = $state(false)

	let colorMode = $state("light")

	onMount(() => {
		const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
		if(isDark) colorMode = "dark"
	})

	const defaultVariables = $derived(
		`--emphasis: var(--text);
		--anchor1: #ff5d5d;
		--anchor2: #ffb454;

		color-scheme: light dark;`)

	const dynamicVariables = `--main-background: light-dark(var(--primary-10), var(--primary-02));
		--panel: light-dark(var(--primary-09), var(--primary-03));
		--border: light-dark(var(--primary-08), var(--primary-04));
		--outline: light-dark(var(--primary-01), var(--primary-10));
		--guide: light-dark(var(--primary-07), var(--primary-05));
		--muted: light-dark(var(--primary-04), var(--primary-07));
		--text: light-dark(var(--primary-01), var(--primary-10));
		--ring: light-dark(var(--accent-05), var(--primary-05));
		--menu: light-dark(var(--tertiary-09), var(--tertiary-03));
		--title: light-dark(var(--primary-05), var(--primary-06));
		--pop-text: light-dark(var(--secondary-06), var(--secondary-07));
		--pop-text-em: light-dark(var(--primary-06), var(--primary-07));
		--button: light-dark(var(--primary-04), var(--primary-07));

		--background-cta-primary: light-dark(var(--tertiary-05), var(--tertiary-05));
		--border-cta-primary: light-dark(var(--tertiary-04), var(--tertiary-05));
		--icon-cta-primary: light-dark(var(--tertiary-08), var(--tertiary-08));
		--text-cta-primary: light-dark(var(--tertiary-10), var(--tertiary-10));

		--background-cta-secondary: light-dark(var(--tertiary-08), var(--tertiary-04));
		--border-cta-secondary: light-dark(var(--tertiary-07), var(--tertiary-03));
		--icon-cta-secondary: light-dark(var(--tertiary-09), var(--tertiary-06));
		--text-cta-secondary: light-dark(var(--tertiary-10), var(--tertiary-10));

`

	const lightOverrideVariables = `--main-background: var(--primary-10);
		--panel: var(--primary-09);
		--border: var(--primary-08);
		--guide: var(--primary-07);
		--muted: var(--primary-04);
		--text: var(--primary-01);
		--ring: var(--accent-05);
		--menu: var(--tertiary-09);
		--title: var(--primary-05);
		--pop-text: var(--secondary-06);
		--pop-text-em: var(--primary-06);
		--button: var(--primary-04);

		--background-cta-primary: var(--tertiary-05);
		--border-cta-primary: var(--tertiary-04);
		--icon-cta-primary: var(--tertiary-08);
		--text-cta-primary: var(--tertiary-10);


		--background-cta-secondary: var(--tertiary-08);
		--border-cta-secondary: var(--tertiary-07);
		--icon-cta-secondary: var(--tertiary-09);
		--text-cta-secondary: var(--tertiary-10);

		`		

	const darkOverrideVariables = `--main-background: var(--primary-02);
		--panel: var(--primary-03);
		--border: var(--primary-04);
		--guide: var(--primary-05);
		--muted: var(--primary-07);
		--text: var(--primary-10);
		--ring: var(--primary-05);

		--menu: var(--tertiary-03);
		--title: var(--primary-06);
		--pop-text: var(--secondary-07);
		--pop-text-em: var(--primary-07);
		--button: var(--primary-07);

		--background-cta-primary: var(--tertiary-05);
		--border-cta-primary: var(--tertiary-05);
		--icon-cta-primary: var(--tertiary-07);
		--text-cta-primary: var(--tertiary-10);

		--background-cta-secondary: var(--tertiary-04);
		--border-cta-secondary: var(--tertiary-03);
		--icon-cta-secondary: var(--tertiary-06);
		--text-cta-secondary: var(--tertiary-10);
		`	

	const cssVariables = $derived(toggleDarkMode
		? colorMode === "light"
			? darkOverrideVariables
			: lightOverrideVariables
		: dynamicVariables
	)

	let headerStyles = $derived(compileCSS(paletteStyleText + ";" + cssVariables + defaultVariables, anchors));

	

	let darkerL = $derived(Math.min(anchors[0].L, anchors[1].L));
	let lighterL = $derived(Math.max(anchors[0].L, anchors[1].L));

	// Minimum Lightness can never be brighter than the darker anchor's L;
	// Maximum Lightness can never be darker than the lighter anchor's L --
	// see cylinder-deform.js's model for why (Z-level stack extremes).
	$effect(() => {
		if (minL > darkerL) minL = darkerL;
	});
	$effect(() => {
		if (maxL < lighterL) maxL = lighterL;
	});

	let cyl = $derived(
		computeCylinderPoints(NUM_D, NUM_Z, anchors, minChroma, minL, maxL),
	);

	// Chroma radar rings: one ring per anchor's own shade (Z) level, all 12
	// hues at that level. Both anchors land on the same ring when they share
	// a shade index; otherwise each gets its own 360-degree slice -- see
	// RadarDemo.svelte's doc for why.
	let radarRings = $derived.by(() => {
		const [anchorOneZIndex, anchorTwoZIndex] = cyl.anchorZIndices;
		const [anchorOneDIndex, anchorTwoDIndex] = cyl.anchorIndices;
		const anchorOneRing = {
			chromaValues: cyl.R[anchorOneZIndex],
			lightness: cyl.zLevels[anchorOneZIndex],
			anchors: [{ dIndex: anchorOneDIndex, label: "Anchor 1" }],
		};
		if (anchorOneZIndex === anchorTwoZIndex) {
			anchorOneRing.anchors.push({ dIndex: anchorTwoDIndex, label: "Anchor 2" });
			return [anchorOneRing];
		}
		const anchorTwoRing = {
			chromaValues: cyl.R[anchorTwoZIndex],
			lightness: cyl.zLevels[anchorTwoZIndex],
			anchors: [{ dIndex: anchorTwoDIndex, label: "Anchor 2" }],
		};
		return [anchorOneRing, anchorTwoRing];
	});

	// A separate 12-level lightness stack just for LineDemo, matching the
	// 12-point ring CircleDemo shows -- cyl.zLevels is the real 10-level
	// stack the palette itself uses (NUM_Z), a different count on purpose.
	// Computed the same way (min/max lightness pinned as the endpoints), so
	// every value is always inside [minL, maxL] by construction.
	let lineDemoLightnessValues = $derived(
		computeCylinderZLevels(12, anchors[0].L, anchors[1].L, minL, maxL).zLevels,
	);

	let points = $derived(
		cyl.points.map((p) => ({
			...p,
			color: oklchToSrgb(p.Z, p.R * maxInGamutChroma(p.Z, p.D), p.D),
		})),
	);

	
	let curveDemoChromaValuesPrimary = $derived(
		points.map((p, i) => {
			if(i % 12 === scheme.roles.Primary) return p.R
		}).filter(a => a)
	)

	let curveDemoChromaValuesSecondary = $derived(
		points.map((p, i) => {
			if(i % 12 === scheme.roles.Secondary) return p.R
		}).filter(a => a)
	)

	let anchorOneHueIndex = $derived(cyl.D.findIndex(p => anchors[0].D.toFixed(3) === p.toFixed(3)))
	let anchorTwoHueIndex = $derived(cyl.D.findIndex(p => anchors[1].D.toFixed(3) === p.toFixed(3)))

	let anchorOneLightnessIndex = $derived(cyl.zLevels.findIndex(p => anchors[0].L.toFixed(3) === p.toFixed(3)))
	let anchorTwoLightnessIndex = $derived(cyl.zLevels.findIndex(p => anchors[1].L.toFixed(3) === p.toFixed(3)))
	// let anchorOneLightnessIndex = null
	// let anchorTwoLightnessIndex = null
	
	// let anchorOneChromaIndex = $derived(cyl.R.findIndex(p => anchors[0].C.toFixed(3) === p.toFixed(3)))
	// let anchorTwoChromaIndex = $derived(cyl.R.findIndex(p => anchors[1].C.toFixed(3) === p.toFixed(3)))
	let anchorOneChromaIndex = null
	let anchorTwoChromaIndex = null

	let circlePoints = $derived(
		[...new Set(points.map(point => point.D))]
	)
	
	let screen = $derived(
		points.map((p) => toScreen(p.D, p.Z, p.R, azimuth, elevation)),
	);
	// Painter's algorithm: SVG draws later elements on top, and larger `depth`
	// (from project()) means farther from the camera -- so farthest points must
	// come FIRST (drawn on the bottom) and closest points LAST (drawn on top).
	// Sorting ascending would do the opposite: closest first, farthest last,
	// painting distant points over near ones.
	let withScreen = $derived(
		points
			.map((p, i) => ({ p, s: screen[i] }))
			.sort((a, b) => b.s.depth - a.s.depth),
	);

	let axesLines = $derived.by(() => {
		const origin = project(rotate({ x: 0, y: 0, z: 0 }, azimuth, elevation));
		return AXES.map(({ label, color, to }) => ({
			label,
			color,
			origin,
			negEnd: project(
				rotate({ x: -to.x, y: -to.y, z: -to.z }, azimuth, elevation),
			),
			posEnd: project(rotate(to, azimuth, elevation)),
		}));
	});

	let scheme = $derived(
		computeColorScheme(cyl.D, cyl.anchorIndices[0], cyl.anchorIndices[1]),
	);


	let resolvedThemeIsDark = $derived(
		themeMode === "system" ? systemPrefersDark : themeMode === "dark",
	);

	// All 80 --{role}-{01..10} custom properties, from the CURRENT points +
	// scheme -- this is "the whole 80-color palette as variables," which
	// cylinder-page's own <style> below then uses to CONSTRUCT bg/panel/
	// grid/text/muted/ring via var() formulas (see that style block).
	let paletteVars = $derived.by(() => {
		const vars = {};
		const shadeHex = (dIndex, shadeNum) =>
			points[(shadeNum - 1) * NUM_D + dIndex].color.hex;
		for (const roleName of ROLE_ORDER) {
			const dIndex = scheme.roles[roleName];
			for (let shadeNum = 1; shadeNum <= NUM_Z; shadeNum++) {
				vars[
					"--" +
						roleName.toLowerCase() +
						"-" +
						String(shadeNum).padStart(2, "0")
				] = shadeHex(dIndex, shadeNum);
			}
		}
		return vars;
	});
	let paletteStyleText = $derived(
		Object.entries(paletteVars)
			.map(([k, v]) => `${k}: ${v}`)
			.join("; "),
	);

	// "Agnostic shades" (see docs/palette-comparisons.md): each named UI role
	// lives at a fixed DISTANCE from the theme's light endpoint (shade 10 in
	// light mode, shade 1 in dark) rather than a fixed shade number -- that's
	// what makes bg/panel/grid/guide/muted/text already mirror correctly
	// between themes (dark's indices are exactly light's `11 - distance`).
	// Distances are allowed to repeat ON PURPOSE: panel-hover intentionally
	// lands on the same shade as grid/border (a panel's own border color, so
	// hovering "fills in" the border rather than merely changing it), and
	// border-hover reuses `guide`'s slot, which nothing else in this page's
	// CSS actually uses. `button`/`button-hover` remain a genuine experiment,
	// same caveat as before: 4/5 are a guess at the ramp's vivid middle, not
	// a guaranteed-extreme index the way 0-3 and 6-9 are.
	const SHADE_DISTANCE = {
		bg: 0,
		panel: 1,
		grid: 2,
		border: 2,
		"panel-hover": 2,
		guide: 3,
		"border-hover": 3,
		button: 4,
		"button-hover": 5,
		muted: 6,
		placeholder: 7,
		link: 8,
		text: 9,
	};
	const ACCENT_SHADE_DISTANCE = { ring: 5 };

	function shadeAtDistance(distance, isDark) {
		return isDark ? distance + 1 : 10 - distance;
	}

	function invertDistanceMap(distanceMap, isDark) {
		const byShade = {};
		for (const [name, distance] of Object.entries(distanceMap)) {
			const shadeNum = shadeAtDistance(distance, isDark);
			(byShade[shadeNum] ??= []).push(name);
		}
		return byShade;
	}

	let roleShadeUsage = $derived.by(() => ({
		Primary: invertDistanceMap(SHADE_DISTANCE, resolvedThemeIsDark),
		Accent: invertDistanceMap(ACCENT_SHADE_DISTANCE, resolvedThemeIsDark),
	}));

	// Example-content colors: the same agnostic-shade table applied to Primary
	// (for the general CTA) and each status role, so the alert boxes below are
	// built from real computed shades, not hand-picked colors.
	const SHOWCASE_ROLES = {
		primary: "Primary",
		success: "Tip",
		info: "Info",
		warning: "Warning",
		danger: "Danger",
	};
	const SHOWCASE_PROPS = [
		"panel",
		"border",
		"border-hover",
		"button",
		"button-hover",
	];

	let showcaseVars = $derived.by(() => {
		const isDark = resolvedThemeIsDark;
		const hexFor = (roleName, shadeNum) =>
			points[(shadeNum - 1) * NUM_D + scheme.roles[roleName]].color.hex;
		const vars = {};
		for (const [key, roleName] of Object.entries(SHOWCASE_ROLES)) {
			for (const prop of SHOWCASE_PROPS) {
				vars[`--${key}-${prop}`] = hexFor(
					roleName,
					shadeAtDistance(SHADE_DISTANCE[prop], isDark),
				);
			}
			vars[`--${key}-heading`] = hexFor(
				roleName,
				shadeAtDistance(SHADE_DISTANCE.text, isDark),
			);
		}
		vars["--link"] = hexFor(
			"Primary",
			shadeAtDistance(SHADE_DISTANCE.link, isDark),
		);
		vars["--placeholder"] = hexFor(
			"Primary",
			shadeAtDistance(SHADE_DISTANCE.placeholder, isDark),
		);
		return vars;
	});
	let showcaseStyleText = $derived(
		Object.entries(showcaseVars)
			.map(([k, v]) => `${k}: ${v}`)
			.join("; "),
	);

	let paletteRows = $derived(
		Array.from({ length: NUM_Z }, (_, k) =>
			points.slice(k * NUM_D, k * NUM_D + NUM_D),
		),
	);

	// Which role name(s) -- display names -- own each of the 12 D-index
	// columns. Every role currently lands on a distinct index (computeColorScheme
	// picks each role from what's still unclaimed), so today this is always
	// 0 or 1 label per column, but it's built as a list rather than a single
	// lookup so a column that ever gets claimed by more than one label (e.g. a
	// future role sharing a hue with an existing one) still renders correctly
	// instead of silently dropping one.
	let columnRoleLabels = $derived.by(() => {
		const byIndex = Array.from({ length: NUM_D }, () => []);
		for (const roleName of ROLE_ORDER) {
			byIndex[scheme.roles[roleName]].push(displayRoleName(roleName));
		}
		return byIndex;
	});

	let schemeCssText = $derived.by(() => {
		const lines = [
			"/* Scheme: " +
				scheme.schemeName +
				" (Primary/Secondary wheel distance " +
				scheme.wheelDistance +
				") */",
			":root {",
		];
		for (const roleName of ROLE_ORDER) {
			const dIndex = scheme.roles[roleName];
			for (let k = 0; k < NUM_Z; k++) {
				lines.push(
					"  --" +
						roleName.toLowerCase() +
						"-" +
						String(k + 1).padStart(2, "0") +
						": " +
						points[k * NUM_D + dIndex].color.hex +
						";",
				);
			}
		}
		lines.push("}");
		return lines.join("\n");
	});

	// Same 80 colors as schemeCssText, shaped as getScheme()'s own return
	// value from the colorhorse npm package -- role name -> array of hex.
	let schemeObjectText = $derived.by(() => {
		const lines = ["{"];
		for (const roleName of ROLE_ORDER) {
			const dIndex = scheme.roles[roleName];
			const hexValues = Array.from(
				{ length: NUM_Z },
				(_, shadeIndex) => `"${points[shadeIndex * NUM_D + dIndex].color.hex}"`,
			).join(", ");
			lines.push("  " + roleName.toLowerCase() + ": [" + hexValues + "],");
		}
		lines.push("}");
		return lines.join("\n");
	});
</script>

<svelte:head>
	<title>Color Horse</title>
	{@html headerStyles}
</svelte:head>


<header class:colorized>
	<div>
	<Logo colorOne={colorized ? a2Color : "transparent"} colorTwo={colorized ? a1Color : "transparent"} />
	<h1 href="/" id="title">Color Horse</h1>
	</div>
</header>

<main>

	<section>
		{@render content.hero()}
			<div class="buttons">
				<button class="cta" id="darkmode" onclick={() => {
					toggleDarkMode = !toggleDarkMode
				}}>
					<Contrast />
					Toggle Dark Mode
				</button>
				<button class="cta" id="shuffle" onclick={() => {
					a1Color = randomAnchorHex()
					a2Color = randomAnchorHex()
				}}>
					<Shuffle />
					Shuffle Colors
				</button>
			</div>
		{@render content.intro()}
	</section>

	<section>
		{@render showcaseSection()}
	</section>

	{@render controls()}

	<section>
	 {@render content.how()}
	</section>

	<div class="panel">
		{@render circleDemo()}
	</div>

	<section>
		{@render content.chroma()}
	</section>

	<div class="panel">
		{@render radarDemo()}
	</div>

	<section>
		{@render content.shades()}
	</section>

	<div class="panel">
		{@render lineDemo()}
	</div>

	<section>
		{@render content.desaturation()}
	</section>

	<div class="panel">
		{@render curveDemo()}
	</div>

	<section>
		{@render content.sphere()}
	</section>

	{@render colorSphere()}

	{@render content.oklch()}

	<section>
		{@render content.programming()}
		{@render cssText()}
	</section>

	<section>
		{@render integrationsSection()}
	</section>

	<section>
		{@render creatorSection()}
	</section>

	<section>
		{@render creditsSection()}
	</section>
</main>

{#snippet curveDemo()}
	<h2>Fade</h2>
	<CurveDemo points={curveDemoChromaValuesPrimary} primaryColor={a1Color} anchorIndex={-1} />
	<CurveDemo points={curveDemoChromaValuesSecondary} primaryColor={a2Color} anchorIndex={-1} />
	<section>
		{@render content.fade()}
	</section>
	<div class="controls">
		<label>Minimum Saturation
			<input
				type="range"
				min="0"
				max="1"
				step="0.01"
				bind:value={minChroma}
				oninput={() => chromaTwoAdjusted = true}
			/>
		</label>
	</div>
{/snippet}

{#snippet lineDemo()}
	<h2>Lightness</h2>
	<LineDemo points={lineDemoLightnessValues} minLightness={minL} maxLightness={maxL} anchorOneIndex={anchorOneLightnessIndex} anchorTwoIndex={anchorTwoLightnessIndex} />
	<section>
		{@render content.lightness()}
	</section>
	<div class="controls">
		<label>Primary Color Lightness
			<input
				type="range"
				min="0"
				max="1"
				step="0.001"
				bind:value={lightnessOne}
				oninput={() => lightnessOneAdjusted = true}
			/>
		</label>
		<label>Secondary Color Lightness
			<input
				type="range"
				min="0"
				max="1"
				step="0.001"
				bind:value={lightnessTwo}
				oninput={() => lightnessTwoAdjusted = true}
			/>
		</label>
		<label>Darkest Color
			<input
				type="range"
				min="0"
				max={Math.min(darkerL, 0.3)}
				step="0.001"
				bind:value={minL}
			/>
		</label>
		<label>Lightest Color
			<input
				type="range"
				min={Math.max(lighterL, 0.95)}
				max="1"
				step="0.001"
				bind:value={maxL}
			/>
		</label>
	</div>
{/snippet}

{#snippet schemePalette()}
	 <div class="scroll">
		<table>
		<!--
			<thead>
				<tr>
					<th></th>
					<th>Text</th>
					<th>Link</th>
					<th>Placeholder</th>
					<th>Muted</th>
					<th>Button hover</th>
					<th>Button</th>
					<th>Guide, border hover</th>
					<th>Grid, border, panel hover</th>
					<th>Panel</th>
					<th>Background</th>
				</tr>
			</thead>
			-->
			<tbody>
				{#each ROLE_ORDER as roleName (roleName)}
					{@const dIndex = scheme.roles[roleName]}
					{@const exactZIndex =
						roleName === "Primary"
							? cyl.anchorZIndices[0]
							: roleName === "Secondary"
								? cyl.anchorZIndices[1]
								: -1}
					<tr>
						<th class="role-name">{displayRoleName(roleName)}</th>
						{#each { length: NUM_Z } as _, k (k)}
							{@const shadeNum = k + 1}
							{@const color = points[k * NUM_D + dIndex].color}
							{@const usageLabels =
								roleShadeUsage[roleName]?.[shadeNum] ?? []}
							<td style:--color={color.hex}>
								<span>
									{color.hex}
								</span>
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/snippet}

{#snippet circleDemo()}
	<h2>Hue</h2>
	<CircleDemo points={cyl.D} chroma={anchors[0].C} lightness={anchors[0].L} anchorOneIndex={anchorOneHueIndex} anchorTwoIndex={anchorTwoHueIndex} />
	<section>
		{@render content.hue()}
	</section>
	<div class="circle controls">
		<label>Primary Color Hue
			<input type="range" min=0 max=360 bind:value={hueOne} oninput={() => hueOneAdjusted = true} />
		</label>
		<label>Secondary Color Hue
			<input type="range" min=0 max=360 bind:value={hueTwo} oninput={() => hueTwoAdjusted = true} />
		</label>
	</div>
{/snippet}


{#snippet radarDemo()}
	<h2>Saturation</h2>
	<RadarDemo hueDegrees={cyl.D} rings={radarRings} />
		{@render content.saturation()}
		<label>Primary color saturation
			<input
				type="range"
				min="0"
				max="1"
				step="0.001"
				bind:value={chromaOne}
				oninput={() => chromaOneAdjusted = true}
			/>
		</label>
		<label>Secondary color saturation
			<input
				type="range"
				min="0"
				max="1"
				step="0.001"
				bind:value={chromaTwo}
				oninput={() => chromaTwoAdjusted = true}
			/>
		</label>
{/snippet}

{#snippet cssText()}
	<pre>{schemeCssText}</pre>
{/snippet}

{#snippet showcaseSection()}
	<h2>Showcase</h2>
	{@render content.showcase()}
	<div class="swatch-grid">
		{#each BRAND_SWATCHES as brandSwatch (brandSwatch.name)}
			<button
				type="button"
				class="swatch"
				style:--swatch-color-one={brandSwatch.colorOne}
				style:--swatch-color-two={brandSwatch.colorTwo}
				onclick={() => {
					a1Color = brandSwatch.colorOne;
					a2Color = brandSwatch.colorTwo;
				}}
			>
				{brandSwatch.name}
			</button>
		{/each}
	</div>
{/snippet}

{#snippet integrationsSection()}
	<h2>Integrations</h2>
	{@render content.integrations()}
	<h3>CSS variables</h3>
	<pre>{schemeCssText}</pre>
	<h3>JavaScript object</h3>
	<pre>{schemeObjectText}</pre>
{/snippet}

{#snippet creatorSection()}
	<h2>Creator</h2>
	<div class="placeholder">
		{@render content.creator()}
	</div>
{/snippet}

{#snippet creditsSection()}
	<h2>Credits</h2>
	{@render content.credits()}
{/snippet}

{#snippet controls()}
	<div class="panel">
		{@render content.palette()}
		<div class="controls">
			<div class="colors">
				<label>Primary Color
					<input type="color" bind:value={a1Color} />
				</label>
				<label>Secondary Color
					<input type="color" bind:value={a2Color} />
				</label>
			</div>
			<div class="sliders">
				<label>Darkest Shade
					<input
						type="range"
						min="0"
						max={Math.min(darkerL, 0.3)}
						step="0.01"
						bind:value={minL}
					/>
				</label>
				<label>Lightest Shade
					<input
						type="range"
						min={Math.max(lighterL, 0.95)}
						max="1"
						step="0.01"
						bind:value={maxL}
					/>
				</label>
				<label>Minimum Saturation
					<input
						type="range"
						min="0"
						max="1"
						step="0.01"
						bind:value={minChroma}
					/>
				</label>
			</div>
		</div>
		{@render schemePalette()}
	</div>
{/snippet}

{#snippet viewControls()}
	<div class="controls">
		<label>
			Rotate
			<input
				type="range"
				min="0"
				max="360"
				step="1"
				bind:value={azimuth}
			/>
		</label>
		<label>Tilt
			<input
				type="range"
				id="elevation"
				min="-80"
				max="80"
				step="1"
				bind:value={elevation}
			/>
		</label>
	</div>
{/snippet}

{#snippet colorSphere()}
	<div class="viz panel">
		<h2>Colorspace</h2>
		<svg viewBox="0 0 900 620" width="900" height="620">
			{#each axesLines as a (a.label)}
				<line
					x1={a.negEnd.sx}
					y1={a.negEnd.sy}
					x2={a.origin.sx}
					y2={a.origin.sy}
					stroke={a.color}
					stroke-width="1"
					opacity="0.35"
				/>
				<line
					x1={a.origin.sx}
					y1={a.origin.sy}
					x2={a.posEnd.sx}
					y2={a.posEnd.sy}
					stroke={a.color}
					stroke-width="1.5"
					opacity="0.85"
				/>
				<text
					x={a.posEnd.sx}
					y={a.posEnd.sy - 6}
					fill={a.color}
					font-size="13"
					font-weight="700"
					text-anchor="middle">{a.label}</text
				>
			{/each}
			{#each withScreen as { p, s } (p.zIndex + "-" + p.dIndex)}
				<circle
					cx={s.sx}
					cy={s.sy}
					r={p.isAnchor ? 9 * s.scale : 3.5 * s.scale}
					fill={p.color.hex}
					stroke={p.isAnchor ? "var(--emphasis)" : p.color.hex}
					stroke-width={p.isAnchor ? 2 : 1}
				/>
				{#if p.isAnchor}
					<text
						x={s.sx}
						y={s.sy - 14 * s.scale}
						fill={p.anchorPos === 0 ? "var(--anchor1)" : "var(--anchor2)"}
						font-size={11 * Math.max(s.scale, 0.7)}
						font-weight="700"
						text-anchor="middle"
					>
						{p.anchorPos === 0 ? "Anchor 1" : "Anchor 2"}
					</text>
				{/if}
			{/each}
		</svg>
		{@render content.combination()}
		{@render viewControls()}
	</div>
{/snippet}

{#snippet fullPalette()}
	<div class="wrap">
		<div class="palette-panel panel" style="flex: 1 1 auto;">
			<p class="panel-label">
				Palette &mdash; 10 rows (Z-levels) &times; 12 columns (D-indices)
			</p>
			<table class="palette">
				<thead>
					<tr>
						{#each columnRoleLabels as labels, dIndex (dIndex)}
							<th
								class:unassigned={labels.length === 0}
								title={"D-index " +
									dIndex +
									(labels.length ? ": " + labels.join(", ") : " (unassigned)")}
							>
								<span>{labels.length ? labels.join(" / ") : "—"}</span>
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each paletteRows as row, k (k)}
						<tr>
							{#each row as p (p.dIndex)}
								<td
									style:background={p.color.hex}
									class={p.isAnchor
										? p.anchorPos === 0
											? "anchor1"
											: "anchor2"
										: ""}
									title={"H=" +
										p.D.toFixed(1) +
										"°  L=" +
										p.Z.toFixed(3) +
										"  C=" +
										p.color.clampedC.toFixed(3) +
										" (rel " +
										p.R.toFixed(3) +
										")  " +
										p.color.hex}
								></td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
{/snippet}

<style>
	/**
	 * This page's theme tokens are DERIVED, in CSS, from the 80 palette
	 * custom properties set via the `style` attribute on .cylinder-page (see
	 * the component script) -- JS's only job is computing those 80 raw
	 * values and flipping `data-theme`; which shade means "background",
	 * which means "text", light vs dark is a plain CSS formula here, not
	 * imperative JS. Scoped to .cylinder-page (not :root) so it can't leak
	 * into other routes when navigating away client-side -- see the script
	 * block's top comment for why that matters in a SvelteKit SPA.
	 */

	:global(body) {
		color: var(--text);
	}

	a {
		color: var(--link);
	}

	header {
		background: var(--menu);
		width: 100%;
		padding-block: 1em;
		margin-bottom: 1lh;
	}

	header :global(svg) {
		width: auto;
		height: 1em;
		display: inline;
	}

	header h1 {
		text-box-trim: trim-both;
		text-box-edge: cap alphabetic;
		margin: 0;
		padding-top: 0.2em;
		font-family: Fraunces;
		font-style: normal;
		font-size: 1em;
		font-weight: 800;
		font-variation-settings: "SOFT" 100;
		color: var(--title);
	}

	header > div {
		align-items: baseline;
		padding-block: 2vi;
		font-size: min(10vi, 5em);
		gap: 0.3em;
		margin: auto;
		display: flex;
		flex-direction: row;
		opacity: 0;
		transition: opacity 0.4s;
		max-width: min(var(--width), 100vi - 10vw);
		width: 100%;
		flex: 1;
	}

	header.colorized > div {
		opacity: 1;
	}

	main {
		align-items: flex-start;
		display: flex;
		flex-direction: column;
		gap: var(--large-gap);
		margin-inline: auto;
		max-width: min(var(--width), 100vi - 10vw);
		overflow-x: hidden;
		font-family: Fredoka;
		padding-bottom: 4lh;
	}

	section:first-of-type {
		gap: 2lh;
	}

	section {
		display: flex;
		flex-direction: column;
		margin: auto;
		gap: 1lh;
		width: 100%;
		max-width: 80ch;
	}

	section > :global(h2) {
		width: 100%;
		font-size: 1.7em;
		font-family: Fraunces;
		font-weight: 600;
		text-transform: uppercase;
	}

	.panel > :global(h2) {
		font-size: 1.8em;
		font-family: Fraunces;
		font-weight: 600;
		font-style: italic;
		color: var(--primary-04);
		margin-block: 0;
	}

	.controls > label {
		max-width: max(300px, 45%);
		width: 100%;
	}

	aside h2:has(~h2) {
		display: none;
	}

	aside h2 {
		font-size: 1.8em;
		font-family: Fraunces;
		font-style: italic;
	}

	h2:before {
		display: none;
	}

	aside {
		display: flex;
		flex-direction: column;
		gap: 1lh;
	}

	aside table {
		grid-template-columns: 20% 20%;
		align-self: center;
		width: 100%;
		justify-content: space-evenly;
		td {
			border-radius: 50%;
		}
	}

	label {
		font-size: 0.9em;
		font-weight: 500;
	}


	table {
		table-layout: fixed;
		display: grid;
		gap: 10px;
		grid-template-columns: min-content repeat(10, 1fr);
		width: 100%;
		border-collapse: separate;
		border-spacing: 10px 10px;
		font-size: 0.6em;
		text-transform: uppercase;
	}

	thead,
	tbody,
	tr {
		display: contents;
	}

	th, td {
		display: flex;
		align-items: center;
		justify-content: flex-start;
	}

	thead th {
		writing-mode: sideways-lr;
		text-orientation: mixed;
	}

	td {
		aspect-ratio: 1 / 1;
		background: var(--color);
		font-size: 0.5em;
		color: rgba(0,0,0,0);
		border-radius: 10px;
		border: 1.5px solid var(--border);
		padding: 0;
	}

	td span {
		display: block;
		width: 100%;
		aspect-ratio: 1 / 1;
	}

	.viz {
		align-self: stretch;
	}

	.panel {
		width: 100%;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 4vi 5vi;
		overflow: auto;
		display: flex;
		gap: 1lh;
		flex-direction: column;
	}

	.panel > :global(svg) {
		padding-bottom: 1lh;
	}

	.panel table {
		margin-top: 3vi;
	}


	.controls {
		width: 100%;
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		gap: 0.5em;
		align-items: stretch;
		justify-content: space-between;
	}

	.sliders {
		width: 100%;
	}
	.sliders label {
		flex: 1;
	}

	.controls .sliders, .controls .colors {
		max-width: max(45%, 300px);
		width: 100%;
	}

	:global(.line-demo) {
		align-self: center;
	}

	.controls .sliders {
		display: flex;
		flex-direction: column;
	}

	input[type="range"] {
		box-sizing: border-box;
		width: 100%;
		accent-color: var(--ring);
	}

	input[type="color"] {
		width: 100%;
		height: 40px;
		border: 1px solid var(--border);
		border-radius: 6px;
		cursor: pointer;
	}

	.swatch-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 12px;
		width: 100%;
	}

	.swatch {
		background: linear-gradient(90deg, var(--swatch-color-one) 50%, var(--swatch-color-two) 50%);
		border: 1px solid var(--border);
		border-radius: 8px;
		height: 64px;
		color: #fff;
		font-family: Fredoka;
		font-weight: 600;
		text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
		transition: transform 0.15s ease;
	}

	.swatch:hover {
		transform: scale(1.03);
	}

	.placeholder {
		border: 1px dashed var(--border);
		border-radius: 8px;
		padding: 2ch;
	}

	.shade-chip.exact {
		border: 2px solid var(--emphasis);
	}
	.shade-chip.used {
		border: 2px solid var(--ring);
	}

	pre {
		margin-top: 16px;
		background: var(--main-background);
		border: 1px solid var(--border);
		height: 10lh;
		border-radius: 8px;
		padding: 14px 16px;
		max-width: 100%;
		overflow: auto
	}

	.scroll {
		overflow: auto;
	}

	svg {
		display: block;
		max-width: 100%;
		height: auto;
	}

	button {
		background: var(--main-background);
		color: var(--text);
		border: 1px solid var(--border);
		padding: 0.5em;
		cursor: pointer;
	}

	.theme-switcher {
		display: flex;
	}

	.theme-switcher button {
		flex: 1 1 0;
		margin-top: 0;
		text-align: center;

		&:first-child {
			border-top-left-radius: 5px;
			border-bottom-left-radius: 5px;
			border-right: none;
		}

		&:last-child {
			border-top-right-radius: 5px;
			border-bottom-right-radius: 5px;
			border-left: none;
		}
	}

	button:hover {
		border-color: var(--ring);
	}


	button {
		font-family: Fredoka;
		background: var(--button);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 5px;
	}

	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5lh;
		margin: auto;
		max-width: max-content;
		width: max-content;
	}

	button.cta {
		align-self: center;
		padding: 2ch;
		font-size: 1.8rem;
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 1ch;

		&#shuffle {
			background: var(--background-cta-primary);
			border: 1px solid var(--border-cta-primary);
			color: var(--text-cta-primary);

			:global(path) {
				fill: var(--icon-cta-primary);
			}
		}

		&#darkmode {
			background: var(--background-cta-secondary);
			border: 1px solid var(--border-cta-secondary);
			color: var(--text-cta-secondary);

			:global(path) {
				fill: var(--icon-cta-secondary);
			}
		}

		:global(svg) {
			height: 1.2em;
			display: inline;
		}
	}

</style>
