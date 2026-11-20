package cu.picta.pulse.ui.screens

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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cu.picta.pulse.data.network.PictaApiClient
import cu.picta.pulse.ui.theme.PictaColors
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(apiClient: PictaApiClient) {
    val scope = rememberCoroutineScope()
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(false) }
    var errorMsg by remember { mutableStateOf<String?>(null) }

    val isCubanPhone = remember(username) { Regex("^\\d{8}$").matches(username.trim()) }

    fun submit() {
        if (username.isBlank() || password.isEmpty()) {
            errorMsg = "Completa tu usuario o número móvil y contraseña."
            return
        }
        loading = true
        errorMsg = null
        scope.launch {
            runCatching { apiClient.login(username.trim(), password) }
                .onFailure { err ->
                    errorMsg = err.message ?: "No se pudo conectar con api.picta.cu."
                }
            loading = false
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(PictaColors.BgCanvas)
            .imePadding()
            .padding(horizontal = 20.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(vertical = 32.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(PictaColors.AccentCoral.copy(alpha = 0.16f))
                        .border(1.dp, PictaColors.AccentCoral.copy(alpha = 0.35f), RoundedCornerShape(16.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.PlayArrow,
                        contentDescription = null,
                        tint = PictaColors.AccentCoral,
                        modifier = Modifier.size(28.dp)
                    )
                }
                Spacer(modifier = Modifier.width(12.dp))
                Column {
                    Text(
                        text = "Picta Pulse",
                        color = PictaColors.TextPrimary,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "Cliente nativo rápido para Picta",
                        color = PictaColors.TextSecondary,
                        fontSize = 13.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(24.dp))
                    .background(PictaColors.BgSurface)
                    .border(1.dp, PictaColors.BorderSubtle, RoundedCornerShape(24.dp))
                    .padding(22.dp)
            ) {
                Text(
                    text = "Inicia sesión con tu cuenta",
                    color = PictaColors.TextPrimary,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.SemiBold
                )
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = "Conexión directa a api.picta.cu sin VPN usando tu móvil cubano o usuario.",
                    color = PictaColors.TextSecondary,
                    fontSize = 13.sp,
                    lineHeight = 19.sp
                )

                Spacer(modifier = Modifier.height(20.dp))

                Text("Teléfono o usuario", color = PictaColors.TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                Spacer(modifier = Modifier.height(6.dp))
                OutlinedTextField(
                    value = username,
                    onValueChange = { username = it },
                    singleLine = true,
                    placeholder = { Text("Ej. 56942234 o usuario", color = PictaColors.TextMuted) },
                    leadingIcon = { Icon(Icons.Default.Phone, contentDescription = null, tint = PictaColors.TextSecondary) },
                    trailingIcon = {
                        if (isCubanPhone) {
                            Text(
                                text = "+53",
                                color = PictaColors.AccentCoral,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                                fontFamily = FontFamily.Monospace,
                                modifier = Modifier.padding(end = 12.dp)
                            )
                        }
                    },
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                    shape = RoundedCornerShape(14.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = PictaColors.BgCanvas,
                        unfocusedContainerColor = PictaColors.BgCanvas,
                        focusedBorderColor = PictaColors.AccentCoral,
                        unfocusedBorderColor = PictaColors.BorderSubtle,
                        focusedTextColor = PictaColors.TextPrimary,
                        unfocusedTextColor = PictaColors.TextPrimary
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(16.dp))

                Text("Contraseña", color = PictaColors.TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                Spacer(modifier = Modifier.height(6.dp))
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    singleLine = true,
                    placeholder = { Text("Tu contraseña de Picta", color = PictaColors.TextMuted) },
                    leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null, tint = PictaColors.TextSecondary) },
                    trailingIcon = {
                        IconButton(onClick = { showPassword = !showPassword }) {
                            Icon(
                                imageVector = if (showPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                contentDescription = if (showPassword) "Ocultar" else "Mostrar",
                                tint = PictaColors.TextSecondary
                            )
                        }
                    },
                    visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { if (!loading) submit() }),
                    shape = RoundedCornerShape(14.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = PictaColors.BgCanvas,
                        unfocusedContainerColor = PictaColors.BgCanvas,
                        focusedBorderColor = PictaColors.AccentCoral,
                        unfocusedBorderColor = PictaColors.BorderSubtle,
                        focusedTextColor = PictaColors.TextPrimary,
                        unfocusedTextColor = PictaColors.TextPrimary
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                if (!errorMsg.isNullOrBlank()) {
                    Spacer(modifier = Modifier.height(14.dp))
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(PictaColors.ErrorBg)
                            .border(1.dp, PictaColors.AccentCoral.copy(alpha = 0.35f), RoundedCornerShape(12.dp))
                            .padding(12.dp),
                        verticalAlignment = Alignment.Top
                    ) {
                        Icon(
                            imageVector = Icons.Default.ErrorOutline,
                            contentDescription = null,
                            tint = PictaColors.AccentCoral,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(errorMsg!!, color = PictaColors.ErrorText, fontSize = 13.sp)
                    }
                }

                Spacer(modifier = Modifier.height(20.dp))

                Button(
                    onClick = { submit() },
                    enabled = !loading,
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = PictaColors.AccentCoral,
                        contentColor = Color.White
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp)
                ) {
                    if (loading) {
                        CircularProgressIndicator(
                            color = Color.White,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(10.dp))
                        Text("Conectando con Picta...", fontWeight = FontWeight.SemiBold)
                    } else {
                        Text("Entrar a Picta", fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                    }
                }

                Spacer(modifier = Modifier.height(18.dp))
                HorizontalDivider(color = PictaColors.BorderSubtle)
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "Tu sesión se guarda en tu dispositivo con tokens OAuth2 oficiales de Picta.",
                    color = PictaColors.TextSecondary,
                    fontSize = 12.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
    }
}
