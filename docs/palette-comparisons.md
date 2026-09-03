# How our palette compares to two real-world systems

This compares the color system in `src/lib/scheme.js` + `src/lib/cylinder-deform.js`
(demoed at `/cylinder`) against two production design systems that both solve the
same underlying problem: *derive a full, themeable palette of named roles from a
small number of user/brand-chosen colors.*

- **Material Design 3** (Google) — "dynamic color," tonal palettes
- **Radix Colors** (WorkOS) — 12-step semantic scales

## Our system, in one paragraph

Two anchor colors are picked (in OKLCH). Their hues are placed on a 12-slot ring;
the other 10 hues are filled in by minimum-bending-energy interpolation (the same
math as the `/circle` demo) so hues are smoothly spaced, not evenly spaced. Each of
the 12 ring positions is then assigned to one of 8 named **roles** — Primary,
Secondary, Tertiary, Accent, Tip, Info, Warning, Danger — chosen by hue distance to
reference red/green/blue/yellow (see `scheme.js`). Independently, each role's hue
gets a **10-step lightness/chroma column** (`--primary-01` … `--primary-10`), tapered
so chroma is low near black/white and fullest in the middle, again via
bending-energy interpolation along the Z (lightness) axis. Light/dark mode is just
a *relabeling*: `--bg`, `--panel`, `--text` point at different shade indices
(e.g. `--bg: var(--primary-10)` in light mode, `--primary-01` in dark mode) — the
80 underlying swatches never change, only which ones are called "background" or
"text."

## Material Design 3 (Material You)

- **Seed → tonal palettes.** From one seed color (or several "key colors"), M3
  derives up to 6 full **tonal palettes**: Primary, Secondary, Tertiary, Neutral,
  Neutral Variant, and Error. Each is a ramp of **13 fixed tones** (0, 10, 20, …,
  100, plus 4/95/98/99) at *constant hue and chroma*, varying only in lightness —
  conceptually a slice through HCT (Hue-Chroma-Tone) color space rather than an
  interpolation between two picked endpoints.
- **Roles are tone lookups, not free choices.** A semantic role like
  `onPrimaryContainer` or `surfaceVariant` isn't a separate color — it's defined as
  "Primary palette, tone 90" or "Neutral palette, tone 30." There are ~30-40 such
  roles (surface, surfaceContainer/Low/High, outline, outlineVariant, primary,
  onPrimary, primaryContainer, onPrimaryContainer, …), each a fixed `(palette,
  tone)` pair.
- **Light/dark is a tone remap, exactly like ours.** M3 ships two lookup tables —
  a light scheme and a dark scheme — that assign *different tones* of the same
  palette to the same role name: `background` is tone 99 in light mode, tone 6 in
  dark mode. This is the same trick `/cylinder` uses for `--bg`/`--text`.
- **Contrast is guaranteed by construction**, not checked after the fact: role
  pairs like `primary`/`onPrimary` are defined as tones far enough apart (e.g. 40
  and 100) that WCAG contrast holds for every seed color, because HCT tone tracks
  perceptual lightness directly.

## Radix Colors

- **No seed color at all.** Radix ships ~30 hand-picked, pre-built color scales
  (Blue, Grass, Tomato, Slate, …) rather than generating one from user input. You
  pick a scale by name; you don't derive it from a brand color.
- **Each scale is 12 fixed steps, and every step has a hard-coded UI meaning**,
  the same across every hue:
  - 1–2: app background / subtle background
  - 3–5: component background (normal, hover, active)
  - 6–8: borders and separators
  - 9–10: solid/vivid backgrounds (the "brand" step, and its hover)
  - 11–12: low-contrast and high-contrast text
- **Every scale ships in a light AND dark version already authored**, plus a
  separate "alpha" variant of each (same colors, as transparent overlays, for
  compositing over arbitrary backgrounds) and P3 wide-gamut variants. There is no
  runtime "solve" step at all — dark mode is a second static scale, not a
  transformation of the light one.
- **Steps are tuned per-hue by eye/perceptual testing**, not by a formula — step 9
  of "Tomato" and step 9 of "Blue" are independently chosen to look equally
  "solid," not both `L=X%` of some shared curve.

## Side-by-side

