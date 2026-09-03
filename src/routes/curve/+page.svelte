<script>
	/**
	 * The curve deformation demo (formerly curve.html/curve.js). Math
	 * unchanged, imported from $lib/curve-deform.js (which itself re-exports
	 * bendingEnergy from $lib/line-deform.js -- see that file); this is just
	 * the reactive rendering/state layer, following src/routes/circle's
	 * pattern: Svelte runes replace the old imperative render() function,
	 * and the SVG is built declaratively instead of via createElementNS.
	 */
	import { computeCurveDeformation, bendingEnergy } from '$lib/curve-deform.js';

	const CURVE = { x0: 40, x1: 840, baselineY: 170 };
	function curveX(i, X) {
		return CURVE.x0 + (i / (X - 1)) * (CURVE.x1 - CURVE.x0);
	}
	function curveY(offset) {
		return CURVE.baselineY - offset;
	}

	let countInput = $state(21);
	let anchorIndex = $state(10);
	let offset = $state(0);
	let firstOffset = $state(0);
	let lastOffset = $state(0);

	let X = $derived.by(() => {
		let x = parseInt(countInput, 10);
		if (!Number.isFinite(x) || x < 3) x = 3;
		if (x > 200) x = 200;
		return x;
	});

	// Keep the anchor valid whenever the point count changes around it --
	// it must stay a strict interior index (not First/Last themselves).
	$effect(() => {
		if (anchorIndex <= 0 || anchorIndex >= X - 1) {
			anchorIndex = Math.max(1, Math.floor((X - 1) / 2));
		}
	});

	let anchorOptions = $derived(Array.from({ length: Math.max(0, X - 2) }, (_, k) => k + 1));

	let model = $derived(computeCurveDeformation(X, anchorIndex, offset, firstOffset, lastOffset));
	let energy = $derived(bendingEnergy(model.y));
	let maxAbs = $derived(Math.max(...model.y.map(Math.abs)));

	let points = $derived(model.y.map((v, i) => ({ x: curveX(i, X), y: curveY(v) })));
	let polylinePoints = $derived(points.map((p) => p.x + ',' + p.y).join(' '));

	function resetAll() {
		offset = 0;
		firstOffset = 0;
		lastOffset = 0;
	}
</script>

<svelte:head>
	<title>Semi-Rigid Pole: Curve Deformation</title>
</svelte:head>

<div class="wrap">
	<div>
		<h1>Semi-Rigid Pole: Curve Deformation</h1>
		<p class="sub">
			Points sit between a First Point and a Last Point, both of which you
			can drag up or down independently &mdash; they're no longer fixed to a flat
			baseline. Pick an Anchor point between them and drag it too: the curve
			bends smoothly through all three, like a flexible rod pinned at three
			places, with tension distributed evenly along its whole length instead
			of concentrating near any one pin.
		</p>
		<svg viewBox="0 0 880 340" width="880" height="340">
			<line
				x1={curveX(0, X)}
				x2={curveX(X - 1, X)}
				y1={CURVE.baselineY}
				y2={CURVE.baselineY}
				stroke="var(--original)"
				stroke-width="1.5"
				stroke-dasharray="4 4"
				opacity="0.7"
			/>
			<polyline points={polylinePoints} fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" />
			{#each points as p, i (i)}
				{@const isEndpoint = i === 0 || i === X - 1}
				{@const isAnchor = i === anchorIndex}
				{@const fill = isAnchor ? 'var(--red)' : isEndpoint ? 'var(--green)' : 'var(--accent)'}
				{@const r = isEndpoint || isAnchor ? 8 : 4.5}
				<circle cx={p.x} cy={p.y} {r} {fill} stroke="var(--bg)" stroke-width={isEndpoint || isAnchor ? 2 : 1} />
				{#if isEndpoint || isAnchor}
					<text x={p.x} y={p.y - r - 8} {fill} font-size="12" font-weight="700" text-anchor="middle">
						{i === 0 ? 'First' : i === X - 1 ? 'Last' : 'Anchor'}
					</text>
				{/if}
			{/each}
		</svg>
	</div>

	<div class="panel controls">
		<label for="countInput">Number of points (min 3)</label>
		<input type="number" id="countInput" min="3" max="200" step="1" bind:value={countInput} />

		<label for="firstSlider">
			<span class="row">
				<span>First Point offset</span>
				<span class="value">{firstOffset} px</span>
			</span>
		</label>
		<input type="range" id="firstSlider" min="-140" max="140" step="1" bind:value={firstOffset} />

		<label for="lastSlider">
			<span class="row">
				<span>Last Point offset</span>
				<span class="value">{lastOffset} px</span>
			</span>
		</label>
		<input type="range" id="lastSlider" min="-140" max="140" step="1" bind:value={lastOffset} />

		<label for="anchorSelect">Anchor point</label>
		<select id="anchorSelect" bind:value={anchorIndex}>
			{#each anchorOptions as i (i)}
				<option value={i}>Point {i}</option>
			{/each}
		</select>

		<label for="slider">
			<span class="row">
				<span>Anchor offset</span>
				<span class="value">{offset} px</span>
			</span>
		</label>
		<input type="range" id="slider" min="-140" max="140" step="1" bind:value={offset} />
		<button onclick={resetAll}>Reset all to 0</button>

		<div class="legend">
			<div><span class="swatch" style="background:var(--original); opacity:.6"></span>Original straight baseline (faint)</div>
			<div><span class="swatch" style="background:var(--accent)"></span>Deformed curve &amp; free points</div>
			<div><span class="swatch" style="background:var(--green)"></span>First Point &amp; Last Point (you control these)</div>
			<div><span class="swatch" style="background:var(--red)"></span>Anchor (you control this)</div>
		</div>

		<div class="stat">
			Bending energy E = {energy.toFixed(3)}<br />
			Max |displacement| = {maxAbs.toFixed(2)} px
		</div>
	</div>
</div>

<style>
	/* curve.html's own small additions on top of app.css's shared tokens and
	   base layout: a red accent on the range/select inputs and button hover,
	   matching this page's --red "anchor" role, and a responsive SVG. */
	.controls select,
	.controls input[type='range'] {
		accent-color: var(--red);
	}
	button:hover {
		border-color: var(--red);
	}
	svg {
		max-width: 100%;
		height: auto;
	}
</style>
