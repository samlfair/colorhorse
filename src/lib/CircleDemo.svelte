<script>
	// points: the palette's 12 D-ring hues, in degrees, already bending-energy
	// relaxed by the real color-scheme computation -- this component only
	// renders the ring, it doesn't recompute the hue deformation itself.
	let { points = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330], chroma = 0.5, lightness = 0.5, anchorOneIndex = -1, anchorTwoIndex = -1 } = $props();

	const ringCenter = { x: 200, y: 200 };
	const ringRadius = 160;

	function hueDegreeToCoordinate(hueDegree, offset = 0) {
		const angleRadians = ((hueDegree - 90 - offset) * Math.PI) / 180;
		return {
			x: ringCenter.x + ringRadius * Math.cos(angleRadians),
			y: ringCenter.y + ringRadius * Math.sin(angleRadians),
		};
	}

	let evenlySpacedCoordinates = $derived(
		points.map((_, pointIndex) => hueDegreeToCoordinate((pointIndex * 360) / points.length)),
	);
	let deformedHueCoordinates = $derived(points.map((p) => hueDegreeToCoordinate(p, points[anchorOneIndex])));
	let deformedRingPolygonPointString = $derived(
		deformedHueCoordinates.map((coordinate) => `${coordinate.x},${coordinate.y}`).join(" "),
	);
</script>

<div class="circle-demo">
	<svg viewBox="0 0 400 400" width="400" height="400">
		<circle
			cx={ringCenter.x}
			cy={ringCenter.y}
			r={ringRadius}
			fill="none"
			stroke="var(--border)"
			stroke-width="1"
			stroke-dasharray="4 4"
		/>
		{#each evenlySpacedCoordinates as evenlySpacedCoordinate, pointIndex (pointIndex)}
			<circle
				cx={evenlySpacedCoordinate.x}
				cy={evenlySpacedCoordinate.y}
				r="3"
				fill="var(--muted)"
				opacity="0.5"
			/>
		{/each}
		<polygon
			points={deformedRingPolygonPointString}
			fill="none"
			stroke="var(--primary-05)"
			stroke-width="2"
			stroke-linejoin="round"
		/>
		{#each deformedHueCoordinates as deformedHueCoordinate, pointIndex (pointIndex)}
			{@const isAnchor = pointIndex === anchorOneIndex || pointIndex === anchorTwoIndex}
			<circle
				cx={deformedHueCoordinate.x}
				cy={deformedHueCoordinate.y}
				r="6"
				fill={`oklch(${lightness * 100}% ${chroma} ${points[pointIndex]})`}
				stroke={isAnchor ? "black" : "var(--border)"}
				stroke-width={isAnchor ? "2" : "1"}
			/>
		{/each}
	</svg>
</div>

<style>
	.circle-demo {
		display: flex;
		justify-content: center;
	}

	svg {
		max-width: 100%;
		height: auto;
	}
</style>
