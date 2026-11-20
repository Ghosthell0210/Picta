package cu.picta.pulse.ui.components

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Audiotrack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Subtitles
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import cu.picta.pulse.data.model.DownloadDestination
import cu.picta.pulse.data.model.DownloadTaskStatus
import cu.picta.pulse.data.model.Mp4AudioOption
import cu.picta.pulse.data.model.Mp4VariantOption
import cu.picta.pulse.data.model.Mp4VariantsResult
import cu.picta.pulse.data.model.PictaPublicacion
import cu.picta.pulse.data.network.PictaFormatters
import cu.picta.pulse.download.DownloadWorker
import cu.picta.pulse.ui.state.AppViewModel
import cu.picta.pulse.ui.theme.PictaColors
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DownloadBottomSheet(
    video: PictaPublicacion,
    viewModel: AppViewModel,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    val destination by viewModel.downloadDestination.collectAsState()
    val downloads by viewModel.downloads.collectAsState()

    var loadingVariants by remember { mutableStateOf(true) }
    var variantError by remember { mutableStateOf<String?>(null) }
    var variantsResult by remember { mutableStateOf<Mp4VariantsResult?>(null) }
    var selectedVariant by remember { mutableStateOf<Mp4VariantOption?>(null) }
    var selectedAudio by remember { mutableStateOf<Mp4AudioOption?>(null) }

    var activeDownloadId by remember { mutableStateOf<String?>(null) }
    var subtitleMessage by remember { mutableStateOf<String?>(null) }
    var loadingSub by remember { mutableStateOf(false) }

    var officialLoadingKey by remember { mutableStateOf<String?>(null) }
    var officialUrl by remember { mutableStateOf<String?>(null) }
    var officialError by remember { mutableStateOf<String?>(null) }

    val officialVariants = remember(video.descarga) {
        PictaFormatters.parseDescargaVariants(video.descarga)
    }

    val matchedTask = remember(downloads, activeDownloadId, video.id) {
        if (activeDownloadId != null) {
            downloads.firstOrNull { it.id == activeDownloadId }
        } else {
            downloads.firstOrNull {
                it.video.id == video.id && (
                    it.status == DownloadTaskStatus.PREPARING ||
                        it.status == DownloadTaskStatus.DOWNLOADING ||
                        it.status == DownloadTaskStatus.MUXING
                    )
            }
        }
    }

    fun launchActualDownload() {
        val chosen = selectedVariant ?: return
        val audio = selectedAudio
        val id = viewModel.startMp4Download(
            video = video,
            videoUrl = chosen.url,
            audioUrl = audio?.url,
            qualityLabel = chosen.label,
            estimatedSize = chosen.estimatedSizeLabel
        )
        activeDownloadId = id
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) {
        launchActualDownload()
    }

    fun requestPermissionsAndDownload() {
        val permsToAsk = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            permsToAsk.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED
        ) {
            permsToAsk.add(Manifest.permission.WRITE_EXTERNAL_STORAGE)
        }
        if (permsToAsk.isEmpty()) {
            launchActualDownload()
        } else {
            permissionLauncher.launch(permsToAsk.toTypedArray())
        }
    }

    LaunchedEffect(video.id) {
        loadingVariants = true
        variantError = null
        val manifest = video.urlManifiesto
        if (manifest.isNullOrBlank()) {
            variantError = "Esta publicación no tiene manifiesto de video disponible."
            loadingVariants = false
            return@LaunchedEffect
        }
        runCatching {
            viewModel.apiClient.fetchMp4Variants(manifest, video.duracionRaw)
        }.onSuccess { result ->
            variantsResult = result
            selectedVariant = result.variants.firstOrNull { it.label.contains("360") || it.label.contains("480") }
                ?: result.variants.firstOrNull()
            selectedAudio = result.audioTracks.firstOrNull { it.isDefault } ?: result.audioTracks.firstOrNull()
        }.onFailure { err ->
            variantError = err.message ?: "No se pudieron obtener las calidades MP4."
        }
        loadingVariants = false
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = PictaColors.BgSurface,
        contentColor = PictaColors.TextPrimary
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 640.dp)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(bottom = 28.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Descargar MP4 nativo",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = PictaColors.TextPrimary
                    )
                    Text(
                        text = video.nombre,
                        fontSize = 12.sp,
                        color = PictaColors.TextSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Default.Close, contentDescription = "Cerrar", tint = PictaColors.TextSecondary)
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Destination folder selector
            Text("Guardar en carpeta del teléfono", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Spacer(modifier = Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                listOf(DownloadDestination.DOWNLOADS, DownloadDestination.MOVIES).forEach { dest ->
                    val selected = destination == dest
                    Row(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(12.dp))
                            .background(if (selected) PictaColors.AccentCoral.copy(alpha = 0.14f) else PictaColors.BgElevated)
                            .border(
                                1.dp,
                                if (selected) PictaColors.AccentCoral else PictaColors.BorderSubtle,
                                RoundedCornerShape(12.dp)
                            )
                            .clickable { viewModel.setDownloadDestination(dest) }
                            .padding(horizontal = 10.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = if (dest == DownloadDestination.MOVIES) Icons.Default.Movie else Icons.Default.Folder,
                            contentDescription = null,
                            tint = if (selected) PictaColors.AccentCoral else PictaColors.TextSecondary,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Column {
                            Text(
                                text = if (dest == DownloadDestination.MOVIES) "Películas" else "Descargas",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = if (selected) PictaColors.TextPrimary else PictaColors.TextSecondary
                            )
                            Text(
                                text = dest.folderDisplay,
                                fontSize = 10.sp,
                                color = PictaColors.TextMuted,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            if (loadingVariants) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 20.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    CircularProgressIndicator(color = PictaColors.AccentCoral, modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    Spacer(modifier = Modifier.width(10.dp))
                    Text("Analizando calidades disponibles...", color = PictaColors.TextSecondary, fontSize = 13.sp)
                }
            } else if (variantError != null) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(PictaColors.ErrorBg)
                        .padding(12.dp)
                ) {
                    Text(variantError.orEmpty(), color = PictaColors.ErrorText, fontSize = 13.sp)
                }
            } else {
                val res = variantsResult
                if (res?.isLive == true) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(PictaColors.ErrorBg)
                            .padding(12.dp)
                    ) {
                        Text(
                            text = "Las transmisiones en vivo no se pueden descargar como MP4.",
                            color = PictaColors.ErrorText,
                            fontSize = 13.sp
                        )
                    }
                } else if (res != null) {
                    Text("Elige la calidad del MP4", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(8.dp))

                    val rows = res.variants.chunked(2)
                    rows.forEach { pair ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            pair.forEach { variant ->
                                val selected = selectedVariant?.id == variant.id
                                Column(
                                    modifier = Modifier
                                        .weight(1f)
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(if (selected) PictaColors.AccentCoral.copy(alpha = 0.14f) else PictaColors.BgElevated)
                                        .border(
                                            1.dp,
                                            if (selected) PictaColors.AccentCoral else PictaColors.BorderSubtle,
                                            RoundedCornerShape(12.dp)
                                        )
                                        .clickable { selectedVariant = variant }
                                        .padding(12.dp)
                                ) {
                                    Text(
                                        text = variant.label,
                                        color = PictaColors.TextPrimary,
                                        fontSize = 14.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                    if (variant.estimatedSizeLabel.isNotEmpty()) {
                                        Text(
                                            text = variant.estimatedSizeLabel,
                                            color = PictaColors.TextSecondary,
                                            fontSize = 11.sp,
                                            fontFamily = FontFamily.Monospace
                                        )
                                    }
                                }
                            }
                            if (pair.size == 1) {
                                Spacer(modifier = Modifier.weight(1f))
                            }
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                    }

                    if (res.audioTracks.size > 1) {
                        Spacer(modifier = Modifier.height(6.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Audiotrack, contentDescription = null, tint = PictaColors.AccentCoral, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Pista de audio", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        res.audioTracks.forEach { aud ->
                            val selected = selectedAudio?.id == aud.id
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(bottom = 6.dp)
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(if (selected) PictaColors.AccentCoral.copy(alpha = 0.14f) else PictaColors.BgElevated)
                                    .border(
                                        1.dp,
                                        if (selected) PictaColors.AccentCoral else PictaColors.BorderSubtle,
                                        RoundedCornerShape(10.dp)
                                    )
                                    .clickable { selectedAudio = aud }
                                    .padding(horizontal = 12.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(aud.label, color = PictaColors.TextPrimary, fontSize = 13.sp, modifier = Modifier.weight(1f))
                                if (selected) {
                                    Icon(Icons.Default.CheckCircle, contentDescription = null, tint = PictaColors.AccentCoral, modifier = Modifier.size(16.dp))
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    if (matchedTask != null && (
                        matchedTask.status == DownloadTaskStatus.PREPARING ||
                            matchedTask.status == DownloadTaskStatus.DOWNLOADING ||
                            matchedTask.status == DownloadTaskStatus.MUXING
                        )
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(14.dp))
                                .background(PictaColors.BgElevated)
                                .border(1.dp, PictaColors.BorderSubtle, RoundedCornerShape(14.dp))
                                .padding(14.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = if (matchedTask.status == DownloadTaskStatus.MUXING) "Empaquetando MP4..." else "Descargando (${matchedTask.quality})...",
                                    color = PictaColors.TextPrimary,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.weight(1f)
                                )
                                Text(
                                    text = "${matchedTask.progressPct}%",
                                    color = PictaColors.AccentCoral,
                                    fontSize = 13.sp,
                                    fontFamily = FontFamily.Monospace,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                            LinearProgressIndicator(
                                progress = { (matchedTask.progressPct.coerceIn(0, 100)) / 100f },
                                color = PictaColors.AccentCoral,
                                trackColor = PictaColors.BgCanvas,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(6.dp)
                                    .clip(RoundedCornerShape(3.dp))
                            )
                            Spacer(modifier = Modifier.height(10.dp))
                            OutlinedButton(
                                onClick = { viewModel.cancelDownload(matchedTask.id) },
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text("Cancelar descarga", color = PictaColors.ErrorText)
                            }
                        }
                    } else if (matchedTask?.status == DownloadTaskStatus.COMPLETED) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(14.dp))
                                .background(PictaColors.SuccessBg)
                                .border(1.dp, PictaColors.SuccessText.copy(alpha = 0.35f), RoundedCornerShape(14.dp))
                                .padding(14.dp)
                        ) {
                            Text(
                                text = "Guardado en ${matchedTask.relativePathDisplay} (${matchedTask.sizeLabel})",
                                color = PictaColors.SuccessText,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                            Spacer(modifier = Modifier.height(10.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Button(
                                    onClick = {
                                        onDismiss()
                                        viewModel.playVideo(matchedTask.video, matchedTask.contentUri)
                                    },
                                    colors = ButtonDefaults.buttonColors(containerColor = PictaColors.AccentCoral),
                                    shape = RoundedCornerShape(10.dp),
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Icon(Icons.Default.PlayArrow, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Reproducir", fontSize = 12.sp)
                                }
                                OutlinedButton(
                                    onClick = {
                                        if (matchedTask.contentUri.isNotBlank()) {
                                            val openIntent = Intent(Intent.ACTION_VIEW).apply {
                                                setDataAndType(Uri.parse(matchedTask.contentUri), "video/mp4")
                                                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                            }
                                            runCatching { context.startActivity(openIntent) }
                                        }
                                    },
                                    shape = RoundedCornerShape(10.dp),
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Icon(Icons.Default.OpenInNew, contentDescription = null, modifier = Modifier.size(15.dp), tint = PictaColors.TextPrimary)
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Abrir MP4", fontSize = 12.sp, color = PictaColors.TextPrimary)
                                }
                            }
                        }
                    } else {
                        if (matchedTask?.status == DownloadTaskStatus.FAILED && !matchedTask.errorMessage.isNullOrBlank()) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(bottom = 10.dp)
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(PictaColors.ErrorBg)
                                    .padding(10.dp)
                            ) {
                                Text(matchedTask.errorMessage, color = PictaColors.ErrorText, fontSize = 12.sp)
                            }
                        }
                        val chosen = selectedVariant
                        Button(
                            onClick = { requestPermissionsAndDownload() },
                            enabled = chosen != null,
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = PictaColors.AccentCoral,
                                contentColor = Color.White
                            ),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(48.dp)
                        ) {
                            Icon(Icons.Default.Download, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            val btnText = buildString {
                                append("Guardar MP4")
                                if (chosen != null) {
                                    append(" (${chosen.label}")
                                    if (chosen.estimatedSizeLabel.isNotEmpty()) append(" · ${chosen.estimatedSizeLabel}")
                                    append(")")
                                }
                            }
                            Text(btnText, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }

            if (!video.urlSubtitulo.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(14.dp))
                OutlinedButton(
                    onClick = {
                        if (loadingSub) return@OutlinedButton
                        loadingSub = true
                        subtitleMessage = null
                        scope.launch {
                            runCatching {
                                DownloadWorker.downloadSubtitleOnly(context, video, video.urlSubtitulo)
                            }.onSuccess { saved ->
                                subtitleMessage = "Subtítulo guardado en ${saved.displayPath}"
                            }.onFailure { err ->
                                subtitleMessage = err.message ?: "No se pudo guardar el subtítulo."
                            }
                            loadingSub = false
                        }
                    },
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.Subtitles, contentDescription = null, tint = PictaColors.TextPrimary, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (loadingSub) "Descargando subtítulo..." else "Descargar subtítulo (.srt)",
                        color = PictaColors.TextPrimary,
                        fontSize = 13.sp
                    )
                }
                if (!subtitleMessage.isNullOrBlank()) {
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(subtitleMessage.orEmpty(), color = PictaColors.TextSecondary, fontSize = 12.sp)
                }
            }

            if (officialVariants.isNotEmpty()) {
                Spacer(modifier = Modifier.height(16.dp))
                HorizontalDivider(color = PictaColors.BorderSubtle)
                Spacer(modifier = Modifier.height(12.dp))
                Text("Enlace directo oficial (suscriptores)", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    officialVariants.take(3).forEach { ov ->
                        OutlinedButton(
                            onClick = {
                                officialLoadingKey = ov.key
                                officialError = null
                                officialUrl = null
                                scope.launch {
                                    runCatching {
                                        viewModel.apiClient.generateDownloadLink(video.id, ov.key)
                                    }.onSuccess { url ->
                                        if (url.isBlank()) {
                                            officialError = "Picta no devolvió enlace para esta calidad."
                                        } else {
                                            officialUrl = url
                                        }
                                    }.onFailure { err ->
                                        officialError = err.message ?: "Requiere plan con descargas activas en Picta."
                                    }
                                    officialLoadingKey = null
                                }
                            },
                            enabled = officialLoadingKey == null,
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Text(
                                text = if (officialLoadingKey == ov.key) "..." else "${ov.label} (${ov.size})",
                                fontSize = 11.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                color = PictaColors.TextPrimary
                            )
                        }
                    }
                }
                if (!officialError.isNullOrBlank()) {
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(officialError.orEmpty(), color = PictaColors.ErrorText, fontSize = 12.sp)
                }
                if (!officialUrl.isNullOrBlank()) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Button(
                        onClick = {
                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(officialUrl))
                            runCatching { context.startActivity(intent) }
                        },
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = PictaColors.BgElevated),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(Icons.Default.OpenInNew, contentDescription = null, modifier = Modifier.size(16.dp), tint = PictaColors.AccentCoral)
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Abrir enlace oficial de Picta", color = PictaColors.TextPrimary, fontSize = 13.sp)
                    }
                }
            }
        }
    }
}
