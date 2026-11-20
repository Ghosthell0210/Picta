package cu.picta.pulse.ui.screens

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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Sort
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cu.picta.pulse.data.model.PictaCanal
import cu.picta.pulse.data.model.PictaPublicacion
import cu.picta.pulse.ui.components.PictaMediaImage
import cu.picta.pulse.ui.components.VideoCard
import cu.picta.pulse.ui.state.AppViewModel
import cu.picta.pulse.ui.theme.PictaColors
import kotlinx.coroutines.launch

private enum class HomeCategory(val id: String, val label: String, val queryParam: Pair<String, String>?) {
    ALL("all", "Todo", null),
    SUBSCRIPTIONS("subs", "Suscripciones", null),
    MOVIES("movies", "Películas", "tipologia_nombre_raw__in" to "Película"),
    SERIES("series", "Series", "tipologia_nombre_raw__in" to "Serie"),
    MUSIC("music", "Música", "tipologia_nombre_raw__in" to "Video Musical"),
    DOCS("docs", "Documentales", "tipologia_nombre_raw__in" to "Documental"),
    SHORTS("shorts", "Shorts", "tipologia_nombre_raw__in" to "Shorts"),
    LIVE("live", "En vivo", "tipo__in" to "live")
}

private enum class HomeSort(val label: String, val ordering: String) {
    RECENT("Recientes", "-fecha_publicado"),
    POPULAR("Populares", "-cantidad_visitas"),
    RATED("Valorados", "-cantidad_me_gusta")
}

