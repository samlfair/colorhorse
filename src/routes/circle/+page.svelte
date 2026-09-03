<script>
	/**
	 * The circular point-deformation demo (formerly index.html/index.js).
	 * All math is unchanged, imported from $lib/deform.js -- this file is
	 * just the reactive rendering/state layer, rewritten from imperative DOM
	 * manipulation (svg.innerHTML = '', createElementNS, addEventListener)
	 * into Svelte's declarative template + runes, which is the real work a
	 * framework port does: the model doesn't change, how it's presented does.
	 */
	import { computeDeformedAngles, bendingEnergy } from '$lib/deform.js';

	const CENTER = { x: 320, y: 320 };
	const RADIUS = 240;
	const POINT_R = 6;
	const A_N_R = 9;

	let countInput = $state(24);
	let A = $state(0);
	let N = $state(12);
	let dNDeg = $state(40);

	let X = $derived.by(() => {
		let x = parseInt(countInput, 10);
		if (!Number.isFinite(x) || x < 5) x = 5;
		if (x > 96) x = 96;
		return x;
	});

	// Keep A and N valid whenever the point count shrinks (or grows) around
	// them: both must stay in [0, X) and distinct -- the same clamp the
	// original imperative version ran at the top of every render().
	$effect(() => {
		if (A >= X) A = 0;
		if (N >= X) N = Math.floor(X / 2);
		if (N === A) N = (A + 1) % X;
	});

	let nOptions = $derived(Array.from({ length: X }, (_, i) => i).filter((i) => i !== A));
	let aOptions = $derived(Array.from({ length: X }, (_, i) => i).filter((i) => i !== N));

	let dN = $derived((dNDeg * Math.PI) / 180);
	let model = $derived(computeDeformedAngles(X, A, N, dN));
	let energy = $derived(bendingEnergy(model.u));
	let maxAbsU = $derived(Math.max(...model.u.map(Math.abs)));
	let maxAbsUIndex = $derived(model.u.indexOf(model.u.reduce((best, v) => (Math.abs(v) > Math.abs(best) ? v : best), 0)));

	function polarToXY(angle) {
		return {
			x: CENTER.x + RADIUS * Math.cos(angle - Math.PI / 2),
			y: CENTER.y + RADIUS * Math.sin(angle - Math.PI / 2)
		};
	}

	let originalXY = $derived(model.original.map(polarToXY));
	let deformedXY = $derived(model.deformed.map(polarToXY));
	let polygonPoints = $derived(deformedXY.map((p) => p.x + ',' + p.y).join(' '));

	function resetDisplacement() {
		dNDeg = 0;
	}
</script>

<svelte:head>
	<title>Circle Deformation</title>
</svelte:head>

<div class="wrap">
	<div>
		<h1>Semi-Rigid Pole: Circular Point Deformation</h1>
		<p class="sub">
			Points start evenly spaced on a circle. Point A is fixed. Dragging Point N's
			slider bends the ring like a flexible circular pole&mdash;deformation spreads
			smoothly to every other point, minimizing discrete bending energy.
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
			{#each originalXY as p (p)}
				<circle cx={p.x} cy={p.y} r="3.5" fill="var(--original)" opacity="0.55" />
			{/each}
			<polygon points={polygonPoints} fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" />
			{#each deformedXY as p, i (i)}
				{@const isSpecial = i === A || i === N}
				{@const fill = i === A ? 'var(--green)' : i === N ? 'var(--red)' : 'var(--accent)'}
				{@const r = isSpecial ? A_N_R : POINT_R}
				<circle cx={p.x} cy={p.y} {r} {fill} stroke="var(--bg)" stroke-width={isSpecial ? 2 : 1} />
				{#if isSpecial}
					<text x={p.x} y={p.y - r - 8} {fill} font-size="13" font-weight="700" text-anchor="middle">
						{i === A ? 'A' : 'N'}
					</text>
				{/if}
			{/each}
		</svg>
	</div>

	<div class="panel controls">
		<label for="countInput">Number of points (min 5)</label>
		<input type="number" id="countInput" min="5" max="96" step="1" bind:value={countInput} />

		<label for="nSelect">Point N (the one you move)</label>
		<select id="nSelect" bind:value={N}>
			{#each nOptions as i (i)}
				<option value={i}>Point {i}</option>
			{/each}
		</select>

		<label for="aSelect">Point A (fixed reference)</label>
		<select id="aSelect" bind:value={A}>
			{#each aOptions as i (i)}
				<option value={i}>Point {i}</option>
			{/each}
		</select>

		<label for="slider">
			<span class="row">
				<span>Angular displacement of N</span>
				<span class="value">{dNDeg}&deg;</span>
			</span>
		</label>
		<input type="range" id="slider" min="-170" max="170" step="1" bind:value={dNDeg} />
		<button onclick={resetDisplacement}>Reset to 0&deg;</button>

		<div class="legend">
			<div><span class="swatch" style="background:var(--original); opacity:.6"></span>Original evenly-spaced positions (faint)</div>
			<div><span class="swatch" style="background:var(--accent)"></span>Deformed positions &amp; connecting lines</div>
			<div><span class="swatch" style="background:var(--green)"></span>Point A (fixed)</div>
			<div><span class="swatch" style="background:var(--red)"></span>Point N (moved)</div>
		</div>

		<div class="stat">
			Bending energy E = {energy.toFixed(5)}<br />
			Max |displacement| = {((maxAbsU * 180) / Math.PI).toFixed(2)}&deg; (point {maxAbsUIndex})
		</div>
	</div>
</div>
