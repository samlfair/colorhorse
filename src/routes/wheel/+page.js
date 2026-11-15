import { dev } from "$app/environment";
import { error } from "@sveltejs/kit";

// Hue wheel sketches, for local development: in a production build the
// page doesn't exist.
export function load() {
	if (!dev) error(404, "Not found");
}
