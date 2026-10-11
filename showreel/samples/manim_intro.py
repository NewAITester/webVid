from manim import *

TITLE = "Hello Manim"  # عنوان
ACCENT = BLUE

class Intro(Scene):
    def construct(self):
        self.camera.background_color = "#101020"
        title = Text(TITLE, font_size=72, color=ACCENT)
        self.play(Write(title), run_time=1.5)
        self.wait(0.5)
        self.play(title.animate.shift(UP * 2).scale(0.6))
        c = Circle(radius=1.2, color=RED, fill_opacity=0.5)
        s = Square(side_length=2, color=GREEN).next_to(c, RIGHT, buff=1)
        g = VGroup(c, s)
        self.play(Create(c), FadeIn(s, shift=UP))
        self.play(Transform(c, Square(side_length=2.4, color=YELLOW)), run_time=1)
        self.play(Rotate(s, PI / 4), Indicate(title))
        self.wait()
        self.play(FadeOut(g), FadeOut(title))

class Outro(Scene):
    def construct(self):
        t = Text("Thanks!", font_size=96)
        for i in range(3):
            d = Dot(point=LEFT * 3 + RIGHT * 3 * i, color=YELLOW)
            self.add(d)
        self.play(GrowFromCenter(t))
        self.wait(1)
