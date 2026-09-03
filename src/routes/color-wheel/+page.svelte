<script>
	/**
	 * The color-wheel demo (formerly color-wheel.html/color-wheel.js).
	 * Math unchanged, from $lib/hue-deform.js; this file is the reactive
	 * rendering/state layer, following the pattern established in
	 * src/routes/circle/+page.svelte.
	 */
	import { computeHuePalette, hslToHex } from '$lib/hue-deform.js';

	const CENTER = { x: 320, y: 320 };
	const RADIUS = 240;
	const POINT_R = 8;
	const PIN_R = 12;

	let countInput = $state(12);
	let primary = $state(0);
	let secondary = $state(150);
	let satPercent = $state(65);
	let lightPercent = $state(55);

	let X = $derived.by(() => {
		let x = parseInt(countInput, 10);
		if (!Number.isFinite(x) || x < 5) x = 5;
		if (x > 48) x = 48;
		return x;
	});
	let s = $derived(satPercent / 100);
	let l = $derived(lightPercent / 100);

	let model = $derived(computeHuePalette(X, primary, secondary));

	function polarToXY(hueDeg) {
		const angle = (hueDeg * Math.PI) / 180;
		return {
			x: CENTER.x + RADIUS * Math.cos(angle - Math.PI / 2),
			y: CENTER.y + RADIUS * Math.sin(angle - Math.PI / 2)
		};
	}

	let originalPoints = $derived(model.original.map((h) => ({ ...polarToXY(h), hex: hslToHex(h, s, l) })));
	let deformedPoints = $derived(
		model.hues.map((h, i) => ({
			...polarToXY(h),
			hex: hslToHex(h, s, l),
			isPinned: i === model.A || i === model.N,
			label: i === model.A ? 'Primary' : i === model.N ? 'Secondary' : null
		}))
	);
	let polygonPoints = $derived(deformedPoints.map((p) => p.x + ',' + p.y).join(' '));
	let primaryHex = $derived(hslToHex(primary, s, l));
	let secondaryHex = $derived(hslToHex(secondary, s, l));

	let paletteSwatches = $derived(
		model.hues.map((h, i) => ({
			hex: hslToHex(h, s, l),
			hue: Math.round(h),
			pinned: i === model.A || i === model.N,
			tag: i === model.A ? 'Primary' : i === model.N ? 'Secondary' : '#' + i
		}))
	);
</script>

<svelte:head>
	<title>Color Wheel Palette Generator</title>
</svelte:head>

<div class="wrap">
	<div>
		<h1>Color Wheel Palette Generator</h1>
		<p class="sub">
			Choose how many hues you want, then pick a primary hue (fixed) and a
			secondary hue (dragged to a new position). Every other hue relaxes
			smoothly between them using the same minimum-bending-energy model as
			the circular point demo&mdash;now applied directly to hue angles.
		</p>
		<svg viewBox="0 0 640 640" width="640" height="640">
			<circle
				cx={CENTER.x}
				cy={CENTER.y}
				r={RADIUS}
				fill="none"
				stroke="var(--grid)"
				stroke-width="1"
				stroke-dasharray="4 4"
			/>
			{#each originalPoints as p (p)}
				<circle cx={p.x} cy={p.y} r="4" fill={p.hex} opacity="0.3" />
			{/each}
			<polygon points={polygonPoints} fill="none" stroke="var(--grid)" stroke-width="1.5" stroke-linejoin="round" />
			{#each deformedPoints as p, i (i)}
				{@const r = p.isPinned ? PIN_R : POINT_R}
				<circle
					cx={p.x}
					cy={p.y}
					{r}
					fill={p.hex}
					stroke={p.isPinned ? 'var(--ring)' : 'var(--bg)'}
					stroke-width={p.isPinned ? 3 : 1}
				/>
				{#if p.label}
					<text x={p.x} y={p.y - r - 8} fill="var(--ring)" font-size="13" font-weight="700" text-anchor="middle">
						{p.label}
					</text>
				{/if}
			{/each}
		</svg>
	</div>

	<div class="panel controls">
		<label for="countInput">Number of hues (min 5)</label>
		<input type="number" id="countInput" min="5" max="48" step="1" bind:value={countInput} />

		<label for="primarySlider">
			<span class="row"><span>Primary hue</span><span class="value">{primary}&deg;</span></span>
		</label>
		<div class="hue-row">
			<div class="swatch-chip" style="background:{primaryHex}"></div>
			<input type="range" id="primarySlider" min="0" max="359" step="1" bind:value={primary} />
		</div>

		<label for="secondarySlider">
			<span class="row"><span>Secondary hue</span><span class="value">{secondary}&deg;</span></span>
		</label>
		<div class="hue-row">
			<div class="swatch-chip" style="background:{secondaryHex}"></div>
			<input type="range" id="secondarySlider" min="0" max="359" step="1" bind:value={secondary} />
		</div>

		<label for="satSlider">
			<span class="row"><span>Saturation</span><span class="value">{Math.round(s * 100)}%</span></span>
		</label>
		<input type="range" id="satSlider" min="0" max="100" step="1" bind:value={satPercent} />

		<label for="lightSlider">
			<span class="row"><span>Lightness</span><span class="value">{Math.round(l * 100)}%</span></span>
		</label>
		<input type="range" id="lightSlider" min="10" max="90" step="1" bind:value={lightPercent} />

		<div class="note">
			Secondary hue snaps to the nearest of the {X} evenly-spaced slots
			(slot {model.N}), then bends to it by {model.dN.toFixed(1)}&deg;.
		</div>

		<div class="palette">
			<p style="margin-top:0">Palette output</p>
			<div class="palette-strip">
				{#each paletteSwatches as sw, i (i)}
					<div class="palette-swatch" class:pinned={sw.pinned}>
						<div class="fill" style="background:{sw.hex}"></div>
						<div class="label">
							<div class="tag">{sw.tag}</div>
							{sw.hue}&deg;<br />{sw.hex}
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
</div>

<style>
	/* color-wheel-specific rules, on top of the shared theme.css tokens/base
	   layout in src/app.css: the hue-picker swatch chips and the generated
	   palette table, neither of which any other route needs. */
	.row {
		gap: 8px;
	}
	.hue-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.hue-row input[type='range'] {
		flex: 1;
	}
	.swatch-chip {
		width: 26px;
		height: 26px;
		border-radius: 6px;
		border: 1px solid var(--grid);
		flex: 0 0 auto;
	}
	.note {
		margin-top: 18px;
		font-size: 0.8rem;
		color: var(--muted);
		line-height: 1.5;
	}
	.palette {
		margin-top: 20px;
	}
	.palette-strip {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.palette-swatch {
		width: 64px;
		border-radius: 8px;
		overflow: hidden;
		border: 1px solid var(--grid);
		font-size: 0.68rem;
		text-align: center;
		background: var(--panel);
	}
	.palette-swatch .fill {
		height: 44px;
	}
	.palette-swatch .label {
		padding: 4px 2px;
		color: var(--muted);
		line-height: 1.3;
	}
	.palette-swatch.pinned {
		border-color: var(--ring);
		border-width: 2px;
	}
	.palette-swatch .tag {
		font-weight: 700;
		color: var(--text);
	}
</style>
