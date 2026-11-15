<script>
	import { huePalette, huesFromColorOne, HUE_COUNT } from "$lib/hue-palette.js";
	import { randomAnchorHex, HEX_COLOR_PATTERN } from "$lib/random-color.js";
	import { LOGO_REGIONS, logoColors } from "$lib/logo-colors.js";
	import LogoMark from "$lib/LogoMark.svelte";
	import Shuffle from "$lib/Shuffle.svelte";

	const HUES = Array.from({ length: HUE_COUNT }, (_, hueIndex) => hueIndex + 1);
	const SHADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
	const PREVIEW_SIZES = [128, 64, 32, 16];

	let colorOne = $state("#4da3ff");
	let colorTwo = $state("#ff6b4d");

	// Each region of the mark takes one palette color: a hue, counted around
	// the ring from color one's, and a shade. Starts from the logo's own.
	let regions = $state(LOGO_REGIONS.map((region) => ({ ...region })));

	let overlapPercent = $state(42);
	let axisDegrees = $state(30);
	let horseScale = $state(4);
	let horseX = $state(0);
	let horseY = $state(0);

	let palette = $derived(huesFromColorOne(huePalette(colorOne, colorTwo)));
	let regionColors = $derived(logoColors(palette.hues, regions));

	let largeLogo;

	function downloadSvg() {
		// On its own, the file follows the viewer's light or dark setting.
		const svgElement = largeLogo.querySelector("svg").cloneNode(true);
		svgElement.style.colorScheme = "light dark";
		const blobUrl = URL.createObjectURL(new Blob([svgElement.outerHTML], { type: "image/svg+xml" }));
		const downloadLink = document.createElement("a");
		downloadLink.href = blobUrl;
		downloadLink.download = "color-horse-logo.svg";
		downloadLink.click();
		setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
	}
</script>

<svelte:head>
	<title>Logo · Color Horse</title>
</svelte:head>

