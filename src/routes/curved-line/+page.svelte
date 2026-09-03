<script>
	/**
	 * The curved-line demo (formerly curved-line.html/curved-line.js).
	 * Reuses the shared line-bending-energy solve and arc-length primitives
	 * from $lib/line-deform.js and $lib/curved-line-deform.js unmodified.
	 *
	 * ONE thing is genuinely page-specific and NOT reused from
	 * curved-line-deform.js: that module works in a normalized [0,1] x-space
	 * with dimensionless pole offsets, while this page needs actual SCREEN
	 * PIXELS on both axes (x and y must share real units for "arc length" to
	 * mean physical distance along the pole -- see curved-line-deform.js's
	 * own module doc for why that divergence is deliberate). So
	 * computeCurvedLinePointsPx below is a thin, screen-pixel-space wrapper
	 * around the SAME shared, unit-agnostic primitives
	 * (computeLineBendingDisplacements and cumulativeArcLength/
	 * pointAtArcLength) rather than a duplicate of the math.
	 */
	import { computeLineBendingDisplacements, bendingEnergy } from '$lib/line-deform.js';
	import { cumulativeArcLength, pointAtArcLength } from '$lib/curved-line-deform.js';

	const CURVE = { x0: 40, x1: 840, baselineY: 170 };
	const FINE_RESOLUTION = 401;
	function screenY(offset) {
		return CURVE.baselineY - offset;
	}

	// The bent 2D shape, in SCREEN PIXELS on both axes. fineX runs from x0 to
	// x1; fineY is the perpendicular offset, pinned to 0 at the exact middle
	// and to the pole values at the ends.
	function computeCurvedLineShapePx(fineResolution, x0, x1, poleOneValue, poleTwoValue) {
		const midIndex = Math.floor((fineResolution - 1) / 2);
		const pins = [
			{ index: 0, value: poleOneValue },
			{ index: fineResolution - 1, value: poleTwoValue },
			{ index: midIndex, value: 0 }
		];
		const fineY = computeLineBendingDisplacements(fineResolution, pins);
		const fineX = Array.from({ length: fineResolution }, (_, i) => x0 + (i / (fineResolution - 1)) * (x1 - x0));
		return { fineX, fineY, midIndex };
	}

	// Places `numPoints` points EVENLY SPACED ALONG THE POLE'S OWN ARC LENGTH.
	function computeCurvedLinePointsPx(numPoints, fineResolution, x0, x1, poleOneValue, poleTwoValue) {
		const { fineX, fineY, midIndex } = computeCurvedLineShapePx(fineResolution, x0, x1, poleOneValue, poleTwoValue);
		const cum = cumulativeArcLength(fineX, fineY);
		const total = cum[cum.length - 1];
		const points = Array.from({ length: numPoints }, (_, k) => {
			const target = (k / (numPoints - 1)) * total;
			return pointAtArcLength(fineX, fineY, cum, target);
		});
		return { points, totalArcLength: total, fineX, fineY, midIndex };
	}

	let countInput = $state(25);
	let poleOne = $state(0);
	let poleTwo = $state(0);

	let X = $derived.by(() => {
		let x = parseInt(countInput, 10);
		if (!Number.isFinite(x) || x < 3) x = 3;
		if (x > 120) x = 120;
		return x;
	});

	let shape = $derived(computeCurvedLinePointsPx(X, FINE_RESOLUTION, CURVE.x0, CURVE.x1, poleOne, poleTwo));
	let energy = $derived(bendingEnergy(shape.fineY));

	let originalXs = $derived(Array.from({ length: X }, (_, i) => CURVE.x0 + (i / (X - 1)) * (CURVE.x1 - CURVE.x0)));
	let finePolylinePoints = $derived(shape.fineX.map((fx, i) => fx + ',' + screenY(shape.fineY[i])).join(' '));

	let spacings = $derived.by(() => {
		const s = [];
		for (let i = 1; i < shape.points.length; i++) s.push(shape.points[i].x - shape.points[i - 1].x);
		return s;
	});
	let firstSpacing = $derived(spacings[0]);
	let lastSpacing = $derived(spacings[spacings.length - 1]);
	let middleSpacing = $derived(spacings[Math.floor(spacings.length / 2)]);

	function reset() {
		poleOne = 0;
		poleTwo = 0;
	}
</script>

<svelte:head>
	<title>Semi-Rigid Pole: Curved Line Deformation</title>
</svelte:head>

