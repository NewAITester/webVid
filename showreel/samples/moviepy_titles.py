from moviepy.editor import *
from moviepy.video.fx.all import fadein, fadeout

W, H = 1920, 1080          # اندازهٔ قاب
TITLE = "سفر به ستاره‌ها"   # عنوان
ACCENT = (228, 20, 42)      # رنگ اصلی
DUR = 3

def title_card(text, sub, color):
    bg = ColorClip((W, H), color=color).set_duration(DUR)
    t = TextClip(text, fontsize=110, color='white', font='Arial-Bold').set_position('center').set_duration(DUR).crossfadein(0.5)
    s = (TextClip(sub, fontsize=40, color='#FFD447')
         .set_position(('center', H * 0.68))
         .set_start(0.6).set_duration(DUR - 0.6)
         .fx(fadein, 0.4))
    return CompositeVideoClip([bg, t, s], size=(W, H))

scenes = [title_card(TITLE, "قسمت اول", ACCENT), title_card("CHAPTER 2", "the journey", (10, 10, 30))]
logo = ImageClip("logo.png").set_duration(4).resize(height=200).set_position(lambda t: (100 + 300 * t, 50))
bar = ColorClip((400, 12), color=(255, 255, 255)).set_position(("center", 900)).set_duration(4)
end = CompositeVideoClip([ColorClip((W, H), color=(0, 0, 0)).set_duration(4), logo, bar,
                          TextClip("THE END", fontsize=150, color="white").set_position("center").set_duration(4).fadeout(1)])
final = concatenate_videoclips(scenes + [end], method="compose")
final = final.set_audio(AudioFileClip("music.mp3").subclip(0, final.duration))
final.write_videofile("out.mp4", fps=30)
