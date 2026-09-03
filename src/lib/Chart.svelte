<script>
	/**
	 * Reusable line-chart panel, extracted from the old imperative
	 * renderChart() in cylinder-chroma-diagnostics.js (which built SVG nodes
	 * by hand via document.createElementNS). Used by every static comparison
	 * panel AND the interactive explorer on /diagnostics -- one component
	 * instead of that logic duplicated per panel.
	 *
	 * @prop {Array<{values:number[], color:string, dashed?:boolean, pinnedIndices?:Set<number>}>} series
	 * @prop {number} yMin
	 * @prop {number} yMax
	 * @prop {number} [floor] - if set, draws a dashed floor line + shades the invalid region below it
	 * @prop {number} [width]
	 * @prop {number} [height]
	 */
	let { series, yMin, yMax, floor = undefined, width = 480, height = 220 } = $props();

	const padL = 40, padR = 12, padT = 12, padB = 24;
	let innerW = $derived(width - padL - padR);
	let innerH = $derived(height - padT - padB);
	let n = $derived(series[0].values.length);

	function x(i) {
		return padL + (innerW * i) / (n - 1);
	}
	function y(v) {
		return padT + innerH * (1 - (v - yMin) / (yMax - yMin));
	}

	let ticks = $derived(
		[...new Set([yMin, yMax, 0, floor].filter((v) => v !== undefined && v >= yMin && v <= yMax))]
	);

	function seriesPoints(values) {
		return values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
	}
</script>

<svg viewBox="0 0 {width} {height}">
	{#if floor !== undefined && floor > yMin}
		<rect x={padL} y={y(floor)} width={innerW} height={Math.max(0, y(yMin) - y(floor))} fill="var(--invalid)" />
	{/if}
	{#if yMin < 0}
		<rect x={padL} y={y(0)} width={innerW} height={Math.max(0, y(yMin) - y(0))} fill="var(--invalid)" />
	{/if}

	{#each ticks as t (t)}
		<line x1={padL} x2={padL + innerW} y1={y(t)} y2={y(t)} stroke="var(--grid)" stroke-width="1" />
		<text x={padL - 6} y={y(t) + 3} fill="var(--muted)" font-size="9" text-anchor="end">{t.toFixed(2)}</text>
	{/each}
	{#if floor !== undefined}
		<line x1={padL} x2={padL + innerW} y1={y(floor)} y2={y(floor)} stroke="var(--floorline)" stroke-width="1" stroke-dasharray="3,3" />
	{/if}

	{#each series as s, si (si)}
		<polyline
			points={seriesPoints(s.values)}
			fill="none"
			stroke={s.color}
			stroke-width="2"
			stroke-dasharray={s.dashed ? '5,4' : 'none'}
			opacity={s.dashed ? 0.85 : 1}
		/>
		{#each s.values as v, i (i)}
			{@const isPin = s.pinnedIndices && s.pinnedIndices.has(i)}
			<circle cx={x(i)} cy={y(v)} r={isPin ? 4 : 2.5} fill={isPin ? 'var(--pin)' : s.color} />
		{/each}
	{/each}

	<line x1={padL} x2={padL + innerW} y1={padT + innerH} y2={padT + innerH} stroke="var(--grid)" stroke-width="1" />
</svg>

<style>
	svg {
		width: 100%;
		height: auto;
		display: block;
	}
</style>
