package cu.picta.pulse.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.DownloadDone
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
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
import cu.picta.pulse.data.model.DownloadTaskStatus
import cu.picta.pulse.data.model.LocalDownloadItem
import cu.picta.pulse.ui.components.PictaMediaImage
import cu.picta.pulse.ui.state.AppViewModel
import cu.picta.pulse.ui.theme.PictaColors

@Composable
fun DownloadsScreen(viewModel: AppViewModel) {
    val context = LocalContext.current
    val downloads by viewModel.downloads.collectAsState()
    val destination by viewModel.downloadDestination.collectAsState()

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(PictaColors.BgCanvas),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 110.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(PictaColors.BgSurface)
                    .border(1.dp, PictaColors.BorderSubtle, RoundedCornerShape(16.dp))
                    .padding(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.Folder, contentDescription = null, tint = PictaColors.AccentCoral, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text("Descargas MP4 en tu teléfono", color = PictaColors.TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    Text(
                        text = "Carpeta activa: ${destination.folderDisplay}",
                        color = PictaColors.TextSecondary,
                        fontSize = 12.sp
                    )
                }
            }
        }

        if (downloads.isEmpty()) {
            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 48.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Icon(Icons.Default.DownloadDone, contentDescription = null, tint = PictaColors.TextMuted, modifier = Modifier.size(36.dp))
                    Spacer(modifier = Modifier.height(10.dp))
                    Text("Aún no has descargado videos", color = PictaColors.TextPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "Abre cualquier video y toca Descargar para guardarlo como MP4 en Descargas o Películas.",
                        color = PictaColors.TextSecondary,
                        fontSize = 13.sp
                    )
                }
            }
        } else {
            items(downloads, key = { it.id }) { item ->
                DownloadCard(
                    item = item,
                    onPlayOffline = {
                        viewModel.playVideo(item.video, item.contentUri.takeIf { it.isNotBlank() })
                    },
                    onOpenExternal = {
                        if (item.contentUri.isNotBlank()) {
                            val intent = Intent(Intent.ACTION_VIEW).apply {
                                setDataAndType(Uri.parse(item.contentUri), "video/mp4")
                                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                            }
                            runCatching { context.startActivity(intent) }
                        }
                    },
                    onShare = {
                        if (item.contentUri.isNotBlank()) {
                            val share = Intent(Intent.ACTION_SEND).apply {
                                type = "video/mp4"
                                putExtra(Intent.EXTRA_STREAM, Uri.parse(item.contentUri))
                                putExtra(Intent.EXTRA_SUBJECT, item.video.nombre)
                                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                            }
                            runCatching { context.startActivity(Intent.createChooser(share, "Compartir video MP4")) }
                        }
                    },
                    onCancel = { viewModel.cancelDownload(item.id) },
                    onDelete = { viewModel.deleteDownload(item) }
                )
            }
        }
    }
}

@Composable
private fun DownloadCard(
    item: LocalDownloadItem,
    onPlayOffline: () -> Unit,
    onOpenExternal: () -> Unit,
    onShare: () -> Unit,
    onCancel: () -> Unit,
    onDelete: () -> Unit
) {
    val isActive = item.status == DownloadTaskStatus.PREPARING ||
        item.status == DownloadTaskStatus.DOWNLOADING ||
        item.status == DownloadTaskStatus.MUXING

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(PictaColors.BgSurface)
            .border(1.dp, PictaColors.BorderSubtle, RoundedCornerShape(16.dp))
            .padding(12.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .width(104.dp)
                    .aspectRatio(16f / 9f)
                    .clip(RoundedCornerShape(10.dp))
                    .background(PictaColors.BgElevated)
            ) {
                PictaMediaImage(
                    rawUrl = item.video.urlImagen,
                    size = "240x135",
                    contentDescription = item.video.nombre,
                    modifier = Modifier.fillMaxSize()
                )
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.video.nombre,
                    color = PictaColors.TextPrimary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = listOf(item.quality, item.sizeLabel).filter { it.isNotBlank() }.joinToString(" · "),
                    color = PictaColors.TextSecondary,
                    fontSize = 11.sp,
                    fontFamily = FontFamily.Monospace
                )
                if (item.relativePathDisplay.isNotBlank()) {
                    Text(
                        text = item.relativePathDisplay,
                        color = PictaColors.TextMuted,
                        fontSize = 11.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
            if (isActive) {
                IconButton(onClick = onCancel) {
                    Icon(Icons.Default.Cancel, contentDescription = "Cancelar", tint = PictaColors.AccentCoral)
                }
            } else {
                IconButton(onClick = onDelete) {
                    Icon(Icons.Default.DeleteOutline, contentDescription = "Eliminar", tint = PictaColors.TextSecondary)
                }
            }
        }

        if (isActive) {
            Spacer(modifier = Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = when (item.status) {
                        DownloadTaskStatus.PREPARING -> "Preparando..."
                        DownloadTaskStatus.MUXING -> "Empaquetando MP4..."
                        else -> "Descargando..."
                    },
                    color = PictaColors.TextSecondary,
                    fontSize = 12.sp,
                    modifier = Modifier.weight(1f)
                )
                Text(
                    text = "${item.progressPct}%",
                    color = PictaColors.AccentCoral,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace
                )
            }
            Spacer(modifier = Modifier.height(6.dp))
            LinearProgressIndicator(
                progress = { (item.progressPct.coerceIn(0, 100)) / 100f },
                color = PictaColors.AccentCoral,
                trackColor = PictaColors.BgElevated,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(5.dp)
                    .clip(RoundedCornerShape(3.dp))
            )
        } else if (item.status == DownloadTaskStatus.FAILED) {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = item.errorMessage ?: "Descarga fallida",
                color = PictaColors.ErrorText,
                fontSize = 12.sp
            )
        } else if (item.status == DownloadTaskStatus.CANCELLED) {
            Spacer(modifier = Modifier.height(8.dp))
            Text("Descarga cancelada", color = PictaColors.TextMuted, fontSize = 12.sp)
        } else if (item.status == DownloadTaskStatus.COMPLETED && item.contentUri.isNotBlank()) {
            Spacer(modifier = Modifier.height(10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = onPlayOffline,
                    colors = ButtonDefaults.buttonColors(containerColor = PictaColors.AccentCoral, contentColor = Color.White),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.Default.PlayArrow, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Ver offline", fontSize = 12.sp)
                }
                OutlinedButton(
                    onClick = onOpenExternal,
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Icon(Icons.Default.OpenInNew, contentDescription = "Abrir", tint = PictaColors.TextPrimary, modifier = Modifier.size(16.dp))
                }
                OutlinedButton(
                    onClick = onShare,
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Icon(Icons.Default.Share, contentDescription = "Compartir", tint = PictaColors.TextPrimary, modifier = Modifier.size(16.dp))
                }
            }
        }
    }
}
