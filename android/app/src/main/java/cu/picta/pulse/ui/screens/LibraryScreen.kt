package cu.picta.pulse.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material.icons.filled.History
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cu.picta.pulse.data.model.PictaCanal
import cu.picta.pulse.ui.components.VideoCard
import cu.picta.pulse.ui.state.AppViewModel
import cu.picta.pulse.ui.theme.PictaColors

private enum class LibraryTab(val label: String) {
    HISTORY("Historial"),
    SAVED("Guardados")
}

@Composable
fun LibraryScreen(
    viewModel: AppViewModel,
    onOpenChannel: (PictaCanal) -> Unit
) {
    val history by viewModel.history.collectAsState()
    val saved by viewModel.savedVideos.collectAsState()
    var activeTab by remember { mutableStateOf(LibraryTab.HISTORY) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(PictaColors.BgCanvas)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.weight(1f)) {
                LibraryTab.entries.forEach { tab ->
                    val selected = tab == activeTab
                    FilterChip(
                        selected = selected,
                        onClick = { activeTab = tab },
                        leadingIcon = {
                            Icon(
                                imageVector = if (tab == LibraryTab.HISTORY) Icons.Default.History else Icons.Default.Bookmark,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp)
                            )
                        },
                        label = {
                            val count = if (tab == LibraryTab.HISTORY) history.size else saved.size
                            Text("${tab.label} ($count)", fontSize = 12.sp)
                        },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = PictaColors.AccentCoral,
                            selectedLabelColor = Color.White,
                            selectedLeadingIconColor = Color.White,
                            containerColor = PictaColors.BgSurface,
                            labelColor = PictaColors.TextSecondary,
                            iconColor = PictaColors.TextSecondary
                        )
                    )
                }
            }

            if (activeTab == LibraryTab.HISTORY && history.isNotEmpty()) {
                TextButton(onClick = { viewModel.prefsStore.clearHistory() }) {
                    Icon(Icons.Default.DeleteSweep, contentDescription = null, tint = PictaColors.ErrorText, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Limpiar", color = PictaColors.ErrorText, fontSize = 12.sp)
                }
            }
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 110.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            if (activeTab == LibraryTab.HISTORY) {
                if (history.isEmpty()) {
                    item {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 48.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text("Tu historial está vacío", color = PictaColors.TextPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                            Spacer(modifier = Modifier.height(6.dp))
                            Text("Los videos que reproduzcas aparecerán aquí para continuar viéndolos.", color = PictaColors.TextSecondary, fontSize = 13.sp)
                        }
                    }
                } else {
                    items(history, key = { it.video.id }) { item ->
                        val pct = if (item.durationSeconds > 0L && item.progressSeconds > 5L) {
                            ((item.progressSeconds * 100L) / item.durationSeconds).toInt().coerceIn(2, 100)
                        } else null
                        VideoCard(
                            video = item.video,
                            onSelect = { viewModel.playVideo(it) },
                            onChannelClick = onOpenChannel,
                            progressPercent = pct
                        )
                    }
                }
            } else {
                if (saved.isEmpty()) {
                    item {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 48.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text("Aún no tienes videos guardados", color = PictaColors.TextPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                            Spacer(modifier = Modifier.height(6.dp))
                            Text("Pulsa Guardar desde cualquier video para acceder rápido.", color = PictaColors.TextSecondary, fontSize = 13.sp)
                        }
                    }
                } else {
                    items(saved, key = { it.id }) { video ->
                        VideoCard(
                            video = video,
                            onSelect = { viewModel.playVideo(it) },
                            onChannelClick = onOpenChannel
                        )
                    }
                }
            }
        }
    }
}
