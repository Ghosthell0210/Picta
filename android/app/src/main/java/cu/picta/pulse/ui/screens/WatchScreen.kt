package cu.picta.pulse.ui.screens

import android.content.Intent
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Reply
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.ThumbDown
import androidx.compose.material.icons.filled.ThumbUp
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cu.picta.pulse.data.model.PictaCanal
import cu.picta.pulse.data.model.PictaComentario
import cu.picta.pulse.data.model.PictaPublicacion
import cu.picta.pulse.data.model.PictaTemporada
import cu.picta.pulse.data.model.PictaVoto
import cu.picta.pulse.data.network.PictaFormatters
import cu.picta.pulse.ui.components.DownloadBottomSheet
import cu.picta.pulse.ui.components.PictaMediaImage
import cu.picta.pulse.ui.components.PictaVideoPlayer
import cu.picta.pulse.ui.components.VideoCard
import cu.picta.pulse.ui.state.AppViewModel
import cu.picta.pulse.ui.theme.PictaColors
import kotlinx.coroutines.launch

private enum class WatchTab(val label: String) {
    RECOMMENDED("Recomendados"),
    COMMENTS("Comentarios")
}

@Composable
fun WatchScreen(
    video: PictaPublicacion,
    viewModel: AppViewModel,
    onOpenChannel: (PictaCanal) -> Unit
) {
    BackHandler { viewModel.minimizePlayer() }

    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val session by viewModel.session.collectAsState()
    val savedVideos by viewModel.savedVideos.collectAsState()
    val videoEnded by viewModel.videoEndedEvent.collectAsState()

    val isSaved = remember(savedVideos, video.id) { savedVideos.any { it.id == video.id } }
    val isLive = video.tipo.equals("live", ignoreCase = true)

    var descExpanded by remember(video.id) { mutableStateOf(false) }
    var activeTab by remember(video.id) { mutableStateOf(WatchTab.RECOMMENDED) }
    var showDownloadSheet by remember(video.id) { mutableStateOf(false) }

    var userVote by remember(video.id) { mutableStateOf<PictaVoto?>(null) }
    var likeCount by remember(video.id) { mutableLongStateOf(video.cantidadMeGusta) }
    var dislikeCount by remember(video.id) { mutableLongStateOf(video.cantidadNoMeGusta) }
    var voteBusy by remember(video.id) { mutableStateOf(false) }

    var subId by remember(video.id) { mutableStateOf<Long?>(null) }
    var subBusy by remember(video.id) { mutableStateOf(false) }
    var canalSubsCount by remember(video.id) { mutableStateOf(video.canal?.cantidadSuscripciones) }

    var recommended by remember(video.id) { mutableStateOf<List<PictaPublicacion>>(emptyList()) }
    var loadingRecs by remember(video.id) { mutableStateOf(true) }

    var seasons by remember(video.id) { mutableStateOf<List<PictaTemporada>>(emptyList()) }
    var selectedSeasonId by remember(video.id) {
        mutableStateOf(video.categoria?.capitulo?.temporada?.id ?: video.categoria?.temporada?.id)
    }
    var episodes by remember(video.id) { mutableStateOf<List<PictaPublicacion>>(emptyList()) }
    var loadingEpisodes by remember(video.id) { mutableStateOf(false) }

    var comments by remember(video.id) { mutableStateOf<List<PictaComentario>>(emptyList()) }
    var commentsPage by remember(video.id) { mutableIntStateOf(1) }
    var hasMoreComments by remember(video.id) { mutableStateOf(false) }
    var loadingComments by remember(video.id) { mutableStateOf(false) }
    var commentText by remember(video.id) { mutableStateOf("") }
    var postingComment by remember(video.id) { mutableStateOf(false) }
    var replyParent by remember(video.id) { mutableStateOf<PictaComentario?>(null) }
    var expandedReplies by remember(video.id) { mutableStateOf<Map<Long, List<PictaComentario>>>(emptyMap()) }

    val nextEpisode = remember(episodes, video.id) {
        val idx = episodes.indexOfFirst { it.id == video.id }
        if (idx >= 0 && idx + 1 < episodes.size) episodes[idx + 1] else null
    }

    LaunchedEffect(videoEnded, nextEpisode?.id) {
        if (videoEnded) {
            viewModel.consumeEndedEvent()
            if (nextEpisode != null) {
                viewModel.playVideo(nextEpisode)
            }
        }
    }

    LaunchedEffect(video.id, session?.user?.id) {
        loadingRecs = true
        recommended = viewModel.apiClient.fetchRecomendados(video.id)
        loadingRecs = false

        val tempId = video.categoria?.capitulo?.temporada?.id ?: video.categoria?.temporada?.id
        val serieId = video.categoria?.capitulo?.temporada?.serie?.pelserId
        selectedSeasonId = tempId
        if (serieId != null) {
            seasons = runCatching { viewModel.apiClient.fetchTemporadas(serieId) }.getOrDefault(emptyList())
        }
        if (tempId != null) {
            loadingEpisodes = true
            episodes = runCatching { viewModel.apiClient.fetchEpisodiosByTemporada(tempId) }.getOrDefault(emptyList())
            loadingEpisodes = false
        }

        val uid = session?.user?.id
        if (uid != null) {
            userVote = viewModel.apiClient.fetchUserVote(video.id, uid)
        }
        val canal = video.canal
        val uname = session?.user?.username
        if (canal != null && !uname.isNullOrBlank()) {
            subId = viewModel.apiClient.checkCanalSubscription(canal.id, uname)?.id
        }
        if (canal != null && canal.cantidadSuscripciones == null) {
            canalSubsCount = viewModel.apiClient.fetchCanalById(canal.id, canal.nombre)?.cantidadSuscripciones
        }
    }

    LaunchedEffect(video.id, activeTab) {
        if (activeTab == WatchTab.COMMENTS && comments.isEmpty() && video.mostrarComentarios) {
            loadingComments = true
            runCatching { viewModel.apiClient.fetchComentarios(video.id, 1) }
                .onSuccess { res ->
                    comments = res.results
                    commentsPage = 1
                    hasMoreComments = !res.next.isNullOrBlank()
                }
            loadingComments = false
        }
    }

    fun handleVote(targetLike: Boolean) {
        if (voteBusy) return
        voteBusy = true
        scope.launch {
            val current = userVote
            runCatching {
                when {
                    current == null -> {
                        val created = viewModel.apiClient.submitVote(video.id, targetLike)
                        userVote = created
                        if (targetLike) likeCount++ else dislikeCount++
                    }
                    current.valor == targetLike -> {
                        viewModel.apiClient.removeVote(current.id)
                        userVote = null
                        if (targetLike) likeCount = (likeCount - 1L).coerceAtLeast(0L)
                        else dislikeCount = (dislikeCount - 1L).coerceAtLeast(0L)
                    }
                    else -> {
                        val updated = viewModel.apiClient.updateVote(current.id, targetLike)
                        userVote = updated
                        if (targetLike) {
                            likeCount++
                            dislikeCount = (dislikeCount - 1L).coerceAtLeast(0L)
                        } else {
                            dislikeCount++
                            likeCount = (likeCount - 1L).coerceAtLeast(0L)
                        }
                    }
                }
            }
            voteBusy = false
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(PictaColors.BgCanvas)
    ) {
        PictaVideoPlayer(
            viewModel = viewModel,
            title = video.nombre,
            isLive = isLive,
            onMinimize = { viewModel.minimizePlayer() }
        )

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 36.dp)
        ) {
            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 14.dp)
                ) {
                    Text(
                        text = video.nombre,
                        color = PictaColors.TextPrimary,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        lineHeight = 24.sp
                    )
                    Spacer(modifier = Modifier.height(6.dp))

                    val metaParts = buildList {
                        val views = if (video.cantidadVisitas > 0) video.cantidadVisitas else video.cantidadReproducciones
                        add("${PictaFormatters.formatCount(views)} vistas")
                        val rel = PictaFormatters.formatRelativeDate(video.fechaPublicado ?: video.fechaCreacion)
                        if (rel.isNotEmpty()) add(rel)
                        video.categoria?.tipologia?.nombre?.let { add(it) }
                    }
                    Text(
                        text = metaParts.joinToString(" · "),
                        color = PictaColors.TextSecondary,
                        fontSize = 12.sp
                    )

                    if (!video.descripcion.isNullOrBlank()) {
                        Spacer(modifier = Modifier.height(10.dp))
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(PictaColors.BgSurface)
                                .border(1.dp, PictaColors.BorderSubtle, RoundedCornerShape(12.dp))
                                .clickable { descExpanded = !descExpanded }
                                .padding(12.dp)
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = video.descripcion,
                                    color = PictaColors.TextSecondary,
                                    fontSize = 13.sp,
                                    maxLines = if (descExpanded) Int.MAX_VALUE else 2,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.weight(1f)
                                )
                                Icon(
                                    imageVector = if (descExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                                    contentDescription = null,
                                    tint = PictaColors.TextSecondary
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        item {
                            ActionChip(
                                icon = Icons.Default.ThumbUp,
                                label = PictaFormatters.formatCount(likeCount),
                                active = userVote?.valor == true,
                                onClick = { handleVote(true) }
                            )
                        }
                        item {
                            ActionChip(
                                icon = Icons.Default.ThumbDown,
                                label = PictaFormatters.formatCount(dislikeCount),
                                active = userVote?.valor == false,
                                onClick = { handleVote(false) }
                            )
                        }
                        item {
                            ActionChip(
                                icon = if (isSaved) Icons.Default.Bookmark else Icons.Default.BookmarkBorder,
                                label = if (isSaved) "Guardado" else "Guardar",
                                active = isSaved,
                                onClick = { viewModel.toggleSaved(video) }
                            )
                        }
                        item {
                            ActionChip(
                                icon = Icons.Default.Download,
                                label = "Descargar MP4",
                                active = false,
                                accentHighlight = true,
                                onClick = { showDownloadSheet = true }
                            )
                        }
                        item {
                            ActionChip(
                                icon = Icons.Default.Share,
                                label = "Compartir",
                                active = false,
                                onClick = {
                                    val shareUrl = if (video.slugUrl.isNotBlank()) {
                                        "https://www.picta.cu/medias/${video.slugUrl}"
                                    } else {
                                        "https://www.picta.cu"
                                    }
                                    val intent = Intent(Intent.ACTION_SEND).apply {
                                        type = "text/plain"
                                        putExtra(Intent.EXTRA_SUBJECT, video.nombre)
                                        putExtra(Intent.EXTRA_TEXT, "${video.nombre}\n$shareUrl")
                                    }
                                    runCatching { context.startActivity(Intent.createChooser(intent, "Compartir video")) }
                                }
                            )
                        }
                    }

                    video.canal?.let { canal ->
                        Spacer(modifier = Modifier.height(16.dp))
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(16.dp))
                                .background(PictaColors.BgSurface)
                                .border(1.dp, PictaColors.BorderSubtle, RoundedCornerShape(16.dp))
                                .clickable { onOpenChannel(canal) }
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(44.dp)
                                    .clip(CircleShape)
                                    .background(PictaColors.BgElevated)
                            ) {
                                PictaMediaImage(
                                    rawUrl = canal.urlAvatar ?: canal.urlImagen,
                                    size = "80x80",
                                    contentDescription = canal.nombre,
                                    isAvatar = true,
                                    fallbackText = canal.nombre,
                                    modifier = Modifier.fillMaxSize()
                                )
                            }
                            Spacer(modifier = Modifier.width(12.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = canal.nombre,
                                    color = PictaColors.TextPrimary,
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                canalSubsCount?.let { cnt ->
                                    Text(
                                        text = "${PictaFormatters.formatCount(cnt)} suscriptores",
                                        color = PictaColors.TextSecondary,
                                        fontSize = 12.sp
                                    )
                                }
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
                                            runCatching { viewModel.apiClient.subscribeCanal(canal.id) }
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
                                    modifier = Modifier.size(15.dp)
                                )
                                Spacer(modifier = Modifier.width(5.dp))
                                Text(if (subId != null) "Suscrito" else "Suscribirse", fontSize = 12.sp)
                            }
                        }
                    }

                    if (nextEpisode != null) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(14.dp))
                                .background(PictaColors.AccentCoral.copy(alpha = 0.14f))
                                .border(1.dp, PictaColors.AccentCoral.copy(alpha = 0.35f), RoundedCornerShape(14.dp))
                                .clickable { viewModel.playVideo(nextEpisode) }
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.SkipNext, contentDescription = null, tint = PictaColors.AccentCoral)
                            Spacer(modifier = Modifier.width(8.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Siguiente episodio", color = PictaColors.AccentCoral, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                Text(
                                    text = nextEpisode.nombre,
                                    color = PictaColors.TextPrimary,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                    }

                    if (seasons.isNotEmpty() || episodes.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(16.dp))
                        Text("Episodios", color = PictaColors.TextPrimary, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                        if (seasons.size > 1) {
                            Spacer(modifier = Modifier.height(8.dp))
                            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                items(seasons, key = { it.id }) { season ->
                                    val selected = season.id == selectedSeasonId
                                    FilterChip(
                                        selected = selected,
                                        onClick = {
                                            selectedSeasonId = season.id
                                            scope.launch {
                                                loadingEpisodes = true
                                                episodes = runCatching {
                                                    viewModel.apiClient.fetchEpisodiosByTemporada(season.id)
                                                }.getOrDefault(emptyList())
                                                loadingEpisodes = false
                                            }
                                        },
                                        label = { Text(season.nombre.ifBlank { "Temp. ${season.numero}" }, fontSize = 12.sp) },
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
                        Spacer(modifier = Modifier.height(8.dp))
                        if (loadingEpisodes) {
                            CircularProgressIndicator(color = PictaColors.AccentCoral, modifier = Modifier.size(22.dp))
                        } else {
                            LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                items(episodes, key = { it.id }) { ep ->
                                    val isCurrent = ep.id == video.id
                                    Column(
                                        modifier = Modifier
                                            .width(152.dp)
                                            .clip(RoundedCornerShape(12.dp))
                                            .background(if (isCurrent) PictaColors.AccentCoral.copy(alpha = 0.14f) else PictaColors.BgSurface)
                                            .border(
                                                1.dp,
                                                if (isCurrent) PictaColors.AccentCoral else PictaColors.BorderSubtle,
                                                RoundedCornerShape(12.dp)
                                            )
                                            .clickable { viewModel.playVideo(ep) }
                                            .padding(6.dp)
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .aspectRatio(16f / 9f)
                                                .clip(RoundedCornerShape(8.dp))
                                        ) {
                                            PictaMediaImage(
                                                rawUrl = ep.urlImagen,
                                                size = "240x135",
                                                contentDescription = ep.nombre,
                                                modifier = Modifier.fillMaxSize()
                                            )
                                        }
                                        Spacer(modifier = Modifier.height(6.dp))
                                        Text(
                                            text = ep.nombre,
                                            color = if (isCurrent) PictaColors.AccentCoral else PictaColors.TextPrimary,
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            maxLines = 2,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    }
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        WatchTab.entries.forEach { tab ->
                            val selected = tab == activeTab
                            val title = if (tab == WatchTab.COMMENTS) {
                                "${tab.label} (${video.cantidadComentarios})"
                            } else tab.label
                            FilterChip(
                                selected = selected,
                                onClick = { activeTab = tab },
                                label = { Text(title, fontSize = 13.sp) },
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
            }

            if (activeTab == WatchTab.RECOMMENDED) {
                if (loadingRecs) {
                    item {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(24.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            CircularProgressIndicator(color = PictaColors.AccentCoral)
                        }
                    }
                } else if (recommended.isEmpty()) {
                    item {
                        Text(
                            text = "No hay videos recomendados.",
                            color = PictaColors.TextSecondary,
                            fontSize = 13.sp,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)
                        )
                    }
                } else {
                    items(recommended, key = { it.id }) { rec ->
                        VideoCard(
                            video = rec,
                            onSelect = { viewModel.playVideo(it) },
                            onChannelClick = onOpenChannel,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                        )
                    }
                }
            } else {
                if (!video.mostrarComentarios) {
                    item {
                        Text(
                            text = "Los comentarios están desactivados en esta publicación.",
                            color = PictaColors.TextSecondary,
                            fontSize = 13.sp,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)
                        )
                    }
                } else {
                    item {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 6.dp)
                        ) {
                            replyParent?.let { parent ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(bottom = 6.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = "Respondiendo a @${parent.usuario?.username ?: "usuario"}",
                                        color = PictaColors.AccentCoral,
                                        fontSize = 12.sp,
                                        modifier = Modifier.weight(1f)
                                    )
                                    TextButton(onClick = { replyParent = null }) {
                                        Text("Cancelar", color = PictaColors.TextSecondary, fontSize = 12.sp)
                                    }
                                }
                            }
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                OutlinedTextField(
                                    value = commentText,
                                    onValueChange = { commentText = it },
                                    placeholder = { Text("Escribe un comentario...", color = PictaColors.TextMuted, fontSize = 13.sp) },
                                    maxLines = 3,
                                    shape = RoundedCornerShape(14.dp),
                                    colors = OutlinedTextFieldDefaults.colors(
                                        focusedContainerColor = PictaColors.BgSurface,
                                        unfocusedContainerColor = PictaColors.BgSurface,
                                        focusedBorderColor = PictaColors.AccentCoral,
                                        unfocusedBorderColor = PictaColors.BorderSubtle,
                                        focusedTextColor = PictaColors.TextPrimary,
                                        unfocusedTextColor = PictaColors.TextPrimary
                                    ),
                                    modifier = Modifier.weight(1f)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                IconButton(
                                    onClick = {
                                        val txt = commentText.trim()
                                        if (txt.isEmpty() || postingComment) return@IconButton
                                        postingComment = true
                                        val parent = replyParent
                                        scope.launch {
                                            runCatching {
                                                viewModel.apiClient.postComentario(video.id, txt, parent?.id)
                                            }.onSuccess { created ->
                                                commentText = ""
                                                replyParent = null
                                                if (parent == null) {
                                                    comments = listOf(created) + comments
                                                } else {
                                                    val currentReplies = expandedReplies[parent.id].orEmpty()
                                                    expandedReplies = expandedReplies + (parent.id to (currentReplies + created))
                                                }
                                            }
                                            postingComment = false
                                        }
                                    },
                                    enabled = commentText.isNotBlank() && !postingComment,
                                    modifier = Modifier
                                        .size(46.dp)
                                        .clip(CircleShape)
                                        .background(PictaColors.AccentCoral)
                                ) {
                                    Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Enviar", tint = Color.White, modifier = Modifier.size(18.dp))
                                }
                            }
                        }
                    }

                    if (loadingComments) {
                        item {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(24.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                CircularProgressIndicator(color = PictaColors.AccentCoral)
                            }
                        }
                    } else if (comments.isEmpty()) {
                        item {
                            Text(
                                text = "Sé el primero en comentar.",
                                color = PictaColors.TextSecondary,
                                fontSize = 13.sp,
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp)
                            )
                        }
                    } else {
                        items(comments, key = { it.id }) { comment ->
                            val isMine = session?.user?.username != null &&
                                comment.usuario?.username == session?.user?.username
                            val replies = expandedReplies[comment.id]

                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 16.dp, vertical = 8.dp)
                            ) {
                                Row(verticalAlignment = Alignment.Top) {
                                    Box(
                                        modifier = Modifier
                                            .size(34.dp)
                                            .clip(CircleShape)
                                            .background(PictaColors.BgElevated)
                                    ) {
                                        PictaMediaImage(
                                            rawUrl = comment.usuario?.avatar,
                                            size = "80x80",
                                            contentDescription = comment.usuario?.username ?: "Usuario",
                                            isAvatar = true,
                                            fallbackText = comment.usuario?.username ?: "U",
                                            modifier = Modifier.fillMaxSize()
                                        )
                                    }
                                    Spacer(modifier = Modifier.width(10.dp))
                                    Column(modifier = Modifier.weight(1f)) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Text(
                                                text = "@${comment.usuario?.username ?: "usuario"}",
                                                color = PictaColors.TextPrimary,
                                                fontSize = 13.sp,
                                                fontWeight = FontWeight.SemiBold
                                            )
                                            Spacer(modifier = Modifier.width(8.dp))
                                            Text(
                                                text = PictaFormatters.formatRelativeDate(comment.fecha),
                                                color = PictaColors.TextMuted,
                                                fontSize = 11.sp
                                            )
                                        }
                                        Spacer(modifier = Modifier.height(4.dp))
                                        Text(comment.texto, color = PictaColors.TextSecondary, fontSize = 13.sp, lineHeight = 18.sp)
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            TextButton(onClick = { replyParent = comment }) {
                                                Icon(Icons.AutoMirrored.Filled.Reply, contentDescription = null, modifier = Modifier.size(14.dp), tint = PictaColors.TextSecondary)
                                                Spacer(modifier = Modifier.width(4.dp))
                                                Text("Responder", color = PictaColors.TextSecondary, fontSize = 11.sp)
                                            }
                                            if (comment.cantidadRespuestas > 0 && replies == null) {
                                                TextButton(onClick = {
                                                    scope.launch {
                                                        val loaded = runCatching {
                                                            viewModel.apiClient.fetchRespuestasComentario(comment.id)
                                                        }.getOrDefault(emptyList())
                                                        expandedReplies = expandedReplies + (comment.id to loaded)
                                                    }
                                                }) {
                                                    Text(
                                                        text = "Ver ${comment.cantidadRespuestas} respuestas",
                                                        color = PictaColors.AccentCoral,
                                                        fontSize = 11.sp
                                                    )
                                                }
                                            }
                                            if (isMine) {
                                                TextButton(onClick = {
                                                    scope.launch {
                                                        runCatching { viewModel.apiClient.deleteComentario(comment.id) }
                                                            .onSuccess { comments = comments.filterNot { it.id == comment.id } }
                                                    }
                                                }) {
                                                    Icon(Icons.Default.DeleteOutline, contentDescription = null, modifier = Modifier.size(14.dp), tint = PictaColors.ErrorText)
                                                    Spacer(modifier = Modifier.width(4.dp))
                                                    Text("Eliminar", color = PictaColors.ErrorText, fontSize = 11.sp)
                                                }
                                            }
                                        }
                                        if (!replies.isNullOrEmpty()) {
                                            Column(
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .padding(start = 10.dp, top = 4.dp)
                                                    .clip(RoundedCornerShape(10.dp))
                                                    .background(PictaColors.BgSurface)
                                                    .padding(10.dp),
                                                verticalArrangement = Arrangement.spacedBy(8.dp)
                                            ) {
                                                replies.forEach { rep ->
                                                    Column {
                                                        Text(
                                                            text = "@${rep.usuario?.username ?: "usuario"} · ${PictaFormatters.formatRelativeDate(rep.fecha)}",
                                                            color = PictaColors.TextPrimary,
                                                            fontSize = 11.sp,
                                                            fontWeight = FontWeight.SemiBold
                                                        )
                                                        Text(rep.texto, color = PictaColors.TextSecondary, fontSize = 12.sp)
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                HorizontalDivider(color = PictaColors.BorderSubtle, modifier = Modifier.padding(top = 6.dp))
                            }
                        }
                        if (hasMoreComments) {
                            item {
                                TextButton(
                                    onClick = {
                                        val nextP = commentsPage + 1
                                        scope.launch {
                                            runCatching { viewModel.apiClient.fetchComentarios(video.id, nextP) }
                                                .onSuccess { res ->
                                                    comments = (comments + res.results).distinctBy { it.id }
                                                    commentsPage = nextP
                                                    hasMoreComments = !res.next.isNullOrBlank()
                                                }
                                        }
                                    },
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(horizontal = 16.dp)
                                ) {
                                    Text("Cargar más comentarios", color = PictaColors.AccentCoral)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showDownloadSheet) {
        DownloadBottomSheet(
            video = video,
            viewModel = viewModel,
            onDismiss = { showDownloadSheet = false }
        )
    }
}

@Composable
private fun ActionChip(
    icon: ImageVector,
    label: String,
    active: Boolean,
    accentHighlight: Boolean = false,
    onClick: () -> Unit
) {
    val bg = when {
        active -> PictaColors.AccentCoral.copy(alpha = 0.16f)
        accentHighlight -> PictaColors.AccentCoral
        else -> PictaColors.BgSurface
    }
    val fg = when {
        active -> PictaColors.AccentCoral
        accentHighlight -> Color.White
        else -> PictaColors.TextPrimary
    }
    val borderColor = when {
        active || accentHighlight -> PictaColors.AccentCoral
        else -> PictaColors.BorderSubtle
    }
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(bg)
            .border(1.dp, borderColor, RoundedCornerShape(12.dp))
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(imageVector = icon, contentDescription = null, tint = fg, modifier = Modifier.size(16.dp))
        Spacer(modifier = Modifier.width(6.dp))
        Text(text = label, color = fg, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    }
}
