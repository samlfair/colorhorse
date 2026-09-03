<script>
	// points: 12 lightness values (0-1) from the palette's Z-level stack,
	// already sorted ascending and bending-energy-placed by the real
	// color-scheme computation -- this component only renders the stack, it
	// doesn't recompute the placement itself. minLightness/maxLightness are
	// the same bounds that stack was placed within (the "Dark"/"Light"
	// sliders on the main control panel), needed here only to scale the axes.
	let {
		points = [0.1, 0.18, 0.26, 0.34, 0.42, 0.5, 0.58, 0.66, 0.74, 0.82, 0.9, 0.98],
		minLightness = 0.1,
		maxLightness = 0.98,
		anchorOneIndex,
		anchorTwoIndex
	} = $props();

	const curveChartBounds = { leftX: 20, rightX: 580, topY: 15, bottomY: 145 };
	const numberLineBounds = { leftX: 20, rightX: 580, y: 30 };

	// Clamped to [0, 1]: a lightness value outside [minLightness, maxLightness]
	// -- stale props mid-update, or just bad input -- should pin to the
	// nearest chart edge, not push its point off the visible chart entirely.
	function lightnessToUnitFraction(lightnessValue) {
		const lightnessDomainSpan = maxLightness - minLightness || 1;
		const rawFraction = (lightnessValue - minLightness) / lightnessDomainSpan;
		return Math.max(0, Math.min(1, rawFraction));
	}

	function lightnessToChartX(pointIndex, totalPointCount) {
		return (
			curveChartBounds.leftX +
			(pointIndex / (totalPointCount - 1)) * (curveChartBounds.rightX - curveChartBounds.leftX)
		);
	}
	function lightnessToChartY(lightnessValue) {
		const unitFraction = lightnessToUnitFraction(lightnessValue);
		return curveChartBounds.bottomY - unitFraction * (curveChartBounds.bottomY - curveChartBounds.topY);
	}
	function lightnessToLineX(lightnessValue) {
		const unitFraction = lightnessToUnitFraction(lightnessValue);
		return numberLineBounds.leftX + unitFraction * (numberLineBounds.rightX - numberLineBounds.leftX);
	}

	let curveChartCoordinates = $derived(
		points.map((lightnessValue, pointIndex) => ({
			x: lightnessToChartX(pointIndex, points.length),
			y: lightnessToChartY(lightnessValue),
		})),
	);
	let curveChartPolylinePointString = $derived(
		curveChartCoordinates.map((coordinate) => `${coordinate.x},${coordinate.y}`).join(" "),
	);

	let numberLineCoordinates = $derived(points.map((lightnessValue) => ({ x: lightnessToLineX(lightnessValue) })));
</script>

<div class="line-demo">
	<svg viewBox="0 0 600 160" width="600" height="160">
		<polyline points={curveChartPolylinePointString} fill="none" stroke="var(--primary-05)" stroke-width="2" />
		{#each curveChartCoordinates as curveChartCoordinate, pointIndex (pointIndex)}
			<circle
				cx={curveChartCoordinate.x}
				cy={curveChartCoordinate.y}
				r="4"
				fill="var(--primary-05)"
				stroke="var(--main-background)"
				stroke-width="1"
			/>
		{/each}
	</svg>

	<svg viewBox="0 0 600 60" width="600" height="60" class="number-line">
		<line
			x1={numberLineBounds.leftX}
			x2={numberLineBounds.rightX}
			y1={numberLineBounds.y}
			y2={numberLineBounds.y}
			stroke="var(--border)"
			stroke-width="1"
		/>
		{#each numberLineCoordinates as numberLineCoordinate, pointIndex (pointIndex)}
			{@const isAnchor = pointIndex === anchorOneIndex || pointIndex === anchorTwoIndex}
			{#if !isAnchor}
			<circle
				cx={numberLineCoordinate.x}
				cy={numberLineBounds.y}
				r="5"
				fill={`oklch(${points[pointIndex]} 0 0)`}
				stroke="var(--border)"
				stroke-width="1"
			/>
			{/if}
		{/each}
		{#each numberLineCoordinates as numberLineCoordinate, pointIndex (pointIndex)}
			{@const isAnchorOne = pointIndex === anchorOneIndex}
			{@const isAnchorTwo = pointIndex === anchorTwoIndex}
			{#if isAnchorOne || isAnchorTwo}
			<circle
				cx={numberLineCoordinate.x}
				cy={numberLineBounds.y}
				r="8"
				fill={isAnchorOne ? "var(--anchorOne)" : "var(--anchorTwo)"}
				stroke-alignment="outer"
				stroke="black"
				stroke-width="2"
			/>
			{/if}
		{/each}
	</svg>
</div>

<style>
	.line-demo {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
	}

	svg {
		max-width: 100%;
		height: auto;
	}

	.number-line {
		margin-top: -0.5em;
	}
</style>
