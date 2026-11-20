package cu.picta.pulse.ui.state

import android.app.Application
import android.net.Uri
import androidx.annotation.OptIn
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import cu.picta.pulse.PictaApplication
import cu.picta.pulse.data.model.DownloadDestination
import cu.picta.pulse.data.model.LocalDownloadItem
import cu.picta.pulse.data.model.PictaCanal
import cu.picta.pulse.data.model.PictaPublicacion
import cu.picta.pulse.data.network.PictaFormatters
import cu.picta.pulse.download.DownloadWorker
import cu.picta.pulse.download.MediaStoreSaver
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

enum class MainTab(val label: String) {
    HOME("Inicio"),
    EXPLORE("Explorar"),
    LIBRARY("Listas"),
    DOWNLOADS("Descargas")
}

data class VideoQualityTrack(
    val groupIndex: Int,
    val trackIndex: Int,
    val height: Int,
    val bitrate: Int,
    val label: String
)

data class AudioTrackOption(
    val groupIndex: Int,
    val trackIndex: Int,
    val label: String
)

class AppViewModel(application: Application) : AndroidViewModel(application) {

    private val app = application as PictaApplication
    val prefsStore = app.prefsStore
    val apiClient = app.apiClient

    val session = prefsStore.session
    val history = prefsStore.history
    val savedVideos = prefsStore.savedVideos
    val downloads = prefsStore.downloads
    val downloadDestination = prefsStore.downloadDestination

    private val _activeTab = MutableStateFlow(MainTab.HOME)
    val activeTab: StateFlow<MainTab> = _activeTab.asStateFlow()

    private val _selectedChannel = MutableStateFlow<PictaCanal?>(null)
    val selectedChannel: StateFlow<PictaCanal?> = _selectedChannel.asStateFlow()

    private val _showAccountSheet = MutableStateFlow(false)
    val showAccountSheet: StateFlow<Boolean> = _showAccountSheet.asStateFlow()

    private val _currentVideo = MutableStateFlow<PictaPublicacion?>(null)
    val currentVideo: StateFlow<PictaPublicacion?> = _currentVideo.asStateFlow()

    private val _isMinimized = MutableStateFlow(false)
    val isMinimized: StateFlow<Boolean> = _isMinimized.asStateFlow()

    private val _isPlaying = MutableStateFlow(false)
    val isPlaying: StateFlow<Boolean> = _isPlaying.asStateFlow()

    private val _isBuffering = MutableStateFlow(false)
    val isBuffering: StateFlow<Boolean> = _isBuffering.asStateFlow()

    private val _currentPositionMs = MutableStateFlow(0L)
    val currentPositionMs: StateFlow<Long> = _currentPositionMs.asStateFlow()

    private val _durationMs = MutableStateFlow(0L)
    val durationMs: StateFlow<Long> = _durationMs.asStateFlow()

    private val _playerError = MutableStateFlow<String?>(null)
    val playerError: StateFlow<String?> = _playerError.asStateFlow()

    private val _isOfflinePlayback = MutableStateFlow(false)
    val isOfflinePlayback: StateFlow<Boolean> = _isOfflinePlayback.asStateFlow()

    private val _qualityTracks = MutableStateFlow<List<VideoQualityTrack>>(emptyList())
    val qualityTracks: StateFlow<List<VideoQualityTrack>> = _qualityTracks.asStateFlow()

    private val _selectedQualityHeight = MutableStateFlow<Int?>(null)
    val selectedQualityHeight: StateFlow<Int?> = _selectedQualityHeight.asStateFlow()

    private val _audioTracks = MutableStateFlow<List<AudioTrackOption>>(emptyList())
    val audioTracks: StateFlow<List<AudioTrackOption>> = _audioTracks.asStateFlow()

    private val _selectedAudioIndex = MutableStateFlow(0)
    val selectedAudioIndex: StateFlow<Int> = _selectedAudioIndex.asStateFlow()

    private val _hasSubtitles = MutableStateFlow(false)
    val hasSubtitles: StateFlow<Boolean> = _hasSubtitles.asStateFlow()

    private val _subtitlesEnabled = MutableStateFlow(false)
    val subtitlesEnabled: StateFlow<Boolean> = _subtitlesEnabled.asStateFlow()