| | Ours (`/cylinder`) | Material Design 3 | Radix Colors |
|---|---|---|---|
| Input | 2 anchor colors (OKLCH) | 1 seed color (± key colors) | none — pick a named scale |
| Hue spacing | solved (bending energy) | not applicable (each palette is 1 hue) | fixed, pre-authored per scale |
| Shades per role | 10, solved along Z (bending energy) | 13 fixed tones, same for every palette | 12 fixed steps, same for every scale |
| Role → shade mapping | fixed lookup (`--bg` = shade 10/01) | fixed lookup (role = palette+tone) | fixed lookup (step 9 = solid, step 11 = text, …) |
| Light/dark | swap which shade a role points to | swap which tone a role points to | two separately authored scales |
| Contrast guarantee | none (not yet modeled) | yes, by tone-distance construction | yes, by manual tuning |
| Roles/palette count | 8 roles, 1 ring (12 hues total) | 6 palettes × ~30-40 roles | ~30 independent scales, 12 steps each |
| Generation | fully computed at runtime from 2 anchors | fully computed at runtime from 1 seed | authored once, shipped as static data |

## What's genuinely close, what's genuinely different

**Closest match: the light/dark mechanism.** All three systems treat "background"
and "text" as *labels pointing at shades*, not colors in their own right, and flip
that pointer for dark mode instead of recomputing anything. That part of our
`/cylinder` design (`--bg: var(--primary-10)` → `var(--primary-01)`) is the same
idea M3 calls tonal roles.

**Biggest gap: contrast is unmodeled here.** Both M3 (via fixed tone-distance
role pairs) and Radix (via manual tuning) *guarantee* that a role like "text on
background" is readable, for any input hue. Our system currently derives text/bg
from fixed shade indices (01/10) with no check that the resulting pair meets a
contrast threshold — for a very light or very dark anchor color, that guarantee
could silently break. This is the most actionable finding: adding a contrast-based
adjustment (or at least a diagnostic check, alongside the existing `/diagnostics`
route) would bring us in line with how both real systems handle this.

**Structural difference: interpolation vs. lookup.** M3 and Radix both start from
*fixed, pre-decided* shade/tone counts and meanings and plug a color in; we instead
*solve* for both the hue spacing and the lightness/chroma taper from two anchors
using the bending-energy model that's this whole repo's throughline. That's a more
flexible/generative approach (arbitrary anchor pairs "just work"), but it also
means we don't get M3/Radix's per-hue hand-tuning — e.g. Radix's step 9 for a warm
color and a cool color are independently balanced to look equally "solid," where
ours applies the same Z-taper math regardless of hue.

## Comments

These systems have 12 and 13 shades while our system only has 10. Should we have more?

What degree of lightness+saturation do these systems use for various applications? (Headings, backgrounds, surfaces, alerts, body text, accents, borders, etc.) Also, how do they use primary colors versus other colors?

## Answers

### Should we have more than 10 shades?

Not necessarily just for granularity's sake — the count itself isn't where Material
and Radix get their value. `NUM_Z = 10` in `routes/cylinder/+page.svelte` is a plain
constant passed into `computeCylinderZLevels`/`computeCylinderRGrid`; the
bending-energy Z-taper doesn't care how many levels it solves for, so bumping it to
12 or 13 is a one-line change, not a redesign.

What actually gives Material's 13 tones and Radix's 12 steps their power is that
*every single one has a fixed, named UI job*:

- Radix: 1-2 backgrounds, 3-5 component bg (rest/hover/active), 6-8 borders (rest/
  hover/focus), 9-10 solid brand fill (rest/hover), 11-12 text (low/high contrast).
- Material: the "extra" tones past a plain 0/10/20…100 ramp (4, 95, 98, 99) exist
  specifically for *surface elevation layering* (stacking cards/sheets/menus at
  slightly different tones), not just finer steps.

Our 10 shades, by contrast, currently have only **4 assigned meanings** —
`--bg`/`--panel` (indices 9/10 or 1/2, depending on light/dark) and `--text`
(index 1 or 10). The other six are rendered in the `/cylinder` swatch chart but
aren't wired to any CSS role. So the higher-leverage move is assigning fixed roles
to more of the 10 shades we already have — a hover-state index, a border index, a
"page bg vs. card bg" distinction — before assuming the fix is a bigger number.
If that exercise reveals we genuinely need finer gradation somewhere (e.g. between
two adjacent named steps), raising `NUM_Z` is cheap once we know *where*.

