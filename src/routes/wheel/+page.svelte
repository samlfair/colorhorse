<script>
	import { computeCylinderD } from "$lib/cylinder-deform.js";
	import { normalizeHue } from "$lib/hue-deform.js";
	import { MIN_GAP } from "$lib/tension-ring.js";
	import { hexToOklch } from "$lib/oklch.js";
	import { randomAnchorHex, HEX_COLOR_PATTERN } from "$lib/random-color.js";
	import { getWheel, getGamut, assignRoles } from "colorhorse";
	import CircleDemo from "$lib/CircleDemo.svelte";
	import Shuffle from "$lib/Shuffle.svelte";

	const HUE_COUNT = 12;
	const ROLE_ORDER = ["primary", "secondary", "tertiary", "accent", "success", "info", "warning", "danger"];
	const VARIANTS = [
		{ key: "rainbow", band: "rainbow", heading: "Rainbow band", marked: true },
		{ key: "proportional", band: "proportional", heading: "Proportional segments" },
		{ key: "equal", band: "equal", heading: "Equal segments" },
		{ key: "roles-only", band: "equal", heading: "Roles only, equal segments", rolesOnly: true },
	];

	let colorOne = $state("#ff0000");
	let colorTwo = $state("#0000ff");
	let wheelName = $state("rgb");
	// "nearest", or how many slots past the primary the secondary sits.
	let colorTwoSlot = $state("nearest");

	let hueWheel = $derived(getWheel(wheelName));
	const chromaGamut = getGamut("srgb");

	// The same anchors and ring as the home page.
	let anchors = $derived(
		[colorOne, colorTwo].map((hex) => {
			const { L, C, H } = hexToOklch(hex);
			return { D: hueWheel.toWheel(H), L, C, H };
		}),
	);
	// Spread works as on the home page: the nearest slot follows the
	// colors, and equal hues fall back to it, having no arc to spread over.
	let nearestColorTwoSlot = $derived.by(() => {
		const [anchorOneIndex, anchorTwoIndex] = computeCylinderD(HUE_COUNT, anchors).anchorIndices;
		return (anchorTwoIndex - anchorOneIndex + HUE_COUNT) % HUE_COUNT;
	});
	let anchorsShareHue = $derived.by(() => {
		const gap = normalizeHue(anchors[1].D - anchors[0].D);
		return gap < MIN_GAP || gap > 360 - MIN_GAP;
	});
	let chosenColorTwoSlot = $derived(colorTwoSlot === "nearest" || anchorsShareHue ? undefined : colorTwoSlot);
	let spread = $derived(chosenColorTwoSlot ?? nearestColorTwoSlot);
	let ring = $derived(computeCylinderD(HUE_COUNT, anchors, chosenColorTwoSlot));
	let hues = $derived(ring.D.map(hueWheel.toHue));
	// Each hue's roles, as on the home page's wheel.
	let roles = $derived(
		assignRoles(hues, ring.anchorIndices[0], ring.anchorIndices[1], { colorTwoOnNearestSlot: chosenColorTwoSlot === undefined }).roles,
	);
	let roleLabels = $derived(
		ring.D.map((_, hueIndex) =>
			ROLE_ORDER.filter((roleName) => roles[roleName] === hueIndex)
				.map((roleName) => roleName[0].toUpperCase() + roleName.slice(1))
				.join(", "),
		),
	);

	// The ring a wheel draws: every hue, or with rolesOnly just the hues
	// that have a role, in ring order.
	function wheelRing(variant) {
		const kept = ring.D.map((_, hueIndex) => hueIndex).filter((hueIndex) => !variant.rolesOnly || roleLabels[hueIndex]);
		return {
			points: kept.map((hueIndex) => ring.D[hueIndex]),
			hues: kept.map((hueIndex) => hues[hueIndex]),
			labels: kept.map((hueIndex) => roleLabels[hueIndex]),
			anchorOneIndex: kept.indexOf(ring.anchorIndices[0]),
			anchorTwoIndex: kept.indexOf(ring.anchorIndices[1]),
		};
	}
	let chroma = $derived(Math.min(anchors[0].C, chromaGamut.maxChroma(anchors[0].L, anchors[0].H)));
</script>

<svelte:head>
	<title>Hue Wheel · Color Horse</title>
</svelte:head>

<div
	class="wheel-page"
	style:--primary-05={colorOne}
>
	<h1>Hue Wheel</h1>

	<form onsubmit={(event) => event.preventDefault()}>
		<label>
			Primary
			<input
				type="color"
				value={colorOne}
				oninput={(event) => {
					if (HEX_COLOR_PATTERN.test(event.currentTarget.value)) colorOne = event.currentTarget.value;
				}}
			/>
		</label>
		<label>
			Secondary
			<input
				type="color"
				value={colorTwo}
				oninput={(event) => {
					if (HEX_COLOR_PATTERN.test(event.currentTarget.value)) colorTwo = event.currentTarget.value;
				}}
			/>
		</label>
		<label>
			Wheel
			<select bind:value={wheelName}>
				<option value="rgb">RGB</option>
				<option value="ryb">RYB</option>
			</select>
		</label>
		<label>
			<span>Spread <output aria-hidden="true">{spread + 1}</output></span>
			<input
				type="range"
				min="1"
				max={HUE_COUNT - 1}
				step="1"
				value={spread}
				aria-valuetext={`${spread + 1}`}
				disabled={anchorsShareHue}
				oninput={(event) => {
					const slot = Number(event.currentTarget.value);
					colorTwoSlot = slot === nearestColorTwoSlot ? "nearest" : slot;
				}}
			/>
		</label>
		<button
			type="button"
			onclick={() => colorTwoSlot = "nearest"}
		>Nearest</button>
		<button
			type="button"
			onclick={() => {
				colorOne = randomAnchorHex();
				colorTwo = randomAnchorHex();
			}}
		>
			<Shuffle />
			Shuffle
		</button>
	</form>

	<ul>
		{#each VARIANTS as variant (variant.key)}
			{@const wheel = wheelRing(variant)}
			<li>
				<h2>{variant.heading}</h2>
				<CircleDemo
					{...wheel}
					{chroma}
					lightness={anchors[0].L}
					band={variant.band}
					toHue={hueWheel.toHue}
					dots={false}
					outline={false}
					hueMarkers={variant.marked ?? false}
				/>
			</li>
		{/each}
	</ul>
</div>

<style>
	.wheel-page {
		--border: #c8c8c8;
		--muted: #888;
		--text: #111;
		max-width: 140rem;
		margin-inline: auto;
		padding: 3rem 2rem;
		font-family: var(--heading-font);
		font-size: 1.6rem;
	}

	h1 {
		margin: 0 0 2rem;
		letter-spacing: -0.04em;
	}

	form {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 1.5rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	label > span {
		display: flex;
		justify-content: space-between;
		gap: 1ch;

		output {
			font-variant-numeric: tabular-nums;
		}
	}

	input[type="range"] {
		width: 16rem;
	}

	input[type="color"] {
		width: 6rem;
		height: 2.5em;
	}

	select,
	button {
		font: inherit;
	}

	button {
		display: inline-flex;
		align-items: center;
		gap: 0.5em;
		padding: 0.4em 1em;
		cursor: pointer;

		:global(svg) {
			width: auto;
			height: 1.1em;
		}
	}

	ul {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(32rem, 1fr));
		gap: 3rem;
		margin: 3rem 0 0;
		padding: 0;
		list-style: none;
	}

	h2 {
		margin: 0 0 1rem;
		font-size: 2rem;
		text-align: center;
	}
</style>
