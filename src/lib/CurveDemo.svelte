<script>
	import { hexToOklch, oklchToSrgb, maxInGamutChroma } from "$lib/oklch.js";

	// points: 12 relative chroma values (0-1, one per D-ring hue position)
	// from the palette's ring taper -- this component only renders the taper,
	// it doesn't recompute it. Every point is drawn using the PRIMARY color's
	// own hue and lightness, held constant; only chroma varies from point to
	// point, so the chart isolates what changing chroma alone looks like,
	// independent of hue or lightness.
	let {
		points = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45],
		primaryColor = "#3388ff",
	} = $props();

	$effect(() => console.log({ points }))

	const curveChartBounds = { leftX: 20, rightX: 580, baselineY: 90, maxChromaOffset: 70 };

	function chromaToChartX(pointIndex, totalPointCount) {
		return (
			curveChartBounds.leftX +
			(pointIndex / (totalPointCount - 1)) * (curveChartBounds.rightX - curveChartBounds.leftX)
		);
	}
	function chromaToChartY(chromaValue) {
		return curveChartBounds.baselineY - chromaValue * curveChartBounds.maxChromaOffset;
	}

	let primaryOklch = $derived(hexToOklch(primaryColor));
	let primaryMaxChroma = $derived(maxInGamutChroma(primaryOklch.L, primaryOklch.H));

	function chromaValueToHex(chromaValue) {
		return oklchToSrgb(0.7, chromaValue * primaryMaxChroma, primaryOklch.H).hex;
	}

	let chromaPointCoordinates = $derived(
		points.map((chromaValue, pointIndex) => ({
			x: chromaToChartX(pointIndex, points.length),
			y: chromaToChartY(chromaValue),
			fillColor: chromaValueToHex(chromaValue),
		})),
	);
	let chromaCurvePolylinePointString = $derived(
		chromaPointCoordinates.map((coordinate) => `${coordinate.x},${coordinate.y}`).join(" "),
	);
</script>

<div class="curve-demo">
	<svg viewBox="0 0 600 180" width="600" height="180">
		<line
			x1={curveChartBounds.leftX}
			x2={curveChartBounds.rightX}
			y1={curveChartBounds.baselineY}
			y2={curveChartBounds.baselineY}
			stroke="var(--muted)"
			stroke-width="1.5"
			stroke-dasharray="4 4"
			opacity="0.6"
		/>
		<polyline
			points={chromaCurvePolylinePointString}
			fill="none"
			stroke="var(--primary-05)"
			stroke-width="2"
			stroke-linejoin="round"
		/>
		{#each chromaPointCoordinates as chromaPointCoordinate, pointIndex (pointIndex)}
			<circle
				cx={chromaPointCoordinate.x}
				cy={chromaPointCoordinate.y}
				r="7"
				fill={chromaPointCoordinate.fillColor}
				stroke="var(--main-background)"
				stroke-width="2"
			/>
		{/each}
	</svg>
</div>

<style>
	.curve-demo {
		display: flex;
		justify-content: center;
	}

	svg {
		max-width: 100%;
		height: auto;
	}
</style>