    private val _playbackSpeed = MutableStateFlow(1.0f)
    val playbackSpeed: StateFlow<Float> = _playbackSpeed.asStateFlow()

    private val _videoEndedEvent = MutableStateFlow(false)
    val videoEndedEvent: StateFlow<Boolean> = _videoEndedEvent.asStateFlow()

    private var trackSelector: DefaultTrackSelector? = null
    private var exoPlayer: ExoPlayer? = null
    private var progressJob: Job? = null
    private var lastPersistedSec: Long = -1L

    init {
        if (prefsStore.getCurrentSession() != null) {
            viewModelScope.launch {
                runCatching { apiClient.fetchMe() }.onSuccess { user ->
                    prefsStore.getCurrentSession()?.let { current ->
                        prefsStore.saveSession(current.copy(user = user))
                    }
                }
            }
        }
    }

    @OptIn(UnstableApi::class)
    fun getOrCreatePlayer(): ExoPlayer {
        exoPlayer?.let { return it }
        val selector = DefaultTrackSelector(app).apply {
            setParameters(
                buildUponParameters()
                    .setPreferredTextLanguage("es")
                    .setMaxVideoSize(1280, 720)
            )
        }
        trackSelector = selector

        val player = ExoPlayer.Builder(app)
            .setTrackSelector(selector)
            .build()

        player.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                _isPlaying.value = isPlaying
                if (!isPlaying) persistCurrentProgress()
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                _isBuffering.value = playbackState == Player.STATE_BUFFERING
                if (playbackState == Player.STATE_READY) {
                    val dur = player.duration
                    if (dur > 0L && dur != C.TIME_UNSET) {
                        _durationMs.value = dur
                    }
                } else if (playbackState == Player.STATE_ENDED) {
                    _videoEndedEvent.value = true
                    persistCurrentProgress()
                }
            }

            override fun onTracksChanged(tracks: Tracks) {
                updateAvailableTracks(tracks)
            }

