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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
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
import cu.picta.pulse.data.model.PictaGenero
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
import kotlinx.coroutines.delay

private enum class ExploreScope(val label: String) {
    VIDEOS("Videos"),
    SERIES("Series"),
    CANALES("Canales")
}

private val EXPLORE_COUNTRIES = listOf(
    "Cuba",
    "Estados Unidos",
    "España",
    "México",
    "Corea del Sur",
    "Japón",
    "Reino Unido",
    "Francia",
    "Colombia",
    "Argentina",
    "Polonia",
    "Brasil",
    "Alemania",
    "Italia"
)

@Composable
fun ExploreScreen(
    viewModel: AppViewModel,
    onOpenChannel: (PictaCanal) -> Unit
) {
    var query by remember { mutableStateOf("") }
    var scope by remember { mutableStateOf(ExploreScope.VIDEOS) }
    var showFilters by remember { mutableStateOf(false) }
    var selectedGenre by remember { mutableStateOf("") }
    var selectedCountry by remember { mutableStateOf("") }

    var generos by remember { mutableStateOf<List<PictaGenero>>(emptyList()) }
    var videos by remember { mutableStateOf<List<PictaPublicacion>>(emptyList()) }
    var series by remember { mutableStateOf<List<PictaSerie>>(emptyList()) }
    var canales by remember { mutableStateOf<List<PictaCanal>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var errorMsg by remember { mutableStateOf<String?>(null) }

    var activeSerieSheet by remember { mutableStateOf<PictaSerie?>(null) }

    LaunchedEffect(Unit) {
        generos = viewModel.apiClient.fetchGeneros()
    }

    LaunchedEffect(query, scope, selectedGenre, selectedCountry) {
        delay(340L)
        loading = true
        errorMsg = null

        val q = query.trim()
        val tokens = q.lowercase()
            .replace(Regex("['’\".,:;!?()]"), " ")
            .split(Regex("\\s+"))
            .filter { it.isNotBlank() }
        val longestToken = tokens.maxByOrNull { it.length }.orEmpty()
        val wildcard = if (longestToken.isNotEmpty()) "*$longestToken*" else ""

        val extraFilters = buildMap {
            if (selectedGenre.isNotBlank()) put("genero_raw", selectedGenre)
            if (selectedCountry.isNotBlank()) put("pais", selectedCountry)
        }

        try {
            when (scope) {
                ExploreScope.VIDEOS -> {
                    if (q.isEmpty()) {
                        val params = mutableMapOf(
                            "page" to "1",
                            "page_size" to "24",
                            "ordering" to "-cantidad_reproducciones"
                        )
                        params.putAll(extraFilters)
                        videos = viewModel.apiClient.fetchPublicaciones(params).results
                    } else {
                        val merged = coroutineScope {
                            val bySearchDef = async {
                                runCatching {
                                    viewModel.apiClient.fetchPublicaciones(
                                        buildMap {
                                            put("page", "1")
                                            put("page_size", "24")
                                            put("ordering", "-cantidad_visitas")
                                            put("search", q)
                                            putAll(extraFilters)
                                        }
                                    ).results
                                }.getOrDefault(emptyList())
                            }
                            val byWildcardDef = async {
                                if (wildcard.isEmpty()) emptyList()
                                else runCatching {
                                    viewModel.apiClient.fetchPublicaciones(
                                        buildMap {
                                            put("page", "1")
                                            put("page_size", "24")
                                            put("ordering", "-cantidad_visitas")
                                            put("nombre__wildcard", wildcard)
                                            putAll(extraFilters)
                                        }
                                    ).results
                                }.getOrDefault(emptyList())
                            }

                            val bySearch = bySearchDef.await()
                            val byWildcard = byWildcardDef.await()
                            val exactMatches = byWildcard.filter { item ->
                                val lower = item.nombre.lowercase()
                                tokens.size <= 1 || tokens.all { lower.contains(it) }
                            }
                            (exactMatches + bySearch + byWildcard).distinctBy { it.id }
                        }
                        videos = merged
                    }
                }
                ExploreScope.SERIES -> {
                    val params = buildMap {
                        put("page", "1")
                        put("page_size", "48")
                        put("ordering", "-last_update")
                        if (wildcard.isNotEmpty()) put("nombre__wildcard", wildcard)
                        putAll(extraFilters)
                    }
                    var items = viewModel.apiClient.fetchSeries(params).results
                    if (tokens.size > 1) {
                        val filtered = items.filter { s ->
                            val lower = s.nombre.lowercase()
                            tokens.all { lower.contains(it) }
                        }
                        if (filtered.isNotEmpty()) items = filtered
                    }
                    series = items
                }
                ExploreScope.CANALES -> {
                    val params = buildMap {
                        put("page", "1")
                        put("page_size", "48")
                        put("ordering", "-cantidad_suscripciones")
                        if (wildcard.isNotEmpty()) put("nombre__wildcard", wildcard)
                    }
                    canales = viewModel.apiClient.fetchCanales(params).results
                }
            }
        } catch (err: Throwable) {
            errorMsg = err.message ?: "Error al buscar en Picta."
        } finally {
            loading = false
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(PictaColors.BgCanvas)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 10.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    singleLine = true,
                    placeholder = { Text("Buscar videos, series o canales...", color = PictaColors.TextMuted, fontSize = 14.sp) },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = PictaColors.TextSecondary) },
                    trailingIcon = {
                        if (query.isNotEmpty()) {
                            IconButton(onClick = { query = "" }) {
                                Icon(Icons.Default.Close, contentDescription = "Limpiar", tint = PictaColors.TextSecondary)
                            }
                        }
                    },
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
                if (scope != ExploreScope.CANALES) {
                    Spacer(modifier = Modifier.width(8.dp))
                    val hasActiveFilters = selectedGenre.isNotBlank() || selectedCountry.isNotBlank()
                    IconButton(
                        onClick = { showFilters = !showFilters },
                        modifier = Modifier
                            .size(50.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .background(if (hasActiveFilters) PictaColors.AccentCoral.copy(alpha = 0.16f) else PictaColors.BgSurface)
                            .border(
                                1.dp,
                                if (hasActiveFilters) PictaColors.AccentCoral else PictaColors.BorderSubtle,
                                RoundedCornerShape(14.dp)
                            )
                    ) {
                        Icon(
                            imageVector = Icons.Default.Tune,
                            contentDescription = "Filtros",
                            tint = if (hasActiveFilters) PictaColors.AccentCoral else PictaColors.TextSecondary
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ExploreScope.entries.forEach { sc ->
                    val selected = sc == scope
                    FilterChip(
                        selected = selected,
                        onClick = { scope = sc },
                        label = {
                            Text(sc.label, fontSize = 13.sp, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium)
                        },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = PictaColors.AccentCoral,
                            selectedLabelColor = Color.White,
                            containerColor = PictaColors.BgSurface,
                            labelColor = PictaColors.TextSecondary
                        )
                    )
                }
            }

            if (showFilters && scope != ExploreScope.CANALES) {
                Spacer(modifier = Modifier.height(8.dp))
                if (generos.isNotEmpty()) {
                    Text("Género", color = PictaColors.TextSecondary, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.padding(vertical = 4.dp)
                    ) {
                        item {
                            FilterChip(
                                selected = selectedGenre.isEmpty(),
                                onClick = { selectedGenre = "" },
                                label = { Text("Todos", fontSize = 12.sp) },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = PictaColors.AccentCoral,
                                    selectedLabelColor = Color.White,
                                    containerColor = PictaColors.BgElevated,
                                    labelColor = PictaColors.TextSecondary
                                )
                            )
                        }
                        items(generos, key = { it.id }) { gen ->
                            val sel = selectedGenre == gen.nombre
                            FilterChip(
                                selected = sel,
                                onClick = { selectedGenre = if (sel) "" else gen.nombre },
                                label = { Text(gen.nombre, fontSize = 12.sp) },
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

                Text("País", color = PictaColors.TextSecondary, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.padding(top = 4.dp)
                ) {
                    item {
                        FilterChip(
                            selected = selectedCountry.isEmpty(),
                            onClick = { selectedCountry = "" },
                            label = { Text("Todos", fontSize = 12.sp) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = PictaColors.AccentCoral,
                                selectedLabelColor = Color.White,
                                containerColor = PictaColors.BgElevated,
                                labelColor = PictaColors.TextSecondary
                            )
                        )
                    }
                    items(EXPLORE_COUNTRIES) { country ->
                        val sel = selectedCountry == country
                        FilterChip(
                            selected = sel,
                            onClick = { selectedCountry = if (sel) "" else country },
                            label = { Text(country, fontSize = 12.sp) },
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
        }

        if (loading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = PictaColors.AccentCoral)
            }
        } else if (errorMsg != null) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(PictaColors.ErrorBg)
                    .padding(14.dp)
            ) {
                Text(errorMsg.orEmpty(), color = PictaColors.ErrorText, fontSize = 13.sp)
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 110.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                when (scope) {
                    ExploreScope.VIDEOS -> {
                        if (videos.isEmpty()) {
                            item {
                                Text(
                                    text = "No se encontraron videos.",
                                    color = PictaColors.TextSecondary,
                                    fontSize = 14.sp,
                                    modifier = Modifier.padding(vertical = 24.dp)
                                )
                            }
                        } else {
                            items(videos, key = { it.id }) { v ->
                                VideoCard(
                                    video = v,
                                    onSelect = { viewModel.playVideo(it) },
                                    onChannelClick = onOpenChannel
                                )
                            }
                        }
                    }
                    ExploreScope.SERIES -> {
                        if (series.isEmpty()) {
                            item {
                                Text(
                                    text = "No se encontraron series.",
                                    color = PictaColors.TextSecondary,
                                    fontSize = 14.sp,
                                    modifier = Modifier.padding(vertical = 24.dp)
                                )
                            }
                        } else {
                            items(series, key = { it.pelserId }) { serie ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(16.dp))
                                        .background(PictaColors.BgSurface)
                                        .border(1.dp, PictaColors.BorderSubtle, RoundedCornerShape(16.dp))
                                        .clickable { activeSerieSheet = serie }
                                        .padding(10.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .width(74.dp)
                                            .aspectRatio(2f / 3f)
                                            .clip(RoundedCornerShape(10.dp))
                                    ) {
                                        PictaMediaImage(
                                            rawUrl = serie.urlImagen ?: serie.imagenSecundaria,
                                            size = "240x360",
                                            contentDescription = serie.nombre,
                                            isPoster = true,
                                            modifier = Modifier.fillMaxSize()
                                        )
                                    }
                                    Spacer(modifier = Modifier.width(12.dp))
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = serie.nombre,
                                            color = PictaColors.TextPrimary,
                                            fontSize = 15.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            maxLines = 2,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                        Spacer(modifier = Modifier.height(4.dp))
                                        val meta = listOfNotNull(
                                            serie.ano?.toString(),
                                            serie.cantidadTemporadas?.let { "$it temp." },
                                            serie.cantidadCapitulos?.let { "$it caps." }
                                        ).joinToString(" · ")
                                        if (meta.isNotEmpty()) {
                                            Text(meta, color = PictaColors.TextSecondary, fontSize = 12.sp)
                                        }
                                        if (!serie.sinopsis.isNullOrBlank()) {
                                            Spacer(modifier = Modifier.height(4.dp))
                                            Text(
                                                text = serie.sinopsis,
                                                color = PictaColors.TextMuted,
                                                fontSize = 12.sp,
                                                maxLines = 2,
                                                overflow = TextOverflow.Ellipsis
                                            )
                                        }
                                    }
                                    Icon(Icons.Default.ChevronRight, contentDescription = null, tint = PictaColors.TextSecondary)
                                }
                            }
                        }
                    }
                    ExploreScope.CANALES -> {
                        if (canales.isEmpty()) {
                            item {
                                Text(
                                    text = "No se encontraron canales.",
                                    color = PictaColors.TextSecondary,
                                    fontSize = 14.sp,
                                    modifier = Modifier.padding(vertical = 24.dp)
                                )
                            }
                        } else {
                            items(canales, key = { it.id }) { canal ->
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
                                            .size(52.dp)
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
                                        val subs = PictaFormatters.formatCount(canal.cantidadSuscripciones)
                                        Text(
                                            text = "$subs suscriptores",
                                            color = PictaColors.TextSecondary,
                                            fontSize = 12.sp
                                        )
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
