import { mdsvex } from 'mdsvex';
import adapter from '@sveltejs/adapter-static';
import remarkSimpleAlerts from './src/lib/remark-simple-alerts.js';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// Prerenders every route to plain static HTML/CSS/JS at build time --
		// no Node server needed to view the site, matching how the project
		// worked before this port (open the built output directly, or serve
		// it as static files). `fallback` is left unset since every route
		// here is prerenderable (no dynamic/user-specific data).
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: undefined,
			precompress: false,
			strict: true
		}),
		prerender: {
			// /logo is a development-only tool that answers 404 in a
			// production build (see src/routes/logo/+page.js), so it's left
			// out of the site. Every other prerender error still fails the
			// build.
			handleHttpError: ({ path, status, message }) => {
				if (path === '/logo' && status === 404) return;
				throw new Error(message);
			}
		}
	},
	preprocess: [mdsvex({ extensions: ['.svx', '.md'], remarkPlugins: [remarkSimpleAlerts] })],
	extensions: ['.svelte', '.svx', '.md']
};

export default config;
