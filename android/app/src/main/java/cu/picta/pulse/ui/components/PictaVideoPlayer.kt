package cu.picta.pulse.ui.components

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.ActivityInfo
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.activity.compose.BackHandler
import androidx.annotation.OptIn
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Audiotrack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ClosedCaption
import androidx.compose.material.icons.filled.ClosedCaptionDisabled
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Forward10
import androidx.compose.material.icons.filled.Fullscreen
import androidx.compose.material.icons.filled.FullscreenExit
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Replay10
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import cu.picta.pulse.data.network.PictaFormatters
import cu.picta.pulse.ui.state.AppViewModel
import cu.picta.pulse.ui.theme.PictaColors
import kotlinx.coroutines.delay

@Composable
fun PictaVideoPlayer(
    viewModel: AppViewModel,
    title: String,
    isLive: Boolean,
    onMinimize: () -> Unit,
    modifier: Modifier = Modifier
) {
    var isFullscreen by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val activity = remember(context) { context.findActivity() }

    DisposableEffect(isFullscreen) {
        if (activity != null) {
            val window = activity.window
            val controller = WindowCompat.getInsetsController(window, window.decorView)
            if (isFullscreen) {
                activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                controller.hide(WindowInsetsCompat.Type.systemBars())
            } else {
                activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                controller.show(WindowInsetsCompat.Type.systemBars())
            }
        }
        onDispose {
            if (isFullscreen && activity != null) {
                activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                val window = activity.window
                WindowCompat.getInsetsController(window, window.decorView)
                    .show(WindowInsetsCompat.Type.systemBars())
            }
        }
    }

    if (isFullscreen) {
        Dialog(
            onDismissRequest = { isFullscreen = false },
            properties = DialogProperties(
                usePlatformDefaultWidth = false,
                decorFitsSystemWindows = false
            )
        ) {
            BackHandler { isFullscreen = false }
            val dialogView = LocalView.current
            LaunchedEffect(dialogView) {
                dialogView.keepScreenOn = true
            }
            PlayerViewport(
                viewModel = viewModel,
                title = title,
                isLive = isLive,
                isFullscreen = true,
                onToggleFullscreen = { isFullscreen = false },
                onMinimize = {
                    isFullscreen = false
                    onMinimize()
                },
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black)
            )
        }
    } else {
        PlayerViewport(
            viewModel = viewModel,
            title = title,
            isLive = isLive,
            isFullscreen = false,
            onToggleFullscreen = { isFullscreen = true },
            onMinimize = onMinimize,
            modifier = modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
                .background(Color.Black)
        )
    }
}

