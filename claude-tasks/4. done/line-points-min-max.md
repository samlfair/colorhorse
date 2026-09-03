# Min-max line points

The line deformation is good. However, I made a mistake in my conception. Rather than position the points between 0 and 1, the points should be position between Pin1 and Pin4, with 0 and 1 as the minimum and maximum allowed position. So the plot is `[PinOne, ..., PinFour]`, with pins two and three somewhere in the middle.

1 >= PinFour > PinThree > PinTwo > PinOne >= 0

The identies of the pins can be automatically assigned based on their values. If PinFour is 0.8 and PinThree is 0.7, and then the value of PinThree changes to 0.9, then you should swap the identities of PinThree and PinFour to keep the values in order.