<script>

	let { children } = $props();
</script>

<svelte:head>
	<link href="/DefaultStyles.css" rel="stylesheet" />
	<link href="/TypographyStyles.css" rel="stylesheet" />
	<link href="/ResetStyles.css" rel="stylesheet" />
</svelte:head>


{@render children()}

