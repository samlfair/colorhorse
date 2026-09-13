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
	import { computeCylinderPoints, computeCylinderZLevels } from "$lib/cylinder-deform.js";
	import { hexToOklch, oklchToSrgb, maxInGamutChroma } from "$lib/oklch.js";
	import { computeColorScheme } from "$lib/scheme.js";
	import compileCSS from "$lib/compileCSS.js";
	import { buildAseFile } from "$lib/ase.js";
	import Logo from "$lib/Logo.svelte"
	import CircleDemo from "$lib/CircleDemo.svelte"
	import RadarDemo from "$lib/RadarDemo.svelte"
	import LineDemo from "$lib/LineDemo.svelte"
	import CurveDemo from "$lib/CurveDemo.svelte"
	import Shuffle from "$lib/Shuffle.svelte"
	import Contrast from "$lib/Contrast.svelte"
	import Copy from "$lib/Copy.svelte"
	import Check from "$lib/Check.svelte"
	import Download from "$lib/Download.svelte"
	import Man from "$lib/Man.svelte"
	import HorseJumping from "$lib/HorseJumping.svelte"
	import * as content from "$lib/Content.svx"

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
		{ name: "FedEx", colorOne: "#4d148c", colorTwo: "#ff6600" },
		{ name: "Mastercard", colorOne: "#eb001b", colorTwo: "#f79e1b" },
		{ name: "Pepsi", colorOne: "#004b93", colorTwo: "#e32934" },
		{ name: "Barclays", colorOne: "#00aeef", colorTwo: "#00395d" },
		{ name: "London Underground", colorOne: "#000099", colorTwo: "#cc3333" },
		{ name: "McDonalds", colorOne: "#bd0017", colorTwo: "#ffc836" },
		{ name: "NFL", colorOne: "#013369", colorTwo: "#d50a0a"},
		{ name: "Dunkin", colorOne: "#ff671f", colorTwo: "#da1884"},
		{ name: "Subway", colorOne: "#ffCB0A", colorTwo: "#009743" }
	];

	// Two of the three RGB channels are pushed away from 127.5 in one
	// direction and the third is pushed the same distance in the opposite
	// direction, which keeps every random color near an edge of the RGB
	// cube -- i.e. near the sRGB gamut boundary -- instead of near its
	// muddy grey/brown center, regardless of which hue falls out. Lower
	// RANDOM_COLOR_POWER skews channel magnitudes further toward that
	// boundary (more vivid); raise it toward 1 for weaker, more muted colors.
	const RANDOM_COLOR_POWER = 0.8;

	function randomAnchorHex() {
		const sign = Math.sign(Math.random() - 0.5) || 1;
		const n1 = sign * Math.floor(1 + Math.random() ** RANDOM_COLOR_POWER * 127);
		const n2 = sign * Math.floor(1 + Math.random() ** RANDOM_COLOR_POWER * 127);
		const n3 = -sign * Math.floor(1 + Math.random() ** RANDOM_COLOR_POWER * 127);
		const oddOneOut = Math.floor(Math.random() * 3);
		const offsets = [n1, n2];
		offsets.splice(oddOneOut, 0, n3);
		const [r, g, b] = offsets.map((v) => Math.round(127.5 + v));
		return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
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
	// The anchor-derived clamps below (darkerL/lighterL/lowerChromaR) must
	// not run against a1Color/a2Color's neutral PLACEHOLDER values (see
	// their declaration -- "#cccccc"/"#dddddd" are pure gray, so their
	// relative chroma is ~0): without this guard, minChroma gets clamped
	// down to ~0 on that very first render, and since the clamps only ever
	// push a value DOWN (never back up), it stays stuck at 0 forever, even
	// after onMount seeds real, vivid anchor colors below.
	let anchorsSeeded = $state(false)

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
		colorized = true
		anchorsSeeded = true

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
	// Relative chroma (0-1, fraction of that hue/lightness's own gamut
	// boundary) -- NOT absolute OKLCH chroma (which for sRGB tops out
	// somewhere around 0.1-0.4 depending on hue/lightness, nowhere near a
	// 0-1 range). The saturation sliders bind to this relative value so the
	// full slider travel is always meaningful, regardless of which hue is
	// selected.
	let chromaOne = $derived(anchorFromColor(a1Color).R)
	let chromaTwo = $derived(anchorFromColor(a2Color).R)

	let hueOneAdjusted = $state(false)
	let hueTwoAdjusted = $state(false)
	let lightnessOneAdjusted = $state(false)
	let lightnessTwoAdjusted = $state(false)
	let chromaOneAdjusted = $state(false)
	let chromaTwoAdjusted = $state(false)

	// Each panel's Reset button: drop that panel's override so getAnchors()
	// falls back to the color inputs again, and snap the sliders themselves
	// back to those same color-extracted values (they don't move on their
	// own just because the override flag flipped -- $derived only recomputes
	// when a1Color/a2Color change, not when *Adjusted does).
	function resetHue() {
		hueOneAdjusted = false;
		hueTwoAdjusted = false;
		hueOne = anchorFromColor(a1Color).D;
		hueTwo = anchorFromColor(a2Color).D;
	}
	function resetLightness() {
		lightnessOneAdjusted = false;
		lightnessTwoAdjusted = false;
		lightnessOne = anchorFromColor(a1Color).L;
		lightnessTwo = anchorFromColor(a2Color).L;
	}
	function resetSaturation() {
		chromaOneAdjusted = false;
		chromaTwoAdjusted = false;
		chromaOne = anchorFromColor(a1Color).R;
		chromaTwo = anchorFromColor(a2Color).R;
	}
	// Fade has no per-anchor override of its own (its one slider, minChroma,
	// is a global floor, not a value extracted from either color input) --
	// reset here means "back to whatever it was before the user touched
	// THIS slider," captured on focus (before any drag/keyboard change) and
	// left alone otherwise, including when minChroma changes via the OTHER
	// Minimum Saturation slider in the main palette panel.
	let minChromaBeforeFadeTouch = $state(DEFAULTS.minChroma);
	function captureMinChromaBeforeFadeTouch() {
		minChromaBeforeFadeTouch = minChroma;
	}
	function resetFade() {
		minChroma = minChromaBeforeFadeTouch;
	}

	function getAnchors(a1Color, a2Color, hueOne, hueTwo) {
		let first = anchorFromColor(a1Color)
		let second = anchorFromColor(a2Color)

		if(hueOneAdjusted) first.D = hueOne 
		if(hueTwoAdjusted) second.D = hueTwo
		if(lightnessOneAdjusted) first.L = lightnessOne
		if(lightnessTwoAdjusted) second.L = lightnessTwo
		if(chromaOneAdjusted) first.C = chromaOne * maxInGamutChroma(first.L, first.D)
		if(chromaTwoAdjusted) second.C = chromaTwo * maxInGamutChroma(second.L, second.D)

		const adjustedColorOne = anchorFromColor(oklchToSrgb(first.L, first.C, first.D).hex)
		const adjustedColorTwo = anchorFromColor(oklchToSrgb(second.L, second.C, second.D).hex)

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
		--code-background: light-dark(var(--secondary-09), var(--secondary-03));

		--primary-link-color: light-dark(var(--primary-05), var(--primary-08));
		--primary-link-hover-color: light-dark(var(--primary-07), var(--primary-09));
		--panel-heading: light-dark(var(--primary-04), var(--primary-07));
		--heading: light-dark(var(--primary-04), var(--primary-07));
		--accent-soft: light-dark(var(--accent-08), var(--accent-04));

		--success-text: light-dark(var(--tip-02), var(--tip-10));
		--success-border: light-dark(var(--tip-05), var(--tip-06));
		--success-heading: light-dark(var(--tip-03), var(--tip-09));
		--success-background: light-dark(var(--tip-09), var(--tip-03));

		--info-text: light-dark(var(--info-02), var(--info-10));
		--info-border: light-dark(var(--info-05), var(--info-06));
		--info-heading: light-dark(var(--info-03), var(--info-09));
		--info-background: light-dark(var(--info-09), var(--info-03));

		--warning-text: light-dark(var(--warning-02), var(--warning-10));
		--warning-border: light-dark(var(--warning-05), var(--warning-06));
		--warning-heading: light-dark(var(--warning-03), var(--warning-09));
		--warning-background: light-dark(var(--warning-09), var(--warning-03));

		--danger-text: light-dark(var(--danger-02), var(--danger-10));
		--danger-border: light-dark(var(--danger-05), var(--danger-06));
		--danger-heading: light-dark(var(--danger-03), var(--danger-09));
		--danger-background: light-dark(var(--danger-09), var(--danger-03));

		--panel: light-dark(var(--primary-09), var(--primary-03));
		--border: light-dark(var(--primary-08), var(--primary-04));
		--outline: light-dark(var(--primary-01), var(--primary-10));
		--guide: light-dark(var(--primary-07), var(--primary-05));
		--muted: light-dark(var(--primary-04), var(--primary-07));
		--text: light-dark(var(--primary-01), var(--primary-10));
		--ring: light-dark(var(--accent-05), var(--primary-05));
		--menu: light-dark(var(--tertiary-09), var(--tertiary-03));
		--title: light-dark(var(--primary-05), var(--primary-06));
		--pop-text: light-dark(var(--secondary-06), var(--secondary-05));
		--pop-text-em: light-dark(var(--secondary-04), var(--secondary-07));
		--button: light-dark(var(--primary-04), var(--primary-07));

		--background-cta-primary: light-dark(var(--primary-05), var(--primary-05));
		--border-cta-primary: light-dark(var(--primary-04), var(--primary-05));
		--icon-cta-primary: light-dark(var(--primary-08), var(--primary-08));
		--text-cta-primary: light-dark(var(--primary-10), var(--primary-10));

		--background-cta-secondary: light-dark(var(--primary-08), var(--primary-04));
		--border-cta-secondary: light-dark(var(--primary-07), var(--primary-03));
		--icon-cta-secondary: light-dark(var(--primary-05), var(--primary-06));
		--text-cta-secondary: light-dark(var(--primary-04), var(--primary-10));

		
		--background-success: light-dark(var(--tip-06), var(--tip-04));
		--icon-success: light-dark(var(--tip-09), var(--tip-09));

`

	const lightOverrideVariables = `--main-background: var(--primary-10);
		--code-background: var(--secondary-09);
		--panel: var(--primary-09);
		--border: var(--primary-08);
		--guide: var(--primary-07);
		--muted: var(--primary-04);
		--text: var(--primary-01);
		--ring: var(--accent-05);
		--menu: var(--tertiary-09);
		--title: var(--primary-05);
		--pop-text: var(--secondary-06);
		--pop-text-em: var(--secondary-04);
		--button: var(--primary-04);

		
		--primary-link-color: var(--primary-05);
		--primary-link-hover-color: var(--primary-07);
		--panel-heading: var(--primary-04);
		--heading: var(--primary-05);
		--accent-soft: var(--accent-08);

		--success-text: var(--tip-02);
		--success-border: var(--tip-05);
		--success-heading: var(--tip-03);
		--success-background: var(--tip-09);

		--info-text: var(--info-02);
		--info-border: var(--info-05);
		--info-heading: var(--info-03);
		--info-background: var(--info-09);

		--warning-text: var(--warning-02);
		--warning-border: var(--warning-05);
		--warning-heading: var(--warning-03);
		--warning-background: var(--warning-09);

		--danger-text: var(--danger-02);
		--danger-border: var(--danger-05);
		--danger-heading: var(--danger-03);
		--danger-background: var(--danger-09);


		--background-cta-primary: var(--primary-05);
		--border-cta-primary: var(--primary-04);
		--icon-cta-primary: var(--primary-08);
		--text-cta-primary: var(--primary-10);


		--background-cta-secondary: var(--primary-08);
		--border-cta-secondary: var(--primary-07);
		--icon-cta-secondary: var(--primary-05);
		--text-cta-secondary: var(--primary-04);

		--background-success: var(--tip-06);
		--icon-success: var(--tip-09);

		`		

	const darkOverrideVariables = `--main-background: var(--primary-02);
		--code-background: var(--secondary-03);
		--panel: var(--primary-03);
		--border: var(--primary-04);
		--guide: var(--primary-05);
		--muted: var(--primary-07);
		--text: var(--primary-10);
		--ring: var(--primary-05);

		
		--primary-link-color: var(--primary-08);
		--primary-link-hover-color: var(--primary-09);
		--panel-heading: var(--primary-07);
		--heading: var(--primary-07);
		--accent-soft: var(--accent-04);

		--success-text: var(--tip-10);
		--success-border: var(--tip-06);
		--success-heading: var(--tip-09);
		--success-background: var(--tip-03);

		--info-text: var(--info-10);
		--info-border: var(--info-06);
		--info-heading: var(--info-09);
		--info-background: var(--info-03);

		--warning-text: var(--warning-10);
		--warning-border: var(--warning-06);
		--warning-heading: var(--warning-09);
		--warning-background: var(--warning-03);

		--danger-text: var(--danger-10);
		--danger-border: var(--danger-06);
		--danger-heading: var(--danger-09);
		--danger-background: var(--danger-03);


		--menu: var(--tertiary-03);
		--title: var(--primary-06);
		--pop-text: var(--secondary-07);
		--pop-text-em: var(--secondary-05);
		--button: var(--secondary-07);

		--background-cta-primary: var(--primary-05);
		--border-cta-primary: var(--primary-05);
		--icon-cta-primary: var(--primary-07);
		--text-cta-primary: var(--primary-10);

		--background-cta-secondary: var(--primary-04);
		--border-cta-secondary: var(--primary-03);
		--icon-cta-secondary: var(--primary-06);
		--text-cta-secondary: var(--primary-10);

		--background-success: var(--tip-06);
		--icon-success: var(--tip-09);
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
	let lowerChromaR = $derived(Math.min(anchors[0].R, anchors[1].R));
	// If an anchor's own lightness is dragged (via the Primary/Secondary
	// Color Lightness sliders) all the way to black or white, darkerL/lighterL
	// hit 0/1 too -- collapsing the Darkest/Lightest Shade sliders' dynamic
	// bound to their OTHER fixed end (max=Math.min(darkerL,0.3) -> 0, or
	// min=Math.max(lighterL,0.95) -> 1) and leaving them a zero-width, totally
	// undraggable range. LIGHTNESS_RAMP_MARGIN keeps a sliver of always-usable
	// range on both sliders no matter how extreme an anchor gets, and the
	// clamp effects below compare against these same margined values -- not
	// the raw darkerL/lighterL -- so the effect and the slider's own max/min
	// attribute always agree instead of fighting each other.
	const LIGHTNESS_RAMP_MARGIN = 0.02;
	let darkestShadeCeiling = $derived(Math.max(Math.min(darkerL, 0.3), LIGHTNESS_RAMP_MARGIN));
	let lightestShadeFloor = $derived(Math.min(Math.max(lighterL, 0.95), 1 - LIGHTNESS_RAMP_MARGIN));
	// The Minimum Saturation slider's own `max` attribute must be gated the
	// same way as the $effect below: before anchorsSeeded, lowerChromaR is
	// computed from the achromatic a1Color/a2Color PLACEHOLDERS (~0), and a
	// native <input type="range"> silently clamps its OWN value to whatever
	// `max` is the moment the browser parses it -- independent of the
	// $effect entirely, and before onMount even runs. That clamp sticks
	// (nothing un-clamps a range input when max later increases), which is
	// what was pinning minChroma at 0 even after the $effect got gated.
	let minChromaSliderMax = $derived(anchorsSeeded ? lowerChromaR : 1);

	// Minimum Lightness can never be brighter than the darker anchor's L;
	// Maximum Lightness can never be darker than the lighter anchor's L --
	// see cylinder-deform.js's model for why (Z-level stack extremes).
	$effect(() => {
		if (anchorsSeeded && minL > darkestShadeCeiling) minL = darkestShadeCeiling;
	});
	$effect(() => {
		if (anchorsSeeded && maxL < lightestShadeFloor) maxL = lightestShadeFloor;
	});
	// Minimum Saturation is a floor applied to every non-anchor point (see
	// cylinder-deform.js's computeCylinderR/computeCylinderRGrid), so it can
	// never exceed the less-saturated anchor's own relative chroma (R) --
	// otherwise that anchor's own neighborhood would get floored ABOVE the
	// anchor's actual color, the same contradiction minL/maxL avoid above.
	$effect(() => {
		if (anchorsSeeded && minChroma > lowerChromaR) minChroma = lowerChromaR;
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


	let schemeCssText = $derived.by(() => {
		const lines = [
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
			).join(`,\n    `);
			lines.push("  " + roleName.toLowerCase() + `: [\n    ` + hexValues + `\n  ],`);
		}
		lines.push("}");
		return lines.join("\n");
	});

	// Same 80 colors again, shaped for buildAseFile(): one named group per
	// role, one named color entry per shade -- Adobe Swatch Exchange import
	// for design tools (Photoshop, Illustrator, Affinity, Figma/Sketch via
	// plugin).
	let aseGroups = $derived.by(() =>
		ROLE_ORDER.map((roleName) => {
			const dIndex = scheme.roles[roleName];
			return {
				name: displayRoleName(roleName),
				colors: Array.from({ length: NUM_Z }, (_, shadeIndex) => ({
					name: roleName.toLowerCase() + "-" + String(shadeIndex + 1).padStart(2, "0"),
					hex: points[shadeIndex * NUM_D + dIndex].color.hex,
				})),
			};
		}),
	);

	// Same 80 colors as a real object (unlike schemeObjectText, a preformatted
	// JS-literal STRING with unquoted keys) -- this is what actually gets
	// JSON.stringify()'d for the JSON download.
	let paletteObject = $derived.by(() => {
		const result = {};
		for (const roleName of ROLE_ORDER) {
			const dIndex = scheme.roles[roleName];
			result[roleName.toLowerCase()] = Array.from(
				{ length: NUM_Z },
				(_, shadeIndex) => points[shadeIndex * NUM_D + dIndex].color.hex,
			);
		}
		return result;
	});

	// Same 80 colors as a plain, human-readable listing for the Text download.
	let paletteTextContent = $derived.by(() => {
		const lines = [];
		for (const roleName of ROLE_ORDER) {
			const dIndex = scheme.roles[roleName];
			lines.push(displayRoleName(roleName));
			for (let shadeIndex = 0; shadeIndex < NUM_Z; shadeIndex++) {
				lines.push("  " + String(shadeIndex + 1).padStart(2, "0") + ": " + points[shadeIndex * NUM_D + dIndex].color.hex);
			}
		}
		return lines.join("\n");
	});

	function triggerFileDownload(filename, content, mimeType) {
		const blobUrl = URL.createObjectURL(new Blob([content], { type: mimeType }));
		const downloadLink = document.createElement("a");
		downloadLink.href = blobUrl;
		downloadLink.download = filename;
		downloadLink.click();
		URL.revokeObjectURL(blobUrl);
	}

	function downloadPaletteText() {
		triggerFileDownload("color-horse-palette.txt", paletteTextContent, "text/plain");
	}
	function downloadPaletteCss() {
		triggerFileDownload("color-horse-palette.css", schemeCssText, "text/css");
	}
	function downloadPaletteJson() {
		triggerFileDownload("color-horse-palette.json", JSON.stringify(paletteObject, null, 2), "application/json");
	}
	function downloadPaletteAse() {
		triggerFileDownload("color-horse-palette.ase", buildAseFile(aseGroups), "application/octet-stream");
	}

	let cssCopied = $state([])
	let cssCopyTimeout

	let jsCopied = $state([])
	let jsCopyTimeout

	async function handleCopy(text, toggle, timeout) {
		console.log({toggle})
		try {
			await navigator.clipboard.writeText(text)
			toggle.push(1)
			console.log(toggle)
			clearTimeout(timeout)
			timeout = setTimeout(() => {
				toggle.shift()
			}, 1000)
		} catch(e) {
			console.error("Failed to copy:", e)
		}
	}
</script>

<svelte:head>
	<title>Color Horse</title>
	<meta property="og:description" content="The automatic color scheme generator" />
	<meta property="og:image" content="/palette.png" />
	<meta property="og:title" content="Color Horse" />
	<link rel="icon" href="/favicon.ico" type="image/x-icon" />
	{@html headerStyles}
</svelte:head>


<section>
<div class="top"/>
<header class:colorized>
	<!-- <h1 href="/" id="title">Color Horse</h1> -->
	<blockquote>
	<p>The <em>magic</em> color scheme generator</p>
	</blockquote>
	<Logo colorOne={colorized ? a2Color : "#000"} colorTwo={colorized ? a1Color : "#000"} />
</header>
</section>


<style>
	:global(body) {
		color: var(--text);
		font-family: Fraunces;
		display: block;
	}

	section {
		width: min-content;
	}

	.top {
		height: 100px;
		width: 1200px;
		padding: 0;
		margin: 0;
		--segment: calc(100% / 8);
		background: linear-gradient(
			to right,
			var(--primary-07) calc(1 * var(--segment)),
			var(--secondary-06) calc(1 * var(--segment)),
			var(--secondary-06) calc(2 * var(--segment)),
			var(--tertiary-06) calc(2 * var(--segment)),
			var(--tertiary-06) calc(3 * var(--segment)),
			var(--accent-06) calc(3 * var(--segment)),
			var(--accent-06) calc(4 * var(--segment)),
			var(--tip-07) calc(4 * var(--segment)),
			var(--tip-07) calc(5 * var(--segment)),
			var(--info-08) calc(5 * var(--segment)),
			var(--info-08) calc(6 * var(--segment)),
			var(--warning-07) calc(6 * var(--segment)),
			var(--warning-07) calc(7 * var(--segment)),
			var(--danger-05) calc(7 * var(--segment))
		);
	}

	header {
		margin: 0;
		--main-background: var(--primary-02);
		background: var(--main-background);
		width: 1200px;
		height: 600px;
		align-items: flex-end;
		font-size: min(10vi, 5em);
		display: flex;
		flex-direction: row;
		justify-content: center;
		align-content: center;
		text-box-edge: ex alphabetic;
		text-box-trim: trim-both;
		padding-inline: 10%;
		box-sizing: border-box;
		padding-bottom: 0.5lh;
	}

	header h1 {
		text-box-trim: trim-both;
		text-box-edge: ex alphabetic;
		margin: 0;
		width: 100%;
		font-family: Fraunces;
		font-style: normal;
		font-size: 0.8em;
		font-weight: 800;
		font-variation-settings: "SOFT" 100;
		color: var(--title);
	}

	blockquote {
		flex: 4;
		padding: 0;
		margin: 0;
		transform: rotate(-1deg);
	}

	p {
		font-weight: 900;
		font-style: italic;
		line-height: 1.1em;
		text-box-trim: trim-both;
		text-box-edge: ex alphabetic;
		-webkit-text-stroke: 0px var(--accent);
		paint-order: stroke fill;

		--accent: var(--tertiary-03);
		color: var(--primary-09);

		em {
			color: var(--secondary-08);
		}
		
			display: inline;
		  background: linear-gradient(
		  	transparent calc(0.75em - 1ex),
		  	var(--accent) calc(0.75em - 1ex),
		  	var(--accent) 1.25em,
		  	transparent 1.25em
		  ),
		  linear-gradient(
		  	100deg,
		  	var(--main-background) 4%,
		  	transparent 4%,
		  	transparent 96%,
		  	var(--main-background) 96%
		  );
		  background-blend-mode: darken;
		  mix-blend-mode: lighten;
		  line-height: 1cap;
		  border-radius: 3px;
		  padding-inline: 1.5ch;
		  box-decoration-break: clone;
		  -webkit-box-decoration-break: clone;

	}

	header :global(svg) {
		transform: scaleX(-1);
		display: block;
		flex: 1;
		height: auto;
	}





</style>