@Composable
fun HomeScreen(
    viewModel: AppViewModel,
    onOpenExplore: () -> Unit,
    onOpenChannel: (PictaCanal) -> Unit
) {
    val scope = rememberCoroutineScope()
    val session by viewModel.session.collectAsState()
    val history by viewModel.history.collectAsState()

    var activeCategory by remember { mutableStateOf(HomeCategory.ALL) }
    var activeSort by remember { mutableStateOf(HomeSort.RECENT) }
    var freeOnly by remember { mutableStateOf(true) }
    var showSortMenu by remember { mutableStateOf(false) }

    var videos by remember { mutableStateOf<List<PictaPublicacion>>(emptyList()) }
    var page by remember { mutableIntStateOf(1) }
    var hasMore by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(true) }
    var loadingMore by remember { mutableStateOf(false) }
    var errorMsg by remember { mutableStateOf<String?>(null) }
    var subsCount by remember { mutableIntStateOf(0) }

    suspend fun loadFeed(targetPage: Int, append: Boolean) {
        if (append) loadingMore = true else loading = true
        errorMsg = null
        try {
            if (activeCategory == HomeCategory.SUBSCRIPTIONS) {
                val username = session?.user?.username.orEmpty()
                if (username.isBlank()) {
                    videos = emptyList()
                    subsCount = 0
                    hasMore = false
                } else {
                    val (count, list) = viewModel.apiClient.fetchSubscriptionsFeed(username)
                    subsCount = count
                    videos = if (freeOnly) list.filter { it.precios.isEmpty() } else list
                    hasMore = false
                }
            } else {
                val params = mutableMapOf(
                    "page" to targetPage.toString(),
                    "page_size" to "18",
                    "ordering" to activeSort.ordering
                )
                activeCategory.queryParam?.let { (k, v) -> params[k] = v }
                if (freeOnly) params["precios__isnull"] = "true"

                val res = viewModel.apiClient.fetchPublicaciones(params)
                val nextList = res.results
                videos = if (append) (videos + nextList).distinctBy { it.id } else nextList
                page = targetPage
                hasMore = !res.next.isNullOrBlank()
            }
        } catch (err: Throwable) {
            errorMsg = err.message ?: "No se pudo conectar con api.picta.cu."
        } finally {
            loading = false
            loadingMore = false
        }
    }

    LaunchedEffect(activeCategory, activeSort, freeOnly, session?.user?.username) {
        loadFeed(1, false)
    }

    val historyMap = remember(history) {
        history.associateBy({ it.video.id }) { item ->
            if (item.durationSeconds > 0L && item.progressSeconds > 5L) {
                ((item.progressSeconds * 100L) / item.durationSeconds).toInt().coerceIn(2, 100)
            } else 0
        }
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(PictaColors.BgCanvas),
        contentPadding = PaddingValues(bottom = 110.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Column(modifier = Modifier.fillMaxWidth()) {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(HomeCategory.entries) { cat ->
                        val selected = cat == activeCategory
                        FilterChip(
                            selected = selected,
                            onClick = { activeCategory = cat },
                            label = {
                                Text(
                                    text = cat.label,
                                    fontSize = 13.sp,
                                    fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium
                                )
                            },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = PictaColors.AccentCoral,
                                selectedLabelColor = Color.White,
                                containerColor = PictaColors.BgSurface,
                                labelColor = PictaColors.TextSecondary
                            ),
                            border = FilterChipDefaults.filterChipBorder(
                                enabled = true,
                                selected = selected,
                                borderColor = PictaColors.BorderSubtle,
                                selectedBorderColor = PictaColors.AccentCoral
                            )
                        )
                    }
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box {
                        Row(
                            modifier = Modifier
                                .clip(RoundedCornerShape(10.dp))
                                .background(PictaColors.BgSurface)
                                .border(1.dp, PictaColors.BorderSubtle, RoundedCornerShape(10.dp))
                                .clickable { showSortMenu = true }
                                .padding(horizontal = 10.dp, vertical = 7.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.Sort, contentDescription = null, tint = PictaColors.TextSecondary, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(activeSort.label, color = PictaColors.TextPrimary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                        }
                        DropdownMenu(
                            expanded = showSortMenu,
                            onDismissRequest = { showSortMenu = false },
                            modifier = Modifier.background(PictaColors.BgElevated)
                        ) {
                            HomeSort.entries.forEach { srt ->
                                DropdownMenuItem(
                                    text = {
                                        Text(
                                            text = srt.label,
                                            color = if (srt == activeSort) PictaColors.AccentCoral else PictaColors.TextPrimary
                                        )
                                    },
                                    onClick = {
                                        activeSort = srt
                                        showSortMenu = false
                                    }
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.weight(1f))

                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Solo gratis", color = PictaColors.TextSecondary, fontSize = 12.sp)
                        Spacer(modifier = Modifier.width(8.dp))
                        Switch(
                            checked = freeOnly,
                            onCheckedChange = { freeOnly = it },
                            colors = SwitchDefaults.colors(
                                checkedThumbColor = Color.White,
                                checkedTrackColor = PictaColors.AccentCoral,
                                uncheckedTrackColor = PictaColors.BgElevated
                            )
                        )
                    }
                }
            }
        }

        if (loading) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(260.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = PictaColors.AccentCoral)
                }
            }
        } else if (errorMsg != null) {
            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(PictaColors.ErrorBg)
                        .border(1.dp, PictaColors.AccentCoral.copy(alpha = 0.35f), RoundedCornerShape(16.dp))
                        .padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(errorMsg.orEmpty(), color = PictaColors.ErrorText, fontSize = 13.sp)
                    Spacer(modifier = Modifier.height(10.dp))
                    Button(
                        onClick = { scope.launch { loadFeed(1, false) } },
                        colors = ButtonDefaults.buttonColors(containerColor = PictaColors.AccentCoral)
                    ) {
                        Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Reintentar")
                    }
                }
            }
        } else if (videos.isEmpty()) {
            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 24.dp, vertical = 40.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    val emptyMsg = if (activeCategory == HomeCategory.SUBSCRIPTIONS && subsCount == 0) {
                        "Aún no sigues ningún canal en Picta."
                    } else {
                        "No se encontraron publicaciones en esta categoría."
                    }
                    Text(emptyMsg, color = PictaColors.TextSecondary, fontSize = 14.sp)
                    if (activeCategory == HomeCategory.SUBSCRIPTIONS) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Button(
                            onClick = onOpenExplore,
                            colors = ButtonDefaults.buttonColors(containerColor = PictaColors.AccentCoral)
                        ) {
                            Text("Explorar canales")
                        }
                    }
                }
            }
        } else {
            val hero = if (activeCategory == HomeCategory.ALL && videos.isNotEmpty()) videos.first() else null
            val feedItems = if (hero != null) videos.drop(1) else videos

            if (hero != null) {
                item(key = "hero_${hero.id}") {
                    FeaturedHeroCard(
                        video = hero,
                        onPlay = { viewModel.playVideo(hero) },
                        modifier = Modifier.padding(horizontal = 16.dp)
                    )
                }
            }

            items(feedItems, key = { it.id }) { video ->
                val pct = historyMap[video.id]?.takeIf { it > 0 }
                VideoCard(
                    video = video,
                    onSelect = { viewModel.playVideo(it) },
                    onChannelClick = onOpenChannel,
                    progressPercent = pct,
                    modifier = Modifier.padding(horizontal = 16.dp)
                )
            }

            if (hasMore) {
                item {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 6.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        OutlinedButton(
                            onClick = { if (!loadingMore) scope.launch { loadFeed(page + 1, true) } },
                            enabled = !loadingMore,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            if (loadingMore) {
                                CircularProgressIndicator(
                                    color = PictaColors.AccentCoral,
                                    strokeWidth = 2.dp,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                            }
                            Text("Cargar más videos", color = PictaColors.TextPrimary)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FeaturedHeroCard(
    video: PictaPublicacion,
    onPlay: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(16f / 9f)
            .clip(RoundedCornerShape(20.dp))
            .background(PictaColors.BgSurface)
            .border(1.dp, PictaColors.BorderSubtle, RoundedCornerShape(20.dp))
            .clickable { onPlay() }
    ) {
        PictaMediaImage(
            rawUrl = video.urlImagen,
            size = "720x405",
            contentDescription = video.nombre,
            modifier = Modifier.fillMaxSize()
        )
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        listOf(
                            Color.Transparent,
                            Color.Black.copy(alpha = 0.35f),
                            Color.Black.copy(alpha = 0.88f)
                        )
                    )
                )
        )
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(16.dp)
        ) {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .background(PictaColors.AccentCoral)
                    .padding(horizontal = 8.dp, vertical = 3.dp)
            ) {
                Text("DESTACADO", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            }
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = video.nombre,
                color = Color.White,
                fontSize = 17.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(modifier = Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.PlayArrow, contentDescription = null, tint = PictaColors.AccentCoral, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = video.canal?.nombre ?: "Reproducir ahora",
                    color = PictaColors.TextSecondary,
                    fontSize = 12.sp
                )
            }
        }
    }
}