{#snippet mark(size)}
	<LogoMark
		{...regionColors}
		overlapArcFraction={overlapPercent / 100}
		{axisDegrees}
		{horseScale}
		{horseX}
		{horseY}
		{size}
		square
	/>
{/snippet}

<div class="logo-page">
	<main>
		<h1>Logo</h1>

		<figure bind:this={largeLogo}>
			{@render mark(400)}
		</figure>

		<ul>
			{#each ["light", "dark"] as background (background)}
				<li class={background}>
					{#each PREVIEW_SIZES as previewSize (previewSize)}
						{@render mark(previewSize)}
					{/each}
				</li>
			{/each}
		</ul>
	</main>

	<form onsubmit={(event) => event.preventDefault()}>
		<fieldset>
			<legend>Colors</legend>
			<label>
				Color One
				<input
					type="color"
					value={colorOne}
					oninput={(event) => {
						if (HEX_COLOR_PATTERN.test(event.currentTarget.value)) colorOne = event.currentTarget.value;
					}}
				/>
			</label>
			<label>
				Color Two
				<input
					type="color"
					value={colorTwo}
					oninput={(event) => {
						if (HEX_COLOR_PATTERN.test(event.currentTarget.value)) colorTwo = event.currentTarget.value;
					}}
				/>
			</label>
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
			<table>
				<thead>
					<tr>
						<th scope="col">Hue</th>
						{#each SHADES as shade (shade)}
							<th scope="col">{shade}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each palette.hues as paletteHue, hueIndex (hueIndex)}
						<tr>
							<th scope="row">
								{hueIndex + 1}
								{#if hueIndex === 0}<small>One</small>{/if}
								{#if hueIndex === palette.colorTwoPosition}<small>Two</small>{/if}
							</th>
							{#each paletteHue.shades as shadeHex, shadeIndex (shadeIndex)}
								<td
									style:--color={shadeHex}
									title="Hue {hueIndex + 1}, shade {shadeIndex + 1}: {shadeHex}"
								></td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</fieldset>

		<fieldset>
			<legend>Regions</legend>
			{#each regions as region (region.key)}
				<div class="region">
					<span
						class="swatch"
						style:--color={regionColors[region.key]}
					></span>
					<span>{region.label}</span>
					<select
						aria-label="{region.label} hue"
						bind:value={region.hue}
					>
						{#each HUES as hue (hue)}
							<option value={hue}>Hue {hue}</option>
						{/each}
					</select>
					<select
						aria-label="{region.label} shade"
						bind:value={region.shade}
					>
						{#each SHADES as shade (shade)}
							<option value={shade}>Shade {shade}</option>
						{/each}
					</select>
				</div>
			{/each}
		</fieldset>

		<fieldset>
			<legend>Geometry</legend>
			<label>
				<span>Overlap <output aria-hidden="true">{overlapPercent}%</output></span>
				<input
					type="range"
					min="5"
					max="45"
					step="1"
					bind:value={overlapPercent}
					aria-valuetext="{overlapPercent}%"
				/>
			</label>
			<label>
				<span>Axis <output aria-hidden="true">{axisDegrees}°</output></span>
				<input
					type="range"
					min="0"
					max="90"
					step="1"
					bind:value={axisDegrees}
					aria-valuetext="{axisDegrees}°"
				/>
			</label>
			<label>
				<span>Horse Size <output aria-hidden="true">{horseScale.toFixed(2)}</output></span>
				<input
					type="range"
					min="1"
					max="5"
					step="0.05"
					bind:value={horseScale}
				/>
			</label>
			<label>
				<span>Horse Across <output aria-hidden="true">{horseX}</output></span>
				<input
					type="range"
					min="-50"
					max="50"
					step="0.5"
					bind:value={horseX}
				/>
			</label>
			<label>
				<span>Horse Down <output aria-hidden="true">{horseY}</output></span>
				<input
					type="range"
					min="-50"
					max="50"
					step="0.5"
					bind:value={horseY}
				/>
			</label>
		</fieldset>

		<button
			type="button"
			onclick={downloadSvg}
		>Download SVG</button>
	</form>
</div>

<style>
	.logo-page {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(18rem, 28rem);
		gap: 3rem;
		max-width: 110rem;
		margin-inline: auto;
		padding: 3rem 2rem;
		font-family: var(--heading-font);
	}

	main {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2rem;
	}

	h1 {
		align-self: flex-start;
		margin: 0;
		letter-spacing: -0.04em;
	}

	figure {
		margin: 0;
	}

	main ul {
		display: grid;
		gap: 1rem;
		width: 100%;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	main li {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 2rem;
		padding: 1.5rem;
		border-radius: 0.5rem;

		&.light {
			color-scheme: light;
			background: white;
		}

		&.dark {
			color-scheme: dark;
			background: #111;
		}
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 2rem;
		font-size: 1.6rem;
	}

	fieldset {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		margin-bottom: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;

		> span {
			display: flex;
			justify-content: space-between;
		}

		output {
			font-variant-numeric: tabular-nums;
		}
	}

	input[type="range"] {
		width: 100%;
	}

	input[type="color"] {
		width: 100%;
		height: 2.5em;
	}

	table {
		border-collapse: separate;
		border-spacing: 2px;
		font-size: 0.75em;
	}

	th {
		padding: 0 0.5em 0 0;
		font-weight: 400;
		font-variant-numeric: tabular-nums;
		text-align: right;
		white-space: nowrap;
		border: 0;

		small {
			margin-left: 0.3em;
			font-size: 0.8em;
			font-weight: 700;
			text-transform: uppercase;
		}
	}

	thead th {
		padding: 0;
		text-align: center;
	}

	td {
		width: 1.6em;
		height: 1.6em;
		padding: 0;
		background: var(--color);
		border: 0;
	}

	.region {
		display: grid;
		grid-template-columns: auto 1fr auto auto;
		align-items: center;
		gap: 0.5em;

		select {
			font: inherit;
		}
	}

	.swatch {
		width: 1.5em;
		aspect-ratio: 1;
		background: var(--color);
		border-radius: 50%;
	}

	button {
		display: inline-flex;
		align-items: center;
		align-self: flex-start;
		gap: 0.5em;
		padding: 0.6em 1.2em;
		font: inherit;
		font-weight: 700;
		cursor: pointer;

		:global(svg) {
			width: auto;
			height: 1.1em;
		}
	}

	@media (width < 800px) {
		.logo-page {
			grid-template-columns: 1fr;
		}
	}
</style>
