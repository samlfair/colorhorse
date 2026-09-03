// Every route in this app is static (no user-specific or request-time
// data), so the whole site prerenders to plain HTML/CSS/JS at build time --
// see svelte.config.js's adapter-static config.
export const prerender = true;
