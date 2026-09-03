<script>
	/**
	 * The four-pin, sorted-identity linear deformation demo (formerly
	 * line.html/line.js). Math unchanged, imported from $lib/line-deform.js;
	 * this file is the reactive rendering/state layer.
	 *
	 * THE key behavior to preserve: four PHYSICAL sliders have a stable id
	 * (0..3) that never changes -- dragging one never makes the control jump
	 * around. Which PIN IDENTITY (One/Two/Three/Four) each currently holds
	 * is reassigned every render by sorting the four sliders' raw values
	 * ascending: smallest = Pin One, largest = Pin Four. Pin One/Four are
	 * hard-pinned to array indices 0/(X-1); the free points between pins are
	 * dynamically reapportioned via apportion() proportional to gap size.
	 */
	import { computeLineDeformation, bendingEnergy, apportion } from '$lib/line-deform.js';

	const NUM_CONTROLS = 4;
	const PIN_LABELS = ['Pin One', 'Pin Two', 'Pin Three', 'Pin Four'];
	const STABLE_IDS = [0, 1, 2, 3];
	// 31 makes the default 27 interior points split evenly into thirds
	// (9/9/9), so the default [0, 1/3, 2/3, 1] state is exactly collinear
	// (zero bending energy) -- any other count still works, it just may not
	// land perfectly evenly at the default values (apportion still keeps it
	// within 1 point of ideal, same as everywhere else in this demo).
	const DEFAULT_VALUES = [0, 1 / 3, 2 / 3, 1];

	// ---- shared value domain: 0 and 1 are the ABSOLUTE min/max any pin may
	// ever reach (enforced by each slider's own min/max), so the axis is
	// always exactly [0,1] plus a tiny fixed margin for breathing room --
	// Pin One and Pin Four will typically sit somewhere INSIDE this range,
	// not at its edges, since they're just the min/max of the four sliders.
	const DOMAIN = { lo: -0.03, hi: 1.03 };

	// ---- curve panel geometry: x = point index, y = value (0 at bottom) ----
	const CURVE = { x0: 50, x1: 850, yTop: 25, yBottom: 225 };
	function curveX(i, X) {
		return CURVE.x0 + (i / (X - 1)) * (CURVE.x1 - CURVE.x0);
	}
	function curveY(v) {
		return CURVE.yBottom - ((v - DOMAIN.lo) / (DOMAIN.hi - DOMAIN.lo)) * (CURVE.yBottom - CURVE.yTop);
	}

	// ---- number-line panel geometry: x = value ----
	const LINE = { x0: 50, x1: 850, yOriginal: 40, yDeformed: 110 };
	function lineX(v) {
		return LINE.x0 + ((v - DOMAIN.lo) / (DOMAIN.hi - DOMAIN.lo)) * (LINE.x1 - LINE.x0);
	}

	let countInput = $state(31);
	// Current absolute value (0..1) of each of the four PHYSICAL sliders,
	// keyed by stable id -- NOT by pin identity, since which pin a slider
	// currently represents is determined purely by sorting these values,
	// fresh, on every render.
	let sliderValues = $state([...DEFAULT_VALUES]);

	let X = $derived.by(() => {
		let x = parseInt(countInput, 10);
		if (!Number.isFinite(x) || x < NUM_CONTROLS) x = NUM_CONTROLS;
		if (x > 200) x = 200;
		return x;
	});

	// THE reassignment step: sort the four sliders' raw values, fresh, every
	// render -- whichever is currently smallest becomes Pin One, largest
	// becomes Pin Four, the middle two become Pin Two/Three. Drag one
	// slider's value past another's and their pin identities swap
	// immediately; the physical sliders themselves never move.
	let sortedPins = $derived(
		STABLE_IDS.map((id) => ({ id, value: sliderValues[id] })).sort((a, b) => a.value - b.value)
	);
	let sortedValues = $derived(sortedPins.map((p) => p.value));

	// Given X and the four pins' values already sorted ascending, decide how
	// many of the X-4 free points sit in each of the three gaps between
	// them -- a gap you stretch wide gets more points, one you squeeze
	// narrow gives points up. Pin One/Four are hard-pinned to indices 0/X-1.
	let dynamicIndices = $derived.by(() => {
		const interiorFreeTotal = X - NUM_CONTROLS;
		const gaps = [];
		for (let k = 0; k < sortedValues.length - 1; k++) {
			gaps.push(Math.max(sortedValues[k + 1] - sortedValues[k], 0));
		}
		const counts = apportion(interiorFreeTotal, gaps);
		const indices = [0];
		for (let k = 0; k < counts.length; k++) {
			indices.push(indices[indices.length - 1] + 1 + counts[k]);
		}
		return indices; // [0, idxTwo, idxThree, X-1]
	});

	let pins = $derived(dynamicIndices.map((idx, k) => ({ index: idx, position: sortedValues[k] })));
	let model = $derived(computeLineDeformation(X, pins));

	let lo = $derived(sortedValues[0]); // Pin One's value
	let hi = $derived(sortedValues[3]); // Pin Four's value
	// The pure minimum-bending-energy solution has no notion of a boundary
	// and can in principle ring slightly past its pinned endpoints between
	// two closely-spaced interior pins; clamp onto [Pin One, Pin Four] as a
	// safety net (pins themselves are never affected).
	let clamped = $derived(model.deformed.map((v) => Math.max(lo, Math.min(hi, v))));
	let overshoot = $derived(model.deformed.some((v, i) => v !== clamped[i]));

	let energy = $derived(bendingEnergy(model.u));
	let maxIdx = $derived.by(() => {
		let m = 0;
		for (let i = 1; i < model.u.length; i++) if (Math.abs(model.u[i]) > Math.abs(model.u[m])) m = i;
		return m;
	});
	// Live "current pin identity" readout next to each slider, keyed by
	// stable id -- the visible proof of reassignment.
	let pinLabelByStableId = $derived.by(() => {
		const map = {};
		sortedPins.forEach((p, rank) => {
			map[p.id] = PIN_LABELS[rank];
		});
		return map;
	});
	let order = $derived(sortedPins.map((p, rank) => PIN_LABELS[rank] + ' = Slider ' + (p.id + 1)).join(', '));

	// ---- template-friendly derived point lists for the two SVGs ----
	let curveOriginalPolyline = $derived(model.original.map((v, i) => curveX(i, X) + ',' + curveY(v)).join(' '));
	let curveDeformedPoints = $derived(
		clamped.map((v, i) => ({
			x: curveX(i, X),
			y: curveY(v),
			isPin: dynamicIndices.includes(i),
			pinRank: dynamicIndices.indexOf(i)
		}))
	);
	let curveDeformedPolyline = $derived(curveDeformedPoints.map((p) => p.x + ',' + p.y).join(' '));

	let lineDeformedPoints = $derived(clamped.map((v, i) => ({ x: lineX(v), isPin: dynamicIndices.includes(i) })));
	let lineDeformedPolyline = $derived(lineDeformedPoints.map((p) => p.x + ',' + LINE.yDeformed).join(' '));

	function resetAll() {
		sliderValues = [...DEFAULT_VALUES];
	}
