Model a set of X points distributed evenly around a circle, with Point A fixed at its original position.

Point N is then moved to a new angular position and becomes fixed there. The other points should deform smoothly between these two fixed points, behaving conceptually like a semi-rigid, flexible circular pole.

The important behavior is:

- Initially, X points are evenly distributed around the circumference.
- Point A never moves.
- Point N is moved to a specified new angle and then becomes fixed.
- All other points are allowed to move.
- The deformation should be smooth and gradual around the circle.
- Angular spacing between adjacent points should therefore gradually increase in some regions and decrease in others.
- There should not be an abrupt transition where one group of points remains evenly spaced and another group has a different uniform spacing.
- The deformation should resemble bending a semi-rigid pole: neighboring points influence one another, and sharp changes in spacing should be penalized.
- Model this as a minimum-bending-energy problem. Let `u[i]` be the angular displacement of point `i` from its original position. Minimize the discrete bending energy:

    E = Σ (u[i+1] - 2*u[i] + u[i-1])²

  subject to:

    u[A] = 0
    u[N] = displacement of N

  Account correctly for the circular topology and the fact that A and N divide the ring into two paths.

- Once the displacements have been calculated, the new angular position of each point is:

    newAngle[i] = originalAngle[i] + u[i]

  Normalize angles as necessary.
- The implementation should avoid numerical instability and clearly explain the mathematical model in comments.

Then build a small interactive demonstration:

1. Write the deformation logic in JavaScript as a standalone function.
2. Create an SVG visualization of the circle and points.
3. Draw lines connecting adjacent points so the deformation is visually obvious.
4. Make Point A and Point N visually distinct from the other points.
5. Add a control that allows Point N's angular displacement to be changed interactively, preferably with a range slider.
6. Update the SVG whenever the displacement changes.
7. Include enough points (e.g. 24) that the gradual deformation is easy to see.
8. Show both the original circle/positions and the deformed positions if useful, using a subtle visual distinction.
9. Put everything into a single plain `index.html` file with inline JavaScript and SVG. Do not use frameworks, build tools, or external dependencies.

Finally, open the HTML page in the browser so the behavior can be inspected visually.

Before implementing the SVG, first implement and test the mathematical deformation logic. Include a concise explanation in comments describing why the solution produces the desired gradual change in spacing.

---

If any of the above logic or description is illogical or misguided, feel free to take a new approach that respects the underline intention.

---

## Project-wide convention (supersedes point 9 above): SvelteKit app

Point 9 described a single self-contained `index.html`, before this repo grew into several demos sharing the same underlying math, and before it was ported to a SvelteKit app (an earlier intermediate stage used shared linked `.html`/`.css`/`.js` files with no build step at all — that stage is gone; see git-free history/backups if it's ever needed for reference). **The current structure:**

- **`src/lib/*.js`** — the math modules (`deform.js`, `hue-deform.js`, `line-deform.js`, `curve-deform.js`, `curved-line-deform.js`, `cylinder-deform.js`, `oklch.js`, `scheme.js`), each a plain ES module with named `export function`s. A real module system (Vite) means these no longer need the old dual-mode/namespaced-global trick from the pre-SvelteKit stage — same-named internals in different files (e.g. `bendingEnergy` means something different in `deform.js` vs `line-deform.js`) can't collide anymore, since ES module scoping is per-file. Import whichever functions a route needs directly, e.g. `import { computeDeformedAngles, bendingEnergy } from '$lib/deform.js';`.
- **`src/lib/*.test.js`** — Vitest unit tests for the math modules (pure logic, no DOM), run via `npm run test`. These carry over the exact same assertions the pre-SvelteKit stage had (each file wraps its whole assertion body in one `it('all assertions pass', ...)`, ending in `expect(failed).toBe(0)`) — the correctness work behind these (especially the cylinder ring's convexify fix) took real effort to get right; don't weaken or skip these when touching `$lib`.
- **`src/lib/Chart.svelte`** — a reusable line-chart component (used by `/diagnostics`); reach for it before writing another one-off SVG chart renderer.
- **`src/routes/<name>/+page.svelte`** — one route per demo (`/circle`, `/color-wheel`, `/curve`, `/curved-line`, `/line`, `/cylinder`, `/diagnostics`), each Svelte 5 (runes: `$state`/`$derived`/`$effect`), replacing the old imperative `svg.innerHTML = ''` + `createElementNS` rendering with declarative `{#each}` templates over derived point arrays. `$effect` is used only for clamping one piece of state against another (e.g. circle's Point A/N distinctness, cylinder's lightness bounds) — mirroring what the old code did imperatively at the top of every `render()`.
- **`src/app.css`** — shared theme tokens (`--bg`, `--panel`, `--text`, `--muted`, `--grid`, `--original`, `--accent`, `--green`, `--red`, `--yellow`, `--ring`) and shared layout classes (`.wrap`, `.panel`, `.controls`, etc.), imported once by `src/routes/+layout.svelte` so every route gets it for free. Add a route-scoped `<style>` block only for what's genuinely unique to that page.
- **`/cylinder` is the one exception to `src/app.css`'s theme tokens**: its own chrome IS the live color scheme it demonstrates. It computes 80 palette custom properties (`--primary-01`..`--primary-10`, `--secondary-01`..`10`, ... 8 roles × 10 shades) from the current anchors/scheme and derives `--bg`/`--panel`/etc from them via CSS `var()` formulas, switched by a `data-theme` attribute — but scoped to a wrapper `<div class="cylinder-page">` local to that route, NOT `:root`/`document.documentElement`, because SvelteKit is a client-side-routed SPA after the first load and a global mutation would leak into other routes on navigation. Its two anchor colors are seeded RANDOMLY, but only inside `onMount()` (never at the top level of `<script>`) — this route is statically prerendered, and top-level code there runs once at BUILD time; `onMount()` is guaranteed to run only in a real visitor's browser, which is what "seeded randomly on page load" actually requires.
- **Build**: `npm run dev` (Vite dev server), `npm run build` (prerenders every route to static HTML/CSS/JS via `@sveltejs/adapter-static` — see `svelte.config.js`; `src/routes/+layout.js` sets `export const prerender = true` once for the whole app), `npm run preview` (serve the built output), `npm run test` (Vitest). No Node server is required to VIEW the built site (`adapter-static`'s whole point), but a build step (`npm run build`, or `npm run dev` for local iteration) is now genuinely required to get there — "no build tools" from point 9 no longer holds project-wide; it was explicitly superseded by request.

When adding another demo: reuse an existing `$lib` module if the underlying model already exists (check before writing a new one), reuse `src/app.css` for chrome unless the page has its own live theme like `/cylinder`, and give the route only its own scoped `<style>` for what's genuinely unique to it.