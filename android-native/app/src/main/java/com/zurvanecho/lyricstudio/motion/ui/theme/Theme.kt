package com.zurvanecho.lyricstudio.motion.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.zurvanecho.lyricstudio.motion.R

/**
 * توکن‌های طراحی Alight — از res/values نسخهٔ دیکدشدهٔ APK استخراج شده‌اند.
 * سطوح A12..A4، لهجه‌ها B1/R2/Y1، متن G0..P5.
 */
object Alight {
    val SurfaceDeep = Color(0xFF0C0D13) // A12
    val Surface = Color(0xFF141620) // A11
    val Surface1 = Color(0xFF191C25) // A1
    val Surface2 = Color(0xFF1E2239) // A2
    val Surface3 = Color(0xFF242636) // A3
    val Surface4 = Color(0xFF2B2F39) // A4
    val Surface6 = Color(0xFF363942) // A6
    val Surface9 = Color(0xFF202332) // A9

    val Pink = Color(0xFFF16586) // B1
    val Red = Color(0xFFE01445) // R2
    val Mint = Color(0xFF00FFA8) // Y1
    val GreenLight = Color(0xFF69FC97) // C1
    val Green = Color(0xFF29E59C) // C2
    val Yellow = Color(0xFFF9DE66) // E3
    val Blue = Color(0xFF4A9EFF)
    val Purple = Color(0xFF9B7BFF)
    val Orange = Color(0xFFFF9F43)

    val Text = Color(0xFFFAFAFA) // G0
    val Text2 = Color(0xFFC4C5CB) // P1
    val Text3 = Color(0xFFA9ABB4) // P3
    val TextDim = Color(0xFF9395A1) // P4
    val Line = Color(0xFF2B2F39)
}

val LyricStudioFont = FontFamily(
    Font(R.font.iransansx_regular, FontWeight.Normal),
    Font(R.font.iransansx_medium, FontWeight.Medium),
    Font(R.font.iransansx_bold, FontWeight.Bold),
    Font(R.font.iransansx_black, FontWeight.Black),
)

private val ColorScheme = darkColorScheme(
    primary = Alight.Pink,
    secondary = Alight.Mint,
    background = Alight.SurfaceDeep,
    surface = Alight.Surface,
    surfaceVariant = Alight.Surface1,
    onPrimary = Alight.Text,
    onSecondary = Color.Black,
    onBackground = Alight.Text,
    onSurface = Alight.Text,
    onSurfaceVariant = Alight.Text2,
    error = Alight.Red,
)

private val AppTypography = Typography(
    titleLarge = TextStyle(fontFamily = LyricStudioFont, fontWeight = FontWeight.Black, fontSize = 20.sp),
    titleMedium = TextStyle(fontFamily = LyricStudioFont, fontWeight = FontWeight.Bold, fontSize = 16.sp),
    bodyLarge = TextStyle(fontFamily = LyricStudioFont, fontWeight = FontWeight.Normal, fontSize = 15.sp),
    bodyMedium = TextStyle(fontFamily = LyricStudioFont, fontWeight = FontWeight.Normal, fontSize = 13.sp),
    labelMedium = TextStyle(fontFamily = LyricStudioFont, fontWeight = FontWeight.Medium, fontSize = 12.sp),
    labelSmall = TextStyle(fontFamily = LyricStudioFont, fontWeight = FontWeight.Medium, fontSize = 10.5.sp),
)

@Composable
fun LyricStudioTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = ColorScheme,
        typography = AppTypography,
        content = content,
    )
}

/**
 * تبدیل رنگ هگز (#rgb / #rrggbb / #rrggbbaa) به Compose Color.
 * توجه: Color(Long) آلفا را اول می‌خواهد (AARRGGBB)، برعکس وب که آلفا آخر است.
 */
fun hexColor(hex: String?): Color {
    if (hex.isNullOrBlank()) return Color.Transparent
    return try {
        val h = hex.trimStart('#')
        val argb = when (h.length) {
            3 -> "FF" + h.map { "$it$it" }.joinToString("")
            6 -> "FF$h"
            8 -> h.substring(6, 8) + h.substring(0, 6) // rrggbbaa → aarrggbb
            else -> return Color.Transparent
        }
        Color(argb.toLong(16))
    } catch (_: Exception) {
        Color.Transparent
    }
}