</script>

<svelte:head>
	<title>Semi-Rigid Pole: Linear Point Deformation</title>
</svelte:head>

<div class="wrap">
	<div>
		<h1>Semi-Rigid Pole: Linear Point Deformation</h1>
		<p class="sub">
			Points are arranged between Pin One and Pin Four, with 0 and 1 as the
			absolute minimum and maximum any pin may reach &mdash; not as fixed
			endpoints of the line itself. Drag any of the four sliders below: the
			<strong>value</strong> of what you're dragging changes, but which pin
			identity (One/Two/Three/Four) it currently holds is reassigned
			automatically, by sorting all four values low&rarr;high on every
			change. Drag Pin Three's slider past Pin Four's value and they swap
			identities immediately &mdash; watch each slider's live label. The
			other 25 points distribute smoothly between whichever four values
			currently hold the four identities, with free points reassigned
			between pins the same way as before: a gap you stretch wide gets more
			of them, one you squeeze narrow gives them up.
		</p>
		<p class="panel-label">Bending curve &mdash; value (y) vs. point index (x)</p>
		<svg viewBox="0 0 880 260" width="880" height="260">
			{#each [0, 1] as v (v)}
				<line x1={CURVE.x0} x2={CURVE.x1} y1={curveY(v)} y2={curveY(v)} stroke="var(--grid)" stroke-width="1" />
				<text x={CURVE.x0 - 10} y={curveY(v) + 4} fill="var(--muted)" font-size="11" text-anchor="end">{v}</text>
			{/each}
			<polyline
				points={curveOriginalPolyline}
				fill="none"
				stroke="var(--original)"
				stroke-width="1.5"
				stroke-dasharray="4 4"
				opacity="0.7"
			/>
			<polyline points={curveDeformedPolyline} fill="none" stroke="var(--accent)" stroke-width="2" />
			{#each curveDeformedPoints as p, i (i)}
				<circle
					cx={p.x}
					cy={p.y}
					r={p.isPin ? 6 : 3.5}
					fill={p.isPin ? 'var(--red)' : 'var(--accent)'}
					stroke="var(--bg)"
					stroke-width={p.isPin ? 2 : 1}
				/>
				{#if p.isPin}
					<text x={p.x} y={p.y - 12} fill="var(--red)" font-size="12" font-weight="700" text-anchor="middle">
						{p.pinRank + 1}
					</text>
				{/if}
			{/each}
		</svg>
		<p class="panel-label" style="margin-top:16px;">Number line &mdash; the same points laid out between Pin One and Pin Four</p>
		<svg viewBox="0 0 880 170" width="880" height="170">
			<line x1={LINE.x0} x2={LINE.x1} y1={LINE.yDeformed} y2={LINE.yDeformed} stroke="var(--grid)" stroke-width="1" />
			{#each [0, 1] as v (v)}
				<text x={lineX(v)} y={LINE.yDeformed + 30} fill="var(--muted)" font-size="11" text-anchor="middle">{v}</text>
			{/each}
			{#each model.original as v, i (i)}
				<circle cx={lineX(v)} cy={LINE.yOriginal} r="3" fill="var(--original)" opacity="0.55" />
			{/each}
			<polyline points={lineDeformedPolyline} fill="none" stroke="var(--accent)" stroke-width="1.5" opacity="0.6" />
			{#each lineDeformedPoints as p, i (i)}
				<circle
					cx={p.x}
					cy={LINE.yDeformed}
					r={p.isPin ? 6 : 4}
					fill={p.isPin ? 'var(--red)' : 'var(--accent)'}
					stroke="var(--bg)"
					stroke-width={p.isPin ? 2 : 1}
				/>
			{/each}
		</svg>
	</div>

	<div class="panel controls">
		<label for="countInput">Number of points (min 4)</label>
		<input type="number" id="countInput" min="4" max="200" step="1" bind:value={countInput} />

		<p style="margin:16px 0 4px 0; font-size:0.85rem; color:var(--muted);">
			Drag any of the four sliders (their pin identity reassigns automatically):
		</p>
		<div id="sliders">
			{#each STABLE_IDS as id (id)}
				<label for={'slider' + id}>
					<span class="row">
						<span>{pinLabelByStableId[id]}</span>
						<span class="value">{sliderValues[id].toFixed(3)}</span>
					</span>
					<span class="slot">Slider {id + 1}</span>
				</label>
				<input type="range" id={'slider' + id} min="0" max="1" step="0.001" bind:value={sliderValues[id]} />
			{/each}
		</div>
		<button onclick={resetAll}>Reset all to original positions</button>

		<div class="legend">
			<div><span class="swatch" style="background:var(--original); opacity:.6"></span>Original evenly-spaced positions (faint)</div>
			<div><span class="swatch" style="background:var(--accent)"></span>Free points (deformed by tension)</div>
			<div><span class="swatch" style="background:var(--red)"></span>Pin One&ndash;Four (dot labels show current identity 1&ndash;4)</div>
		</div>

		<div class="stat">
			Bending energy E = {energy.toFixed(6)}<br />
			Max |displacement| = {Math.abs(model.u[maxIdx]).toFixed(4)} (point {maxIdx})<br />
			Order (low&rarr;high): {order}<br />
			Point indices [1,2,3,4] = {dynamicIndices.join(', ')}
			{#if overshoot}
				<br /><span style="color:var(--red)">Interior points wanted to bend past Pin One/Pin Four -- held at that range.</span>
			{/if}
		</div>
	</div>
</div>

<style>
	/* Page-specific overrides on top of src/app.css: the "grabbed" accent
	   here is red (matching Pin One-Four) rather than the shared default
	   blue, the SVGs are wide and meant to scale responsively, and the
	   pin-identity slider labels need their own small style. */
	.controls {
		min-width: 300px;
		flex: 1 1 300px;
	}
	.controls input[type='range'] {
		accent-color: var(--red);
	}
	.value {
		color: var(--red);
	}
	.slot {
		font-variant-numeric: tabular-nums;
		color: var(--muted);
		font-weight: 400;
		font-size: 0.78rem;
	}
	svg {
		max-width: 100%;
		height: auto;
	}
	button:hover {
		border-color: var(--red);
	}
	.panel-label {
		font-size: 0.75rem;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin: 0 0 8px 4px;
	}
</style>
