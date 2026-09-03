<script>
	// Circular radar/spider chart: same D-ring hue angles as CircleDemo, but
	// radius now encodes each hue's relative chroma (0-1, 0 = achromatic
	// center, 1 = sRGB gamut boundary) instead of staying fixed, so the ring
	// traces a slightly deformed circle wherever chroma dips or bulges.
	//
	// rings holds one entry when both anchors share a shade (Z) index (they
	// already sit on the same chroma slice) or two when they don't, one full
	// 360-degree slice per anchor's own shade level -- see +page.svelte's
	// radarRings derivation. This component only draws what it's given.
	import { oklchToSrgb, maxInGamutChroma } from "colorhorse";

	let {
		hueDegrees = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330],
		rings = [{ chromaValues: [], lightness: 0.6, anchors: [] }],
	} = $props();

	const ringCenter = { x: 200, y: 200 };
	const maxRadius = 160;
	const innerRadiusFraction = 0.25; // chroma 0 still shows a visible point, not a collapse to center
	const ringStrokeColors = ["var(--anchor1)", "var(--anchor2)"];
	const gridCircleFractions = [1 / 3, 2 / 3, 1];

	function chromaToCoordinate(hueDegree, chromaFraction) {
		const clampedChroma = Math.max(0, Math.min(1, chromaFraction));
		const radius = maxRadius * (innerRadiusFraction + (1 - innerRadiusFraction) * clampedChroma);
		const angleRadians = ((hueDegree - 90) * Math.PI) / 180;
		return {
			x: ringCenter.x + radius * Math.cos(angleRadians),
			y: ringCenter.y + radius * Math.sin(angleRadians),
		};
	}

	let spokeCoordinates = $derived(
		hueDegrees.map((_, pointIndex) => chromaToCoordinate((pointIndex * 360) / hueDegrees.length, 1)),
	);
	let gridCircleRadii = $derived(
		gridCircleFractions.map((fraction) => maxRadius * (innerRadiusFraction + (1 - innerRadiusFraction) * fraction)),
	);

	let renderedRings = $derived(
		rings.map((ring, ringIndex) => {
			const anchorLabelByPointIndex = new Map(ring.anchors.map((anchor) => [anchor.dIndex, anchor.label]));
			const pointCoordinates = hueDegrees.map((hueDegree, pointIndex) => {
				const chromaFraction = ring.chromaValues[pointIndex] ?? 0;
				const coordinate = chromaToCoordinate(hueDegree, chromaFraction);
				const gamutMaxChroma = maxInGamutChroma(ring.lightness, hueDegree);
				const hex = oklchToSrgb(ring.lightness, chromaFraction * gamutMaxChroma, hueDegree).hex;
				return {
					...coordinate,
					hex,
					anchorLabel: anchorLabelByPointIndex.get(pointIndex) ?? null,
				};
			});
			return {
				strokeColor: ringStrokeColors[ringIndex % ringStrokeColors.length],
				pointCoordinates,
				polygonPointString: pointCoordinates.map((coordinate) => `${coordinate.x},${coordinate.y}`).join(" "),
			};
		}),
	);
</script>

<div class="radar-demo">
	<svg viewBox="0 0 400 400" width="400" height="400">
		{#each gridCircleRadii as gridCircleRadius (gridCircleRadius)}
			<circle
				cx={ringCenter.x}
				cy={ringCenter.y}
				r={gridCircleRadius}
				fill="none"
				stroke="var(--guide)"
				stroke-width="1"
				stroke-dasharray="4 4"
			/>
		{/each}
		{#each spokeCoordinates as spokeCoordinate, pointIndex (pointIndex)}
			<line
				x1={ringCenter.x}
				y1={ringCenter.y}
				x2={spokeCoordinate.x}
				y2={spokeCoordinate.y}
				stroke="var(--guide)"
				stroke-width="1"
				opacity="0.5"
			/>
		{/each}
		{#each renderedRings as renderedRing, ringIndex (ringIndex)}
			<polygon
				points={renderedRing.polygonPointString}
				fill={renderedRing.strokeColor}
				fill-opacity="0.08"
				stroke={renderedRing.strokeColor}
				stroke-width="2"
				stroke-linejoin="round"
			/>
			{#each renderedRing.pointCoordinates as pointCoordinate, pointIndex (pointIndex)}
				{@const isAnchorPoint = pointCoordinate.anchorLabel !== null}
				<circle
					cx={pointCoordinate.x}
					cy={pointCoordinate.y}
					r={isAnchorPoint ? 9 : 5}
					fill={pointCoordinate.hex}
					stroke={isAnchorPoint ? renderedRing.strokeColor : "var(--border)"}
					stroke-width={isAnchorPoint ? 3 : 1}
				/>
				{#if isAnchorPoint}
					<text
						x={pointCoordinate.x}
						y={pointCoordinate.y - 16}
						fill={renderedRing.strokeColor}
						font-size="12"
						font-weight="700"
						text-anchor="middle"
					>
						{pointCoordinate.anchorLabel}
					</text>
				{/if}
			{/each}
		{/each}
	</svg>
</div>

<style>
	.radar-demo {
		display: flex;
		justify-content: center;
	}

	svg {
		max-width: 100%;
		height: auto;
	}
</style>