### What lightness/chroma do real systems use per application, and how do they treat primary vs. other colors?

**Material Design 3** (typical light-theme tone assignments, HCT tone 0=black,
100=white):

| Application | Role | Tone (light) | Tone (dark) |
|---|---|---|---|
| Buttons, FAB, active/selected indicators | `primary` | 40 | 80 |
| Text/icon on a primary-filled element | `onPrimary` | 100 | 20 |
| Tonal buttons, chips | `primaryContainer` | 90 | 30 |
| Page/card background | `surface` (Neutral palette) | 98 | 6 |
| Body text, headings | `onSurface` (Neutral palette) | 10 | 90 |
| Borders/dividers | `outline` (Neutral palette) | 50 | 60 |
| Errors/alerts | separate fixed-hue error palette | 40 | 80 |

The load-bearing pattern: **the saturated brand hue is reserved for small,
actionable elements** (buttons, FABs, selection, links) **and their containers**;
backgrounds, surfaces, borders, and body text all pull from a separate **Neutral /
Neutral-Variant palette** that's *technically* tinted by the seed hue but kept at
very low chroma (~4-8% of primary's) — closer to gray than to "brand color." M3
doesn't give headings their own color role by default either; headings and body
text are both `onSurface`.

**Radix Colors** (moving from step 1 → 12 within one scale, light mode):

| Steps | Application | Typical L/C |
|---|---|---|
| 1-2 | App/subtle background | ~98-99% L, barely any chroma |
| 3-5 | Component bg (rest/hover/active) | L drifts down slightly, chroma creeps up |
| 6-8 | Borders, separators, focus rings | mid L (~70-85%), moderate chroma |
| 9 | Solid brand fill (the "actual" named color) | mid L, **highest chroma in the scale** |
| 10 | Hover of the solid fill | small L/C shift off step 9 |
| 11 | Low-contrast text (secondary/muted) | dark L, moderate chroma |
| 12 | High-contrast text (headings, primary body text) | darkest L, but **lower chroma than step 9** |

Two things worth calling out: step 12 (the step actually used for headings/body
text) is deliberately *less* saturated than step 9 (the "brand" swatch) — fully
saturated text reads as harsh and hurts legibility, so Radix pulls chroma back even
while keeping the hue. And Radix's own docs are explicit that the named accent
scale is for interactive/brand elements only; a separate, undertone-matched Gray
scale is what's meant to carry backgrounds, panels, borders, and most body text.

**How this compares to our system:** both references agree on the same principle —
*primary/brand hue is for accents, a near-neutral scale carries backgrounds/
borders/text*. Our current `/cylinder` wiring doesn't fully follow that: `--bg`
and `--text` are both pulled off **Primary's own ramp** (`--bg: var(--primary-10)`,
`--text: var(--primary-01)`), not from a separate neutral role — we don't have a
Neutral/Gray among our 8 roles at all. We do get a *partial* version of the same
effect for free: the Z-taper's `minChroma` floor and the "egg" shape (chroma is
lowest near Z=0/1, the very shades bg/text draw from) mean our background/text
shades are already less saturated than the mid-column ones by construction — but
that's a side effect of the taper, not a dedicated low-chroma role the way
Material's Neutral palette or Radix's Gray scale are. The concrete change that
would bring us in line with both references: add an explicit near-zero-chroma
"Neutral" role (its own hue slot on the ring, with a much lower chroma ceiling)
for backgrounds/borders/body text, rather than continuing to draw `--bg`/`--text`
off Primary's own column.

## Comment

As a note, our system is called "Color Horse."

If we wanted to build out Color Horse as a useful UI color pallette generator, what changes would we need to make? I don't want this to be a comprehensive enterprise-grade system, but we could consider the most common messages and actions. I imagine you would have colors like `--color-background-success-idle`, `--color-background-success-hover`, `--color-border-success-idle`, `--color-border-success-hover`, `--color-button-success` — although I have very little experience with UI design, so that might be misguided. What would you envision?