<div class="wrap">
	<div>
		<h1>Semi-Rigid Pole: Curved Line Deformation</h1>
		<p class="sub">
			Combines the line demo and the curve demo: a fixed support holds the
			exact middle of the pole at rest (offset 0), while Pole One and Pole
			Two &mdash; the two true ends &mdash; are yours to drag up or down. Lowering
			them bends the pole into an arc, steepest right at the poles and
			flattest near the untouched middle. The points are then laid out the
			way the line demo lays points out: evenly spaced along the pole's own
			length, not evenly spaced left-to-right. Since the poles' ends are
			where the bend is steepest, an even length-wise spacing spends more of
			its point budget there &mdash; so the points visibly cluster toward
			whichever pole you've lowered.
		</p>
		<svg viewBox="0 0 880 340" width="880" height="340">
			<line
				x1={CURVE.x0}
				x2={CURVE.x1}
				y1={CURVE.baselineY}
				y2={CURVE.baselineY}
				stroke="var(--original)"
				stroke-width="1.5"
				stroke-dasharray="4 4"
				opacity="0.7"
			/>
			{#each originalXs as ox (ox)}
				<circle cx={ox} cy={CURVE.baselineY} r="3" fill="var(--original)" opacity="0.5" />
			{/each}
			<polyline
				points={finePolylinePoints}
				fill="none"
				stroke="var(--accent)"
				stroke-width="2.5"
				stroke-linejoin="round"
				opacity="0.55"
			/>
			<circle cx={shape.fineX[shape.midIndex]} cy={screenY(0)} r="6" fill="var(--yellow)" stroke="var(--bg)" stroke-width="2" />
			<text
				x={shape.fineX[shape.midIndex]}
				y={screenY(0) + 22}
				fill="var(--yellow)"
				font-size="12"
				font-weight="700"
				text-anchor="middle"
			>
				Fixed support
			</text>
			{#each shape.points as p, i (i)}
				{@const isPole = i === 0 || i === X - 1}
				{@const fill = isPole ? 'var(--red)' : 'var(--accent)'}
				{@const r = isPole ? 8 : 4.5}
				<circle cx={p.x} cy={screenY(p.y)} {r} {fill} stroke="var(--bg)" stroke-width={isPole ? 2 : 1} />
				{#if isPole}
					<text x={p.x} y={screenY(p.y) - r - 8} {fill} font-size="12" font-weight="700" text-anchor="middle">
						{i === 0 ? 'Pole One' : 'Pole Two'}
					</text>
				{/if}
			{/each}
		</svg>
	</div>

	<div class="panel controls">
		<label for="countInput">Number of points (min 3)</label>
		<input type="number" id="countInput" min="3" max="120" step="1" bind:value={countInput} />

		<label for="poleOneSlider">
			<span class="row">
				<span>Pole One offset</span>
				<span class="value">{poleOne} px</span>
			</span>
		</label>
		<input type="range" id="poleOneSlider" min="-140" max="140" step="1" bind:value={poleOne} />

		<label for="poleTwoSlider">
			<span class="row">
				<span>Pole Two offset</span>
				<span class="value">{poleTwo} px</span>
			</span>
		</label>
		<input type="range" id="poleTwoSlider" min="-140" max="140" step="1" bind:value={poleTwo} />
		<button onclick={reset}>Reset both poles to 0</button>

		<div class="legend">
			<div><span class="swatch" style="background:var(--original); opacity:.6"></span>Original evenly-spaced-by-index positions (faint, on the flat baseline)</div>
			<div><span class="swatch" style="background:var(--accent)"></span>Deformed points, evenly spaced along the pole's own length</div>
			<div><span class="swatch" style="background:var(--red)"></span>Pole One &amp; Pole Two (you control these)</div>
			<div><span class="swatch" style="background:var(--yellow)"></span>Fixed center support (always stays at 0)</div>
		</div>

		<div class="stat">
			Bending energy E = {energy.toFixed(3)}<br />
			Pole length: {shape.totalArcLength.toFixed(1)} px (flat baseline: {CURVE.x1 - CURVE.x0} px)<br />
			Point spacing near Pole One: {firstSpacing.toFixed(1)} px<br />
			Point spacing near Pole Two: {lastSpacing.toFixed(1)} px<br />
			Point spacing at mid-pole: {middleSpacing.toFixed(1)} px
		</div>
	</div>
</div>

<style>
	/* curved-line's own small deviations from app.css's shared defaults --
	   everything else (tokens, .wrap/.panel/.controls layout, .legend,
	   .stat, svg chrome, button) comes from app.css unchanged. */
	.controls { min-width: 300px; flex: 1 1 300px; }
	.controls input[type='range'] { accent-color: var(--red); }
	.value { color: var(--red); }
	.legend { margin-top: 20px; }
	svg { max-width: 100%; height: auto; }
	button:hover { border-color: var(--red); }
</style>
