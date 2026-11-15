<script>
	/**
	 * Color Horse: the palette, with every control in one panel beside the
	 * content. The math lives in $lib; this is the state, theme and layout.
	 *
	 * Prerendered: top-level code here runs once at build time, so the random
	 * starting colors are picked in onMount(), which only runs in a browser.
	 *
	 * The live theme (80 palette variables and the data-theme attribute) is
	 * scoped to this page's wrapper <div>, not <html>, so it can't leak into
	 * other routes after client-side navigation.
	 */
	import { onMount, onDestroy, tick, untrack } from "svelte";
	import { replaceState } from "$app/navigation";
	import { page } from "$app/state";
	import { computeCylinderD, computeCylinderPoints } from "$lib/cylinder-deform.js";
	import { normalizeHue } from "$lib/hue-deform.js";
	import { MIN_GAP } from "$lib/tension-ring.js";
	import { hexToOklch, oklchToSrgb } from "$lib/oklch.js";
	import { turnView, wheelPixels, DRAG_DEGREES_PER_PIXEL, WHEEL_DEGREES_PER_PIXEL } from "$lib/view-turn.js";
	import { assignRoles } from "colorhorse";
	import compileCSS from "$lib/compileCSS.js";
	import { buildAseFile } from "$lib/ase.js";
	import { encodeUrlState, decodeUrlState, URL_STATE_DEFAULTS, SHADE_COUNT_RANGE, URL_STATE_VERSION, KNOWN_URL_STATE_VERSIONS } from "$lib/url-state.js";
	import { getWheel, getGamut } from "colorhorse";
	import LogoMark from "$lib/LogoMark.svelte"
	import { logoColors } from "$lib/logo-colors.js"
	import { huesFromColorOne } from "$lib/hue-palette.js"
	import CircleDemo from "$lib/CircleDemo.svelte"
	import RadarDemo from "$lib/RadarDemo.svelte"
	import LineDemo from "$lib/LineDemo.svelte"
	import CurveDemo from "$lib/CurveDemo.svelte"
	import Shuffle from "$lib/Shuffle.svelte"
	import Swap from "$lib/Swap.svelte"
	import Contrast from "$lib/Contrast.svelte"
	import Copy from "$lib/Copy.svelte"
	import Check from "$lib/Check.svelte"
	import Download from "$lib/Download.svelte"
	import Man from "$lib/Man.svelte"
	import PostDemo from "$lib/PostDemo.svelte"
	import * as content from "$lib/Content.svx"

	const NUM_D = 12;
	// The page's own theme is written against --{role}-01..10, so it always
	// uses a 10-shade palette, whatever shade count the palette itself has.
	const THEME_SHADE_COUNT = 10;
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

	// The smallest frame that holds the cylinder, its axes and their labels
	// at every Rotate and Tilt setting, so the graphic has no empty margin
	// and doesn't change size while it turns.
	const COLORSPACE_FRAME = (() => {
		const MARGIN = 16;
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;
		const include = (x, y) => {
			minX = Math.min(minX, x);
			maxX = Math.max(maxX, x);
			minY = Math.min(minY, y);
			maxY = Math.max(maxY, y);
		};
		for (let azimuthStep = 0; azimuthStep < 360; azimuthStep += 5) {
			for (let elevationStep = -80; elevationStep <= 80; elevationStep += 5) {
				for (let D = 0; D < 360; D += 10) {
					for (const Z of [0, 1]) {
						const point = toScreen(D, Z, 1, azimuthStep, elevationStep);
						// Anchor dots and their labels sit above the point.
						include(point.sx - 30 * point.scale, point.sy - 26 * point.scale);
						include(point.sx + 30 * point.scale, point.sy + 9 * point.scale);
					}
				}
				for (const { to } of AXES) {
					const end = project(rotate(to, azimuthStep, elevationStep));
					const opposite = project(rotate({ x: -to.x, y: -to.y, z: -to.z }, azimuthStep, elevationStep));
					include(end.sx - 8, end.sy - 20);
					include(end.sx + 8, end.sy);
					include(opposite.sx, opposite.sy);
				}
			}
		}
		const x = Math.floor(minX - MARGIN);
		const y = Math.floor(minY - MARGIN);
		return { x, y, width: Math.ceil(maxX + MARGIN) - x, height: Math.ceil(maxY + MARGIN) - y };
	})();

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
	let minL = $state(URL_STATE_DEFAULTS.dark);
	let maxL = $state(URL_STATE_DEFAULTS.light);
	let contrast = $state(URL_STATE_DEFAULTS.contrast);
	let minChroma = $state(URL_STATE_DEFAULTS.sat);
	let wheel = $state(URL_STATE_DEFAULTS.wheel); // "rgb" | "ryb"
	// The ring is laid out in this wheel's angles (every D below);
	// hueWheel.toHue turns an angle into an OKLCH hue for the color math.
	let hueWheel = $derived(getWheel(wheel));
	let gamut = $state(URL_STATE_DEFAULTS.gamut); // "srgb" | "print"
	let chromaGamut = $derived(getGamut(gamut));
	let colorTwoSlot = $state(URL_STATE_DEFAULTS.slot); // "nearest" | 1..11
	let shadeCount = $state(URL_STATE_DEFAULTS.shades);
	// Which role model (scheme.js's `model`) the palette uses. A shared link
	// keeps its own, so it looks the same after the model changes.
	let roleModel = $state(URL_STATE_VERSION);
	// On phones the settings are a drawer along the bottom of the screen.
	let phoneLayout = $state(false);
	let settingsOpen = $state(false);
	// The content tabs. The one showing comes from the URL's hash
	// ("#about"); the palette otherwise. Links to a hash keep the query,
	// so the palette's settings survive switching tabs.
	const TABS = [
		{ id: "palette", label: "Palette" },
		{ id: "space", label: "Space" },
		{ id: "example", label: "Example" },
		{ id: "method", label: "Method" },
		{ id: "about", label: "About" },
	];
	// Older links use the tabs' former names.
	const RENAMED_TABS = { overview: "method", demo: "example" };
	let activeTab = $derived.by(() => {
		const hashId = page.url.hash.slice(1);
		const tabId = RENAMED_TABS[hashId] ?? hashId;
		return TABS.some((tab) => tab.id === tabId) ? tabId : "palette";
	});

	// A new tab starts at the top.
	let contentArea;
	$effect(() => {
		activeTab;
		untrack(() => {
			contentArea?.scrollTo(0, 0);
			if (phoneLayout) window.scrollTo(0, 0);
		});
	});
	let settingsButton;
	let settingsForm;

	// Opening moves focus into the drawer; closing returns it to the button.
	async function openSettings() {
		settingsOpen = true;
		await tick();
		settingsForm.focus();
	}

	function closeSettings() {
		settingsOpen = false;
		settingsButton.focus();
	}

	// On phones the drawer's handle also opens with a swipe up and closes
	// with a swipe down. A swipe isn't also counted as a tap.
	const HANDLE_SWIPE_DISTANCE = 12;
	let handleSwipe = null;
	let handleWasSwiped = false;

	function startHandleSwipe(event) {
		event.currentTarget.setPointerCapture(event.pointerId);
		handleSwipe = { y: event.clientY, moved: false };
	}

	function moveHandleSwipe(event) {
		if (handleSwipe && Math.abs(event.clientY - handleSwipe.y) > HANDLE_SWIPE_DISTANCE) handleSwipe.moved = true;
	}

	function endHandleSwipe(event) {
		if (!handleSwipe) return;
		const swipedBy = event.clientY - handleSwipe.y;
		handleWasSwiped = handleSwipe.moved;
		handleSwipe = null;
		if (!handleWasSwiped) return;
		if (swipedBy < 0 && !settingsOpen) openSettings();
		if (swipedBy > 0 && settingsOpen) closeSettings();
	}

	function tapHandle() {
		if (handleWasSwiped) {
			handleWasSwiped = false;
			return;
		}
		settingsOpen ? closeSettings() : openSettings();
	}
	let azimuth = $state(30);
	let elevation = $state(18);

	// Turning the 3D view by hand. A drag moves the surface with the pointer;
	// scrolling moves it with the content, like scrolling a page: vertically
	// to tilt, horizontally to rotate. The Rotate and Tilt sliders do the
	// same from the keyboard.
	let viewDrag = $state(null);

	function turnSpace(rotateBy, tiltBy) {
		({ azimuth, elevation } = turnView({ azimuth, elevation }, rotateBy, tiltBy));
	}

	function startViewDrag(event) {
		if (event.button !== 0) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		viewDrag = { x: event.clientX, y: event.clientY };
	}

	function moveViewDrag(event) {
		if (!viewDrag) return;
		turnSpace(-(event.clientX - viewDrag.x) * DRAG_DEGREES_PER_PIXEL, -(event.clientY - viewDrag.y) * DRAG_DEGREES_PER_PIXEL);
		viewDrag = { x: event.clientX, y: event.clientY };
	}

	// Svelte's own wheel handlers are passive, so they can't stop the page
	// scrolling; this one isn't.
	function turnOnWheel(svgElement) {
		const onWheel = (event) => {
			event.preventDefault();
			const pixels = wheelPixels(event);
			turnSpace(pixels.x * WHEEL_DEGREES_PER_PIXEL, pixels.y * WHEEL_DEGREES_PER_PIXEL);
		};
		svgElement.addEventListener("wheel", onWheel, { passive: false });
		return () => svgElement.removeEventListener("wheel", onWheel);
	}
	let systemPrefersDark = $state(false);

	let DEFAULTS = {
		a1Color: "#888888",
		a2Color: "#888888",
		minL: URL_STATE_DEFAULTS.dark,
		maxL: URL_STATE_DEFAULTS.light,
		contrast: URL_STATE_DEFAULTS.contrast,
		minChroma: URL_STATE_DEFAULTS.sat,
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
		const settingsFromUrl = decodeUrlState(window.location.search);
		DEFAULTS = {
			a1Color: settingsFromUrl.colorOne ?? randomAnchorHex(),
			a2Color: settingsFromUrl.colorTwo ?? randomAnchorHex(),
			minL: URL_STATE_DEFAULTS.dark,
			maxL: URL_STATE_DEFAULTS.light,
			contrast: URL_STATE_DEFAULTS.contrast,
			minChroma: URL_STATE_DEFAULTS.sat,
			azimuth: 30,
			elevation: 18,
		};
		a1Color = DEFAULTS.a1Color;
		a2Color = DEFAULTS.a2Color;
		minL = settingsFromUrl.dark ?? minL;
		maxL = settingsFromUrl.light ?? maxL;
		minChroma = settingsFromUrl.sat ?? minChroma;
		contrast = settingsFromUrl.contrast ?? contrast;
		wheel = settingsFromUrl.wheel ?? wheel;
		gamut = settingsFromUrl.gamut ?? gamut;
		colorTwoSlot = settingsFromUrl.slot ?? colorTwoSlot;
		shadeCount = settingsFromUrl.shades ?? shadeCount;
		roleModel = KNOWN_URL_STATE_VERSIONS.includes(settingsFromUrl.version) ? settingsFromUrl.version : URL_STATE_VERSION;
		colorized = true
		anchorsSeeded = true

		const phoneQuery = window.matchMedia("(width < 800px)");
		const onPhoneChange = () => phoneLayout = phoneQuery.matches;
		onPhoneChange();
		phoneQuery.addEventListener("change", onPhoneChange);

		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		systemPrefersDark = mq.matches;
		const onChange = () => {
			systemPrefersDark = mq.matches;
		};
		mq.addEventListener("change", onChange);

		colorSchemeOverride = readStoredColorScheme();
		const onStorage = (event) => {
			if (event.key === COLOR_SCHEME_STORAGE_KEY) colorSchemeOverride = readStoredColorScheme();
		};
		window.addEventListener("storage", onStorage);

		return () => {
			phoneQuery.removeEventListener("change", onPhoneChange);
			mq.removeEventListener("change", onChange);
			window.removeEventListener("storage", onStorage);
		};

	});

	const COLOR_SCHEME_STORAGE_KEY = "color-scheme";

	function readStoredColorScheme() {
		try {
			const storedScheme = localStorage.getItem(COLOR_SCHEME_STORAGE_KEY);
			return storedScheme === "light" || storedScheme === "dark" ? storedScheme : null;
		} catch {
			return null;
		}
	}

	// Switches to the opposite of what's showing. Switching back to the
	// system's own scheme clears the override, so the page follows the
	// system again.
	function toggleColorScheme() {
		const targetScheme = resolvedThemeIsDark ? "light" : "dark";
		const systemScheme = systemPrefersDark ? "dark" : "light";
		colorSchemeOverride = targetScheme === systemScheme ? null : targetScheme;
		try {
			if (colorSchemeOverride) localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, colorSchemeOverride);
			else localStorage.removeItem(COLOR_SCHEME_STORAGE_KEY);
		} catch {
			// Storage blocked: the scheme still applies for this visit.
		}
	}

	/* ------------------------- derived model ------------------------- */
	function anchorFromColor(hex) {
		const { L, C, H } = hexToOklch(hex);
		const maxC = chromaGamut.maxChroma(L, H);
		const R = maxC > 1e-9 ? Math.min(1, C / maxC) : 0;
		return { D: hueWheel.toWheel(H), Z: L, R, L, C, H };
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
		colorTwoSlot = "nearest";
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

		if(hueOneAdjusted) first.H = hueWheel.toHue(hueOne)
		if(hueTwoAdjusted) second.H = hueWheel.toHue(hueTwo)
		if(lightnessOneAdjusted) first.L = lightnessOne
		if(lightnessTwoAdjusted) second.L = lightnessTwo
		if(chromaOneAdjusted) first.C = chromaOne * chromaGamut.maxChroma(first.L, first.H)
		if(chromaTwoAdjusted) second.C = chromaTwo * chromaGamut.maxChroma(second.L, second.H)

		const adjustedHexOne = oklchToSrgb(first.L, first.C, first.H).hex
		const adjustedHexTwo = oklchToSrgb(second.L, second.C, second.H).hex

		return [
			{ ...anchorFromColor(adjustedHexOne), hex: adjustedHexOne },
			{ ...anchorFromColor(adjustedHexTwo), hex: adjustedHexTwo },
		]
	}
	
	let anchors = $derived(getAnchors(a1Color, a2Color, hueOne, hueTwo));

	// Swapping the inputs re-derives every slider from the new colors, so
	// swap any manual adjustments along with them.
	function swapColors() {
		// One assignment, so every old value is read before any of them changes.
		[
			a1Color, a2Color,
			hueOne, hueTwo, hueOneAdjusted, hueTwoAdjusted,
			lightnessOne, lightnessTwo, lightnessOneAdjusted, lightnessTwoAdjusted,
			chromaOne, chromaTwo, chromaOneAdjusted, chromaTwoAdjusted,
		] = [
			a2Color, a1Color,
			hueTwo, hueOne, hueTwoAdjusted, hueOneAdjusted,
			lightnessTwo, lightnessOne, lightnessTwoAdjusted, lightnessOneAdjusted,
			chromaTwo, chromaOne, chromaTwoAdjusted, chromaOneAdjusted,
		];
		// Seen from the other color, the same ring puts it 12 - n slots on.
		if (colorTwoSlot !== "nearest") colorTwoSlot = NUM_D - colorTwoSlot;
	}

	// Switching wheels re-derives the hue sliders from the input colors, which
	// would drop a manual hue adjustment; carry it over to the new wheel.
	function setWheel(nextWheel) {
		const adjustedHueOne = hueWheel.toHue(hueOne);
		const adjustedHueTwo = hueWheel.toHue(hueTwo);
		wheel = nextWheel;
		if (hueOneAdjusted) hueOne = hueWheel.toWheel(adjustedHueOne);
		if (hueTwoAdjusted) hueTwo = hueWheel.toWheel(adjustedHueTwo);
	}

	// The URL carries each anchor's EFFECTIVE color (after any hue/lightness/
	// saturation override), so a link reproduces the palette without
	// encoding the overrides themselves. Writes are throttled: Safari throws
	// if a page calls replaceState ~100 times in 30s, which dragging a
	// slider would otherwise do.
	const URL_WRITE_INTERVAL_MS = 300;
	let urlQuery = $derived(
		encodeUrlState({
			colorOne: anchors[0].hex,
			colorTwo: anchors[1].hex,
			dark: minL,
			light: maxL,
			sat: minChroma,
			contrast,
			wheel,
			gamut,
			shades: shadeCount,
			slot: colorTwoSlot,
			version: roleModel,
		}),
	);
	let pendingUrlQuery = null;
	let urlWriteTimer = null;
	function writeUrlQuery() {
		urlWriteTimer = null;
		const nextSearch = pendingUrlQuery ? `?${pendingUrlQuery}` : "";
		if (nextSearch === window.location.search) return;
		replaceState(`${window.location.pathname}${nextSearch}${window.location.hash}`, {});
	}
	$effect(() => {
		if (!anchorsSeeded) return;
		pendingUrlQuery = urlQuery;
		if (urlWriteTimer === null) urlWriteTimer = setTimeout(writeUrlQuery, URL_WRITE_INTERVAL_MS);
	});
	onDestroy(() => clearTimeout(urlWriteTimer));
	// "light" or "dark" when the visitor has pinned a scheme against their
	// system's; null follows the system.
	let colorSchemeOverride = $state(null);

	const defaultVariables = $derived(
		`--emphasis: var(--text);
		--anchor1: #ff5d5d;
		--anchor2: #ffb454;

		color-scheme: ${colorSchemeOverride ?? "light dark"};`)

	const dynamicVariables = `--main-background: light-dark(white, black);
		--settings-background: light-dark(white, black);
		--nav-background: light-dark(white, black);
		--nav-text: light-dark(var(--secondary-03), var(--secondary-08));
		--nav-text-hover: light-dark(var(--secondary-01), var(--secondary-10));
		--nav-indicator: light-dark(var(--secondary-04), var(--secondary-07));
		--content-background: light-dark(white, black);
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

	let headerStyles = $derived(compileCSS(paletteStyleText + ";" + dynamicVariables + defaultVariables, anchors));

	

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

	let nearestColorTwoSlot = $derived.by(() => {
		const [anchorOneIndex, anchorTwoIndex] = computeCylinderD(NUM_D, anchors).anchorIndices;
		return (anchorTwoIndex - anchorOneIndex + NUM_D) % NUM_D;
	});
	// A chosen slot needs an arc between the two hues to spread over; with
	// equal hues (e.g. #ff0000 and #800000) fall back to the nearest slot.
	let anchorsShareHue = $derived.by(() => {
		const gap = normalizeHue(anchors[1].D - anchors[0].D);
		return gap < MIN_GAP || gap > 360 - MIN_GAP;
	});
	let chosenColorTwoSlot = $derived(
		colorTwoSlot === "nearest" || anchorsShareHue ? undefined : colorTwoSlot,
	);

	function computePalette(shades, slot) {
		return computeCylinderPoints(
			NUM_D,
			shades,
			anchors,
			minChroma,
			minL,
			maxL,
			contrast,
			slot,
		);
	}
	let cyl = $derived(computePalette(shadeCount, chosenColorTwoSlot));
	let themeCyl = $derived(shadeCount === THEME_SHADE_COUNT ? cyl : computePalette(THEME_SHADE_COUNT, chosenColorTwoSlot));

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

	// LineDemo shows the palette's own shades, so it follows the shade count.
	let lineDemoLightnessValues = $derived(cyl.zLevels);

	// OKLCH hue of each ring slot (cyl.D holds wheel angles).
	let ringHues = $derived(cyl.D.map(hueWheel.toHue));

	function colorPoints(cylinder) {
		const hues = cylinder === cyl ? ringHues : cylinder.D.map(hueWheel.toHue);
		return cylinder.points.map((p) => ({
			...p,
			color: oklchToSrgb(p.Z, p.R * chromaGamut.maxChroma(p.Z, hues[p.dIndex]), hues[p.dIndex]),
		}));
	}
	let points = $derived(colorPoints(cyl));
	let themePoints = $derived(themeCyl === cyl ? points : colorPoints(themeCyl));

	// The logo takes its colors from the page's 10-shade palette, by hue
	// counted from color one's (see logo-colors.js).
	let logoRegionColors = $derived.by(() => {
		const hues = Array.from({ length: NUM_D }, (_, dIndex) => ({
			shades: Array.from({ length: THEME_SHADE_COUNT }, (_, shadeIndex) => themePoints[shadeIndex * NUM_D + dIndex].color.hex),
		}));
		const [colorOneIndex, colorTwoIndex] = themeCyl.anchorIndices;
		return logoColors(huesFromColorOne({ hues, colorOneIndex, colorTwoIndex }).hues);
	});

	
	function chromaValuesForHue(dIndex) {
		return points.filter((_, pointIndex) => pointIndex % NUM_D === dIndex).map((point) => point.R);
	}
	let curveDemoChromaValuesPrimary = $derived(chromaValuesForHue(cyl.anchorIndices[0]));
	let curveDemoChromaValuesSecondary = $derived(chromaValuesForHue(cyl.anchorIndices[1]));

	let anchorOneHueIndex = $derived(cyl.anchorIndices[0])
	let anchorTwoHueIndex = $derived(cyl.anchorIndices[1])

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

	let colorTwoOnNearestSlot = $derived(
		chosenColorTwoSlot === undefined || chosenColorTwoSlot === nearestColorTwoSlot,
	);
	// colorhorse's public role names, back to the keys this page's CSS
	// custom properties use (--tip-01 and so on).
	const ROLE_KEYS_BY_PUBLIC_NAME = {
		primary: "Primary",
		secondary: "Secondary",
		tertiary: "Tertiary",
		accent: "Accent",
		success: "Tip",
		info: "Info",
		warning: "Warning",
		danger: "Danger",
	};
	function schemeFor(cylinder, colorTwoOnNearestSlot) {
		const hues = cylinder === cyl ? ringHues : cylinder.D.map(hueWheel.toHue);
		const assigned = assignRoles(hues, cylinder.anchorIndices[0], cylinder.anchorIndices[1], { roleModel, colorTwoOnNearestSlot });
		const roles = {};
		for (const [publicName, hueIndex] of Object.entries(assigned.roles)) roles[ROLE_KEYS_BY_PUBLIC_NAME[publicName]] = hueIndex;
		return { ...assigned, roles };
	}
	let scheme = $derived(schemeFor(cyl, colorTwoOnNearestSlot));
	// The page's own theme needs every role (callouts use --danger-* and so
	// on). The nearest-slot rules give every role a hue, but only on a ring
	// laid out for the nearest slot. So with a chosen slot, the theme keeps
	// the palette's own roles, and each role the slot leaves out takes the
	// hue on this ring closest to where the nearest slot would put it.
	let themeScheme = $derived.by(() => {
		if (colorTwoOnNearestSlot) return scheme;
		const nearestRing = computeCylinderD(NUM_D, anchors);
		const nearestRoles = schemeFor(nearestRing, true).roles;
		const roles = { ...scheme.roles };
		for (const roleName of ROLE_ORDER) {
			if (roleName in roles) continue;
			const targetD = nearestRing.D[nearestRoles[roleName]];
			let closest = 0;
			for (let dIndex = 1; dIndex < NUM_D; dIndex++) {
				if (wheelDistance(cyl.D[dIndex], targetD) < wheelDistance(cyl.D[closest], targetD)) closest = dIndex;
			}
			roles[roleName] = closest;
		}
		return { ...scheme, roles };
	});
	function wheelDistance(a, b) {
		const gap = normalizeHue(a - b);
		return Math.min(gap, 360 - gap);
	}
	// The nearest slot follows the colors as they change; any other slot
	// stays pinned where it was put.
	function setColorTwoSlot(slot) {
		colorTwoSlot = slot === nearestColorTwoSlot ? "nearest" : slot;
	}
	function startNewPalette(colorOne, colorTwo) {
		a1Color = colorOne;
		a2Color = colorTwo;
		roleModel = URL_STATE_VERSION;
	}
	let assignedRoleNames = $derived(ROLE_ORDER.filter((roleName) => roleName in scheme.roles));

	// The palette table's rows: every hue, going round the wheel from
	// Primary, each labelled with whichever roles (if any) use it.
	let paletteRows = $derived(
		Array.from({ length: NUM_D }, (_, wheelStep) => {
			const dIndex = (scheme.roles.Primary + wheelStep) % NUM_D;
			return {
				dIndex,
				roleNames: ROLE_ORDER.filter((roleName) => scheme.roles[roleName] === dIndex),
			};
		}),
	);
	let ringRoleLabels = $derived(
		cyl.D.map((_, dIndex) =>
			ROLE_ORDER.filter((roleName) => scheme.roles[roleName] === dIndex)
				.map(displayRoleName)
				.join(", "),
		),
	);


	let resolvedThemeIsDark = $derived(
		colorSchemeOverride ? colorSchemeOverride === "dark" : systemPrefersDark,
	);

	// All 80 --{role}-{01..10} custom properties, from the CURRENT points +
	// scheme -- this is "the whole 80-color palette as variables," which
	// cylinder-page's own <style> below then uses to CONSTRUCT bg/panel/
	// grid/text/muted/ring via var() formulas (see that style block).
	let paletteVars = $derived.by(() => {
		const vars = {};
		const shadeHex = (dIndex, shadeNum) =>
			themePoints[(shadeNum - 1) * NUM_D + dIndex].color.hex;
		for (const roleName of ROLE_ORDER) {
			const dIndex = themeScheme.roles[roleName];
			for (let shadeNum = 1; shadeNum <= THEME_SHADE_COUNT; shadeNum++) {
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

	let schemeCssText = $derived.by(() => {
		const lines = [
			":root {",
		];
		for (const roleName of assignedRoleNames) {
			const dIndex = scheme.roles[roleName];
			for (let k = 0; k < shadeCount; k++) {
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

	// Same 80 colors again, shaped for buildAseFile(): one named group per
	// role, one named color entry per shade -- Adobe Swatch Exchange import
	// for design tools (Photoshop, Illustrator, Affinity, Figma/Sketch via
	// plugin).
	let aseGroups = $derived.by(() =>
		assignedRoleNames.map((roleName) => {
			const dIndex = scheme.roles[roleName];
			return {
				name: displayRoleName(roleName),
				colors: Array.from({ length: shadeCount }, (_, shadeIndex) => ({
					name: roleName.toLowerCase() + "-" + String(shadeIndex + 1).padStart(2, "0"),
					hex: points[shadeIndex * NUM_D + dIndex].color.hex,
				})),
			};
		}),
	);

	// Same 80 colors as JSON, shaped like getScheme()'s return value from
	// the colorhorse package: role name -> array of hex.
	let paletteObject = $derived.by(() => {
		const result = {};
		for (const roleName of assignedRoleNames) {
			const dIndex = scheme.roles[roleName];
			result[roleName.toLowerCase()] = Array.from(
				{ length: shadeCount },
				(_, shadeIndex) => points[shadeIndex * NUM_D + dIndex].color.hex,
			);
		}
		return result;
	});
	let paletteJsonText = $derived(JSON.stringify(paletteObject, null, 2));

	// Same 80 colors as a plain, human-readable listing for the Text download.
	let paletteTextContent = $derived.by(() => {
		const lines = [];
		for (const roleName of assignedRoleNames) {
			const dIndex = scheme.roles[roleName];
			lines.push(displayRoleName(roleName));
			for (let shadeIndex = 0; shadeIndex < shadeCount; shadeIndex++) {
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
	function downloadPaletteAse() {
		triggerFileDownload("color-horse-palette.ase", buildAseFile(aseGroups), "application/octet-stream");
	}

	// The swatch under the pointer: its row header shows its hex.
	let hoveredSwatch = $state(null);

	// A swatch's copy icon takes another shade of the same hue, half the
	// shades away: lighter on a dark swatch, darker on a light one.
	function iconShadeIndex(shadeIndex, dIndex) {
		const step = Math.ceil(shadeCount / 2);
		return points[shadeIndex * NUM_D + dIndex].Z < 0.623
			? Math.min(shadeCount - 1, shadeIndex + step)
			: Math.max(0, shadeIndex - step);
	}

	// Slider values as shown beside each slider and read out to screen readers.
	function percentText(fraction) {
		return `${Math.round(fraction * 100)}%`;
	}

	function degreesText(degrees) {
		return `${Math.round(degrees)}°`;
	}

	// What was copied last ("css", "json", or a swatch's hex), shown with a
	// check mark for a moment, and the page's one announcement for it.
	let copiedKey = $state(null);
	let copyAnnouncement = $state("");
	let copiedKeyTimer;

	async function copyText(text, key, announcement) {
		try {
			await navigator.clipboard.writeText(text);
		} catch (error) {
			console.error("Failed to copy:", error);
			return;
		}
		copiedKey = key;
		clearTimeout(copiedKeyTimer);
		copiedKeyTimer = setTimeout(() => copiedKey = null, 1500);
		// Cleared first so copying the same thing twice is announced twice.
		copyAnnouncement = "";
		await tick();
		copyAnnouncement = announcement;
	}
	onDestroy(() => clearTimeout(copiedKeyTimer));
</script>

<svelte:head>
	<title>Color Horse · Color Palette Generator</title>
	<meta
		name="description"
		content="Generate a color palette from two colors."
	/>
	<link
		rel="canonical"
		href="https://color.horse/"
	/>
	<!-- Link previews. The image is square, with the logo in the middle so a
	     wide crop keeps it whole; rebuild it with scripts/build-og-image.js. -->
	<meta
		property="og:type"
		content="website"
	/>
	<meta
		property="og:url"
		content="https://color.horse/"
	/>
	<meta
		property="og:site_name"
		content="Color Horse"
	/>
	<meta
		property="og:title"
		content="Color Horse · Color Palette Generator"
	/>
	<meta
		property="og:description"
		content="Generate a color palette from two colors."
	/>
	<meta
		property="og:image"
		content="https://color.horse/og-image.png"
	/>
	<meta
		property="og:image:width"
		content="1200"
	/>
	<meta
		property="og:image:height"
		content="1200"
	/>
	<meta
		property="og:image:alt"
		content="The Color Horse logo: a horse's head in two overlapping circles."
	/>
	<meta
		name="twitter:card"
		content="summary"
	/>
	<link
		rel="icon"
		href="/favicon.ico"
		type="image/x-icon"
	/>
	{@html headerStyles}
</svelte:head>

<svelte:window
	onkeydown={(event) => {
		if (event.key === "Escape" && phoneLayout && settingsOpen) closeSettings();
	}}
/>

<div class="studio">
	<header>
		<h1 class:colorized>Color Horse</h1>
		<nav aria-label="Main">
			<ul>
				{#each TABS as tab (tab.id)}
					<li>
						<a
							href="#{tab.id}"
							aria-current={activeTab === tab.id ? "page" : undefined}
						>{tab.label}</a>
					</li>
				{/each}
			</ul>
		</nav>
	</header>

	<main bind:this={contentArea}>
		<noscript>{@render content.noscript()}</noscript>

		<div
			id="palette"
			hidden={activeTab !== "palette"}
		>
			<section>
				<table style:--shade-count={shadeCount}>
					<thead class="visually-hidden">
						<tr>
							<td></td>
							{#each { length: shadeCount } as _, shadeIndex (shadeIndex)}
								<th scope="col">Shade {shadeIndex + 1}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each paletteRows as paletteRow (paletteRow.dIndex)}
							<tr>
								<!-- The role names, on one line so their spaces survive, and over
								     them the hovered swatch's hex, shown for sighted users only. -->
								<th
									scope="row"
									data-hovered={hoveredSwatch?.dIndex === paletteRow.dIndex || undefined}
								>
									<span>{#each paletteRow.roleNames as roleName, roleIndex (roleName)}{#if roleIndex > 0}, {/if}{#if roleName === "Primary" || roleName === "Secondary"}<strong>{displayRoleName(roleName)}</strong>{:else}{displayRoleName(roleName)}{/if}{/each}</span>
									<span aria-hidden="true">{hoveredSwatch?.dIndex === paletteRow.dIndex ? hoveredSwatch.hex : ""}</span>
								</th>
								{#each { length: shadeCount } as _, shadeIndex (shadeIndex)}
									{@const swatchHex = points[shadeIndex * NUM_D + paletteRow.dIndex].color.hex}
									<td
										style:--color={swatchHex}
										style:--icon-color={points[iconShadeIndex(shadeIndex, paletteRow.dIndex) * NUM_D + paletteRow.dIndex].color.hex}
										onpointerenter={() => hoveredSwatch = { dIndex: paletteRow.dIndex, hex: swatchHex }}
										onpointerleave={() => hoveredSwatch = null}
									>
										<button
											type="button"
											data-copied={copiedKey === swatchHex || undefined}
											onclick={() => copyText(swatchHex, swatchHex, `Copied ${swatchHex}`)}
										>
											{#if copiedKey === swatchHex}
												<Check />
											{:else}
												<Copy />
											{/if}
											<span class="visually-hidden">Copy {swatchHex}</span>
										</button>
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</section>
		</div>

		<div
			id="method"
			hidden={activeTab !== "method"}
		>
			<h2>Method</h2>

			<section>
				{@render content.how()}
			</section>

			<section>
				<h3>Hue</h3>
				<figure>
					<figcaption>{@render content.hue()}</figcaption>
					<CircleDemo
						points={cyl.D}
						hues={ringHues}
						chroma={Math.min(anchors[0].C, chromaGamut.maxChroma(anchors[0].L, anchors[0].H))}
						lightness={anchors[0].L}
						anchorOneIndex={anchorOneHueIndex}
						anchorTwoIndex={anchorTwoHueIndex}
						labels={ringRoleLabels}
					/>
				</figure>
				{@render content.spread()}
				{@render content.wheel()}
			</section>

			<section>
				{@render content.shades()}
			</section>

			<section>
				<h3>Lightness</h3>
				<figure>
					<figcaption>{@render content.lightness()}</figcaption>
					<LineDemo
						points={lineDemoLightnessValues}
						minLightness={minL}
						maxLightness={maxL}
						anchorOneIndex={anchorOneLightnessIndex}
						anchorTwoIndex={anchorTwoLightnessIndex}
					/>
				</figure>
			</section>

			<section>
				{@render content.chroma()}
			</section>

			<section>
				<h3>Saturation</h3>
				<figure>
					<figcaption>{@render content.saturation()}</figcaption>
					<RadarDemo
						hueDegrees={cyl.D}
						hues={ringHues}
						{gamut}
						rings={radarRings}
					/>
				</figure>
				{@render content.gamut()}
			</section>

			<section>
				{@render content.desaturation()}
			</section>

			<section>
				<h3>Fade</h3>
				<figure>
					<figcaption>{@render content.fade()}</figcaption>
					<CurveDemo
						points={curveDemoChromaValuesPrimary}
						primaryColor={a1Color}
						anchorIndex={-1}
						title="Primary color saturation across the shades"
					/>
					<CurveDemo
						points={curveDemoChromaValuesSecondary}
						primaryColor={a2Color}
						anchorIndex={-1}
						title="Secondary color saturation across the shades"
					/>
				</figure>
			</section>

			<section>
				{@render content.oklch()}
			</section>

			<section>
				{@render content.selection()}
			</section>
		</div>

		<div
			id="space"
			hidden={activeTab !== "space"}
		>
			<section>
				<figure>
					<svg
						viewBox={`${COLORSPACE_FRAME.x} ${COLORSPACE_FRAME.y} ${COLORSPACE_FRAME.width} ${COLORSPACE_FRAME.height}`}
						width={COLORSPACE_FRAME.width}
						height={COLORSPACE_FRAME.height}
						role="img"
						data-dragging={viewDrag ? "" : undefined}
						{@attach turnOnWheel}
						onpointerdown={startViewDrag}
						onpointermove={moveViewDrag}
						onlostpointercapture={() => viewDrag = null}
					>
						<title>The palette's colors in three dimensions</title>
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
					<figcaption>
						<dl>
							<div>
								<dt>Height</dt>
								<dd>Lightness</dd>
							</div>
							<div>
								<dt>Angle</dt>
								<dd>Hue</dd>
							</div>
							<div>
								<dt>Radius</dt>
								<dd>Saturation</dd>
							</div>
						</dl>
					</figcaption>
				</figure>
				<fieldset aria-label="View">
					<label>
						<span>Rotate <output aria-hidden="true">{degreesText(azimuth)}</output></span>
						<input
							type="range"
							min="0"
							max="360"
							step="1"
							bind:value={azimuth}
							aria-valuetext={degreesText(azimuth)}
						/>
					</label>
					<label>
						<span>Tilt <output aria-hidden="true">{degreesText(elevation)}</output></span>
						<input
							type="range"
							min="-80"
							max="80"
							step="1"
							bind:value={elevation}
							aria-valuetext={degreesText(elevation)}
						/>
					</label>
				</fieldset>
			</section>
		</div>

		<div
			id="example"
			hidden={activeTab !== "example"}
		>
			<section>
				<PostDemo />
			</section>
		</div>

		<div
			id="about"
			hidden={activeTab !== "about"}
		>
			<h2>About</h2>

			<section>
				<h3>Creator</h3>
				<Man color={paletteVars["--accent-07"]} />
				{@render content.creator()}
			</section>

			<section>
				<h3>Module</h3>
				{@render content.module()}
			</section>

			<section>
				<h3>Credits</h3>
				{@render content.credits()}
			</section>
		</div>

	</main>

	<aside aria-label="Settings">
		<header>
			<button
				type="button"
				aria-expanded={settingsOpen}
				aria-controls="settings"
				bind:this={settingsButton}
				onclick={tapHandle}
				onpointerdown={startHandleSwipe}
				onpointermove={moveHandleSwipe}
				onpointerup={endHandleSwipe}
				onpointercancel={() => handleSwipe = null}
			><span class="visually-hidden">Settings</span></button>
		</header>

		<!-- The title tops the panel on wide screens; on phones, where the
		     panel is a drawer, it stays in the page header instead. -->
		<h1 class:colorized>Color Horse</h1>

		<div>
			<LogoMark
				{...logoRegionColors}
				decorative
				square
			/>
			{@render content.intro()}
		</div>

		<form
			id="settings"
			tabindex="-1"
			bind:this={settingsForm}
			inert={phoneLayout && !settingsOpen}
			onsubmit={(event) => event.preventDefault()}
		>
			{#if roleModel < URL_STATE_VERSION}
				<fieldset>
					<legend>Roles</legend>
					{@render content.roleModel()}
					<button
						type="button"
						onclick={() => roleModel = URL_STATE_VERSION}
					>
						Update Roles
					</button>
				</fieldset>
			{/if}

			<fieldset>
				<legend>Colors</legend>
				<label>Primary
					<input
						type="color"
						value={a1Color}
						oninput={(event) => {
							if (HEX_COLOR_PATTERN.test(event.currentTarget.value)) a1Color = event.currentTarget.value;
						}}
					/>
				</label>
				<label>Secondary
					<input
						type="color"
						value={a2Color}
						oninput={(event) => {
							if (HEX_COLOR_PATTERN.test(event.currentTarget.value)) a2Color = event.currentTarget.value;
						}}
					/>
				</label>
				<menu>
					<li>
						<button
							type="button"
							onclick={() => startNewPalette(randomAnchorHex(), randomAnchorHex())}
						>
							<Shuffle />
							Shuffle
						</button>
					</li>
					<li>
						<button
							type="button"
							onclick={swapColors}
						>
							<Swap />
							Swap
						</button>
					</li>
					<li>
						<button
							type="button"
							aria-pressed={resolvedThemeIsDark}
							onclick={toggleColorScheme}
						>
							<Contrast />
							Dark Mode
						</button>
					</li>
				</menu>
			</fieldset>

			<fieldset>
				<legend>Hue</legend>
				<label>
					<span>Primary Hue <output aria-hidden="true">{degreesText(hueOne)}</output></span>
					<input
						type="range"
						min="0"
						max="360"
						bind:value={hueOne}
						aria-valuetext={degreesText(hueOne)}
						oninput={() => hueOneAdjusted = true}
					/>
				</label>
				<label>
					<span>Secondary Hue <output aria-hidden="true">{degreesText(hueTwo)}</output></span>
					<input
						type="range"
						min="0"
						max="360"
						bind:value={hueTwo}
						aria-valuetext={degreesText(hueTwo)}
						oninput={() => hueTwoAdjusted = true}
					/>
				</label>
				<label>Spread
					<input
						type="range"
						min="1"
						max={NUM_D - 1}
						step="1"
						value={chosenColorTwoSlot ?? nearestColorTwoSlot}
						aria-valuetext={`${(chosenColorTwoSlot ?? nearestColorTwoSlot) + 1}`}
						disabled={anchorsShareHue}
						oninput={(event) => setColorTwoSlot(Number(event.currentTarget.value))}
					/>
					<ol aria-hidden="true">
						{#each { length: NUM_D - 1 } as _, slotIndex (slotIndex)}
							<li>
								{#if slotIndex + 1 === nearestColorTwoSlot}
									<strong title="Default (nearest slot)">{slotIndex + 2}</strong>
								{:else}
									{slotIndex + 2}
								{/if}
							</li>
						{/each}
					</ol>
				</label>
				<label>Color Wheel
					<select
						value={wheel}
						onchange={(event) => setWheel(event.currentTarget.value)}
					>
						<option value="rgb">RGB</option>
						<option value="ryb">RYB</option>
					</select>
				</label>
				<button
					type="button"
					onclick={resetHue}
				>Reset</button>
			</fieldset>

			<fieldset>
				<legend>Lightness</legend>
				<label>Shades
					<input
						type="number"
						min={SHADE_COUNT_RANGE[0]}
						max={SHADE_COUNT_RANGE[1]}
						step="1"
						value={shadeCount}
						oninput={(event) => {
							const typedCount = Number(event.currentTarget.value);
							if (Number.isInteger(typedCount) && typedCount >= SHADE_COUNT_RANGE[0] && typedCount <= SHADE_COUNT_RANGE[1]) {
								shadeCount = typedCount;
							}
						}}
						onchange={(event) => {
							const typedCount = Math.round(Number(event.currentTarget.value));
							if (Number.isFinite(typedCount)) {
								shadeCount = Math.min(Math.max(typedCount, SHADE_COUNT_RANGE[0]), SHADE_COUNT_RANGE[1]);
							}
							event.currentTarget.value = String(shadeCount);
						}}
					/>
				</label>
				<label>
					<span>Primary Lightness <output aria-hidden="true">{percentText(lightnessOne)}</output></span>
					<input
						type="range"
						min={darkestShadeCeiling}
						max={lightestShadeFloor}
						step="0.001"
						bind:value={lightnessOne}
						aria-valuetext={percentText(lightnessOne)}
						oninput={() => lightnessOneAdjusted = true}
					/>
				</label>
				<label>
					<span>Secondary Lightness <output aria-hidden="true">{percentText(lightnessTwo)}</output></span>
					<input
						type="range"
						min={darkestShadeCeiling}
						max={lightestShadeFloor}
						step="0.001"
						bind:value={lightnessTwo}
						aria-valuetext={percentText(lightnessTwo)}
						oninput={() => lightnessTwoAdjusted = true}
					/>
				</label>
				<label>
					<span>Darkest Shade <output aria-hidden="true">{percentText(minL)}</output></span>
					<input
						type="range"
						min="0"
						max={darkestShadeCeiling}
						step="0.001"
						bind:value={minL}
						aria-valuetext={percentText(minL)}
					/>
				</label>
				<label>
					<span>Lightest Shade <output aria-hidden="true">{percentText(maxL)}</output></span>
					<input
						type="range"
						min={lightestShadeFloor}
						max="1"
						step="0.001"
						bind:value={maxL}
						aria-valuetext={percentText(maxL)}
					/>
				</label>
				<label>
					<span>Contrast <output aria-hidden="true">{percentText(contrast)}</output></span>
					<input
						type="range"
						min="0"
						max="1"
						step="0.01"
						bind:value={contrast}
						aria-valuetext={percentText(contrast)}
					/>
				</label>
				<button
					type="button"
					onclick={resetLightness}
				>Reset</button>
			</fieldset>

			<fieldset>
				<legend>Saturation</legend>
				<label>
					<span>Primary Saturation <output aria-hidden="true">{percentText(chromaOne)}</output></span>
					<input
						type="range"
						min="0"
						max="1"
						step="0.001"
						bind:value={chromaOne}
						aria-valuetext={percentText(chromaOne)}
						oninput={() => chromaOneAdjusted = true}
					/>
				</label>
				<label>
					<span>Secondary Saturation <output aria-hidden="true">{percentText(chromaTwo)}</output></span>
					<input
						type="range"
						min="0"
						max="1"
						step="0.001"
						bind:value={chromaTwo}
						aria-valuetext={percentText(chromaTwo)}
						oninput={() => chromaTwoAdjusted = true}
					/>
				</label>
				<label>
					<span>Minimum Saturation <output aria-hidden="true">{percentText(minChroma)}</output></span>
					<input
						type="range"
						min="0.01"
						max={minChromaSliderMax}
						step="0.01"
						bind:value={minChroma}
						aria-valuetext={percentText(minChroma)}
						onfocus={captureMinChromaBeforeFadeTouch}
					/>
				</label>
				<label>Gamut
					<select bind:value={gamut}>
						<option value="srgb">Screen (sRGB)</option>
						<option value="print">Print (FOGRA39)</option>
					</select>
				</label>
				<button
					type="button"
					onclick={() => {
						resetSaturation();
						resetFade();
					}}
				>Reset</button>
			</fieldset>

			<fieldset>
				<legend>Copy</legend>
				<menu>
					<li><button type="button" onclick={() => copyText(schemeCssText, "css", "Copied CSS")}>{#if copiedKey === "css"}<Check />{:else}<Copy />{/if}CSS</button></li>
					<li><button type="button" onclick={() => copyText(paletteJsonText, "json", "Copied JSON")}>{#if copiedKey === "json"}<Check />{:else}<Copy />{/if}JSON</button></li>
				</menu>
			</fieldset>

			<fieldset>
				<legend>Download</legend>
				<menu>
					<li><button type="button" onclick={downloadPaletteText}><Download />Text</button></li>
					<li><button type="button" onclick={downloadPaletteAse}><Download />ASE</button></li>
				</menu>
			</fieldset>
		</form>

		<footer>
			<p>© Sam Littlefair, 2026</p>
		</footer>
	</aside>

	<p
		role="status"
		class="visually-hidden"
	>{copyAnnouncement}</p>
</div>

<style>
	/* Helvetica throughout: a touch tighter for text, wider for small
	   capitals (the legends and row labels set their own). */
	.studio {
		--min-text: 16px;
		font-family: var(--heading-font);
		letter-spacing: -0.011em;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		height: 100dvh;
		width: 100%;
		max-width: none;
		color: var(--text);
	}

	/* Form controls don't inherit type on their own. Code keeps its
	   natural spacing. */
	.studio :global(:is(input, select, textarea, button, output)) {
		font-family: inherit;
		letter-spacing: inherit;
	}

	.studio :global(:is(pre, code)) {
		letter-spacing: 0;
	}

	/* A themed focus ring for every control. */
	.studio :global(:focus-visible) {
		outline: 3px solid var(--outline);
		outline-offset: 2px;
	}

	/* Controls */

	aside {
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		font-size: var(--min-text);
		background: var(--settings-background);
		border-left: 1px solid var(--border);
		scrollbar-width: thin;
		scrollbar-color: var(--border) transparent;
	}

	/* The drawer handle, on phones only. */
	aside > header {
		display: none;
	}

	/* The logo, centered, over the intro. */
	aside > div {
		display: grid;
		gap: 1.5rem;
		padding: 2.5rem 1.5rem 1rem;

		:global(svg) {
			justify-self: center;
			width: 14rem;
			height: auto;
		}

		:global(p) {
			margin: 0;
		}
	}

	aside > footer {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		margin-top: auto;
		padding: 2.5rem 1.25rem 3.5rem;
		color: var(--muted);

		p {
			margin: 0;
		}
	}

	form {
		display: flex;
		flex-direction: column;
		padding: 1rem 1.5rem 0;
	}

	fieldset {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		min-inline-size: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}

	form > fieldset {
		padding-block: 1.1rem;
		border-top: 1px solid var(--border);

		&:first-child {
			border-top: 0;
		}
	}

	/* Floated, so it lays out like any other child instead of sitting on
	   the fieldset's border. */
	legend {
		float: left;
		width: 100%;
		padding: 0;
		font-size: var(--min-text);
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		font-size: var(--min-text);
		font-weight: 500;
	}

	input[type="range"] {
		width: 100%;
		margin: 0;
		accent-color: var(--ring);
	}

	label > span {
		display: flex;
		justify-content: space-between;
		gap: 1ch;

		output {
			font-variant-numeric: tabular-nums;
			color: var(--muted);
		}
	}

	/* Slot numbers under the slider, each centred on its thumb position. */
	label > ol {
		display: flex;
		justify-content: space-between;
		margin: 0;
		padding: 0 8px;
		list-style: none;
		font-size: var(--min-text);
		font-variant-numeric: tabular-nums;
		color: var(--muted);

		li {
			display: flex;
			justify-content: center;
			width: 0;
		}

		strong {
			padding: 0 0.35em;
			border-radius: 1em;
			background: var(--ring);
			color: var(--main-background);
		}
	}

	/* The two color pickers side by side. */
	fieldset:has(> label > input[type="color"]) {
		display: grid;
		grid-template-columns: 1fr 1fr;

		> label {
			justify-content: space-between;
			white-space: nowrap;
		}

		> legend,
		> menu {
			grid-column: 1 / -1;
		}
	}

	input[type="color"] {
		width: 100%;
		height: 2.75rem;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: none;
		cursor: pointer;

		&::-webkit-color-swatch-wrapper {
			padding: 0;
		}

		&::-webkit-color-swatch {
			border: 0;
			border-radius: 7px;
		}

		&::-moz-color-swatch {
			border: 0;
			border-radius: 7px;
		}
	}

	select,
	input[type="number"] {
		width: 100%;
		box-sizing: border-box;
		padding: 0.45em 0.6em;
		font: inherit;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--main-background);
		color: var(--text);
	}

	/* Full-width buttons, one per row. */
	menu {
		display: grid;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;

		button {
			width: 100%;
		}

	}

	button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.6ch;
		padding: 0.55em 0.8em;
		font-family: inherit;
		font-size: var(--min-text);
		font-weight: 600;
		background: var(--background-button);
		border: var(--border-button);
		border-radius: 6px;
		color: var(--text-button);
		cursor: pointer;

		&:hover {
			border-color: var(--ring);
		}

		:global(svg) {
			flex-shrink: 0;
			height: 1.2em;
			width: auto;
		}

		:global(path) {
			fill: var(--icon-button);
		}
	}

	/* Reset and Update: full width like the rest, but quieter. */
	fieldset > button {
		background: transparent;
		border: 1px solid var(--border);
		color: var(--text);
	}

	/* Scroll bars in the theme's own colors. */
	:global(html:has(.studio)) {
		scrollbar-color: var(--border) var(--content-background);
	}

	:global(.studio pre) {
		scrollbar-width: thin;
		scrollbar-color: var(--border) transparent;
	}

	@supports not (scrollbar-color: auto) {
		:global(html:has(.studio) ::-webkit-scrollbar),
		:global(html:has(.studio)::-webkit-scrollbar) {
			width: 10px;
			height: 10px;
		}

		:global(html:has(.studio) ::-webkit-scrollbar-track),
		:global(html:has(.studio)::-webkit-scrollbar-track) {
			background: transparent;
		}

		:global(html:has(.studio) ::-webkit-scrollbar-thumb),
		:global(html:has(.studio)::-webkit-scrollbar-thumb) {
			background: var(--border);
			border: 2px solid transparent;
			border-radius: 10px;
			background-clip: padding-box;
		}
	}

	/* Content */

	/* The content scrolls on its own, so its scroll bar sits beside the
	   settings. Everything in it shares one centred column. */
	main {
		/* Holds the visually hidden text, so it scrolls with the content
		   instead of stretching the page. */
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr) min(100%, 60ch) minmax(0, 1fr);
		align-content: start;
		gap: var(--large-gap) 0;
		min-height: 0;
		margin: 0;
		padding: 3rem 2rem 6rem;
		box-sizing: border-box;
		overflow-x: hidden;
		overflow-y: auto;
		background: var(--content-background);
		scrollbar-color: var(--border) var(--content-background);
		container-type: inline-size;
		/* Text grows with the window, within 1.25x of its minimum. It's set
		   here rather than on each child so that 60ch is the same column for
		   all of them, the header included. (An element can't measure its
		   own container, so this follows the window rather than main.) */
		font-size: clamp(1.6rem, 1.2rem + 0.75vi, 2rem);

		/* Everything sits in the middle column. Each tab's wrapper steps out
		   of the way, so its contents lay out as main's own children. */
		> *,
		> div > * {
			grid-column: 2;
			min-width: 0;
			box-sizing: border-box;
		}

		> div:not([hidden]) {
			display: contents;
		}
	}

	/* The title and the menu: a bar across the top of the whole app, over
	   the content and the settings, outside both scroll areas. The current
	   tab takes the content's color, so it opens onto the page. On narrow
	   screens the tabs scroll sideways rather than wrap. */
	/* A flex column: the title and the tabs share the bar's side padding, so
	   they start at the same edge, and the space above the title (the bar's
	   top padding) equals the space between it and the tabs (the gap). The
	   title is trimmed to its capitals and baseline, so those are the
	   spaces you see. */
	/* The title grows to fill its width (where text-fit is supported),
	   up to 36rem across and three times its base size. */
	.studio :is(header, aside) > h1 {
		box-sizing: border-box;
		width: 100%;
		max-width: 36rem;
		margin: 0;
		font-family: var(--heading-font);
		font-size: 3rem;
		text-fit: grow 300%;
		font-weight: 700;
		letter-spacing: -0.04em;
		line-height: 1;
		color: var(--title);
		text-box-trim: trim-both;
		text-box-edge: cap alphabetic;
		opacity: 0;
		transition: opacity 0.4s;

		&.colorized {
			opacity: 1;
		}
	}

	/* Wide screens: the panel runs the full height on the left, and the
	   header (just the tabs) sits over the content. */
	@media (width >= 800px) {
		.studio {
			grid-template-columns: 390px minmax(0, 1fr);
		}

		.studio > header {
			grid-column-start: 2;
			grid-row: 1;

			> h1 {
				display: none;
			}
		}

		.studio > main {
			grid-column: 2;
			grid-row: 2;
		}

		aside {
			grid-column: 1;
			grid-row: 1 / -1;
			border-right: 1px solid var(--border);
			border-left: 0;

			> h1 {
				padding: 2rem 1.5rem 0;
			}
		}
	}

	@media (width < 800px) {
		aside > h1 {
			display: none;
		}
	}

	.studio > header {
		--bar-inline: 2.8rem;
		--title-space: 2rem;
		z-index: 2;
		display: flex;
		flex-direction: column;
		flex-wrap: nowrap;
		align-items: stretch;
		gap: var(--title-space);
		min-width: 0;
		padding: var(--title-space) var(--bar-inline) 0;
		font-size: var(--min-text);
		background: var(--nav-background);
		border-bottom: 1px solid var(--border);

		/* The global stylesheet boxes a header's nav (side padding, border,
		   background); here it's just the row of tabs. */
		nav {
			width: auto;
			padding: 0;
			background: none;
			border: 0;
			border-radius: 0;
		}
	}

	/* Line-indicator tabs: plain labels over the bar's hairline, and a line
	   under the current tab. The line slides between tabs where anchor
	   positioning is supported; elsewhere it's the current tab's border. */
	.studio > header ul {
		position: relative;
		display: flex;
		flex-wrap: nowrap;
		justify-content: safe center;
		gap: 1.75em;
		margin: 0;
		padding: 0;
		overflow-x: auto;
		overflow-y: hidden;
		list-style: none;
		scrollbar-width: thin;
		scrollbar-color: var(--nav-text) transparent;
	}

	.studio > header a {
		display: block;
		padding: 0.6em 0 0.75em;
		font-weight: 600;
		white-space: nowrap;
		color: var(--nav-text);
		text-decoration: none;

		&:hover,
		&[aria-current="page"] {
			color: var(--nav-text-hover);
		}
	}

	.studio > header li:has(> [aria-current="page"]) {
		anchor-name: --current-tab;
	}

	@supports (position-anchor: --current-tab) {
		.studio > header ul::before {
			content: "";
			position: absolute;
			position-anchor: --current-tab;
			inset-block-start: calc(anchor(bottom) - 3px);
			inset-inline-start: anchor(left);
			inset-inline-end: anchor(right);
			block-size: 3px;
			background: var(--nav-indicator);
		}

		@media (prefers-reduced-motion: no-preference) {
			.studio > header ul::before {
				transition: inset 0.2s;
			}
		}
	}

	@supports not (position-anchor: --current-tab) {
		.studio > header a[aria-current="page"] {
			box-shadow: inset 0 -3px 0 var(--nav-indicator);
		}
	}

	/* The palette tab fills the content area: one row, the whole height,
	   for the table to grow into. */
	main:has(> #palette:not([hidden])) {
		grid-template-rows: minmax(0, 1fr);
		padding-bottom: 3rem;

		> #palette > section {
			min-height: 0;
		}
	}

	/* A spacer above the tabs that scroll. */
	main:has(> :is(#method, #example, #about):not([hidden])) {
		padding-top: 6rem;
	}

	/* The space tab fills the content area too, and the 3D view takes the
	   height left after its caption and controls. Its view box keeps the
	   drawing in proportion inside whatever box it gets. */
	main:has(> #space:not([hidden])) {
		grid-template-rows: minmax(0, 1fr);
		padding-bottom: 3rem;

		> #space > section {
			min-height: 0;
		}
	}

	/* The key: what each direction in the model means. */
	#space figcaption dl {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5em 2em;
		margin: 0;
		font-size: var(--min-text);
		color: var(--muted);

		div {
			display: flex;
			align-items: baseline;
			gap: 0.5em;
		}

		dt {
			font-weight: 700;
			color: var(--text);
		}

		dd {
			margin: 0;
		}
	}

	#space figure {
		flex: 1;
		min-height: 0;
	}

	/* Drag to turn: the graphic takes the whole gesture on a desktop. */
	#space svg {
		flex: 1 1 0;
		width: 100%;
		min-height: 0;
		cursor: grab;
		touch-action: none;
		-webkit-user-select: none;
		user-select: none;

		&[data-dragging] {
			cursor: grabbing;
		}
	}

	/* The colorspace view controls, under the graphic. */
	section > fieldset {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem 2rem;
	}

	section,
	figure,
	figcaption {
		display: flex;
		flex-direction: column;
		gap: 1lh;
	}

	figcaption {
		margin: 0;
		font-style: normal;
	}

	/* The tab's title, then its sections' headings. */
	main > div > h2 {
		margin: 0;
		font-family: var(--heading-font);
		font-size: 2.6em;
		font-weight: 700;
		letter-spacing: -0.04em;
		line-height: 1;
		color: var(--heading);
	}

	section > :global(h3) {
		padding-bottom: 0.3em;
		font-family: var(--heading-font);
		font-size: 1.7em;
		font-weight: 700;
		letter-spacing: -0.03em;
		color: var(--heading);
		border-bottom: 1px solid var(--border);
	}

	:global(h3:before) {
		display: none;
	}

	/* Callouts in the copy. */
	main :global(aside h3:has(~ h3)) {
		display: none;
	}

	main :global(aside h3) {
		font-family: var(--heading-font);
		font-size: 1.6em;
		font-weight: 700;
		letter-spacing: -0.03em;
	}

	main :global(a) {
		color: var(--link);
	}

	/* Diagrams scale down to fit; button icons and the logo keep their size. */
	main :global(svg:not(button svg, header svg)) {
		display: block;
		max-width: 100%;
		height: auto;
	}

	/* Diagrams sit centred under their captions. */
	figure > :global(div[class]) {
		justify-content: center;
		align-items: center;
	}

	figure > svg {
		align-self: center;
	}

	:global(.studio :is(pre, code)) {
		font-size: var(--min-text);
	}

	/* The table fills the palette tab, and the swatches stretch to share it.
	   Every row gets the same share, labels included, so the rows stay
	   evenly spaced however squeezed they get. It scrolls sideways when ten
	   swatches don't fit across. */
	table {
		flex: 1;
		display: grid;
		grid-template-columns: min-content repeat(var(--shade-count), minmax(2.25rem, 1fr));
		grid-auto-rows: minmax(0, 1fr);
		min-height: 0;
		width: 100%;
		overflow-x: auto;
		text-transform: uppercase;
		scrollbar-width: thin;
		scrollbar-color: var(--border) transparent;
	}

	/* Wide screens: the palette tab spans the whole content area, and each
	   swatch column grows only as wide as a row is tall, so with room to
	   spare the swatches are square and the table sits centered. The
	   section is a size container, so 100cqb is its height; the twelve
	   rows, one per hue, share it. This comes after the base
	   table rule so that its columns win. */
	@media (width >= 800px) {
		main > #palette > section {
			grid-column: 1 / -1;
			container-type: size;
		}

		table {
			--square: calc(100cqb / 12);
			grid-template-columns: min-content repeat(var(--shade-count), minmax(2.25rem, var(--square)));
			justify-content: center;
		}
	}

	tbody,
	tr {
		display: contents;
	}

	th {
		position: sticky;
		left: 0;
		z-index: 1;
		display: grid;
		grid-template-areas: "label";
		align-items: center;
		justify-items: end;
		padding-right: 0.5em;
		font-size: 0.85em;
		font-weight: 400;
		letter-spacing: 0.08em;
		line-height: 1;
		color: var(--muted);
		white-space: nowrap;
		text-align: right;
		background: var(--content-background);

		/* Both in one place: the column keeps the wider one's width. The
		   names stay readable to screen readers while the hex shows. */
		> span {
			grid-area: label;
		}

		> span[aria-hidden] {
			font-family: Menlo, Consolas, Monaco, "Liberation Mono", "Lucida Console", monospace;
			font-weight: 700;
			letter-spacing: 0;
		}

		&[data-hovered] > span:not([aria-hidden]) {
			opacity: 0;
		}
	}

	/* Square-cornered swatches, except the palette's own four corners. */
	td {
		display: grid;
		padding: 0;
		background: var(--color);
		border: 0;
		border-radius: 0;
	}

	tr:first-child > td:nth-child(2) {
		border-start-start-radius: 5px;
	}

	tr:first-child > td:last-child {
		border-start-end-radius: 5px;
	}

	tr:last-child > td:nth-child(2) {
		border-end-start-radius: 5px;
	}

	tr:last-child > td:last-child {
		border-end-end-radius: 5px;
	}

	td {
		/* The icon shows on hover or focus, and stays as a check once copied.
		   Its color is another shade of the swatch's hue. */
		button {
			padding: 0;
			background: transparent;
			border: 0;
			border-radius: inherit;
			color: var(--icon-color);

			:global(svg) {
				opacity: 0;
				transition: opacity 0.15s;
			}

			:global(path) {
				fill: currentColor;
			}

			&:hover :global(svg),
			&:focus-visible :global(svg),
			&[data-copied] :global(svg) {
				opacity: 1;
			}
		}
	}

	:global(pre) {
		position: relative;
		max-width: 100%;
		max-height: 10lh;
		overflow: auto;
		margin-top: 16px;
		padding: 14px 16px;
		background: var(--code-background);
		border-radius: 8px;
	}

	/* Phones: the settings become a drawer along the bottom. */
	@media (width < 800px) {
		.studio {
			--drawer-handle: 5.6rem;
			--min-text: 14px;
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto;
			height: auto;
		}

		.studio > header {
			--bar-inline: 1.25rem;
			position: sticky;
			top: 0;
		}

		main:has(> :is(#palette, #space):not([hidden])) {
			grid-template-rows: none;
		}

		#space svg {
			flex: none;
			height: auto;
			touch-action: pan-y;
		}

		table {
			grid-auto-rows: 2.5rem;
		}

		main {
			height: auto;
			overflow-y: visible;
			padding: 2rem 1.25rem calc(var(--drawer-handle) + 4rem);
		}

		aside {
			position: fixed;
			inset: auto 0 0;
			z-index: 10;
			height: auto;
			max-height: 45dvh;
			border-left: 0;
			border-radius: 1rem 1rem 0 0;
			box-shadow: 0 -0.25rem 1.5rem rgb(0 0 0 / 0.18);
			transform: translateY(calc(100% - var(--drawer-handle)));
			transition: transform 0.3s ease;

			&:has(> header > button[aria-expanded="true"]) {
				transform: none;
			}

			/* Closed, it doesn't scroll: a swipe on the handle opens it. */
			&:not(:has(> header > button[aria-expanded="true"])) {
				overflow: hidden;
			}
		}

		aside > header {
			position: sticky;
			top: 0;
			z-index: 1;
			display: flex;
			align-items: center;
			height: var(--drawer-handle);
			padding-inline: 1.25rem;
			background: var(--settings-background);
			box-sizing: border-box;
			padding-block: 0;
			border-radius: inherit;

			/* Grab bar: the handle's only mark. The whole handle is the button. */
			&::before {
				content: "";
				position: absolute;
				top: 50%;
				left: 50%;
				width: 4.8rem;
				height: 5px;
				border-radius: 3px;
				background: var(--border);
				transform: translate(-50%, -50%);
				pointer-events: none;
			}

			/* The handle takes the gesture itself, so the page doesn't scroll
			   under a swipe. */
			button {
				flex: 1;
				align-self: stretch;
				padding: 0;
				background: transparent;
				border: 0;
				touch-action: none;
			}
		}
	}

	@media (prefers-reduced-motion: reduce) {
		aside {
			transition: none;
		}
	}
</style>
