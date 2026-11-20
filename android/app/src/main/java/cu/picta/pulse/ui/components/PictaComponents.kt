package cu.picta.pulse.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.SubcomposeAsyncImage
import coil.request.ImageRequest
import cu.picta.pulse.data.model.PictaCanal
import cu.picta.pulse.data.model.PictaPublicacion
import cu.picta.pulse.data.model.PictaSerie
import cu.picta.pulse.data.model.PictaTemporada
import cu.picta.pulse.data.network.PictaApiClient
import cu.picta.pulse.data.network.PictaFormatters
import cu.picta.pulse.ui.theme.PictaColors
import kotlinx.coroutines.launch

@Composable
fun PictaMediaImage(
    rawUrl: String?,
    size: String = "480x270",
    contentDescription: String,
    modifier: Modifier = Modifier,
    isAvatar: Boolean = false,
    isPoster: Boolean = false,
    fallbackText: String = "P"
) {
    val candidates = remember(rawUrl, size) { PictaFormatters.getPictaImageCandidates(rawUrl, size) }
    var candidateIdx by remember(rawUrl, size) { mutableIntStateOf(0) }
    val activeUrl = candidates.getOrNull(candidateIdx)

    if (activeUrl.isNullOrBlank()) {
        FallbackPlaceholder(
            modifier = modifier,
            isAvatar = isAvatar,
            isPoster = isPoster,
            fallbackText = fallbackText
        )
        return
    }

    val context = LocalContext.current
    SubcomposeAsyncImage(
        model = remember(activeUrl) {
            ImageRequest.Builder(context)
                .data(activeUrl)
                .crossfade(true)
                .build()
        },
        contentDescription = contentDescription,
        contentScale = ContentScale.Crop,
        modifier = modifier,
        loading = {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(PictaColors.BgElevated)
            )
        },
        error = {
            LaunchedEffect(activeUrl) {
                if (candidateIdx == 0 && !rawUrl.isNullOrBlank() && candidates.size > 1) {
                    PictaFormatters.markSizedMiss(rawUrl, size)
                }
                candidateIdx++
            }
            FallbackPlaceholder(
                modifier = Modifier.fillMaxSize(),
                isAvatar = isAvatar,
                isPoster = isPoster,
                fallbackText = fallbackText
            )
        }
    )
}

@Composable
private fun FallbackPlaceholder(
    modifier: Modifier,
    isAvatar: Boolean,
    isPoster: Boolean,
    fallbackText: String
) {
    Box(
        modifier = modifier.background(
            Brush.linearGradient(
                listOf(PictaColors.BgElevated, PictaColors.BgSurface, PictaColors.BgCanvas)
            )
        ),
        contentAlignment = Alignment.Center
    ) {
        when {
            isAvatar -> {
                val initial = fallbackText.trim().firstOrNull()?.uppercaseChar()?.toString() ?: "P"
                Text(
                    text = initial,
                    color = PictaColors.TextPrimary,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 14.sp
                )
            }
            isPoster -> Icon(
                imageVector = Icons.Default.Tv,
                contentDescription = null,
                tint = PictaColors.TextSecondary.copy(alpha = 0.45f),
                modifier = Modifier.size(28.dp)
            )
            else -> Icon(
                imageVector = Icons.Default.Movie,
                contentDescription = null,
                tint = PictaColors.TextSecondary.copy(alpha = 0.45f),
                modifier = Modifier.size(28.dp)
            )
        }
    }
}

