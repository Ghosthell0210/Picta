package cu.picta.pulse.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Smartphone
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cu.picta.pulse.data.model.PictaUser
import cu.picta.pulse.ui.theme.PictaColors

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccountBottomSheet(
    user: PictaUser?,
    onDismiss: () -> Unit,
    onLogout: () -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = PictaColors.BgSurface,
        contentColor = PictaColors.TextPrimary
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 28.dp)
        ) {
            Text("Tu cuenta de Picta", fontSize = 18.sp, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(14.dp))

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(18.dp))
                    .background(PictaColors.BgCanvas)
                    .border(1.dp, PictaColors.BorderSubtle, RoundedCornerShape(18.dp))
                    .padding(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .background(PictaColors.BgElevated)
                ) {
                    PictaMediaImage(
                        rawUrl = user?.avatar,
                        size = "80x80",
                        contentDescription = user?.username ?: "Cuenta",
                        isAvatar = true,
                        fallbackText = user?.username ?: "P",
                        modifier = Modifier.fillMaxSize()
                    )
                }
                Spacer(modifier = Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    val fullName = listOfNotNull(user?.firstName, user?.lastName)
                        .filter { it.isNotBlank() }
                        .joinToString(" ")
                        .ifBlank { user?.username ?: "Usuario" }
                    Text(
                        text = fullName,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = PictaColors.TextPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    val handle = buildString {
                        append("@${user?.username ?: "picta"}")
                        if (!user?.phoneNumber.isNullOrBlank()) {
                            append(" · ${user?.phoneNumber}")
                        }
                    }
                    Text(
                        text = handle,
                        fontSize = 12.sp,
                        color = PictaColors.TextSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(16.dp))
                        .background(PictaColors.BgElevated)
                        .border(1.dp, PictaColors.BorderSubtle, RoundedCornerShape(16.dp))
                        .padding(14.dp)
                ) {
                    Text("Suscripción", fontSize = 12.sp, color = PictaColors.TextSecondary)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = if (user?.hasSubscription == true) user.subscriptionPlan?.nombre ?: "Activa" else "Gratuita",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = PictaColors.TextPrimary
                    )
                }
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(16.dp))
                        .background(PictaColors.BgElevated)
                        .border(1.dp, PictaColors.BorderSubtle, RoundedCornerShape(16.dp))
                        .padding(14.dp)
                ) {
                    Text("Descargas usadas", fontSize = 12.sp, color = PictaColors.TextSecondary)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = (user?.totalDownloads ?: 0).toString(),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        fontFamily = FontFamily.Monospace,
                        color = PictaColors.TextPrimary
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(PictaColors.BgElevated)
                    .border(1.dp, PictaColors.BorderSubtle, RoundedCornerShape(16.dp))
                    .padding(14.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Smartphone, contentDescription = null, tint = PictaColors.AccentCoral, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("App Android Nativa", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                }
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = "Conexión directa a api.picta.cu y videos.picta.cu sin VPN, reproductor ExoPlayer y descargas MP4 directo a tu teléfono.",
                    fontSize = 12.sp,
                    color = PictaColors.TextSecondary,
                    lineHeight = 17.sp
                )
                Spacer(modifier = Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Shield, contentDescription = null, tint = PictaColors.AccentCoral, modifier = Modifier.size(14.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Autenticación OAuth2 oficial", fontSize = 11.sp, color = PictaColors.TextSecondary)
                }
            }

            Spacer(modifier = Modifier.height(18.dp))

            Button(
                onClick = {
                    onDismiss()
                    onLogout()
                },
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = PictaColors.ErrorBg,
                    contentColor = PictaColors.ErrorText
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .border(1.dp, PictaColors.AccentCoral.copy(alpha = 0.35f), RoundedCornerShape(14.dp))
            ) {
                Icon(Icons.Default.Logout, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Cerrar sesión", fontWeight = FontWeight.SemiBold)
            }
        }
    }
}
