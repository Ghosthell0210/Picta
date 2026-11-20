package cu.picta.pulse.ui.screens

import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.PlaylistPlay
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cu.picta.pulse.data.model.PictaCanal
import cu.picta.pulse.data.model.PictaLista
import cu.picta.pulse.data.model.PictaPublicacion
import cu.picta.pulse.data.model.PictaSerie
import cu.picta.pulse.data.network.PictaFormatters
import cu.picta.pulse.ui.components.PictaMediaImage
import cu.picta.pulse.ui.components.SeriesDetailBottomSheet
import cu.picta.pulse.ui.components.VideoCard
import cu.picta.pulse.ui.state.AppViewModel
import cu.picta.pulse.ui.theme.PictaColors
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

private enum class ChannelTab(val label: String) {
    VIDEOS("Videos"),
    MOVIES("Películas"),
    SERIES("Series"),
    LISTS("Listas")
}

@Composable
fun ChannelScreen(
    canal: PictaCanal,
    viewModel: AppViewModel,
    onBack: () -> Unit
) {
    BackHandler { onBack() }

    val scope = rememberCoroutineScope()
    val session by viewModel.session.collectAsState()

    var channelInfo by remember(canal.id) { mutableStateOf(canal) }
    var activeTab by remember(canal.id) { mutableStateOf(ChannelTab.VIDEOS) }
    var videos by remember(canal.id) { mutableStateOf<List<PictaPublicacion>>(emptyList()) }
    var movies by remember(canal.id) { mutableStateOf<List<PictaPublicacion>>(emptyList()) }
    var series by remember(canal.id) { mutableStateOf<List<PictaSerie>>(emptyList()) }
    var listas by remember(canal.id) { mutableStateOf<List<PictaLista>>(emptyList()) }
    var videosPage by remember(canal.id) { mutableIntStateOf(1) }
    var hasMoreVideos by remember(canal.id) { mutableStateOf(false) }
    var loadingMore by remember(canal.id) { mutableStateOf(false) }

    var selectedListaName by remember(canal.id) { mutableStateOf("") }
    var selectedListaItems by remember(canal.id) { mutableStateOf<List<PictaPublicacion>?>(null) }
    var loading by remember(canal.id) { mutableStateOf(true) }

    var subId by remember(canal.id) { mutableStateOf<Long?>(null) }
    var subBusy by remember(canal.id) { mutableStateOf(false) }
    var activeSerieSheet by remember { mutableStateOf<PictaSerie?>(null) }

    LaunchedEffect(canal.id, session?.user?.username) {
        loading = true
        coroutineScope {
            val fullCanalDef = async { runCatching { viewModel.apiClient.fetchCanalById(canal.id, canal.nombre) }.getOrNull() }
            val vDef = async {
                runCatching {
                    viewModel.apiClient.fetchPublicaciones(
                        mapOf("canal_id" to canal.id.toString(), "page" to "1", "page_size" to "36", "ordering" to "-fecha_publicado")
                    )
                }.getOrNull()
            }
            val mDef = async {
                runCatching {
                    viewModel.apiClient.fetchPublicaciones(
                        mapOf(
                            "canal_id" to canal.id.toString(),
                            "tipologia_nombre_raw__in" to "Película",
                            "page" to "1",
                            "page_size" to "36",
                            "ordering" to "-fecha_publicado"
                        )
                    ).results
                }.getOrDefault(emptyList())
            }
            val sDef = async {
                runCatching {
                    viewModel.apiClient.fetchSeries(mapOf("page" to "1", "page_size" to "100")).results
                }.getOrDefault(emptyList())
            }
            val lDef = async { runCatching { viewModel.apiClient.fetchListasCanal(canal.id, canal.nombre) }.getOrDefault(emptyList()) }
            val subDef = async {
                val uname = session?.user?.username
                if (!uname.isNullOrBlank()) {
                    viewModel.apiClient.checkCanalSubscription(canal.id, uname)
                } else null
            }

            val resolved = fullCanalDef.await() ?: canal
            channelInfo = resolved

            var vRes = vDef.await()
            if ((vRes?.results.isNullOrEmpty()) && canal.nombre.isNotBlank()) {
                vRes = runCatching {
                    viewModel.apiClient.fetchPublicaciones(
                        mapOf("canal_nombre_raw" to canal.nombre, "page" to "1", "page_size" to "36", "ordering" to "-fecha_publicado")
                    )
                }.getOrNull()
            }

            val vList = vRes?.results.orEmpty()
            val featured = resolved.publicacionesDestacadas.mapNotNull { fp ->
                fp.publicacion?.let { pub -> if (pub.canal != null) pub else pub.copy(canal = resolved) }
            }
            val merged = (vList + featured).distinctBy { it.id }
            videos = merged
            hasMoreVideos = !vRes?.next.isNullOrBlank()

            val mList = mDef.await()
            val derivedMovies = merged.filter { it.categoria?.tipologia?.nombre == "Película" }
            movies = (mList + derivedMovies).distinctBy { it.id }

            series = sDef.await().filter { it.canal?.id == canal.id }
            listas = lDef.await()
            subId = subDef.await()?.id
        }
        loading = false
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(PictaColors.BgCanvas)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = {
                if (selectedListaItems != null) {
                    selectedListaItems = null
                } else {
                    onBack()
                }
            }) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Atrás", tint = PictaColors.TextPrimary)
            }
            Text(
                text = if (selectedListaItems != null) selectedListaName else channelInfo.nombre,
                color = PictaColors.TextPrimary,
                fontSize = 17.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f)
            )
        }

        if (loading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = PictaColors.AccentCoral)
            }
            return
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 110.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            if (selectedListaItems != null) {
                val listVideos = selectedListaItems.orEmpty()
                if (listVideos.isEmpty()) {
                    item {
                        Text("Esta lista no tiene videos disponibles.", color = PictaColors.TextSecondary, fontSize = 14.sp)
                    }
                } else {
                    items(listVideos, key = { it.id }) { pub ->
                        VideoCard(video = pub, onSelect = { viewModel.playVideo(it) })
                    }
                }
            } else {
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(18.dp))
                            .background(PictaColors.BgSurface)
                            .border(1.dp, PictaColors.BorderSubtle, RoundedCornerShape(18.dp))
                            .padding(16.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(62.dp)
                                    .clip(CircleShape)
                                    .background(PictaColors.BgElevated)
                            ) {
                                PictaMediaImage(
                                    rawUrl = channelInfo.urlAvatar ?: channelInfo.urlImagen,
                                    size = "120x120",
                                    contentDescription = channelInfo.nombre,
                                    isAvatar = true,
                                    fallbackText = channelInfo.nombre,
                                    modifier = Modifier.fillMaxSize()
                                )
                            }
                            Spacer(modifier = Modifier.width(14.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = channelInfo.nombre,
                                    color = PictaColors.TextPrimary,
                                    fontSize = 18.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                val subCount = PictaFormatters.formatCount(channelInfo.cantidadSuscripciones)
                                Text(
                                    text = "$subCount suscriptores",
                                    color = PictaColors.TextSecondary,
                                    fontSize = 12.sp
                                )
                            }
                            Button(
                                onClick = {
                                    if (subBusy) return@Button
                                    subBusy = true
                                    scope.launch {
                                        if (subId != null) {
                                            runCatching { viewModel.apiClient.unsubscribeCanal(subId!!) }
                                                .onSuccess { subId = null }
                                        } else {
                                            runCatching { viewModel.apiClient.subscribeCanal(channelInfo.id) }
                                                .onSuccess { subId = it.id }
                                        }
                                        subBusy = false
                                    }
                                },
                                enabled = !subBusy,
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = if (subId != null) PictaColors.BgElevated else PictaColors.AccentCoral,
                                    contentColor = Color.White
                                )
                            ) {
                                Icon(
                                    imageVector = if (subId != null) Icons.Default.Check else Icons.Default.PersonAdd,
                                    contentDescription = null,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(if (subId != null) "Suscrito" else "Suscribirse", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                            }
                        }

                        if (!channelInfo.descripcion.isNullOrBlank()) {
                            Spacer(modifier = Modifier.height(10.dp))
                            Text(
                                text = channelInfo.descripcion.orEmpty(),
                                color = PictaColors.TextSecondary,
                                fontSize = 13.sp,
                                maxLines = 3,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                }

                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        ChannelTab.entries.forEach { tab ->
                            val selected = tab == activeTab
                            FilterChip(
                                selected = selected,
                                onClick = { activeTab = tab },
                                label = { Text(tab.label, fontSize = 12.sp) },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = PictaColors.AccentCoral,
                                    selectedLabelColor = Color.White,
                                    containerColor = PictaColors.BgSurface,
                                    labelColor = PictaColors.TextSecondary
                                )
                            )
                        }
                    }
                }

                when (activeTab) {
                    ChannelTab.VIDEOS -> {
                        if (videos.isEmpty()) {
                            item { Text("No hay videos en este canal.", color = PictaColors.TextSecondary, fontSize = 14.sp) }
                        } else {
                            items(videos, key = { it.id }) { v ->
                                VideoCard(video = v, onSelect = { viewModel.playVideo(it) })
                            }
                            if (hasMoreVideos) {
                                item {
                                    OutlinedButton(
                                        onClick = {
                                            if (loadingMore) return@OutlinedButton
                                            loadingMore = true
                                            val nextP = videosPage + 1
                                            scope.launch {
                                                runCatching {
                                                    viewModel.apiClient.fetchPublicaciones(
                                                        mapOf(
                                                            "canal_id" to canal.id.toString(),
                                                            "page" to nextP.toString(),
                                                            "page_size" to "36",
                                                            "ordering" to "-fecha_publicado"
                                                        )
                                                    )
                                                }.onSuccess { res ->
                                                    videos = (videos + res.results).distinctBy { it.id }
                                                    videosPage = nextP
                                                    hasMoreVideos = !res.next.isNullOrBlank()
                                                }
                                                loadingMore = false
                                            }
                                        },
                                        shape = RoundedCornerShape(14.dp),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Text(if (loadingMore) "Cargando..." else "Cargar más videos", color = PictaColors.TextPrimary)
                                    }
                                }
                            }
                        }
                    }
                    ChannelTab.MOVIES -> {
                        if (movies.isEmpty()) {
                            item { Text("No hay películas publicadas en este canal.", color = PictaColors.TextSecondary, fontSize = 14.sp) }
                        } else {
                            items(movies, key = { it.id }) { m ->
                                VideoCard(video = m, onSelect = { viewModel.playVideo(it) })
                            }
                        }
                    }
                    ChannelTab.SERIES -> {
                        if (series.isEmpty()) {
                            item { Text("No hay series en este canal.", color = PictaColors.TextSecondary, fontSize = 14.sp) }
                        } else {
                            items(series, key = { it.pelserId }) { s ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(14.dp))
                                        .background(PictaColors.BgSurface)
                                        .border(1.dp, PictaColors.BorderSubtle, RoundedCornerShape(14.dp))
                                        .clickable { activeSerieSheet = s }
                                        .padding(10.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .width(68.dp)
                                            .aspectRatio(2f / 3f)
                                            .clip(RoundedCornerShape(8.dp))
                                    ) {
                                        PictaMediaImage(
                                            rawUrl = s.urlImagen ?: s.imagenSecundaria,
                                            size = "240x360",
                                            contentDescription = s.nombre,
                                            isPoster = true,
                                            modifier = Modifier.fillMaxSize()
                                        )
                                    }
                                    Spacer(modifier = Modifier.width(12.dp))
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(s.nombre, color = PictaColors.TextPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                                        s.cantidadTemporadas?.let {
                                            Text("$it temporadas", color = PictaColors.TextSecondary, fontSize = 12.sp)
                                        }
                                    }
                                    Icon(Icons.Default.ChevronRight, contentDescription = null, tint = PictaColors.TextSecondary)
                                }
                            }
                        }
                    }
                    ChannelTab.LISTS -> {
                        if (listas.isEmpty()) {
                            item { Text("No hay listas de reproducción en este canal.", color = PictaColors.TextSecondary, fontSize = 14.sp) }
                        } else {
                            items(listas, key = { it.id }) { lista ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(14.dp))
                                        .background(PictaColors.BgSurface)
                                        .border(1.dp, PictaColors.BorderSubtle, RoundedCornerShape(14.dp))
                                        .clickable {
                                            scope.launch {
                                                val items = runCatching {
                                                    viewModel.apiClient.fetchListaPublicaciones(lista.id)
                                                        .mapNotNull { it.publicacion }
                                                }.getOrDefault(emptyList())
                                                selectedListaName = lista.nombre
                                                selectedListaItems = items
                                            }
                                        }
                                        .padding(14.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(Icons.Default.PlaylistPlay, contentDescription = null, tint = PictaColors.AccentCoral)
                                    Spacer(modifier = Modifier.width(12.dp))
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(lista.nombre, color = PictaColors.TextPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                                        Text("${lista.publicaciones.size} videos", color = PictaColors.TextSecondary, fontSize = 12.sp)
                                    }
                                    Icon(Icons.Default.ChevronRight, contentDescription = null, tint = PictaColors.TextSecondary)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    activeSerieSheet?.let { serie ->
        SeriesDetailBottomSheet(
            serie = serie,
            apiClient = viewModel.apiClient,
            onDismiss = { activeSerieSheet = null },
            onSelectEpisode = { ep -> viewModel.playVideo(ep) }
        )
    }
}
