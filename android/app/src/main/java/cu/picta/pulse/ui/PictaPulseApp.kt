package cu.picta.pulse.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cu.picta.pulse.data.model.DownloadTaskStatus
import cu.picta.pulse.data.model.PictaPublicacion
import cu.picta.pulse.ui.components.AccountBottomSheet
import cu.picta.pulse.ui.components.PictaMediaImage
import cu.picta.pulse.ui.screens.ChannelScreen
import cu.picta.pulse.ui.screens.DownloadsScreen
import cu.picta.pulse.ui.screens.ExploreScreen
import cu.picta.pulse.ui.screens.HomeScreen
import cu.picta.pulse.ui.screens.LibraryScreen
import cu.picta.pulse.ui.screens.LoginScreen
import cu.picta.pulse.ui.screens.WatchScreen
import cu.picta.pulse.ui.state.AppViewModel
import cu.picta.pulse.ui.state.MainTab
import cu.picta.pulse.ui.theme.PictaColors

@Composable
fun PictaPulseRoot(viewModel: AppViewModel) {
    val session by viewModel.session.collectAsState()
    val activeTab by viewModel.activeTab.collectAsState()
    val selectedChannel by viewModel.selectedChannel.collectAsState()
    val currentVideo by viewModel.currentVideo.collectAsState()
    val isMinimized by viewModel.isMinimized.collectAsState()
    val isPlaying by viewModel.isPlaying.collectAsState()
    val showAccountSheet by viewModel.showAccountSheet.collectAsState()
    val downloads by viewModel.downloads.collectAsState()

    if (session == null) {
        LoginScreen(apiClient = viewModel.apiClient)
        return
    }

    val activeDownloadsCount = downloads.count {
        it.status == DownloadTaskStatus.PREPARING ||
            it.status == DownloadTaskStatus.DOWNLOADING ||
            it.status == DownloadTaskStatus.MUXING
    }

    val showWatchFull = currentVideo != null && !isMinimized && selectedChannel == null

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(PictaColors.BgCanvas)
    ) {
        Scaffold(
            containerColor = PictaColors.BgCanvas,
            topBar = {
                if (!showWatchFull && selectedChannel == null) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(PictaColors.BgCanvas)
                            .statusBarsPadding()
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(56.dp)
                                .padding(horizontal = 16.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier
                                    .weight(1f)
                                    .clickable { viewModel.selectTab(MainTab.HOME) }
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(30.dp)
                                        .clip(RoundedCornerShape(9.dp))
                                        .background(PictaColors.AccentCoral),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.PlayArrow,
                                        contentDescription = null,
                                        tint = Color.White,
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                                Spacer(modifier = Modifier.width(10.dp))
                                Text(
                                    text = "Picta Pulse",
                                    color = PictaColors.TextPrimary,
                                    fontSize = 18.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }

                            IconButton(onClick = { viewModel.selectTab(MainTab.EXPLORE) }) {
                                Icon(
                                    imageVector = Icons.Default.Search,
                                    contentDescription = "Buscar",
                                    tint = PictaColors.TextPrimary
                                )
                            }

                            Box(
                                modifier = Modifier
                                    .size(34.dp)
                                    .clip(CircleShape)
                                    .background(PictaColors.BgElevated)
                                    .border(1.dp, PictaColors.BorderSubtle, CircleShape)
                                    .clickable { viewModel.setShowAccountSheet(true) }
                            ) {
                                PictaMediaImage(
                                    rawUrl = session?.user?.avatar,
                                    size = "80x80",
                                    contentDescription = "Cuenta",
                                    isAvatar = true,
                                    fallbackText = session?.user?.username ?: "P",
                                    modifier = Modifier.fillMaxSize()
                                )
                            }
                        }
                        HorizontalDivider(color = PictaColors.BorderSubtle)
                    }
                }
            },
            bottomBar = {
                if (!showWatchFull) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(PictaColors.BgSurface)
                    ) {
                        val miniVideo = currentVideo
                        if (miniVideo != null && (isMinimized || selectedChannel != null)) {
                            MiniPlayerBar(
                                video = miniVideo,
                                isPlaying = isPlaying,
                                onExpand = { viewModel.expandPlayer() },
                                onTogglePlay = { viewModel.togglePlayPause() },
                                onClose = { viewModel.closePlayer() }
                            )
                        }
                        HorizontalDivider(color = PictaColors.BorderSubtle)
                        NavigationBar(
                            containerColor = PictaColors.BgSurface,
                            tonalElevation = 0.dp,
                            modifier = Modifier.navigationBarsPadding()
                        ) {
                            MainTab.entries.forEach { tab ->
                                val selected = tab == activeTab && selectedChannel == null
                                val icon = when (tab) {
                                    MainTab.HOME -> Icons.Default.Home
                                    MainTab.EXPLORE -> Icons.Default.Explore
                                    MainTab.LIBRARY -> Icons.Default.Bookmark
                                    MainTab.DOWNLOADS -> Icons.Default.Download
                                }
                                NavigationBarItem(
                                    selected = selected,
                                    onClick = { viewModel.selectTab(tab) },
                                    icon = {
                                        if (tab == MainTab.DOWNLOADS && activeDownloadsCount > 0) {
                                            BadgedBox(
                                                badge = {
                                                    Badge(containerColor = PictaColors.AccentCoral) {
                                                        Text(activeDownloadsCount.toString(), color = Color.White)
                                                    }
                                                }
                                            ) {
                                                Icon(icon, contentDescription = tab.label)
                                            }
                                        } else {
                                            Icon(icon, contentDescription = tab.label)
                                        }
                                    },
                                    label = { Text(tab.label, fontSize = 11.sp, maxLines = 1) },
                                    colors = NavigationBarItemDefaults.colors(
                                        selectedIconColor = PictaColors.AccentCoral,
                                        selectedTextColor = PictaColors.AccentCoral,
                                        indicatorColor = PictaColors.AccentCoral.copy(alpha = 0.14f),
                                        unselectedIconColor = PictaColors.TextSecondary,
                                        unselectedTextColor = PictaColors.TextSecondary
                                    )
                                )
                            }
                        }
                    }
                }
            }
        ) { innerPadding ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
            ) {
                when {
                    selectedChannel != null -> {
                        ChannelScreen(
                            canal = selectedChannel!!,
                            viewModel = viewModel,
                            onBack = { viewModel.closeChannel() }
                        )
                    }
                    activeTab == MainTab.HOME -> {
                        HomeScreen(
                            viewModel = viewModel,
                            onOpenExplore = { viewModel.selectTab(MainTab.EXPLORE) },
                            onOpenChannel = { viewModel.openChannel(it) }
                        )
                    }
                    activeTab == MainTab.EXPLORE -> {
                        ExploreScreen(
                            viewModel = viewModel,
                            onOpenChannel = { viewModel.openChannel(it) }
                        )
                    }
                    activeTab == MainTab.LIBRARY -> {
                        LibraryScreen(
                            viewModel = viewModel,
                            onOpenChannel = { viewModel.openChannel(it) }
                        )
                    }
                    activeTab == MainTab.DOWNLOADS -> {
                        DownloadsScreen(viewModel = viewModel)
                    }
                }
            }
        }

        if (showWatchFull && currentVideo != null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(PictaColors.BgCanvas)
                    .statusBarsPadding()
                    .navigationBarsPadding()
            ) {
                WatchScreen(
                    video = currentVideo!!,
                    viewModel = viewModel,
                    onOpenChannel = { viewModel.openChannel(it) }
                )
            }
        }
    }

    if (showAccountSheet) {
        AccountBottomSheet(
            user = session?.user,
            onDismiss = { viewModel.setShowAccountSheet(false) },
            onLogout = { viewModel.logout() }
        )
    }
}

@Composable
private fun MiniPlayerBar(
    video: PictaPublicacion,
    isPlaying: Boolean,
    onExpand: () -> Unit,
    onTogglePlay: () -> Unit,
    onClose: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(PictaColors.BgElevated)
            .clickable { onExpand() }
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .width(64.dp)
                .aspectRatio(16f / 9f)
                .clip(RoundedCornerShape(8.dp))
                .background(PictaColors.BgSurface)
        ) {
            PictaMediaImage(
                rawUrl = video.urlImagen,
                size = "240x135",
                contentDescription = video.nombre,
                modifier = Modifier.fillMaxSize()
            )
        }
        Spacer(modifier = Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = video.nombre,
                color = PictaColors.TextPrimary,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = video.canal?.nombre ?: "Reproduciendo",
                color = PictaColors.TextSecondary,
                fontSize = 11.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        IconButton(onClick = onTogglePlay) {
            Icon(
                imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                contentDescription = if (isPlaying) "Pausar" else "Reproducir",
                tint = PictaColors.TextPrimary
            )
        }
        IconButton(onClick = onClose) {
            Icon(
                imageVector = Icons.Default.Close,
                contentDescription = "Cerrar reproductor",
                tint = PictaColors.TextSecondary
            )
        }
    }
}
