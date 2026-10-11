from manim import *
import numpy as np

class Graph(MovingCameraScene):
    def construct(self):
        ax = Axes(x_range=[-3, 3, 1], y_range=[-2, 2, 1], x_length=8, y_length=5)
        curve = ax.plot(lambda x: np.sin(x), color=BLUE)
        label = MathTex(r"y = \sin(x)").to_corner(UL)
        dots = VGroup(*[Dot(ax.c2p(x, np.sin(x)), color=YELLOW) for x in np.arange(-3, 3.1, 1)])
        self.play(Create(ax), run_time=1)
        self.play(Create(curve), Write(label))
        self.play(LaggedStart(*[FadeIn(d, scale=0.5) for d in dots], lag_ratio=0.2))
        t = ValueTracker(0)
        self.play(t.animate.set_value(3), run_time=2)
        box = SurroundingRectangle(label, color=RED, buff=0.2)
        self.play(Create(box))
        arr = Arrow(LEFT * 2, RIGHT * 2, color=GREEN).shift(DOWN * 3)
        self.play(GrowArrow(arr))
        title = Text("سینوس", font_size=60).next_to(arr, UP)
        self.play(FadeIn(title, shift=DOWN))
        self.wait(2)
