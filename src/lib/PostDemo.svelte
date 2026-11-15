<script>
	import * as content from "$lib/Content.svx";

	let { label = "An example blog post header in the palette's colors" } = $props();
</script>

<div class="post-demo">
	<div
		role="img"
		aria-label={label}
	>
		<div class="masthead">
			<svg
				viewBox="0 0 32 32"
				width="1.8em"
				height="1.8em"
				aria-hidden="true"
			>
				<rect
					width="32"
					height="32"
					fill="var(--primary-05)"
				/>
				<circle
					cx="21"
					cy="21"
					r="9"
					fill="var(--accent-05)"
				/>
			</svg>
			<span>Lorem Ipsum</span>
			<span>Work</span>
			<span>Writing</span>
			<span>About</span>
			<svg
				viewBox="0 0 16 16"
				width="1em"
				height="1em"
				aria-hidden="true"
			>
				<rect
					x="1.5"
					y="3.5"
					width="13"
					height="9"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
				/>
				<path
					d="M2 4 L 8 9 L 14 4"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
				/>
			</svg>
			<svg
				viewBox="0 0 16 16"
				width="1em"
				height="1em"
				aria-hidden="true"
			>
				<circle
					cx="3.5"
					cy="12.5"
					r="1.5"
					fill="currentColor"
				/>
				<path
					d="M2 7.5 A 6.5 6.5 0 0 1 8.5 14 M2 2.5 A 11.5 11.5 0 0 1 13.5 14"
					fill="none"
					stroke="currentColor"
					stroke-width="1.8"
				/>
			</svg>
			<span class="subscribe">Subscribe</span>
		</div>

		<div class="post">
			<p class="breadcrumbs">Home / Writing / Art</p>
			<span class="category">Art</span>
			<p class="title">De Finibus Bonorum et Malorum</p>

			<div class="byline">
				<p class="author">
					Maya Chen
					<span>March 4, 2026</span>
				</p>
				<ul>
					<li>painting</li>
					<li>light</li>
					<li>process</li>
				</ul>
			</div>

			<svg
				class="picture"
				viewBox="0 0 600 200"
				width="600"
				height="200"
				aria-hidden="true"
			>
				<rect
					width="600"
					height="200"
					fill="var(--info-background)"
				/>
				<circle
					cx="470"
					cy="64"
					r="30"
					fill="var(--warning-06)"
				/>
				<path
					d="M0 112 Q 120 64 255 96 T 600 78 V 200 H 0 Z"
					fill="var(--tertiary-05)"
				/>
				<path
					d="M0 140 Q 165 100 330 134 T 600 126 V 200 H 0 Z"
					fill="var(--secondary-05)"
				/>
				<path
					d="M0 168 Q 225 140 390 162 T 600 156 V 200 H 0 Z"
					fill="var(--primary-05)"
				/>
			</svg>

			<div class="text">
				{@render content.demoPostExcerpt()}
			</div>
		</div>
	</div>
</div>

<style>
	/* Text and surfaces use the page's own theme variables, so the header
	   follows light and dark mode like the page. The graphics use each
	   role's middle shades, which read on either background. */
	.post-demo {
		container-type: inline-size;
	}

	/* Cut off by its bottom edge, mid-article. */
	[role="img"] {
		height: 36em;
		overflow: hidden;
		font-family: var(--heading-font);
		line-height: 1.45;
		color: var(--text);
		/* Tinted, unlike studio's white page around it. */
		background: light-dark(var(--primary-10), var(--primary-02));
		border: 1px solid var(--border);
		border-radius: 0.75em;
	}

	.masthead {
		display: flex;
		align-items: center;
		gap: 1.2em;
		padding: 0.9em 1.25em;
		font-size: 0.8em;
		border-bottom: 2px solid var(--text);

		> span {
			color: var(--primary-link-color);
		}

		svg:first-child {
			margin-right: -0.5em;
		}

		> span:first-of-type {
			margin-right: auto;
			font-size: 1.3em;
			font-weight: 700;
			letter-spacing: -0.03em;
			color: var(--text);
		}

		/* The current section. */
		> span:nth-of-type(3) {
			font-weight: 700;
			color: var(--text);
		}

		svg:not(:first-child) {
			color: var(--muted);
		}

		.subscribe {
			padding: 0.5em 0.9em;
			font-weight: 700;
			color: var(--primary-10);
			background: var(--primary-04);
			border-radius: 0.3em;
			text-box: trim-both cap alphabetic;
		}
	}

	.post {
		display: grid;
		justify-items: start;
		gap: 1em;
		padding: 1.25em;

		:global(p) {
			margin: 0;
		}
	}

	.breadcrumbs {
		font-size: 0.75em;
		color: var(--primary-link-color);
	}

	.category {
		padding: 0.2em 0.6em;
		border-radius: 0.25em;
		font-size: 0.7em;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--danger-10);
		background: var(--danger-05);
	}

	.title {
		font-size: clamp(1.8em, 7cqi, 3em);
		font-weight: 700;
		line-height: 1;
		letter-spacing: -0.04em;
		color: var(--heading);
	}

	.byline {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75em;
		width: 100%;
		padding-top: 0.8em;
		border-top: 2px solid var(--text);
	}

	.author {
		font-size: 0.75em;
		font-weight: 700;
		line-height: 1.3;

		span {
			display: block;
			font-weight: 400;
			color: var(--muted);
		}
	}

	ul {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3em;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* Pills, like the event card's chips, all in one color. */
	li {
		display: inline-flex;
		align-items: center;
		padding: 0.2em 0.7em;
		font-size: 0.85em;
		font-weight: 600;
		color: var(--text);
		background: var(--accent-soft);
		border-radius: 1em;

		&::before {
			content: "#";
		}
	}

	/* Where supported, trim the text to its letters so the padding is the
	   same above and below. */
	@supports (text-box: trim-both cap alphabetic) {
		li {
			padding: 0.4em 0.7em;
			text-box: trim-both cap alphabetic;
		}
	}

	.picture {
		width: 100%;
	}

	.text {
		display: grid;
		gap: 0.8em;
		font-size: 0.9em;
	}

	/* Narrow: the menu gives way to the logo, name, and icons. */
	@container (width < 30em) {
		.masthead > span:not(:first-of-type, .subscribe) {
			display: none;
		}
	}
</style>
