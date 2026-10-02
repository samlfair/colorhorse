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
	// A native <input type="color">'s own popup (Chrome/Edge's hex text field
	// in particular) fires `input` events on every keystroke while it's being
	// typed into, including incomplete/malformed intermediate values (e.g.
	// "#3", "#33bb") -- NOT just on a completed, valid color. a1Color/a2Color
	// feed hexToOklch() (oklch.js), which happily parseInt()s a short hex
	// into NaN components with no validation of its own; NaN then poisons
	// every derived value downstream (hueOne, anchors, cyl, points, ...) and
	// computeCylinderPoints ends up throwing (a NaN target angle can never be
	// "closest" to any slot), breaking the reactive graph until a full valid
	// color is entered. HEX_COLOR_PATTERN guards the two color inputs below
	// so a1Color/a2Color only ever get a complete, valid hex -- an in-progress
	// keystroke is simply ignored rather than committed to state.
	const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
	let a1Color = $state("#cccccc"); // neutral placeholder until onMount seeds a real random pair
	let a2Color = $state("#dddddd");
	let minL = $state(0.1);
	let maxL = $state(0.98);
	let contrast = $state(0);
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
		contrast: 0,
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
			contrast: 0,
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
		--pop-text: light-dark(var(--secondary-05), var(--secondary-08));
		--pop-text-em: light-dark(var(--secondary-07), var(--tertiary-07));
		--background-button: light-dark(var(--accent-05), var(--accent-05));
		--border-button: light-dark(var(--accent-04), var(--accent-04));
		--icon-button: light-dark(var(--accent-08), var(--accent-08));
		--text-button: light-dark(var(--accent-10), var(--accent-10));

		--background-cta-primary: light-dark(var(--primary-05), var(--primary-05));
		--border-cta-primary: light-dark(var(--primary-04), var(--primary-04));
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
		--pop-text: var(--secondary-05);
		--pop-text-em: var(--secondary-07);
		--background-button: var(--accent-05);
		--border-button: var(--accent-04);
		--icon-button: var(--accent-08);
		--text-button: var(--accent-10);

		
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
		--pop-text: var(--secondary-05);
		--pop-text-em: var(--secondary-07);
		--background-button: var(--accent-05);
		--border-button: var(--accent-04);
		--icon-button: var(--accent-08);
		--text-button: var(--accent-10);

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
	// Minimum Saturation is a floor applied to every point (see
	// cylinder-deform.js's computeChromaFloor), so it can never exceed the
	// less-saturated anchor's own relative chroma (R) -- otherwise that
	// anchor's own column would have to dip below the floor to reproduce it,
	// the same contradiction minL/maxL avoid above.
	$effect(() => {
		if (anchorsSeeded && minChroma > lowerChromaR) minChroma = lowerChromaR;
	});

	let cyl = $derived(
		computeCylinderPoints(NUM_D, NUM_Z, anchors, minChroma, minL, maxL, contrast),
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
		computeCylinderZLevels(12, anchors[0].L, anchors[1].L, minL, maxL, contrast).zLevels,
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
	<meta property="og:image" content="/scheme-01.png" />
	<meta property="og:title" content="Color Horse" />
	<link rel="icon" href="/favicon.ico" type="image/x-icon" />
	{@html headerStyles}
</svelte:head>


<header class:colorized>
	<div>
	<h1 href="/" id="title">Color Horse</h1>
	<Logo colorOne={colorized ? a2Color : "transparent"} colorTwo={colorized ? a1Color : "transparent"} />
	</div>
</header>

<main class={toggleDarkMode ? "dark" : "light"}>

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


	{@render controls()}

	<section>
	 {@render content.how()}
	</section>

	<div class="panel">
		{@render circleDemo()}
	</div>

	<section>
		{@render content.shades()}
	</section>

	<div class="panel">
		{@render lineDemo()}
	</div>

	<section>
		{@render content.chroma()}
	</section>

	<div class="panel">
		{@render radarDemo()}
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
		{@render content.selection()}
	</section>


	<section>
		{@render showcaseSection()}
	</section>

	<section>
		{@render integrationsSection()}
	</section>

	<section>
		{@render creatorSection()}
	</section>

	<section class="credits">
		{@render creditsSection()}
		<HorseJumping colorOne={a1Color} colorTwo={a2Color} />
	</section>
	<footer>
		<p>© Sam Littlefair, 2026</p>
	</footer>
</main>

	<div class="scheme">
			<div class="swatch" style="--color: var(--danger-background)">
				<div class="swatch" style="--color: var(--danger-border)"></div>
			</div>
			<div class="swatch" style="--color: var(--warning-background)">
				<div class="swatch" style="--color: var(--warning-border)"></div>
			</div>
			<div class="swatch" style="--color: var(--info-background)">
				<div class="swatch" style="--color: var(--info-border)"></div>
			</div>
			<div class="swatch" style="--color: var(--success-background)">
				<div class="swatch" style="--color: var(--success-border)"></div>
			</div>
			<div class="swatch" style="--color: var(--accent-soft)">
				<div class="swatch" style="--color: var(--code-background)"></div>
			</div>
			<div class="swatch" style="--color: var(--menu)">
				<div class="swatch" style="--color: var(--icon-cta-primary)"></div>
			</div>
			<div class="swatch" style="--color: var(--panel)">
				<div class="swatch" style="--color: var(--pop-text-em)"></div>
			</div>
			<div class="swatch" style="--color: var(--main-background); border: 1px solid var(--border);">
				<div class="swatch" style="--color: var(--background-cta-primary)"></div>
			</div>
	</div>

{#snippet curveDemo()}
	<h2>Fade</h2>
		{@render content.fade()}
	<CurveDemo points={curveDemoChromaValuesPrimary} primaryColor={a1Color} anchorIndex={-1} />
	<CurveDemo points={curveDemoChromaValuesSecondary} primaryColor={a2Color} anchorIndex={-1} />
	<div class="controls">
		<label>Minimum Saturation
			<input
				type="range"
				min="0.01"
				max={minChromaSliderMax}
				step="0.01"
				bind:value={minChroma}
				onfocus={captureMinChromaBeforeFadeTouch}
			/>
		</label>
	</div>
	<button onclick={resetFade}>Reset</button>
{/snippet}

{#snippet lineDemo()}
	<h2>Lightness</h2>
		{@render content.lightness()}
	<LineDemo points={lineDemoLightnessValues} minLightness={minL} maxLightness={maxL} anchorOneIndex={anchorOneLightnessIndex} anchorTwoIndex={anchorTwoLightnessIndex} />
	<div class="controls">
		<label>Primary Color Lightness
			<input
				type="range"
				min={darkestShadeCeiling}
				max={lightestShadeFloor}
				step="0.001"
				bind:value={lightnessOne}
				oninput={() => lightnessOneAdjusted = true}
			/>
		</label>
		<label>Secondary Color Lightness
			<input
				type="range"
				min={darkestShadeCeiling}
				max={lightestShadeFloor}
				step="0.001"
				bind:value={lightnessTwo}
				oninput={() => lightnessTwoAdjusted = true}
			/>
		</label>
		<label>Darkest Color
			<input
				type="range"
				min="0"
				max={darkestShadeCeiling}
				step="0.001"
				bind:value={minL}
			/>
		</label>
		<label>Lightest Color
			<input
				type="range"
				min={lightestShadeFloor}
				max="1"
				step="0.001"
				bind:value={maxL}
			/>
		</label>
		<label>Contrast
			<input
				type="range"
				min="0"
				max="1"
				step="0.01"
				bind:value={contrast}
			/>
		</label>
	</div>
	<button onclick={resetLightness}>Reset</button>
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
	{@render content.hue()}
	<CircleDemo points={cyl.D} chroma={anchors[0].C} lightness={anchors[0].L} anchorOneIndex={anchorOneHueIndex} anchorTwoIndex={anchorTwoHueIndex} />
	<div class="circle controls">
		<label>Primary Color Hue
			<input type="range" min=0 max=360 bind:value={hueOne} oninput={() => hueOneAdjusted = true} />
		</label>
		<label>Secondary Color Hue
			<input type="range" min=0 max=360 bind:value={hueTwo} oninput={() => hueTwoAdjusted = true} />
		</label>
	</div>
	<button onclick={resetHue}>Reset</button>
{/snippet}


{#snippet radarDemo()}
	<h2>Saturation</h2>
	{@render content.saturation()}
	<RadarDemo hueDegrees={cyl.D} rings={radarRings} />
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
		<button onclick={resetSaturation}>Reset</button>
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
			</button>
		{/each}
	</div>
{/snippet}

{#snippet integrationsSection()}
	<h2>Integrations</h2>
	{@render content.integrations(cssCopy, jsCopy, aseDownload)}
{/snippet}

{#snippet cssCopy()}
<pre><button onclick={() => handleCopy(schemeCssText, cssCopied, cssCopyTimeout)}><Copy />Copy</button>{#if cssCopied.length}<span class="copied"><Check /></span>{/if}{schemeCssText}</pre>
{/snippet}

{#snippet jsCopy()}
<pre><button onclick={() => handleCopy(schemeObjectText, jsCopied, jsCopyTimeout)}><Copy />Copy</button>{#if jsCopied.length}<span class="copied"><Check /></span>{/if}{schemeObjectText}</pre>
{/snippet}

{#snippet aseDownload()}
<button class="cta" onclick={downloadPaletteAse}><Download />Download .ase</button>
{/snippet}

{#snippet creatorSection()}
	<h2>Creator</h2>
	<div class="creator">
	<Man color={paletteVars["--accent-07"]} />
	<div>
		{@render content.creator()}
	</div>
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
					<input
						type="color"
						value={a1Color}
						oninput={(e) => {
							if (HEX_COLOR_PATTERN.test(e.currentTarget.value)) a1Color = e.currentTarget.value;
						}}
					/>
				</label>
				<label>Secondary Color
					<input
						type="color"
						value={a2Color}
						oninput={(e) => {
							if (HEX_COLOR_PATTERN.test(e.currentTarget.value)) a2Color = e.currentTarget.value;
						}}
					/>
				</label>
				<button onclick={() => {
					a1Color = randomAnchorHex()
					a2Color = randomAnchorHex()
				}}>
					<Shuffle />
					Shuffle
				</button>
			</div>
			<div class="sliders">
				<label>Darkest Shade
					<input
						type="range"
						min="0"
						max={darkestShadeCeiling}
						step="0.01"
						bind:value={minL}
					/>
				</label>
				<label>Lightest Shade
					<input
						type="range"
						min={lightestShadeFloor}
						max="1"
						step="0.01"
						bind:value={maxL}
					/>
				</label>
				<label>Contrast
					<input
						type="range"
						min="0"
						max="1"
						step="0.01"
						bind:value={contrast}
					/>
				</label>
				<label>Minimum Saturation
					<input
						type="range"
						min="0.01"
						max={minChromaSliderMax}
						step="0.01"
						bind:value={minChroma}
					/>
				</label>
			</div>
		</div>
		{@render schemePalette()}
		<div class="buttons">
			<button onclick={downloadPaletteText}><Download />Text</button>
			<button onclick={downloadPaletteCss}><Download />CSS</button>
			<button onclick={downloadPaletteJson}><Download />JSON</button>
			<button onclick={downloadPaletteAse}><Download />Adobe Swatches</button>
		</div>
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
		{@render content.combination()}
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
		{@render viewControls()}
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
		font-size: clamp(16px, 2vi, 18px);
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
		transform: scaleX(-1);
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
		justify-content: space-between;
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
		font-family: "Work Sans";
		padding-bottom: 4lh;
	}

	section:first-of-type {
		gap: 2lh;
	}


	div.creator {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		justify-content: space-around;
		align-items: flex-start;
		gap: max(2vi, 2ch);
	}

	div.creator > * {
		flex: 1;
	}

	div.creator :global(svg) {
		min-height: 10vi;
		min-width: 100px;
		height: auto;
		width: auto;
	}

	div.creator > div {
		min-width: 300px;
		display: flex;
		flex-direction: column;
		gap: 1lh;
	}


	section {
		display: flex;
		flex-direction: column;
		margin: auto;
		gap: 1lh;
		width: 100%;
		max-width: 70ch;
	}

	section > :global(h2) {
		width: 100%;
		font-size: 1.7em;
		font-family: Fraunces;
		color: var(--heading);
		font-weight: 600;
		text-transform: uppercase;
	}

	.panel > :global(h2) {
		font-size: 1.8em;
		font-family: Fraunces;
		font-weight: 600;
		font-style: italic;
		color: var(--panel-heading);
		margin-block: 0;
	}

	section.credits :global(svg) {
		width: 30%;
		height: auto;
		align-self: center;
		margin-block: 6vi;
		transform: scaleX(-1);
	}

	footer {
		font-size: 0.8em;
		color: var(--muted);
		text-align: center;
		width: 100%;
	}

	.controls > label {
		max-width: max(300px, 45%);
		width: 100%;
	}

	:global(aside h2:has(~h2)) {
		display: none;
	}

	:global(aside h2) {
		font-size: 1.6em;
		font-family: Fraunces;
		font-style: italic;
	}

	:global(h2:before) {
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

	tbody,
	tr {
		display: contents;
	}

	th, td {
		display: flex;
		align-items: center;
		justify-content: flex-start;
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

	.panel > button {
		align-self: flex-end;
	}

	.panel table {
		margin-block: 3vi;
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

	.colors {
		display: flex;
		flex-direction: column;

		button {
			margin-top: 1em;
			font-size: 0.8em;
			align-self: flex-start;
			background: var(--background-cta-primary);
			border: var(--border-cta-primary);
			color: var(--text-cta-primary);

			:global(path) {
				fill: var(--icon-cta-primary);
			}
		}
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
		border: 1px solid black;
		border-radius: 8px;
		height: 64px;
		color: #fff;
		font-family: "Work Sans";
		font-weight: 600;
		text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
		transition: transform 0.15s ease;
	}

	.swatch:hover {
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

	:global(pre) {
		margin-top: 16px;
		background: var(--code-background);
		max-height: 10lh;
		border-radius: 8px;
		padding: 14px 16px;
		max-width: 100%;
		overflow: auto;
		position: relative;
	}

	pre button {
		position: absolute;
		top: 2vi;
		right: 2vi;
		display: flex;
		justify-content: flex-start;
		align-items: center;
		gap: 1vi;
		font-weight: 500;
		font-size: 1em;
		color: var(--text-cta-secondary);
		background: var(--background-cta-secondary);


		:global(svg) {
			display: inline-block;
			height: 1em;
		}


		:global(path) {
			fill: var(--text-cta-secondary);
		}
	}

	.ase-download {
		margin-top: 16px;
	}

	pre .copied {
		position: absolute;
		bottom: 2vi;
		right: 2vi;
		height: 1.5em;
		background: var(--background-success);
		display: inline-block;
		aspect-ratio: 1/1;
		border-radius: 50%;
		padding: 0.5em;
		box-sizing: content-box;
		font-size: 1em;

		:global(path) {
			fill: var(--icon-success);
		}
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
		font-family: "Work Sans";
		background: var(--background-cta-primary);
		color: var(--text-cta-primary);
		font-weight: 600;
		font-size: 1em;
		padding: 1vi 2vi;
		border: 1px solid var(--border);
		border-radius: 5px;
	}

	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5lh;
		margin: auto;
		max-width: max-content;
		width: 100%;
		justify-content: center;
		margin-bottom: 3vi;
	}

	button {
		display: flex;
		align-items: center;
		gap: 1ch;
		background: var(--background-button);
		border: var(--border-button);
		color: var(--text-button);

		:global(svg) {
			height: 1.3em;
			width: auto;
		}

		:global(path) {
			fill: var(--icon-button);
		}
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

	.scheme {
		width: 100%;
		height: max-content;
		background: var(--main-background);
		border-top: 1px solid var(--panel);
		display: flex;
		position: fixed;
		bottom: 0px;
		flex-wrap: wrap-reverse balance;
		flex-direction: row-reverse;
		--space: min(0.7vh, 0.8vw);
		gap: var(--space);
		justify-content: flex-end;
		padding: var(--space);

		&> .swatch {
			flex-grow: 1;
			min-width: 11vw;
		}

		.swatch {
		/*
			min-width: 150px;
			max-width: 30%;
			width: 100%;
			*/
			border: none;
			display: flex;
			flex-wrap: wrap;
			background: var(--color);
			height: min(8vi, 6vh);
			aspect-ratio: 2/1;
			padding: calc(var(--space) / 2);
			border-radius: calc(var(--space) * 1.5);
		}

		.swatch .swatch {
			height: 60%;
			aspect-ratio: 1/1;
			border-radius: calc(var(--space) / 1);
		}
	}

</style>
