<script>
	// points: the palette's 12 D-ring hues, in degrees, already bending-energy
	// relaxed by the real color-scheme computation -- this component only
	// renders the ring, it doesn't recompute the hue deformation itself.
	// points are angles on the palette's hue wheel; hues are the matching
	// OKLCH hues for the fill colors (the same values on the RGB wheel).
	// labels: optional text per point, drawn outside the ring. Passing them
	// also draws the two anchors as larger numbered seeds.
	// band: a colored band under the dots -- "rainbow" (every hue on the
	// wheel, via toHue), "proportional" (one segment per hue, reaching
	// halfway to each neighbor) or "equal" (twelve equal segments), with a
	// 2px gap between segments; with "equal", labels sit at the segments'
	// centers. dots: whether to draw the hue dots and the even-spacing
	// markers. outline: whether to join the hues with a line. hueMarkers:
	// rings at the hues instead, black or white for contrast with the band.
	let { points = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330], hues = points, chroma = 0.5, lightness = 0.5, anchorOneIndex = -1, anchorTwoIndex = -1, labels = [], title = "Hues around the color wheel", band = "none", toHue = (wheelAngle) => wheelAngle, dots = true, outline = true, hueMarkers = false } = $props();

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
	let labelAngles = $derived(
		band === "equal"
			? points.map((_, pointIndex) => (points[anchorOneIndex] ?? 0) + (pointIndex - Math.max(anchorOneIndex, 0)) * (360 / points.length))
			: points,
	);
	let seedNumbers = $derived({ [anchorOneIndex]: "1", [anchorTwoIndex]: "2" });
	// Black or white, whichever reads on this lightness: for the seed
	// numbers on their dots, and the hue rings on the band.
	let contrastColor = $derived(lightness > 0.6 ? "black" : "white");

	// With labels, the frame is centered on the ring and leaves room for
	// the longest label at either side (widths estimated at ~0.6em per
	// character) and a label's height above and below. So the ring stays
	// in the middle and the frame keeps its size as the labels move round.
	const LABEL_FONT_SIZE = 14;
	let labelledFrame = $derived.by(() => {
		const margin = 6;
		const ringExtent = ringRadius + 15;
		const longestLabel = Math.max(0, ...labels.filter(Boolean).map((label) => label.length * LABEL_FONT_SIZE * 0.6));
		const halfWidth = Math.ceil(Math.max(ringExtent, labelRadius + longestLabel) + margin);
		const halfHeight = Math.ceil(Math.max(ringExtent, labelRadius + LABEL_FONT_SIZE / 2) + margin);
		return { x: ringCenter.x - halfWidth, y: ringCenter.y - halfHeight, width: halfWidth * 2, height: halfHeight * 2 };
	});

	// Where each label goes: at its hue, unless that would overlap a
	// neighbor, in which case neighbors are nudged apart around the circle
	// (keeping their order) until no two overlap. Angles are on screen,
	// with 0 at the top.
	const LABEL_GAP = 3;
	const LABEL_NUDGE = 0.5;

	function labelBox(screenAngle, label) {
		const coordinate = hueDegreeToCoordinate(screenAngle, 0, labelRadius);
		const width = label.length * LABEL_FONT_SIZE * 0.6;
		const anchor = labelAnchor(coordinate);
		const left = anchor === "start" ? coordinate.x : anchor === "end" ? coordinate.x - width : coordinate.x - width / 2;
		return { left, right: left + width, top: coordinate.y - LABEL_FONT_SIZE / 2, bottom: coordinate.y + LABEL_FONT_SIZE / 2 };
	}

	function boxesOverlap(first, second) {
		return first.left < second.right + LABEL_GAP && second.left < first.right + LABEL_GAP
			&& first.top < second.bottom + LABEL_GAP && second.top < first.bottom + LABEL_GAP;
	}

	let labelPlacements = $derived.by(() => {
		const offset = points[anchorOneIndex] ?? 0;
		const placed = labelAngles
			.map((angle, pointIndex) => ({ pointIndex, label: labels[pointIndex], home: (((angle - offset) % 360) + 360) % 360 }))
			.filter((placement) => placement.label)
			.sort((first, second) => first.home - second.home);
		placed.forEach((placement) => placement.angle = placement.home);
		for (let round = 0; round < 400 && placed.length > 1; round++) {
			let nudged = false;
			placed.forEach((placement, order) => {
				const next = placed[(order + 1) % placed.length];
				if (next === placement) return;
				const nextAngle = order === placed.length - 1 ? next.angle + 360 : next.angle;
				if (!boxesOverlap(labelBox(placement.angle, placement.label), labelBox(nextAngle, next.label))) return;
				placement.angle -= LABEL_NUDGE;
				next.angle += LABEL_NUDGE;
				nudged = true;
			});
			if (!nudged) break;
		}
		return placed.map((placement) => ({
			...placement,
			coordinate: hueDegreeToCoordinate(placement.angle, 0, labelRadius),
		}));
	});

	const BAND_WIDTH = 15;

	// A segment of the band, between two wheel angles.
	function bandSegment(fromAngle, toAngle, offset) {
		const inner = ringRadius - BAND_WIDTH / 2;
		const outer = ringRadius + BAND_WIDTH / 2;
		const largeArc = toAngle - fromAngle > 180 ? 1 : 0;
		const [outerStart, outerEnd, innerEnd, innerStart] = [
			hueDegreeToCoordinate(fromAngle, offset, outer),
			hueDegreeToCoordinate(toAngle, offset, outer),
			hueDegreeToCoordinate(toAngle, offset, inner),
			hueDegreeToCoordinate(fromAngle, offset, inner),
		];
		// Larger angles run clockwise on screen (SVG's y points down): out
		// along the outer arc clockwise, back along the inner one.
		return `M${outerStart.x},${outerStart.y} A${outer},${outer} 0 ${largeArc} 1 ${outerEnd.x},${outerEnd.y} L${innerEnd.x},${innerEnd.y} A${inner},${inner} 0 ${largeArc} 0 ${innerStart.x},${innerStart.y} Z`;
	}

	function bandColor(hue) {
		return `oklch(${lightness * 100}% ${chroma} ${hue})`;
	}

	let bandSegments = $derived.by(() => {
		const offset = points[anchorOneIndex];
		if (band === "rainbow") {
			// One degree at a time, each a touch wider so no seams show.
			return Array.from({ length: 360 }, (_, degree) => ({
				d: bandSegment(degree, degree + 1.5, offset),
				fill: bandColor(toHue(degree + 0.5)),
			}));
		}
		if (band === "proportional") {
			return points.map((point, pointIndex) => {
				const previous = points[(pointIndex - 1 + points.length) % points.length];
				const next = points[(pointIndex + 1) % points.length];
				const halfGap = (from, to) => (((to - from) % 360) + 360) % 360 / 2;
				return {
					d: bandSegment(point - halfGap(previous, point), point + halfGap(point, next), offset),
					fill: bandColor(hues[pointIndex]),
				};
			});
		}
		if (band === "equal") {
			// Hue n gets the nth twelfth, counted from anchor one at the top.
			const step = 360 / points.length;
			const start = offset ?? 0;
			const firstIndex = Math.max(anchorOneIndex, 0);
			return points.map((_, pointIndex) => {
				const center = start + (pointIndex - firstIndex) * step;
				return {
					d: bandSegment(center - step / 2, center + step / 2, offset),
					fill: bandColor(hues[pointIndex]),
				};
			});
		}
		return [];
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
		{#each bandSegments as segment, segmentIndex (segmentIndex)}
			<!-- A pixel of background on each side: 2px between neighbors. -->
			<path
				d={segment.d}
				fill={segment.fill}
				stroke={band === "rainbow" ? undefined : "var(--content-background, white)"}
				stroke-width={band === "rainbow" ? undefined : 2}
			/>
		{/each}
		{#each dots ? evenlySpacedCoordinates : [] as evenlySpacedCoordinate, pointIndex (pointIndex)}
			<circle
				cx={evenlySpacedCoordinate.x}
				cy={evenlySpacedCoordinate.y}
				r="3"
				fill="var(--muted)"
				opacity="0.5"
			/>
		{/each}
		{#if outline}
			<polygon
				points={deformedRingPolygonPointString}
				fill="none"
				stroke={hueMarkers ? contrastColor : "var(--primary-05)"}
				stroke-width="2"
				stroke-linejoin="round"
			/>
		{/if}
		{#each hueMarkers ? deformedHueCoordinates : [] as markerCoordinate, pointIndex (pointIndex)}
			<circle
				cx={markerCoordinate.x}
				cy={markerCoordinate.y}
				r="5"
				fill="none"
				stroke={contrastColor}
				stroke-width="2"
			/>
		{/each}
		{#each dots ? deformedHueCoordinates : [] as deformedHueCoordinate, pointIndex (pointIndex)}
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
					fill={contrastColor}
					font-size="14"
					font-weight="700"
					text-anchor="middle"
					dominant-baseline="central"
				>{seedNumbers[pointIndex]}</text>
			{/if}
		{/each}
		{#if showLabels}
			{#each labelPlacements as placement (placement.pointIndex)}
				<text
					x={placement.coordinate.x}
					y={placement.coordinate.y}
					fill="var(--text, black)"
					font-size={LABEL_FONT_SIZE}
					font-weight={placement.pointIndex === anchorOneIndex || placement.pointIndex === anchorTwoIndex ? 700 : 500}
					text-anchor={labelAnchor(placement.coordinate)}
					dominant-baseline="central"
				>{placement.label}</text>
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