## Answer

Your instinct is right, and it's not misguided at all — it's exactly Material's
"component tokens" tier, which sits on top of the two tiers we already have:

1. **Raw shades** (have it) — `--primary-01`…`--primary-10`, etc., 80 values total.
2. **Semantic roles** (mostly have it) — `scheme.js` already picks Primary,
   Secondary, Tertiary, Accent, **Tip, Info, Warning, Danger** out of the ring —
   the last four are *already* success/info/warning/danger in intent, just named
   for hue-picking rather than for UI. This is most of the work done already.
3. **Component tokens** (missing — this is what you're describing) — a small,
   fixed lookup that says "success background = Tip's shade 9," "success button =
   Tip's shade 5," etc. This tier needs no new deformation math at all; it's just
   a naming/lookup layer over shades that already exist, the same way `--bg` and
   `--text` already alias `--primary-10`/`--primary-01`.

> Response: Right now we have eight hues. You are suggesting another one, neutral/grey, which I think we should omit for now. (Details below.) So we have four colors remaining from our 12-color wheel. Are there any intents or messages or styles that might utilize those colors?

Worth being honest about one thing first: those four leftover D-indices aren't
picked for any particular meaning — `computeColorScheme` assigns Primary,
Secondary, and the four "closest to reference red/green/blue/yellow" roles
first, then Tertiary/Accent from what's left; whatever's left after *that* is
just whichever hues didn't get claimed. There's no guarantee they're evenly
spaced, complementary, or usable as a matched set — for some anchor pairs they
could even sit close together. So I wouldn't promise any of them a *specific*
hue-dependent job the way Success/Info/Warning/Danger get one (those are
deliberately picked to *be* near green/blue/yellow/red).

What they're legitimately good for is roles that need "a distinct color, any
color" rather than "a color that means green/red":
- **Highlight** — promotional emphasis: "new" badges, unread dots, featured/
  spotlighted content. Doesn't need to be any particular hue, just distinct
  from the other seven.
- **Focus / selection ring** — worth calling out because it's not hypothetical:
  `--ring` in this very page's `<style>` block already borrows `var(--accent-05)`
  as an improvised stand-in. Giving focus its own leftover hue would mean a
  focus ring is never visually confusable with the Accent role it's currently
  piggybacking on.
- **Two extra categorical/chart colors** — `Chart.svelte` (used by
  `/diagnostics`) will eventually want data-series colors, and those genuinely
  should NOT reuse Success/Warning/Danger's hues — a red data line next to a red
  "Danger" alert reads as an error even when it isn't. Two of the four leftovers
  could be reserved exactly for that: colors nobody will mistake for a status
  message.

That's 4 candidate uses for 4 leftover slots, but I'd treat this as a proposal,
not a fait accompli — none of it is wired into `scheme.js` yet, since formalizing
new roles means changing `computeColorScheme`'s picking order (and its tests),
which is a bigger step than what's been asked for so far.

### What I'd actually change

**1. Add a Neutral role.** This is the one real gap. Success/Info/Warning/Danger
cover *messages*; ordinary UI chrome (default button, default border, body text,
page background) shouldn't be tinted by whichever hue got picked as Primary — in
both Material and Radix, generic chrome comes from a separate low-chroma Neutral/
Gray scale, not the brand color's own ramp. Concretely: reserve one more ring
position (or just cap Primary's own chroma very low for a `Neutral` alias) so
non-message components have somewhere to live that isn't "brand color."

> Response: I don't want to make this change right now. We'll try to use the primary color as-is for defaults.

Noted — no Neutral role for now, default chrome keeps using Primary's own ramp
(which is already what `--bg`/`--panel`/`--text` do today, so this is "keep the
current behavior," not a change).

**2. Keep the state list short.** For "common messages and actions" without going
enterprise, I'd scope to:
- **5 intents**: Neutral, Success (`Tip`), Info, Warning, Danger
- **3 surfaces**: background, border, solid (button/badge fill)
- **2 interaction states**: idle, hover — skip active/pressed/disabled/focus-ring
  for a first pass; they're the same pattern (see #3) and easy to add later.

That's 5 × 3 × 2 = 30 tokens, plus one more per intent for text-on-solid (below) —
small enough to hand-check by eye, nowhere near Material's ~40 roles.

> Response: Sounds good. I think we should rename "tip" to "success."

Implemented, scoped narrowly: `/cylinder` now shows **"Success"** everywhere a
role name is displayed to a person (the Scheme section's role labels, and the
new palette column headers below). The underlying `scheme.js` key, and the
`--tip-01`…`--tip-10` custom property names it drives, are left as `Tip` — that
name is baked into `computeColorScheme`'s hue-picking logic and
`scheme.test.js`'s assertions, and renaming it there would be a real library
change, not a display tweak. If/when the actual `ui-tokens.js` component-token
layer gets built, that's the natural point to decide whether "Success" becomes
the real key too, or stays a display-only alias.

**3. Don't hand-pick idle vs. hover as separate colors — use adjacent shade
indices.** Radix's hover steps are always exactly "one step further" from the
idle step (3→4, 6→7, 9→10), not an independently authored color. We can do the
same: define ONE index per (intent, surface) for idle, and let hover = that index
±1 (darker/more saturated for light mode, lighter for dark mode — same direction
`--bg`/`--panel` already use for the light/dark swap). That turns "30 authored
colors" into "10 authored indices + a fixed offset rule," which is much easier to
keep consistent and to re-tune later.

> Response: Sounds good.

Agreed, not built yet — this only matters once `ui-tokens.js` (or equivalent)
actually exists to compute idle/hover pairs. Flagging it here so it isn't lost:
when that layer gets built, hover = idle-index ± 1 is the rule to use.

**4. Compute text-on-solid, don't author it.** `--color-button-success`'s label
color shouldn't be a fixed index — it should be whichever of that role's shade-01
or shade-10 has higher contrast against the chosen solid shade, picked
programmatically (the same "pick black or white" rule most systems use for
on-brand text). This is a small, self-contained function: convert both candidates
and the background to relative luminance, compare WCAG contrast ratios, keep the
winner. It's also the natural first piece of the contrast-checking work the
comparison above already flagged as our biggest structural gap — implementing it
for solid buttons is a much smaller, more concrete target than "add contrast
checking everywhere."

> Response: I don't want to do anything with this yet. I want to see what the system looks like first.

Fair — deferred, no code changes for this one.

### Where this would live

A new pure function alongside `scheme.js` — e.g. `src/lib/ui-tokens.js`,
`computeUiTokens(points, scheme, neutralRole)` — that takes the already-computed
80-shade grid plus the role assignments and returns a flat `{ '--color-background-success-idle': '#...', ... }` object. It would get wired into `/cylinder` exactly
the way `--bg`/`--panel`/`--text` are today (`paletteStyleText` in
`routes/cylinder/+page.svelte`), or into a new small `/tokens` demo route if you'd
rather keep it visually separate from the raw shade explorer. No changes to the
bending-energy model itself are needed — this is entirely a labeling/lookup layer
on top of math that already exists.

> Response: Before we make a decision about that, I want to see what this look like. Please update our 80-color pallette with role-assignment columns headers. If a column has multiple roles, list all roles in the header.

Done, on the existing "Palette — 10 rows (Z-levels) × 12 columns (D-indices)"
table on `/cylinder` (`routes/cylinder/+page.svelte`), which is the actual
120-swatch grid (80 role-assigned + 40 across the four leftover columns) —
it had no headers at all before this. Each of the 12 columns now gets a `<th>`
naming whichever role(s) `computeColorScheme` assigned to that D-index, using
the "Success" display rename above; an unassigned column (one of the four from
the earlier question) shows "—" instead. The label list is built as an
array-per-column rather than a single lookup specifically so a column that
ever ends up with more than one label — e.g. if some future role reuses an
existing hue on purpose — renders as `"RoleA / RoleB"` instead of silently
dropping one; under the current picking algorithm every role still lands on a
distinct index, so today it's always 0 or 1 label per column in practice.
Verified via `npm run build` + `npm run preview` (no `claude-in-chrome`
available in this session to screenshot it, so this was checked by fetching
the rendered HTML directly and confirming all 12 `<th>` labels matched
`scheme.roles`).