@OptIn(UnstableApi::class)
@Composable
private fun PlayerViewport(
    viewModel: AppViewModel,
    title: String,
    isLive: Boolean,
    isFullscreen: Boolean,
    onToggleFullscreen: () -> Unit,
    onMinimize: () -> Unit,
    modifier: Modifier = Modifier
) {
    val player = remember { viewModel.getOrCreatePlayer() }
    val isPlaying by viewModel.isPlaying.collectAsState()
    val isBuffering by viewModel.isBuffering.collectAsState()
    val currentPosMs by viewModel.currentPositionMs.collectAsState()
    val durationMs by viewModel.durationMs.collectAsState()
    val playerError by viewModel.playerError.collectAsState()
    val isOffline by viewModel.isOfflinePlayback.collectAsState()
    val qualityTracks by viewModel.qualityTracks.collectAsState()
    val selectedQualityHeight by viewModel.selectedQualityHeight.collectAsState()
    val audioTracks by viewModel.audioTracks.collectAsState()
    val selectedAudioIndex by viewModel.selectedAudioIndex.collectAsState()
    val hasSubtitles by viewModel.hasSubtitles.collectAsState()
    val subtitlesEnabled by viewModel.subtitlesEnabled.collectAsState()
    val playbackSpeed by viewModel.playbackSpeed.collectAsState()

    var showControls by remember { mutableStateOf(true) }
    var isSeeking by remember { mutableStateOf(false) }
    var seekSliderValue by remember { mutableFloatStateOf(0f) }

    var showQualityMenu by remember { mutableStateOf(false) }
    var showAudioMenu by remember { mutableStateOf(false) }
    var showSpeedMenu by remember { mutableStateOf(false) }

    val anyMenuOpen = showQualityMenu || showAudioMenu || showSpeedMenu

    LaunchedEffect(showControls, isPlaying, anyMenuOpen) {
        if (showControls && isPlaying && !anyMenuOpen) {
            delay(3600L)
            showControls = false
        }
    }

    val safeDurationMs = durationMs.coerceAtLeast(1L)
    val effectivePosMs = if (isSeeking) {
        (seekSliderValue * safeDurationMs).toLong()
    } else {
        currentPosMs.coerceIn(0L, safeDurationMs)
    }
    val sliderFraction = if (durationMs > 0L) {
        if (isSeeking) seekSliderValue else (currentPosMs.toFloat() / safeDurationMs.toFloat()).coerceIn(0f, 1f)
    } else 0f

    Box(
        modifier = modifier.clickable(
            interactionSource = remember { MutableInteractionSource() },
            indication = null
        ) {
            showControls = !showControls
        }
    ) {
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    useController = false
                    resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                    keepScreenOn = true
                    layoutParams = FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                    this.player = player
                }
            },
            update = { pv ->
                if (pv.player !== player) {
                    pv.player = player
                }
            },
            onRelease = { pv ->
                pv.player = null
            },
            modifier = Modifier.fillMaxSize()
        )

        if (isBuffering && playerError == null) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(
                    color = PictaColors.AccentCoral,
                    strokeWidth = 3.dp,
                    modifier = Modifier.size(40.dp)
                )
            }
        }

        if (playerError != null) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.84f))
                    .padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Icon(
                    imageVector = Icons.Default.ErrorOutline,
                    contentDescription = null,
                    tint = PictaColors.AccentCoral,
                    modifier = Modifier.size(34.dp)
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = playerError.orEmpty(),
                    color = PictaColors.TextPrimary,
                    fontSize = 13.sp,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }

        AnimatedVisibility(
            visible = showControls && playerError == null,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.fillMaxSize()
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                Color.Black.copy(alpha = 0.72f),
                                Color.Black.copy(alpha = 0.28f),
                                Color.Black.copy(alpha = 0.82f)
                            )
                        )
                    )
                    .padding(horizontal = if (isFullscreen) 20.dp else 10.dp, vertical = if (isFullscreen) 14.dp else 8.dp)
            ) {
                // Top bar
                Row(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(
                        onClick = onMinimize,
                        modifier = Modifier.size(36.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.KeyboardArrowDown,
                            contentDescription = "Minimizar",
                            tint = Color.White
                        )
                    }
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = title,
                        color = Color.White,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                    if (isOffline) {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(PictaColors.SuccessBg)
                                .border(1.dp, PictaColors.SuccessText.copy(alpha = 0.4f), RoundedCornerShape(6.dp))
                                .padding(horizontal = 7.dp, vertical = 3.dp)
                        ) {
                            Text("OFFLINE", color = PictaColors.SuccessText, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        }
                        Spacer(modifier = Modifier.width(6.dp))
                    } else if (isLive) {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(PictaColors.AccentCoral)
                                .padding(horizontal = 7.dp, vertical = 3.dp)
                        ) {
                            Text("EN VIVO", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        }
                        Spacer(modifier = Modifier.width(6.dp))
                    }

                    if (hasSubtitles) {
                        IconButton(
                            onClick = { viewModel.toggleSubtitles() },
                            modifier = Modifier.size(34.dp)
                        ) {
                            Icon(
                                imageVector = if (subtitlesEnabled) Icons.Default.ClosedCaption else Icons.Default.ClosedCaptionDisabled,
                                contentDescription = "Subtítulos",
                                tint = if (subtitlesEnabled) PictaColors.AccentCoral else Color.White
                            )
                        }
                    }

                    if (audioTracks.size > 1) {
                        Box {
                            IconButton(
                                onClick = { showAudioMenu = true },
                                modifier = Modifier.size(34.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Audiotrack,
                                    contentDescription = "Audio",
                                    tint = Color.White
                                )
                            }
                            DropdownMenu(
                                expanded = showAudioMenu,
                                onDismissRequest = { showAudioMenu = false },
                                modifier = Modifier.background(PictaColors.BgElevated)
                            ) {
                                audioTracks.forEachIndexed { idx, track ->
                                    DropdownMenuItem(
                                        text = {
                                            Text(
                                                text = track.label,
                                                color = if (idx == selectedAudioIndex) PictaColors.AccentCoral else PictaColors.TextPrimary
                                            )
                                        },
                                        trailingIcon = {
                                            if (idx == selectedAudioIndex) {
                                                Icon(Icons.Default.Check, contentDescription = null, tint = PictaColors.AccentCoral)
                                            }
                                        },
                                        onClick = {
                                            viewModel.selectAudioTrack(idx)
                                            showAudioMenu = false
                                        }
                                    )
                                }
                            }
                        }
                    }

                    Box {
                        IconButton(
                            onClick = { showSpeedMenu = true },
                            modifier = Modifier.size(34.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Speed,
                                contentDescription = "Velocidad",
                                tint = if (playbackSpeed != 1.0f) PictaColors.AccentCoral else Color.White
                            )
                        }
                        DropdownMenu(
                            expanded = showSpeedMenu,
                            onDismissRequest = { showSpeedMenu = false },
                            modifier = Modifier.background(PictaColors.BgElevated)
                        ) {
                            listOf(0.5f, 0.75f, 1.0f, 1.25f, 1.5f, 2.0f).forEach { spd ->
                                DropdownMenuItem(
                                    text = {
                                        Text(
                                            text = if (spd == 1.0f) "Normal (1x)" else "${spd}x",
                                            color = if (playbackSpeed == spd) PictaColors.AccentCoral else PictaColors.TextPrimary
                                        )
                                    },
                                    trailingIcon = {
                                        if (playbackSpeed == spd) {
                                            Icon(Icons.Default.Check, contentDescription = null, tint = PictaColors.AccentCoral)
                                        }
                                    },
                                    onClick = {
                                        viewModel.setPlaybackSpeed(spd)
                                        showSpeedMenu = false
                                    }
                                )
                            }
                        }
                    }

                    if (qualityTracks.isNotEmpty() && !isOffline) {
                        Box {
                            IconButton(
                                onClick = { showQualityMenu = true },
                                modifier = Modifier.size(34.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Settings,
                                    contentDescription = "Calidad",
                                    tint = if (selectedQualityHeight != null) PictaColors.AccentCoral else Color.White
                                )
                            }
                            DropdownMenu(
                                expanded = showQualityMenu,
                                onDismissRequest = { showQualityMenu = false },
                                modifier = Modifier.background(PictaColors.BgElevated)
                            ) {
                                DropdownMenuItem(
                                    text = {
                                        Text(
                                            text = "Automática",
                                            color = if (selectedQualityHeight == null) PictaColors.AccentCoral else PictaColors.TextPrimary
                                        )
                                    },
                                    trailingIcon = {
                                        if (selectedQualityHeight == null) {
                                            Icon(Icons.Default.Check, contentDescription = null, tint = PictaColors.AccentCoral)
                                        }
                                    },
                                    onClick = {
                                        viewModel.selectQuality(null)
                                        showQualityMenu = false
                                    }
                                )
                                qualityTracks.forEach { qt ->
                                    val selected = selectedQualityHeight == qt.height && qt.height > 0
                                    DropdownMenuItem(
                                        text = {
                                            Text(
                                                text = qt.label,
                                                color = if (selected) PictaColors.AccentCoral else PictaColors.TextPrimary
                                            )
                                        },
                                        trailingIcon = {
                                            if (selected) {
                                                Icon(Icons.Default.Check, contentDescription = null, tint = PictaColors.AccentCoral)
                                            }
                                        },
                                        onClick = {
                                            viewModel.selectQuality(qt)
                                            showQualityMenu = false
                                        }
                                    )
                                }
                            }
                        }
                    }
                }

                // Center playback controls
                Row(
                    modifier = Modifier.align(Alignment.Center),
                    horizontalArrangement = Arrangement.spacedBy(24.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (!isLive) {
                        IconButton(
                            onClick = { viewModel.seekBy(-10_000L) },
                            modifier = Modifier
                                .size(44.dp)
                                .clip(CircleShape)
                                .background(Color.Black.copy(alpha = 0.45f))
                        ) {
                            Icon(
                                imageVector = Icons.Default.Replay10,
                                contentDescription = "-10s",
                                tint = Color.White,
                                modifier = Modifier.size(24.dp)
                            )
                        }
                    }

                    IconButton(
                        onClick = { viewModel.togglePlayPause() },
                        modifier = Modifier
                            .size(56.dp)
                            .clip(CircleShape)
                            .background(PictaColors.AccentCoral.copy(alpha = 0.92f))
                    ) {
                        Icon(
                            imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                            contentDescription = if (isPlaying) "Pausar" else "Reproducir",
                            tint = Color.White,
                            modifier = Modifier.size(30.dp)
                        )
                    }

                    if (!isLive) {
                        IconButton(
                            onClick = { viewModel.seekBy(10_000L) },
                            modifier = Modifier
                                .size(44.dp)
                                .clip(CircleShape)
                                .background(Color.Black.copy(alpha = 0.45f))
                        ) {
                            Icon(
                                imageVector = Icons.Default.Forward10,
                                contentDescription = "+10s",
                                tint = Color.White,
                                modifier = Modifier.size(24.dp)
                            )
                        }
                    }
                }

                // Bottom scrubber & fullscreen
                Column(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .fillMaxWidth()
                ) {
                    if (!isLive && durationMs > 0L) {
                        Slider(
                            value = sliderFraction,
                            onValueChange = { frac ->
                                isSeeking = true
                                seekSliderValue = frac
                            },
                            onValueChangeFinished = {
                                val target = (seekSliderValue * safeDurationMs).toLong()
                                viewModel.seekToMs(target)
                                isSeeking = false
                            },
                            colors = SliderDefaults.colors(
                                thumbColor = PictaColors.AccentCoral,
                                activeTrackColor = PictaColors.AccentCoral,
                                inactiveTrackColor = Color.White.copy(alpha = 0.30f)
                            ),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(26.dp)
                        )
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        if (!isLive) {
                            Text(
                                text = "${PictaFormatters.formatSeconds(effectivePosMs / 1000L)} / ${PictaFormatters.formatSeconds(durationMs / 1000L)}",
                                color = Color.White,
                                fontSize = 11.sp,
                                fontFamily = FontFamily.Monospace
                            )
                        } else {
                            Text(
                                text = "Transmisión en directo",
                                color = Color.White,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Medium
                            )
                        }
                        Spacer(modifier = Modifier.weight(1f))
                        IconButton(
                            onClick = onToggleFullscreen,
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(
                                imageVector = if (isFullscreen) Icons.Default.FullscreenExit else Icons.Default.Fullscreen,
                                contentDescription = "Pantalla completa",
                                tint = Color.White
                            )
                        }
                    }
                }
            }
        }
    }
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
