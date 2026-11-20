package cu.picta.pulse.data.local

import android.content.Context
import cu.picta.pulse.data.model.DownloadDestination
import cu.picta.pulse.data.model.DownloadTaskStatus
import cu.picta.pulse.data.model.LocalDownloadItem
import cu.picta.pulse.data.model.LocalHistoryItem
import cu.picta.pulse.data.model.PictaAuthSession
import cu.picta.pulse.data.model.PictaPublicacion
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class LocalPreferencesStore(context: Context) {

    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
        encodeDefaults = true
    }

    private val _session = MutableStateFlow<PictaAuthSession?>(readSession())
    val session: StateFlow<PictaAuthSession?> = _session.asStateFlow()

    private val _history = MutableStateFlow<List<LocalHistoryItem>>(readHistory())
    val history: StateFlow<List<LocalHistoryItem>> = _history.asStateFlow()

    private val _savedVideos = MutableStateFlow<List<PictaPublicacion>>(readSaved())
    val savedVideos: StateFlow<List<PictaPublicacion>> = _savedVideos.asStateFlow()

    private val _downloads = MutableStateFlow<List<LocalDownloadItem>>(readDownloads())
    val downloads: StateFlow<List<LocalDownloadItem>> = _downloads.asStateFlow()

    private val _downloadDestination = MutableStateFlow(readDestination())
    val downloadDestination: StateFlow<DownloadDestination> = _downloadDestination.asStateFlow()

    fun getCurrentSession(): PictaAuthSession? = _session.value

    @Synchronized
    fun saveSession(next: PictaAuthSession?) {
        _session.value = next
        if (next == null) {
            prefs.edit().remove(KEY_SESSION).apply()
        } else {
            prefs.edit().putString(KEY_SESSION, json.encodeToString(next)).apply()
        }
    }

    @Synchronized
    fun setDownloadDestination(destination: DownloadDestination) {
        _downloadDestination.value = destination
        prefs.edit().putString(KEY_DESTINATION, destination.name).apply()
    }

    @Synchronized
    fun upsertHistory(video: PictaPublicacion, progressSeconds: Long, durationSeconds: Long) {
        val current = _history.value.toMutableList()
        current.removeAll { it.video.id == video.id }
        current.add(
            0,
            LocalHistoryItem(
                video = video,
                watchedAt = System.currentTimeMillis(),
                progressSeconds = progressSeconds.coerceAtLeast(0L),
                durationSeconds = durationSeconds.coerceAtLeast(0L)
            )
        )
        val trimmed = current.take(60)
        _history.value = trimmed
        prefs.edit().putString(KEY_HISTORY, json.encodeToString(trimmed)).apply()
    }

    fun getResumeSeconds(videoId: Long): Long {
        val found = _history.value.firstOrNull { it.video.id == videoId } ?: return 0L
        if (found.durationSeconds <= 0L) return 0L
        if (found.progressSeconds > found.durationSeconds - 8L) return 0L
        return if (found.progressSeconds > 5L) found.progressSeconds else 0L
    }

    @Synchronized
    fun clearHistory() {
        _history.value = emptyList()
        prefs.edit().remove(KEY_HISTORY).apply()
    }

    @Synchronized
    fun toggleSaved(video: PictaPublicacion): Boolean {
        val current = _savedVideos.value.toMutableList()
        val exists = current.any { it.id == video.id }
        if (exists) {
            current.removeAll { it.id == video.id }
        } else {
            current.add(0, video)
        }
        val trimmed = current.take(100)
        _savedVideos.value = trimmed
        prefs.edit().putString(KEY_SAVED, json.encodeToString(trimmed)).apply()
        return !exists
    }

    @Synchronized
    fun upsertDownload(item: LocalDownloadItem) {
        val current = _downloads.value.toMutableList()
        val idx = current.indexOfFirst { it.id == item.id }
        if (idx >= 0) {
            current[idx] = item
        } else {
            current.add(0, item)
        }
        val trimmed = current.take(60)
        _downloads.value = trimmed
        prefs.edit().putString(KEY_DOWNLOADS, json.encodeToString(trimmed)).apply()
    }

    @Synchronized
    fun updateDownloadProgress(
        id: String,
        status: DownloadTaskStatus,
        progressPct: Int,
        errorMessage: String? = null
    ) {
        val current = _downloads.value.toMutableList()
        val idx = current.indexOfFirst { it.id == id }
        if (idx >= 0) {
            current[idx] = current[idx].copy(
                status = status,
                progressPct = progressPct.coerceIn(0, 100),
                errorMessage = errorMessage
            )
            _downloads.value = current
            if (status == DownloadTaskStatus.COMPLETED ||
                status == DownloadTaskStatus.FAILED ||
                status == DownloadTaskStatus.CANCELLED
            ) {
                prefs.edit().putString(KEY_DOWNLOADS, json.encodeToString(current)).apply()
            }
        }
    }

    @Synchronized
    fun removeDownload(id: String) {
        val current = _downloads.value.filterNot { it.id == id }
        _downloads.value = current
        prefs.edit().putString(KEY_DOWNLOADS, json.encodeToString(current)).apply()
    }

    private fun readSession(): PictaAuthSession? = runCatching {
        val raw = prefs.getString(KEY_SESSION, null) ?: return null
        val parsed = json.decodeFromString<PictaAuthSession>(raw)
        if (parsed.accessToken.isNotBlank()) parsed else null
    }.getOrNull()

    private fun readHistory(): List<LocalHistoryItem> = runCatching {
        val raw = prefs.getString(KEY_HISTORY, null) ?: return emptyList()
        json.decodeFromString<List<LocalHistoryItem>>(raw)
    }.getOrDefault(emptyList())

    private fun readSaved(): List<PictaPublicacion> = runCatching {
        val raw = prefs.getString(KEY_SAVED, null) ?: return emptyList()
        json.decodeFromString<List<PictaPublicacion>>(raw)
    }.getOrDefault(emptyList())

    private fun readDownloads(): List<LocalDownloadItem> = runCatching {
        val raw = prefs.getString(KEY_DOWNLOADS, null) ?: return emptyList()
        json.decodeFromString<List<LocalDownloadItem>>(raw).map { item ->
            if (item.status == DownloadTaskStatus.PREPARING ||
                item.status == DownloadTaskStatus.DOWNLOADING ||
                item.status == DownloadTaskStatus.MUXING
            ) {
                item.copy(status = DownloadTaskStatus.CANCELLED)
            } else {
                item
            }
        }
    }.getOrDefault(emptyList())

    private fun readDestination(): DownloadDestination = runCatching {
        val raw = prefs.getString(KEY_DESTINATION, DownloadDestination.DOWNLOADS.name)
        DownloadDestination.valueOf(raw ?: DownloadDestination.DOWNLOADS.name)
    }.getOrDefault(DownloadDestination.DOWNLOADS)

    companion object {
        private const val PREFS_NAME = "picta_pulse_prefs_v1"
        private const val KEY_SESSION = "session_v1"
        private const val KEY_HISTORY = "history_v1"
        private const val KEY_SAVED = "saved_v1"
        private const val KEY_DOWNLOADS = "downloads_v1"
        private const val KEY_DESTINATION = "download_dest_v1"
    }
}