@Composable
fun VideoCard(
    video: PictaPublicacion,
    onSelect: (PictaPublicacion) -> Unit,
    onChannelClick: ((PictaCanal) -> Unit)? = null,
    progressPercent: Int? = null,
    modifier: Modifier = Modifier
) {
    val durText = remember(video.duracionRaw) { PictaFormatters.formatDuration(video.duracionRaw) }
    val views = remember(video.cantidadVisitas, video.cantidadReproducciones) {
        PictaFormatters.formatCount(if (video.cantidadVisitas > 0) video.cantidadVisitas else video.cantidadReproducciones)
    }
    val relDate = remember(video.fechaPublicado, video.fechaCreacion) {
        PictaFormatters.formatRelativeDate(video.fechaPublicado ?: video.fechaCreacion)
    }
    val price = video.precios.firstOrNull()?.valor

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clickable { onSelect(video) }
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
                .clip(RoundedCornerShape(16.dp))
                .background(PictaColors.BgSurface)
                .border(1.dp, PictaColors.BorderSubtle, RoundedCornerShape(16.dp))
        ) {
            PictaMediaImage(
                rawUrl = video.urlImagen,
                size = "480x270",
                contentDescription = video.nombre,
                modifier = Modifier.fillMaxSize()
            )

            if (price != null && price > 0) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(8.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color.Black.copy(alpha = 0.78f))
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = "${price.toInt()} CUP",
                        color = Color(0xFFFBBF24),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }

            if (durText.isNotEmpty()) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(8.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(Color.Black.copy(alpha = 0.82f))
                        .padding(horizontal = 6.dp, vertical = 3.dp)
                ) {
                    Text(
                        text = durText,
                        color = PictaColors.TextPrimary,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }

            if (progressPercent != null && progressPercent > 0) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .fillMaxWidth()
                        .height(3.dp)
                        .background(Color.White.copy(alpha = 0.2f))
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth((progressPercent.coerceIn(1, 100)) / 100f)
                            .height(3.dp)
                            .background(PictaColors.AccentCoral)
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Top
        ) {
            val canal = video.canal
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(PictaColors.BgElevated)
                    .border(1.dp, PictaColors.BorderSubtle, CircleShape)
                    .clickable(enabled = canal != null && onChannelClick != null) {
                        if (canal != null) onChannelClick?.invoke(canal)
                    }
            ) {
                PictaMediaImage(
                    rawUrl = canal?.urlAvatar ?: canal?.urlImagen,
                    size = "80x80",
                    contentDescription = canal?.nombre ?: "Canal",
                    isAvatar = true,
                    fallbackText = canal?.nombre ?: "P",
                    modifier = Modifier.fillMaxSize()
                )
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = video.nombre,
                    color = PictaColors.TextPrimary,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    lineHeight = 20.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(modifier = Modifier.height(4.dp))
                val channelName = canal?.nombre ?: "Picta"
                val metaText = buildString {
                    append(channelName)
                    append(" · ")
                    append("$views vistas")
                    if (relDate.isNotEmpty()) {
                        append(" · ")
                        append(relDate)
                    }
                }
                Text(
                    text = metaText,
                    color = PictaColors.TextSecondary,
                    fontSize = 12.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SeriesDetailBottomSheet(
    serie: PictaSerie,
    apiClient: PictaApiClient,
    onDismiss: () -> Unit,
    onSelectEpisode: (PictaPublicacion) -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    var temporadas by remember { mutableStateOf<List<PictaTemporada>>(emptyList()) }
    var activeTempId by remember { mutableStateOf<Long?>(null) }
    var episodios by remember { mutableStateOf<List<PictaPublicacion>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(serie.pelserId) {
        loading = true
        val temps = runCatching { apiClient.fetchTemporadas(serie.pelserId) }.getOrDefault(emptyList())
        temporadas = temps
        if (temps.isNotEmpty()) {
            activeTempId = temps.first().id
            episodios = runCatching { apiClient.fetchEpisodiosByTemporada(temps.first().id) }
                .getOrDefault(emptyList())
        } else {
            episodios = emptyList()
        }
        loading = false
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
                .heightIn(max = 580.dp)
                .padding(horizontal = 20.dp)
                .padding(bottom = 24.dp)
        ) {
            Text(
                text = serie.nombre,
                color = PictaColors.TextPrimary,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold
            )
            if (!serie.sinopsis.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = serie.sinopsis,
                    color = PictaColors.TextSecondary,
                    fontSize = 13.sp,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis
                )
            }

            if (temporadas.isNotEmpty()) {
                Spacer(modifier = Modifier.height(14.dp))
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    contentPadding = PaddingValues(end = 8.dp)
                ) {
                    items(temporadas, key = { it.id }) { temp ->
                        val selected = temp.id == activeTempId
                        FilterChip(
                            selected = selected,
                            onClick = {
                                activeTempId = temp.id
                                scope.launch {
                                    loading = true
                                    episodios = runCatching { apiClient.fetchEpisodiosByTemporada(temp.id) }
                                        .getOrDefault(emptyList())
                                    loading = false
                                }
                            },
                            label = {
                                Text(temp.nombre.ifBlank { "Temporada ${temp.numero}" })
                            },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = PictaColors.AccentCoral,
                                selectedLabelColor = Color.White,
                                containerColor = PictaColors.BgElevated,
                                labelColor = PictaColors.TextSecondary
                            )
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            if (loading) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(180.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = PictaColors.AccentCoral)
                }
            } else if (episodios.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(140.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text("No hay episodios disponibles.", color = PictaColors.TextSecondary, fontSize = 14.sp)
                }
            } else {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(episodios, key = { it.id }) { ep ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(14.dp))
                                .background(PictaColors.BgElevated)
                                .border(1.dp, PictaColors.BorderSubtle, RoundedCornerShape(14.dp))
                                .clickable {
                                    onDismiss()
                                    onSelectEpisode(ep)
                                }
                                .padding(10.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(
                                modifier = Modifier
                                    .width(108.dp)
                                    .aspectRatio(16f / 9f)
                                    .clip(RoundedCornerShape(10.dp))
                            ) {
                                PictaMediaImage(
                                    rawUrl = ep.urlImagen,
                                    size = "240x135",
                                    contentDescription = ep.nombre,
                                    modifier = Modifier.fillMaxSize()
                                )
                            }
                            Spacer(modifier = Modifier.width(12.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = ep.nombre,
                                    color = PictaColors.TextPrimary,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis
                                )
                                val d = PictaFormatters.formatDuration(ep.duracionRaw)
                                if (d.isNotEmpty()) {
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Text(
                                        text = d,
                                        color = PictaColors.TextSecondary,
                                        fontSize = 12.sp,
                                        fontFamily = FontFamily.Monospace
                                    )
                                }
                            }
                            Icon(
                                imageVector = Icons.Default.PlayArrow,
                                contentDescription = "Reproducir",
                                tint = PictaColors.AccentCoral
                            )
                        }
                    }
                }
            }
        }
    }
}
