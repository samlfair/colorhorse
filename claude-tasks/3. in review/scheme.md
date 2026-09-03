# Create scheme

The ultimate goal of this project is a dynamic color scheme generator. Next, select the hues for the scheme:

- Primary
- Secondary
- Tertiary
- Accent
- Tip
- Info
- Warning
- Danger

1. Primary is anchor one
2. Secondary is anchor two
3. Tip is the _most green_ remaining color
4. Info is the _most blue_ remaining color
5. Warning is the _most yellow_ remaining color
6. Danger is the _most red_ remaining color

Now we should have six remaining hues. The primary, secondary, and remaining colors will determine what type of scheme we are creating:

- tertiary (1,5,7,9)
- antitertiary (1,3,7,11)
- analagous (1,2,7,12)
- antianalagous (1,6,7,8)
- square (1,4,7,10)

_Note: We might need to introduce more schemes to cover all cases_

Based on the scheme we create, the closest color to the primary color will be the tertiary, and the furthest away will be the accent.

Once we've chosen those colors, add a new pallette beneath the table of 120 showcasing the scheme. Below that, enumerate the scheme in a `pre` code block as CSS variables.