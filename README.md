# لیریک استودیو — بازسازی از صفر

ویرایشگر ویدیوی موشن‌گرافی در مرورگر، به سبک Alight Motion.
برنچ بازسازی: `feature/alight-rebuild` — جزئیات و نقشهٔ راه در `REBUILD.md`.

## اجرا
```sh
npm install
npm run dev      # پیش‌نمایش روی :5173
npm test         # node tests/rebuild.smoke.test.mjs
npm run build    # خروجی در dist/
```

## معماری
```
src/core/     خالص و تست‌پذیر: schema، store، evaluate، easing
src/render/   رندر Canvas 2D (renderFrame خالص) + پول رسانه
src/ui/       DOM: home، editor، timeline، panels
src/export/   خروجی ویدیو (WebCodecs؛ فاز R5)
```

## فازها
| فاز | کار |
|---|---|
| R1 | پی‌ریزی: core + رندر + دیزاین‌سیستم + خانه + پوستهٔ ویرایشگر + تایم‌لاین |
| R2 | ویرایش لایه: برش/تقسیم/گروه/ماسک/تک‌نمایش/واگرد |
| R3 | افکت‌ها: رجیستری کامل + بازرس افکت |
| R4 | WebGL: شیدر رنگ/محو/وینیت + مرجع CPU |
| R5 | خروجی: WebCodecs + FFmpeg + پیش‌نمایش خروجی |
| R6 | برابری افکت: ۲۷۲ افکت + ۲۰ شکل |
| R7 | صدا + دوربین + خط آزاد + شعر (.lrc → لایهٔ متن) |
| R8 | پرداخت نهایی + راستی‌آزمایی |
