package cu.picta.pulse.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

object PictaColors {
    val BgCanvas = Color(0xFF070709)
    val BgSurface = Color(0xFF111318)
    val BgElevated = Color(0xFF181B22)
    val AccentCoral = Color(0xFFFF4D4D)
    val AccentCoralHover = Color(0xFFFF6666)
    val TextPrimary = Color(0xFFF5F6F8)
    val TextSecondary = Color(0xFF9CA3AF)
    val TextMuted = Color(0xFF6B7280)
    val BorderSubtle = Color(0x14FFFFFF)
    val BorderStrong = Color(0x26FFFFFF)
    val ErrorBg = Color(0x1AFF4D4D)
    val ErrorText = Color(0xFFFCA5A5)
    val Success = Color(0xFF22C55E)
    val Warning = Color(0xFFD97706)
}

private val DarkColorScheme = darkColorScheme(
    primary = PictaColors.AccentCoral,
    onPrimary = Color.White,
    secondary = PictaColors.BgElevated,
    onSecondary = PictaColors.TextPrimary,
    background = PictaColors.BgCanvas,
    onBackground = PictaColors.TextPrimary,
    surface = PictaColors.BgSurface,
    onSurface = PictaColors.TextPrimary,
    surfaceVariant = PictaColors.BgElevated,
    onSurfaceVariant = PictaColors.TextSecondary,
    outline = PictaColors.BorderSubtle,
    error = PictaColors.AccentCoral,
    onError = Color.White,
)

private val AppTypography = Typography(
    headlineMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 24.sp,
        lineHeight = 30.sp,
        letterSpacing = (-0.3).sp
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 20.sp,
        lineHeight = 26.sp,
        letterSpacing = (-0.2).sp
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 16.sp,
        lineHeight = 22.sp
    ),
    bodyLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 15.sp,
        lineHeight = 22.sp
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp
    ),
    labelMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 16.sp
    ),
    labelSmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        lineHeight = 14.sp
    )
)

@Composable
fun PictaPulseTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        typography = AppTypography,
        content = content
    )
}
