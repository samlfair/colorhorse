120 points sit on a cylinder: 10 stacked rings of 12, positioned by three
independently-computed coordinates that double as an OKLCH color for each
point &mdash; <strong>Hue</strong> (0&ndash;360&deg;, from the circle model:
two anchors pin an exact hue each, the rest relax by circular bending energy),
<strong>Chroma</strong> (a CLOSED ring pinned only at the two anchors, floored
to Minimum Chroma and explicitly convexified so it always traces a smooth ovoid
around the hue wheel, never a furrowed/heart-shaped dip),
and <strong>Lightness</strong> (from the line model: 10 discrete levels between
Minimum/Maximum Lightness, with both anchors' lightness pinned among them by
sorted value). Chroma is always scaled relative to the actual sRGB gamut
boundary at each point's own hue and lightness (its "cusp"), so nothing needs
clamping afterward &mdash; the same idea as the <code>nutelch</code> package
the task named. Anchor color is set directly with a color picker; the two
points that exactly reproduce an anchor's full (H, L, C) are outlined in white.



Labeled swatches show a shade's job, at a fixed <em>distance</em> from
whichever end of the ramp is "light" in the current theme &mdash;
<code>bg</code>/<code>panel</code>/<code>grid</code>/<code>guide</code
>/<code>muted</code>/<code>text</code>
are the page's own real chrome variables, and follow the Light/Dark/System
switch above accordingly. A chip with more than one label (e.g.
<code>grid</code> + <code>border</code> + <code>panel-hover</code>)
means those roles were deliberately given the SAME shade, not that one
collided with another by accident. <code>button</code>/<code
	>button-hover</code
> are the one pair that isn't anchored at a guaranteed-extreme index &mdash;
they're a guess at the ramp's vivid middle, kept as an experiment. The example
content below puts all of these (plus the four status roles) to work.
