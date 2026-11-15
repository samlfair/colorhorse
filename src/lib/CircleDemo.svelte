<script>
	// points: the palette's 12 D-ring hues, in degrees, already bending-energy
	// relaxed by the real color-scheme computation -- this component only
	// renders the ring, it doesn't recompute the hue deformation itself.
	// points are angles on the palette's hue wheel; hues are the matching
	// OKLCH hues for the fill colors (the same values on the RGB wheel).
	// labels: optional text per point, drawn outside the ring. Passing them
	// also draws the two anchors as larger numbered seeds.
	let { points = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330], hues = points, chroma = 0.5, lightness = 0.5, anchorOneIndex = -1, anchorTwoIndex = -1, labels = [], title = "Hues around the color wheel" } = $props();

	const ringCenter = { x: 200, y: 200 };
	const ringRadius = 160;

	const labelRadius = ringRadius + 28;

	function hueDegreeToCoordinate(hueDegree, offset = 0, radius = ringRadius) {
		const angleRadians = ((hueDegree - 90 - offset) * Math.PI) / 180;
		return {
			x: ringCenter.x + radius * Math.cos(angleRadians),
			y: ringCenter.y + radius * Math.sin(angleRadians),
		};
	}

	function labelAnchor(coordinate) {
		if (coordinate.x > ringCenter.x + 20) return "start";
		if (coordinate.x < ringCenter.x - 20) return "end";
		return "middle";
	}

	let showLabels = $derived(labels.length > 0);
	let seedNumbers = $derived({ [anchorOneIndex]: "1", [anchorTwoIndex]: "2" });
	let seedTextColor = $derived(lightness > 0.6 ? "black" : "white");

	// With labels, the frame fits the ring and the labels actually drawn
	// (widths estimated at ~0.6em per character) rather than reserving room
	// for the longest possible label on every side.
	const LABEL_FONT_SIZE = 14;
	let labelledFrame = $derived.by(() => {
		const margin = 6;
		const ringExtent = ringRadius + 15;
		let minX = ringCenter.x - ringExtent;
		let maxX = ringCenter.x + ringExtent;
		let minY = ringCenter.y - ringExtent;
		let maxY = ringCenter.y + ringExtent;
		points.forEach((point, pointIndex) => {
			if (!labels[pointIndex]) return;
			const coordinate = hueDegreeToCoordinate(point, points[anchorOneIndex], labelRadius);
			const width = labels[pointIndex].length * LABEL_FONT_SIZE * 0.6;
			const anchor = labelAnchor(coordinate);
			const left = anchor === "start" ? coordinate.x : anchor === "end" ? coordinate.x - width : coordinate.x - width / 2;
			minX = Math.min(minX, left);
			maxX = Math.max(maxX, left + width);
			minY = Math.min(minY, coordinate.y - LABEL_FONT_SIZE / 2);
			maxY = Math.max(maxY, coordinate.y + LABEL_FONT_SIZE / 2);
		});
		const x = Math.floor(minX - margin);
		const y = Math.floor(minY - margin);
		return { x, y, width: Math.ceil(maxX + margin) - x, height: Math.ceil(maxY + margin) - y };
	});

	let evenlySpacedCoordinates = $derived(
		points.map((_, pointIndex) => hueDegreeToCoordinate((pointIndex * 360) / points.length)),
	);
	let deformedHueCoordinates = $derived(points.map((p) => hueDegreeToCoordinate(p, points[anchorOneIndex])));
	let deformedRingPolygonPointString = $derived(
		deformedHueCoordinates.map((coordinate) => `${coordinate.x},${coordinate.y}`).join(" "),
	);
</script>

<div class="circle-demo">
	<svg
		viewBox={showLabels ? `${labelledFrame.x} ${labelledFrame.y} ${labelledFrame.width} ${labelledFrame.height}` : "0 0 400 400"}
		width={showLabels ? labelledFrame.width : 400}
		height={showLabels ? labelledFrame.height : 400}
		role="img"
	>
		<title>{title}</title>
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
			{@const isSeed = showLabels && isAnchor}
			<circle
				cx={deformedHueCoordinate.x}
				cy={deformedHueCoordinate.y}
				r={isSeed ? 13 : 6}
				fill={`oklch(${lightness * 100}% ${chroma} ${hues[pointIndex]})`}
				stroke={isAnchor ? "var(--text, black)" : "var(--border)"}
				stroke-width={isAnchor ? "2" : "1"}
			/>
			{#if isSeed}
				<text
					x={deformedHueCoordinate.x}
					y={deformedHueCoordinate.y}
					fill={seedTextColor}
					font-size="14"
					font-weight="700"
					text-anchor="middle"
					dominant-baseline="central"
				>{seedNumbers[pointIndex]}</text>
			{/if}
		{/each}
		{#if showLabels}
			{#each points as point, pointIndex (pointIndex)}
				{@const labelCoordinate = hueDegreeToCoordinate(point, points[anchorOneIndex], labelRadius)}
				{#if labels[pointIndex]}
					<text
						x={labelCoordinate.x}
						y={labelCoordinate.y}
						fill="var(--text, black)"
						font-size={LABEL_FONT_SIZE}
						font-weight={pointIndex === anchorOneIndex || pointIndex === anchorTwoIndex ? 700 : 500}
						text-anchor={labelAnchor(labelCoordinate)}
						dominant-baseline="central"
					>{labels[pointIndex]}</text>
				{/if}
			{/each}
		{/if}
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
