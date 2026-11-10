# LyricStudio — Native Android App

کپی برابر اصل Alight Motion، به‌صورت اوپن‌سورس — **بدون نیاز به اکانت، بدون پرداخت، بدون واترمارک.**

Native Android app (Kotlin + Jetpack Compose) that replicates Alight Motion's
behavior, layout, and feature set — built clean-room from observed behavior,
never from Alight's proprietary code, assets, or shaders.

## چی دارد (N1–N7)

| فاز | محتوا |
|-----|-------|
| N1 | اسکلت + خانه (۵ تب) + ادیتور (نوار بالا ۴۲dp، نوار پخش ۴۶dp، تایم‌لاین ۲۸۰dp، دکمهٔ + ۷۳dp) |
| N2 | رندر کامل: کی‌فریم + easing، ۲۱ شکل، مدیا (تصویر/ویدیو)، ماسک، گروه، ترکیب، دوربین |
| N3 | رجیستری ۲۹۱ افکت + موتور پیکسلی + پنل بازرس (اسلایدر پارامتر، انتخاب رنگ) |
| N4 | هستهٔ Rust از طریق JNI (aarch64) برای ۲۲ افکت پیکسلی — با fallback به Kotlin |
| N5 | پیش‌نمایش صدا (MediaPlayer) + ایمپورت شعر LRC (لایهٔ متن زمان‌بندی‌شده) |
| N6 | خروجی MP4 — H.264 + AAC (MediaCodec + MediaMuxer)، با همان رندر پیش‌نمایش |
| N7 | بیلد انتشار با R8 (minify + shrink)، نسخهٔ ۱٫۰٫۰ |

## ساخت

```bash
# APK دیباگ (CI هم همین را می‌سازد)
./gradlew :app:assembleDebug

# APK انتشار (R8 روشن، با کلید دیباگ امضا می‌شود)
./gradlew :app:assembleRelease
```

کتابخانهٔ Rust (JNI) در CI با NDK ساخته می‌شود و در `app/src/main/jniLibs/arm64-v8a/`
قرار می‌گیرد؛ نیازی به کامیت کردن `.so` نیست.

> توجه: Gradle در VM این دستیار ساخته نمی‌شود (فیلتر شبکهٔ VM همهٔ TCP جاوا را
> می‌گیرد) — بیلد فقط در GitHub Actions انجام می‌شود.

## بدون اکانت، بدون پرداخت

- هیچ لاگین، ثبت‌نام، یا حسابی نیست.
- هیچ پرداخت درون‌برنامه‌ای، اشتراک، یا قفل ویژگی نیست.
- هیچ واترمارکی روی خروجی نیست.
- پروژه‌ها به‌صورت JSON روی دستگاه ذخیره می‌شوند (`filesDir/projects`).

## لایسنس

اوپن‌سورس — جزئیات لایسنس با مالک ریپو است.
