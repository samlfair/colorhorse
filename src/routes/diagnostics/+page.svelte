<script>
	/**
	 * Chroma Shape Diagnostics (formerly cylinder-chroma-diagnostics.html/.js).
	 * Proves (with live-computed charts, not just prose) that the OKLCH
	 * cylinder's chroma ring/column is a convex ovoid, not a furrowed heart
	 * shape -- see the colorhorse package's cylinder-deform.js "WHY R IS
	 * CLAMPED, THEN CONVEXIFIED" doc for the full story this page demonstrates.
	 *
	 * Deliberately NOT importing the real cylinder-deform.js for the
	 * RAW/pre-fix comparisons below: those intentionally reproduce logic
	 * (e.g. the removed seam-placement scheme) that no longer exists
	 * anywhere else, on purpose, as a frozen historical reference showing
	 * what the bug looked like before the fix. The FIXED variants mirror
	 * the current model's actual behavior but are reimplemented locally
	 * here too, so RAW and FIXED stay a clean, self-contained, apples-to-
	 * apples pair on this one diagnostic page.
	 */
	import Chart from '$lib/Chart.svelte';

	// --- Frozen math: solveLinearSystem / buildRowCoefficients / computeLineBendingDisplacements ---
	function solveLinearSystem(matrix, vector) {
		const n = vector.length;
		const A = matrix.map((row) => row.slice());
		const b = vector.slice();
		for (let col = 0; col < n; col++) {
			let pivotRow = col, pivotMag = Math.abs(A[col][col]);
			for (let row = col + 1; row < n; row++) {
				const mag = Math.abs(A[row][col]);
				if (mag > pivotMag) { pivotMag = mag; pivotRow = row; }
			}
			if (pivotRow !== col) { [A[col], A[pivotRow]] = [A[pivotRow], A[col]]; [b[col], b[pivotRow]] = [b[pivotRow], b[col]]; }
			for (let row = col + 1; row < n; row++) {
				const factor = A[row][col] / A[col][col];
				if (factor === 0) continue;
				for (let k = col; k < n; k++) A[row][k] -= factor * A[col][k];
				b[row] -= factor * b[col];
			}
		}
		const x = new Array(n).fill(0);
		for (let row = n - 1; row >= 0; row--) {
			let sum = b[row];
			for (let k = row + 1; k < n; k++) sum -= A[row][k] * x[k];
			x[row] = sum / A[row][row];
		}
		return x;
	}
	function buildRowCoefficients(X, j) {
		const coeffs = new Map();
		const add = (idx, c) => coeffs.set(idx, (coeffs.get(idx) || 0) + c);
		const addCurvatureTerm = (i, weight) => {
			if (i < 1 || i > X - 2) return;
			add(i - 1, weight * 1); add(i, weight * -2); add(i + 1, weight * 1);
		};
		addCurvatureTerm(j - 1, 1); addCurvatureTerm(j, -2); addCurvatureTerm(j + 1, 1);
		return coeffs;
	}
	function computeLineBendingDisplacements(X, pins) {
		const pinMap = new Map(pins.map((p) => [p.index, p.value]));
		const freeIndices = [];
		for (let i = 0; i < X; i++) if (!pinMap.has(i)) freeIndices.push(i);
		const M = freeIndices.length;
		const freePos = new Map(freeIndices.map((idx, k) => [idx, k]));
		const u = new Array(X).fill(0);
		for (const [idx, val] of pinMap) u[idx] = val;
		if (M === 0) return u;
		const matrix = Array.from({ length: M }, () => new Array(M).fill(0));
		const vector = new Array(M).fill(0);
		freeIndices.forEach((j, row) => {
			const coeffs = buildRowCoefficients(X, j);
			for (const [idx, c] of coeffs) {
				if (pinMap.has(idx)) vector[row] -= c * pinMap.get(idx);
				else matrix[row][freePos.get(idx)] += c;
			}
		});
		const freeU = solveLinearSystem(matrix, vector);
		freeIndices.forEach((idx, k) => { u[idx] = freeU[k]; });
		for (const [idx, val] of pinMap) u[idx] = val;
		return u;
	}
	function circularIndexDistance(a, b, X) { const diff = Math.abs(a - b) % X; return Math.min(diff, X - diff); }
	function chooseSeamIndex(X, a1, a2) {
		let bestIdx = -1, bestScore = -1;
		for (let i = 0; i < X; i++) {
			if (i === a1 || i === a2) continue;
			const score = Math.min(circularIndexDistance(i, a1, X), circularIndexDistance(i, a2, X));
			if (score > bestScore) { bestScore = score; bestIdx = i; }
		}
		return bestIdx;
	}

	function rawColumn(numZLevels, minChroma, ringVal, equatorZIndex) {
		const pins = [{ index: 0, value: minChroma }, { index: numZLevels - 1, value: minChroma }, { index: equatorZIndex, value: ringVal }];
		return computeLineBendingDisplacements(numZLevels, pins);
	}
	function fixedColumn(numZLevels, minChroma, ringVal, equatorZIndex, isAnchor) {
		const equatorValue = isAnchor ? ringVal : Math.max(ringVal, minChroma);
		const pins = [{ index: 0, value: minChroma }, { index: numZLevels - 1, value: minChroma }, { index: equatorZIndex, value: equatorValue }];
		const pinnedZ = new Set([0, numZLevels - 1, equatorZIndex]);
		const raw = computeLineBendingDisplacements(numZLevels, pins);
		return raw.map((v, k) => {
			if (pinnedZ.has(k)) return v;
			return isAnchor ? Math.min(1, Math.max(0, v)) : Math.min(1, Math.max(minChroma, v));
		});
	}
	function rawRing(X, a1idx, a2idx, a1R, a2R, minChroma) {
		const seamIndex = chooseSeamIndex(X, a1idx, a2idx);
		const nativePins = new Map([[seamIndex, minChroma], [a1idx, a1R], [a2idx, a2R]]);
		const pins = [];
		for (let k = 0; k <= X; k++) { const ni = (seamIndex + k) % X; if (nativePins.has(ni)) pins.push({ index: k, value: nativePins.get(ni) }); }
		const u = computeLineBendingDisplacements(X + 1, pins);
		const R = new Array(X);
		for (let k = 0; k < X; k++) R[(seamIndex + k) % X] = u[k];
		return R;
	}
	function fixedRing(X, a1idx, a2idx, a1R, a2R, minChroma) {
		const seamIndex = chooseSeamIndex(X, a1idx, a2idx);
		const nativePins = new Map([[seamIndex, minChroma], [a1idx, a1R], [a2idx, a2R]]);
		const pins = [];
		for (let k = 0; k <= X; k++) { const ni = (seamIndex + k) % X; if (nativePins.has(ni)) pins.push({ index: k, value: nativePins.get(ni) }); }
		const u = computeLineBendingDisplacements(X + 1, pins);
		const R = new Array(X);
		for (let k = 0; k < X; k++) {
			const ni = (seamIndex + k) % X;
			R[ni] = nativePins.has(ni) ? u[k] : Math.min(1, Math.max(minChroma, u[k]));
		}
		return R;
	}
	function isUnimodal(arr, tol) {
		const n = arr.length;
		let i = 0;
		while (i < n - 1 && arr[i + 1] >= arr[i] - tol) i++;
		while (i < n - 1 && arr[i + 1] <= arr[i] + tol) i++;
		return i === n - 1;
	}

	function chartBounds(raw, fixed) {
		const allVals = raw.concat(fixed).concat([0, 1]);
		return { yMin: Math.min(0, ...allVals) - 0.05, yMax: Math.max(1, ...allVals) + 0.05 };
	}

	function columnPanel(title, note, numZLevels, minChroma, ringVal, equatorZIndex, isAnchor) {
		const raw = rawColumn(numZLevels, minChroma, ringVal, equatorZIndex);
		const fixed = fixedColumn(numZLevels, minChroma, ringVal, equatorZIndex, isAnchor);
		const pinnedIndices = new Set([0, numZLevels - 1, equatorZIndex]);
		const { yMin, yMax } = chartBounds(raw, fixed);

		const rawFloor = isAnchor ? 0 : minChroma;
		const rawOutOfBounds = raw.some((v) => v < rawFloor - 1e-9 || v > 1 + 1e-9);
		const rawUnimodalUp = isUnimodal(raw, 1e-9);
		const rawUnimodalDown = isUnimodal(raw.map((v) => -v), 1e-9);
		const fixedInBounds = fixed.every((v) => v >= (isAnchor ? -1e-9 : minChroma - 1e-9) && v <= 1 + 1e-9);
		const fixedShapeOk = isUnimodal(fixed, 1e-9) || (isAnchor && isUnimodal(fixed.map((v) => -v), 1e-9));
		const ok = fixedInBounds && fixedShapeOk;
		let rawDesc;
		if (rawUnimodalUp) rawDesc = rawOutOfBounds ? 'unimodal but overshoots the valid range' : 'already in-bounds (nothing to correct here)';
		else if (rawUnimodalDown) rawDesc = 'a single valley' + (rawOutOfBounds ? ', dipping out of bounds' : '');
		else rawDesc = 'NOT unimodal -- a genuine multi-wiggle furrow';
		const verdictText = ok
			? `FIXED: in-bounds, ${isUnimodal(fixed, 1e-9) ? 'single bulge' : 'single valley (anchor exception)'}, no furrow. RAW was ${rawDesc}.`
			: 'FAIL: fixed output is out of bounds or not a single smooth shape.';

		return {
			title, note, ok, verdictText, yMin, yMax, floor: isAnchor ? undefined : minChroma,
			series: [
				{ values: raw, color: 'var(--raw)', dashed: true },
				{ values: fixed, color: 'var(--fixed)', pinnedIndices }
			]
		};
	}

	function ringPanel(title, note, X, a1idx, a2idx, a1R, a2R, minChroma) {
		const raw = rawRing(X, a1idx, a2idx, a1R, a2R, minChroma);
		const fixed = fixedRing(X, a1idx, a2idx, a1R, a2R, minChroma);
		const seamIndex = chooseSeamIndex(X, a1idx, a2idx);
		const pinnedIndices = new Set([a1idx, a2idx, seamIndex]);
		const { yMin, yMax } = chartBounds(raw, fixed);

		const rawMin = Math.min(...raw);
		const ok = fixed.every((v, i) => v >= 0 - 1e-9 && v <= 1 + 1e-9 && (i === a1idx || i === a2idx || v >= minChroma - 1e-9));
		const verdictText = ok
			? `FIXED: every non-anchor hue stays >= minChroma, all hues in [0,1]. RAW dipped to ${rawMin.toFixed(3)}${rawMin < 0 ? ' -- NEGATIVE, i.e. this hue would have rendered flipped to its complementary color.' : '.'}`
			: 'FAIL: fixed ring left its valid domain.';

		return {
			title, note, ok, verdictText, yMin, yMax, floor: minChroma,
			series: [
				{ values: raw, color: 'var(--raw)', dashed: true },
				{ values: fixed, color: 'var(--fixed)', pinnedIndices }
			]
		};
	}

	const columnPanels = [
		columnPanel(
			'Equator near a boundary (overshoot)',
			'numZLevels=10, minChroma=0.2, ring value=0.7, equator at Z-index 1 (right next to the bottom pin). RAW massively overshoots the ring value; FIXED clips it back into range but stays a single bulge.',
			10, 0.2, 0.7, 1, false
		),
		columnPanel(
			'Equator centered (baseline, no bug)',
			'Same values, equator at the middle (Z-index 5). RAW and FIXED are nearly identical -- confirms the clamp does not distort the common, well-behaved case.',
			10, 0.2, 0.7, 5, false
		),
		columnPanel(
			'Ring value below the floor -- non-anchor column (the furrow)',
			'minChroma=0.2, but this hue’s ring value is only 0.05 -- lower than the floor. RAW dips well below minChroma AND swings back up (a real furrow, non-monotonic). FIXED flattens it into a shelf at minChroma: no dip below the floor, single bulge restored.',
			10, 0.2, 0.05, 2, false
		),
		columnPanel(
			'Ring value below the floor -- this hue’s OWN anchor',
			'Same inputs, but this IS the anchor whose exact picked chroma (0.05) is genuinely below minChroma. The dip is now legitimate (exact color reproduction wins) -- FIXED keeps it as ONE smooth valley in [0,1], not flattened, and not a multi-wiggle furrow.',
			10, 0.2, 0.05, 2, true
		)
	];

	const ringPanels = [
		ringPanel(
			'Adjacent anchors, very different chroma',
			'X=12, anchors at native D-indices 0 and 1 (30° apart) with R=0.9 and R=0.2, minChroma=0.2 -- a plausible pick (two similar hues, very different saturation). RAW swings deeply negative between them.',
			12, 0, 1, 0.9, 0.2, 0.2
		),
		ringPanel(
			'Opposite anchors (mostly-baseline case)',
			'Same X and R values, anchors 180° apart (indices 0 and 6) -- plenty of ring to absorb the transition, so RAW mostly tracks FIXED closely. It still dips slightly below the minChroma floor near the far side, which FIXED still catches -- the bug is milder here, not absent.',
			12, 0, 6, 0.9, 0.2, 0.2
		)
	];

	/* ------------------------- interactive explorer ------------------------- */
	const NUM_Z = 10;
	let eq = $state(1);
	let ringVal = $state(0.7);
	let mc = $state(0.2);
	let isAnchor = $state(false);

	let liveRaw = $derived(rawColumn(NUM_Z, mc, ringVal, eq));
	let liveFixed = $derived(fixedColumn(NUM_Z, mc, ringVal, eq, isAnchor));
	let livePinned = $derived(new Set([0, NUM_Z - 1, eq]));
	let liveBounds = $derived(chartBounds(liveRaw, liveFixed));
	let liveInBounds = $derived(liveFixed.every((v) => v >= (isAnchor ? -1e-9 : mc - 1e-9) && v <= 1 + 1e-9));
	let liveShapeOk = $derived(isUnimodal(liveFixed, 1e-9) || (isAnchor && isUnimodal(liveFixed.map((v) => -v), 1e-9)));
	let liveRawFurrow = $derived(!isUnimodal(liveRaw, 1e-9) && !isUnimodal(liveRaw.map((v) => -v), 1e-9));
	let liveOk = $derived(liveInBounds && liveShapeOk);
	let liveVerdictText = $derived(
		(liveOk ? 'FIXED: no furrow.' : 'FIXED: FURROW DETECTED.') +
			` (RAW ${liveRawFurrow ? 'has a genuine multi-wiggle furrow' : 'is a single smooth shape, just possibly out of bounds'}; RAW range [${Math.min(...liveRaw).toFixed(3)}, ${Math.max(...liveRaw).toFixed(3)}])`
	);