            override fun onPlayerError(error: PlaybackException) {
                _playerError.value = "Error reproduciendo el video: ${error.localizedMessage ?: "comprueba tu conexión"}"
                _isBuffering.value = false
            }
        })

        exoPlayer = player
        startProgressLoop()
        return player
    }

    private fun startProgressLoop() {
        progressJob?.cancel()
        progressJob = viewModelScope.launch {
            while (isActive) {
                val p = exoPlayer
                if (p != null) {
                    val pos = p.currentPosition.coerceAtLeast(0L)
                    val dur = p.duration.takeIf { it > 0L && it != C.TIME_UNSET } ?: _durationMs.value
                    _currentPositionMs.value = pos
                    if (dur > 0L) _durationMs.value = dur

                    val sec = pos / 1000L
                    if (p.isPlaying && (lastPersistedSec < 0L || kotlin.math.abs(sec - lastPersistedSec) >= 10L)) {
                        persistCurrentProgress()
                    }
                }
                delay(500L)
            }
        }
    }

    private fun persistCurrentProgress() {
        val video = _currentVideo.value ?: return
        val p = exoPlayer ?: return
        val sec = (p.currentPosition / 1000L).coerceAtLeast(0L)
        val durSec = (p.duration.takeIf { it > 0L && it != C.TIME_UNSET }?.div(1000L))
            ?: PictaFormatters.parseDurationSeconds(video.duracionRaw)
        if (sec > 0L) {
            lastPersistedSec = sec
            prefsStore.upsertHistory(video, sec, durSec)
        }
    }

    @OptIn(UnstableApi::class)
    private fun updateAvailableTracks(tracks: Tracks) {
        val qList = mutableListOf<VideoQualityTrack>()
        val aList = mutableListOf<AudioTrackOption>()
        var hasText = false

        tracks.groups.forEachIndexed { gIdx, group ->
            when (group.type) {
                C.TRACK_TYPE_VIDEO -> {
                    for (tIdx in 0 until group.length) {
                        if (group.isTrackSupported(tIdx)) {
                            val fmt = group.getTrackFormat(tIdx)
                            val h = fmt.height.takeIf { it > 0 } ?: 0
                            val br = fmt.bitrate.takeIf { it > 0 } ?: 0
                            val label = if (h > 0) "${h}p" else if (br > 0) "${br / 1000} kbps" else "Auto"
                            qList.add(VideoQualityTrack(gIdx, tIdx, h, br, label))
                        }
                    }
                }
                C.TRACK_TYPE_AUDIO -> {
                    for (tIdx in 0 until group.length) {
                        if (group.isTrackSupported(tIdx)) {
                            val fmt = group.getTrackFormat(tIdx)
                            val label = fmt.label?.takeIf { it.isNotBlank() }
                                ?: fmt.language?.uppercase()?.takeIf { it.isNotBlank() }
                                ?: "Pista ${aList.size + 1}"
                            if (group.isTrackSelected(tIdx)) {
                                _selectedAudioIndex.value = aList.size
                            }
                            aList.add(AudioTrackOption(gIdx, tIdx, label))
                        }
                    }
                }
                C.TRACK_TYPE_TEXT -> {
                    if (group.length > 0) hasText = true
                }
            }
        }

        _qualityTracks.value = qList.distinctBy { it.label }.sortedByDescending { it.height }
        _audioTracks.value = aList
        _hasSubtitles.value = hasText || !_currentVideo.value?.urlSubtitulo.isNullOrBlank()
    }

    fun selectTab(tab: MainTab) {
        _selectedChannel.value = null
        _activeTab.value = tab
    }

    fun openChannel(canal: PictaCanal) {
        if (_currentVideo.value != null && !_isMinimized.value) {
            _isMinimized.value = true
        }
        _selectedChannel.value = canal
    }

    fun closeChannel() {
        _selectedChannel.value = null
    }

    fun setShowAccountSheet(show: Boolean) {
        _showAccountSheet.value = show
    }

    @OptIn(UnstableApi::class)
    fun playVideo(video: PictaPublicacion, offlineContentUri: String? = null) {
        persistCurrentProgress()
        _selectedChannel.value = null
        _currentVideo.value = video
        _isMinimized.value = false
        _playerError.value = null
        _videoEndedEvent.value = false
        _selectedQualityHeight.value = null
        _subtitlesEnabled.value = false
        lastPersistedSec = -1L

        val completedDownload = if (offlineContentUri == null) {
            downloads.value.firstOrNull {
                it.video.id == video.id &&
                    it.status == cu.picta.pulse.data.model.DownloadTaskStatus.COMPLETED &&
                    it.contentUri.isNotBlank()
            }?.contentUri
        } else {
            offlineContentUri
        }

        val uriToPlay = completedDownload ?: PictaFormatters.getDirectHlsUrl(video.urlManifiesto)
        if (uriToPlay.isBlank()) {
            _playerError.value = "Esta publicación no tiene un enlace de reproducción disponible."
            return
        }

        _isOfflinePlayback.value = completedDownload != null
        val player = getOrCreatePlayer()

        val mediaBuilder = MediaItem.Builder().setUri(Uri.parse(uriToPlay))
        if (!video.urlSubtitulo.isNullOrBlank()) {
            val subConfig = MediaItem.SubtitleConfiguration.Builder(Uri.parse(video.urlSubtitulo))
                .setMimeType(MimeTypes.APPLICATION_SUBRIP)
                .setLanguage("es")
                .setLabel("Español")
                .setSelectionFlags(0)
                .build()
            mediaBuilder.setSubtitleConfigurations(listOf(subConfig))
        }

        trackSelector?.let { selector ->
            selector.setParameters(
                selector.buildUponParameters()
                    .clearOverridesOfType(C.TRACK_TYPE_VIDEO)
                    .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
                    .setMaxVideoSize(1280, 720)
            )
        }

        val resumeSec = prefsStore.getResumeSeconds(video.id)
        player.setMediaItem(mediaBuilder.build())
        player.prepare()
        if (resumeSec > 0L) {
            player.seekTo(resumeSec * 1000L)
        }
        player.playbackParameters = PlaybackParameters(_playbackSpeed.value)
        player.playWhenReady = true

        val initialDur = PictaFormatters.parseDurationSeconds(video.duracionRaw)
        _durationMs.value = initialDur * 1000L
        prefsStore.upsertHistory(video, resumeSec, initialDur)

        if (completedDownload == null) {
            viewModelScope.launch { apiClient.registerPlayback(video.id) }
        }
    }

    fun minimizePlayer() {
        persistCurrentProgress()
        _isMinimized.value = true
    }

    fun expandPlayer() {
        _selectedChannel.value = null
        _isMinimized.value = false
    }

    fun closePlayer() {
        persistCurrentProgress()
        exoPlayer?.stop()
        exoPlayer?.clearMediaItems()
        _currentVideo.value = null
        _isMinimized.value = false
        _isPlaying.value = false
    }

    fun togglePlayPause() {
        val p = exoPlayer ?: return
        if (p.isPlaying) p.pause() else p.play()
    }

    fun seekBy(deltaMs: Long) {
        val p = exoPlayer ?: return
        val dur = p.duration.takeIf { it > 0L && it != C.TIME_UNSET } ?: Long.MAX_VALUE
        val target = (p.currentPosition + deltaMs).coerceIn(0L, dur)
        p.seekTo(target)
        _currentPositionMs.value = target
    }

    fun seekToMs(ms: Long) {
        val p = exoPlayer ?: return
        p.seekTo(ms.coerceAtLeast(0L))
        _currentPositionMs.value = ms.coerceAtLeast(0L)
    }

    @OptIn(UnstableApi::class)
    fun selectQuality(track: VideoQualityTrack?) {
        val p = exoPlayer ?: return
        val selector = trackSelector ?: return
        if (track == null) {
            _selectedQualityHeight.value = null
            selector.setParameters(
                selector.buildUponParameters()
                    .clearOverridesOfType(C.TRACK_TYPE_VIDEO)
                    .setMaxVideoSize(1920, 1080)
            )
            return
        }
        val group = p.currentTracks.groups.getOrNull(track.groupIndex) ?: return
        _selectedQualityHeight.value = track.height
        selector.setParameters(
            selector.buildUponParameters()
                .clearOverridesOfType(C.TRACK_TYPE_VIDEO)
                .setOverrideForType(TrackSelectionOverride(group.mediaTrackGroup, track.trackIndex))
        )
    }

    @OptIn(UnstableApi::class)
    fun selectAudioTrack(idx: Int) {
        val p = exoPlayer ?: return
        val selector = trackSelector ?: return
        val option = _audioTracks.value.getOrNull(idx) ?: return
        val group = p.currentTracks.groups.getOrNull(option.groupIndex) ?: return
        _selectedAudioIndex.value = idx
        selector.setParameters(
            selector.buildUponParameters()
                .setOverrideForType(TrackSelectionOverride(group.mediaTrackGroup, option.trackIndex))
        )
    }

    @OptIn(UnstableApi::class)
    fun toggleSubtitles() {
        val selector = trackSelector ?: return
        val next = !_subtitlesEnabled.value
        _subtitlesEnabled.value = next
        selector.setParameters(
            selector.buildUponParameters()
                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, !next)
                .setPreferredTextLanguage("es")
        )
    }

    fun setPlaybackSpeed(speed: Float) {
        _playbackSpeed.value = speed
        exoPlayer?.playbackParameters = PlaybackParameters(speed)
    }

    fun consumeEndedEvent() {
        _videoEndedEvent.value = false
    }

    fun toggleSaved(video: PictaPublicacion): Boolean = prefsStore.toggleSaved(video)

    fun isSaved(videoId: Long): Boolean = savedVideos.value.any { it.id == videoId }

    fun setDownloadDestination(dest: DownloadDestination) {
        prefsStore.setDownloadDestination(dest)
    }

    fun startMp4Download(
        video: PictaPublicacion,
        videoUrl: String,
        audioUrl: String?,
        qualityLabel: String,
        estimatedSize: String
    ): String {
        return DownloadWorker.enqueueDownload(
            context = app,
            video = video,
            videoUrl = videoUrl,
            audioUrl = audioUrl,
            qualityLabel = qualityLabel,
            estimatedSize = estimatedSize,
            destination = downloadDestination.value
        )
    }

    fun cancelDownload(downloadId: String) {
        DownloadWorker.cancelDownload(app, downloadId)
    }

    fun deleteDownload(item: LocalDownloadItem) {
        if (item.contentUri.isNotBlank()) {
            MediaStoreSaver.deleteSavedMedia(app, item.contentUri)
        }
        prefsStore.removeDownload(item.id)
    }

    fun logout() {
        closePlayer()
        apiClient.clearCache()
        prefsStore.saveSession(null)
    }

    override fun onCleared() {
        super.onCleared()
        progressJob?.cancel()
        exoPlayer?.release()
        exoPlayer = null
    }
}
