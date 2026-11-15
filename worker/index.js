// The site's Worker. Cloudflare serves the built site (build/) as static
// files first, so "/" and everything under /_app cost nothing; this only
// runs for paths with no file:
//
//   /{id}?{settings}             a palette's share link (see src/lib/share.js):
//                                the home page, with link-preview tags for
//                                that palette
//   /og/v1/{id}.png?{settings}   that palette's preview image
//
// Anything else gets the static files' own 404. Bump the "v1" in IMAGE_PATH
// after changing the logo, so link previews fetch the new image.

import { PLACEHOLDER_SHARE_ID, SHARE_ID_PATTERN, shareId, sharedPalette } from "../src/lib/share.js";
import { ogImagePng } from "./og-image.js";

const IMAGE_PATH = "/og/v1/";
const IMAGE_ID_PATTERN = /^\/og\/v1\/([0-9][0-9a-z]{7})\.png$/;

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (SHARE_ID_PATTERN.test(url.pathname.slice(1))) return sharePage(request, env, url);
		if (IMAGE_ID_PATTERN.test(url.pathname)) return previewImage(url);
		return env.ASSETS.fetch(request);
	},
};

// The home page as built at the placeholder id, pointed at this palette.
async function sharePage(request, env, url) {
	const page = await env.ASSETS.fetch(new Request(new URL(`/${PLACEHOLDER_SHARE_ID}`, url), request));
	const palette = sharedPalette(url.search);
	if (!page.ok || !palette) return page;
	const id = shareId(palette.query);
	// HTMLRewriter writes attribute values as given, so escape the query's "&".
	const setContent = (content) => ({ element: (element) => element.setAttribute("content", content.replaceAll("&", "&amp;")) });
	return new HTMLRewriter()
		.on('meta[property="og:url"]', setContent(`${url.origin}/${id}?${palette.query}`))
		.on('meta[property="og:image"]', setContent(`${url.origin}${IMAGE_PATH}${id}.png?${palette.query}`))
		.transform(page);
}

function previewImage(url) {
	const palette = sharedPalette(url.search);
	if (!palette) return new Response("Not found", { status: 404 });
	return new Response(ogImagePng(palette.imageColors), {
		headers: {
			"Content-Type": "image/png",
			// The settings decide the image, and the path's version changes
			// with the logo, so a URL's image never changes.
			"Cache-Control": "public, max-age=31536000, immutable",
		},
	});
}
