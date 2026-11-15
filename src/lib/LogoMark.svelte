<script>
	import { logoGeometry, horseTransform, LOGO_PADDING, LOGO_CORNER_RADIUS, LOGO_SHAPE } from "$lib/logo-geometry.js";
	import { HORSE_EAR, HORSE_MANE, HORSE_BODY } from "$lib/horse-paths.js";

	let {
		background = "#dfc7f4",
		// The background in dark mode; without it, the background stays put.
		backgroundDark = undefined,
		// The horse outside both circles, still within the background.
		headOutside = "#b28fd1",
		circleOne = "#1d90fa",
		circleTwo = "#f44b29",
		overlap = "#20a39e",
		headOne = "#284e78",
		headTwo = "#75382b",
		headOverlap = "#2c5552",
		overlapArcFraction = LOGO_SHAPE.overlapArcFraction,
		axisDegrees = LOGO_SHAPE.axisDegrees,
		horseScale = 4,
		horseX = 0,
		horseY = 0,
		size = 240,
		// Widen the background to the right into a square, showing more of the horse.
		square = false,
		title = "Color Horse",
		// Beside a heading that already names it: hidden from screen readers.
		decorative = false,
	} = $props();

	const id = $props.id();

	let geometry = $derived(logoGeometry({ overlapArcFraction, axisDegrees, padding: LOGO_PADDING, square }));
	let viewBox = $derived(`${geometry.viewBox.x} ${geometry.viewBox.y} ${geometry.viewBox.width} ${geometry.viewBox.height}`);
	let horsePlacement = $derived(horseTransform({ scale: horseScale, x: horseX, y: horseY }));
</script>

<!-- Painted in layers: the background, the horse clipped to it (the circles
     then cover all but the part outside them), the two circles, their overlap (circle two clipped
     to circle one), then the horse three times -- clipped to circle one,
     to circle two, and to both -- so each part of it takes the color of
     the region it sits in, and anything outside the circles is cut off. -->
<svg
	xmlns="http://www.w3.org/2000/svg"
	{viewBox}
	width={size}
	height={(size * geometry.viewBox.height) / geometry.viewBox.width}
	role={decorative ? undefined : "img"}
	aria-hidden={decorative ? "true" : undefined}
>
	{#if !decorative}
		<title>{title}</title>
	{/if}
	<defs>
		<clipPath id="{id}-background">
			<rect
				x={geometry.viewBox.x}
				y={geometry.viewBox.y}
				width={geometry.viewBox.width}
				height={geometry.viewBox.height}
				rx={LOGO_CORNER_RADIUS * geometry.radius}
			/>
		</clipPath>
		<clipPath id="{id}-one">
			<circle
				cx={geometry.circleOne.x}
				cy={geometry.circleOne.y}
				r={geometry.radius}
			/>
		</clipPath>
		<clipPath id="{id}-two">
			<circle
				cx={geometry.circleTwo.x}
				cy={geometry.circleTwo.y}
				r={geometry.radius}
			/>
		</clipPath>
		<g
			id="{id}-horse"
			transform={horsePlacement}
		>
			<path d={HORSE_EAR} />
			<path d={HORSE_MANE} />
			<path d={HORSE_BODY} />
		</g>
	</defs>

	<rect
		x={geometry.viewBox.x}
		y={geometry.viewBox.y}
		width={geometry.viewBox.width}
		height={geometry.viewBox.height}
		rx={LOGO_CORNER_RADIUS * geometry.radius}
		fill={background}
		style:fill={backgroundDark ? `light-dark(${background}, ${backgroundDark})` : undefined}
	/>
	<use
		href="#{id}-horse"
		fill={headOutside}
		clip-path="url(#{id}-background)"
	/>
	<circle
		cx={geometry.circleOne.x}
		cy={geometry.circleOne.y}
		r={geometry.radius}
		fill={circleOne}
	/>
	<circle
		cx={geometry.circleTwo.x}
		cy={geometry.circleTwo.y}
		r={geometry.radius}
		fill={circleTwo}
	/>
	<circle
		cx={geometry.circleTwo.x}
		cy={geometry.circleTwo.y}
		r={geometry.radius}
		fill={overlap}
		clip-path="url(#{id}-one)"
	/>

	<use
		href="#{id}-horse"
		fill={headOne}
		clip-path="url(#{id}-one)"
	/>
	<use
		href="#{id}-horse"
		fill={headTwo}
		clip-path="url(#{id}-two)"
	/>
	<g clip-path="url(#{id}-one)">
		<use
			href="#{id}-horse"
			fill={headOverlap}
			clip-path="url(#{id}-two)"
		/>
	</g>
</svg>
