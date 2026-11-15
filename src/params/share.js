import { SHARE_ID_PATTERN } from "$lib/share.js";

// A palette's share id (see share.js), so /{id} is the home page and any
// other path still 404s.
export function match(param) {
	return SHARE_ID_PATTERN.test(param);
}
