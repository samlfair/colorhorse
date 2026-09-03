# OKLCH

This looks great. Finally, lets switch this from DZR to OKLCH:

- The D circular axis is our hue
- The Z vertical axis is our lightness
- The R radial axis is our chroma

Simply change the labels on the sliders and make the points in the cylindrical plotting colored by the OKLCH value.

Use nutelch to keep everything in gamma.

Below the control panel and rendering, create a table with 12 columns and 10 rows to display the new pallette.

## Comment

Nutelch: https://www.npmjs.com/package/nutelch

Let's replace the "Anchor One" and "Anchor Two" input panes with color picker inputs.

Let's also add a "maximum lightness" and "minimum lightness" to bound the L values on the line deformation.

We also need to shift the chroma for each hue. `anchorOne.r` is the anchor point for `anchorOne` and `anchorTwo.r` is the anchor point for `anchorTwo`. Impute all of the other anchors between `anchorOne` and `anchorTwo` along a smooth curve. For the first and last points on those curves, provide one "minimum chroma" input in the control panel.