# Cylinder

Now we will combine the three demos into one cylindrical demo with D for degrees, Z for Z-axis, and R for radius.

The circular axis will be D and range from 0 to 360.

The line axis will be Z and range from 0 to 1.

The curve axis will be R  and range from 0 to 1.

We will start with two anchor points:

```
const anchorOne: {
  D: 0.0,
  Z: 0.4,
  R: 0.7
}

const anchorTwo: {
  D: 47.0,
  Z: 0.3,
  R: 0.6
}
```

We will plot ten more points in space. All twelve points will be assigned an INDEX, which is its native index on the D axis.

Start with this. Then I will explain how to compute the Z and R axes.

## Comment

Put the control panel to the right of the rendering so it's easier to see and edit (but drop it underneat at <700px for smaller screens).

For the R axis, compute 13 points, where the first and last point have the same R value, which is the R value from `anchorOne`. `anchorTwo` will be the curve's anchor.

For the Z axis, first create an array with 10 values. Populate the array with the line deformation function, where PinOne is 0, PinFour is 1, and PinTwo and PinThree are the Z-values from the cylinder's `anchorOne` and `anchorTwo`. Then, repeat the two-dimension D-R plot once for each Z-value in the Z-array. You will have 120 points plotted.