</script>

<svelte:head>
	<title>Chroma Shape Diagnostics: Furrow Check</title>
</svelte:head>

<div class="wrap">
	<h1>Chroma Shape Diagnostics: Is It a Furrow?</h1>
	<p class="lead">
		<code>cylinder-deform.js</code> derives every point's chroma (R, 0-1
		relative to the gamut boundary) with the same minimum-bending-energy
		solver used everywhere in this project. That solver only minimizes
		curvature -- it has no notion that R is physically bounded to
		<code>[0, 1]</code>, or that <code>minChroma</code> is meant to be a
		real floor for the whole shape. Left alone, it can dip below either
		bound between two pins that are close together in index but far apart
		in value: a literal <strong>furrow</strong> cut into what should be a
		smooth "convex ovoid" (egg-shaped) bulge. Worse, a dip below 0
		silently flips the rendered hue (OKLab treats negative chroma as
		positive chroma at the opposite hue), so a furrow isn't just a cosmetic
		dent -- it's the wrong color.
	</p>
	<p class="sub">
		Every chart below is computed live in this page from the same solver
		cylinder-deform.js uses (reimplemented locally, frozen, for this
		before/after comparison). RAW is what the solver returns with no
		correction; FIXED is what the current model actually returns (free
		points clamped to <code>[minChroma, 1]</code>, or <code>[0, 1]</code>
		for a column that's allowed to legitimately dip below the floor -- an
		anchor's own picked chroma).
	</p>
	<div class="legend">
		<span><span class="swatch" style="background:var(--raw)"></span>RAW (unclamped solve)</span>
		<span><span class="swatch" style="background:var(--fixed)"></span>FIXED (as shipped)</span>
		<span><span class="swatch" style="background:var(--pin)"></span>pinned exactly (anchor / minChroma)</span>
		<span><span class="swatch" style="background:var(--floorline);opacity:.8"></span>minChroma floor</span>
		<span><span class="swatch" style="background:var(--invalid)"></span>invalid / furrow region</span>
	</div>

	<h2>1. Z-taper columns (the "egg" axis -- one hue, chroma vs. lightness)</h2>
	<p class="sub">Each column is 3 pins: <code>minChroma</code> at both ends, one interior peak. This is the axis the ticket calls "convex ovoid" -- it should always look like a single smooth bulge.</p>
	<div class="grid">
		{#each columnPanels as p (p.title)}
			<div class="panel">
				<h3>{p.title}</h3>
				<p class="note">{p.note}</p>
				<Chart series={p.series} yMin={p.yMin} yMax={p.yMax} floor={p.floor} />
				<div class="verdict" class:ok={p.ok} class:bad={!p.ok}>{p.verdictText}</div>
			</div>
		{/each}
	</div>

	<h2>2. The D-ring (chroma around the hue wheel)</h2>
	<p class="sub">Two independently-placed anchor peaks plus a seam pinned to <code>minChroma</code>. A dip between two differently-saturated anchors is normal -- the bug is a dip going invalid (below 0, or below the floor away from the anchors), not the presence of a dip itself.</p>
	<div class="grid">
		{#each ringPanels as p (p.title)}
			<div class="panel">
				<h3>{p.title}</h3>
				<p class="note">{p.note}</p>
				<Chart series={p.series} yMin={p.yMin} yMax={p.yMax} floor={p.floor} />
				<div class="verdict" class:ok={p.ok} class:bad={!p.ok}>{p.verdictText}</div>
			</div>
		{/each}
	</div>

	<h2>3. Try it yourself</h2>
	<p class="sub">Drag the sliders to explore any Z-taper column configuration directly -- RAW vs FIXED update live, along with a furrow check identical to the one in the test suite.</p>
	<div class="panel interactive">
		<div class="controls">
			<label>Equator Z-index (where the peak pin sits, 1-8)
				<div><span class="value">{eq}</span></div>
				<input type="range" min="1" max="8" step="1" bind:value={eq} />
			</label>
			<label>Ring value at this hue (the peak's target chroma)
				<div><span class="value">{ringVal.toFixed(2)}</span></div>
				<input type="range" min="0" max="1" step="0.01" bind:value={ringVal} />
			</label>
			<label>minChroma (the floor)
				<div><span class="value">{mc.toFixed(2)}</span></div>
				<input type="range" min="0" max="1" step="0.01" bind:value={mc} />
			</label>
			<label><input type="checkbox" bind:checked={isAnchor} style="width:auto;display:inline-block;vertical-align:middle;" /> Treat as this hue's own anchor column (allowed to dip below the floor)</label>
			<div class="verdict" class:ok={liveOk} class:bad={!liveOk}>{liveVerdictText}</div>
		</div>
		<div class="chart-col">
			<Chart series={[{ values: liveRaw, color: 'var(--raw)', dashed: true }, { values: liveFixed, color: 'var(--fixed)', pinnedIndices: livePinned }]} yMin={liveBounds.yMin} yMax={liveBounds.yMax} floor={isAnchor ? undefined : mc} width={560} height={260} />
		</div>
	</div>
</div>

<style>
	:global(:root) {
		--raw: #ff6b6b;
		--fixed: #4da3ff;
		--pin: #35d07f;
		--invalid: rgba(255, 92, 92, 0.14);
		--floorline: #ffb454;
	}
	h1 { font-size: 1.3rem; margin: 0 0 6px 0; }
	h2 { font-size: 1rem; margin: 36px 0 4px 0; }
	p.sub, p.lead {
		color: var(--muted);
		max-width: 90ch;
		font-size: 0.92rem;
		line-height: 1.5;
	}
	.legend {
		display: flex;
		gap: 18px;
		flex-wrap: wrap;
		font-size: 0.8rem;
		color: var(--muted);
		margin: 4px 0 18px 0;
	}
	.legend span { display: inline-flex; align-items: center; gap: 6px; }
	.swatch { width: 18px; height: 3px; display: inline-block; border-radius: 2px; }
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
		gap: 20px;
	}
	.panel h3 { font-size: 0.88rem; margin: 0 0 2px 0; }
	.panel p.note { font-size: 0.78rem; color: var(--muted); margin: 0 0 10px 0; line-height: 1.4; }
	.verdict { font-size: 0.78rem; font-weight: 600; margin-top: 6px; }
	.verdict.ok { color: var(--pin); }
	.verdict.bad { color: var(--raw); }
	.interactive {
		display: flex;
		gap: 24px;
		flex-wrap: wrap;
		align-items: flex-start;
	}
	.controls { min-width: 260px; flex: 1 1 260px; }
	.controls label { display: block; font-size: 0.82rem; color: var(--muted); margin: 14px 0 6px 0; }
	.controls .value { color: var(--text); font-weight: 600; }
	.chart-col { flex: 2 1 480px; min-width: 320px; }
</style>
