import { dev } from "$app/environment";
import { error } from "@sveltejs/kit";

// The logo editor is a design tool for local development: in a production
// build the page doesn't exist.
export function load() {
	if (!dev) error(404, "Not found");
}
