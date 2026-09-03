<script>
	const demos = [
		{ href: '/circle', label: 'Circle', desc: 'Points evenly spaced on a circle; Point A is fixed, dragging Point N bends the ring like a flexible pole.' },
		{ href: '/color-wheel', label: 'Color Wheel', desc: 'The same circular model applied to hue degrees instead of position.' },
		{ href: '/curve', label: 'Curve', desc: 'Points on a baseline with a single draggable interior anchor.' },
		{ href: '/curved-line', label: 'Curved Line', desc: 'Combines the line and curve models: points cluster near a bent pole\'s poles.' },
		{ href: '/line', label: 'Line', desc: 'An open line with four dynamically-reassigned pins.' },
		{ href: '/', label: 'OKLCH Cylinder Palette', desc: '120 points on a 3D cylinder, doubling as an OKLCH color palette with a live theme.' },
		{ href: '/diagnostics', label: 'Chroma Shape Diagnostics', desc: 'A dev tool proving the cylinder\'s chroma ring is a convex ovoid, not a furrowed heart shape.' }
	];
</script>

<svelte:head>
	<title>Semi-Rigid Pole Demos</title>
</svelte:head>

<div class="wrap">
	<h1>Semi-Rigid Pole Demos</h1>
	<p class="sub">
		A series of minimum-bending-energy "semi-rigid pole" deformation demos: evenly-spaced
		points get pinned at a few user-controlled positions, and the rest are repositioned by
		minimizing discrete bending energy so the deformation spreads smoothly instead of
		splitting into abruptly-different uniform-spacing groups.
	</p>
	<div class="cards">
		{#each demos as d (d.href)}
			<a class="card panel" href={d.href}>
				<h2>{d.label}</h2>
				<p>{d.desc}</p>
			</a>
		{/each}
	</div>
</div>

<style>
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 16px;
		margin-top: 20px;
	}
	.card {
		display: block;
		text-decoration: none;
		color: var(--text);
		transition: border-color 0.15s ease;
	}
	.card:hover {
		border-color: var(--accent);
	}
	.card h2 {
		font-size: 1rem;
		margin: 0 0 6px 0;
	}
	.card p {
		font-size: 0.85rem;
		color: var(--muted);
		margin: 0;
		line-height: 1.4;
	}
</style>
