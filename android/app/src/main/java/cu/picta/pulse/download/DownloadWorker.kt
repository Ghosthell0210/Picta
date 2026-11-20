package cu.picta.pulse.download

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import cu.picta.pulse.MainActivity
import cu.picta.pulse.PictaApplication
import cu.picta.pulse.R
import cu.picta.pulse.data.model.DownloadDestination
import cu.picta.pulse.data.model.DownloadTaskStatus
import cu.picta.pulse.data.model.LocalDownloadItem
import cu.picta.pulse.data.model.PictaPublicacion
import cu.picta.pulse.data.network.PictaFormatters
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import java.io.File
import java.util.UUID

class DownloadWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    private val app = appContext.applicationContext as PictaApplication
    private val store = app.prefsStore
    private val apiClient = app.apiClient

    override suspend fun doWork(): Result {
        val downloadId = inputData.getString(KEY_DOWNLOAD_ID) ?: return Result.failure()
        val videoUrl = inputData.getString(KEY_VIDEO_URL) ?: return Result.failure()
        val audioUrl = inputData.getString(KEY_AUDIO_URL)?.takeIf { it.isNotBlank() }
        val filename = inputData.getString(KEY_FILENAME) ?: "picta-video.mp4"
        val quality = inputData.getString(KEY_QUALITY) ?: "MP4"
        val destName = inputData.getString(KEY_DESTINATION) ?: DownloadDestination.DOWNLOADS.name
        val destination = runCatching { DownloadDestination.valueOf(destName) }
            .getOrDefault(DownloadDestination.DOWNLOADS)
        val videoJson = inputData.getString(KEY_VIDEO_JSON) ?: return Result.failure()
        val video = runCatching { store.json.decodeFromString<PictaPublicacion>(videoJson) }
            .getOrNull() ?: return Result.failure()

        val notificationId = downloadId.hashCode() and 0x7FFFFFFF
        val workDir = File(applicationContext.cacheDir, "dl_$downloadId")
        var lastNotifTime = 0L
        var lastPct = -1

        setForeground(createForegroundInfo(notificationId, video.nombre, "Preparando descarga...", 0))
        store.updateDownloadProgress(downloadId, DownloadTaskStatus.DOWNLOADING, 1)

        return try {
            val mp4File = HlsMp4Downloader.downloadToMp4File(
                client = apiClient.httpClient,
                videoUrl = videoUrl,
                audioUrl = audioUrl,
                workDir = workDir
            ) { stage, pct ->
                val taskStatus = if (pct >= 88) DownloadTaskStatus.MUXING else DownloadTaskStatus.DOWNLOADING
                store.updateDownloadProgress(downloadId, taskStatus, pct)

                val now = System.currentTimeMillis()
                if (now - lastNotifTime > 550L || pct - lastPct >= 5) {
                    lastNotifTime = now
                    lastPct = pct
                    setForeground(createForegroundInfo(notificationId, video.nombre, stage, pct))
                }
            }

            val saved = MediaStoreSaver.saveFileToPublicStorage(
                context = applicationContext,
                sourceFile = mp4File,
                filename = filename,
                mimeType = "video/mp4",
                destination = destination
            )

            // Download optional SRT subtitle alongside video in Downloads/PictaPulse
            if (!video.urlSubtitulo.isNullOrBlank()) {
                runCatching {
                    val srtTemp = File(workDir, "subtitle.srt")
                    HlsMp4Downloader.downloadDirectStreamToFile(apiClient.httpClient, video.urlSubtitulo, srtTemp) {}
                    if (srtTemp.exists() && srtTemp.length() > 0L) {
                        val srtName = filename.replace(Regex("\\.mp4$", RegexOption.IGNORE_CASE), ".srt")
                        MediaStoreSaver.saveFileToPublicStorage(
                            context = applicationContext,
                            sourceFile = srtTemp,
                            filename = srtName,
                            mimeType = "application/x-subrip",
                            destination = DownloadDestination.DOWNLOADS
                        )
                    }
                }
            }

            store.upsertDownload(
                LocalDownloadItem(
                    id = downloadId,
                    video = video,
                    quality = quality,
                    sizeLabel = PictaFormatters.formatFileSize(saved.sizeBytes),
                    sizeBytes = saved.sizeBytes,
                    filename = filename,
                    contentUri = saved.contentUri,
                    relativePathDisplay = saved.displayPath,
                    destination = destination,
                    status = DownloadTaskStatus.COMPLETED,
                    progressPct = 100
                )
            )
            Result.success()
        } catch (cancel: CancellationException) {
            store.updateDownloadProgress(downloadId, DownloadTaskStatus.CANCELLED, 0)
            throw cancel
        } catch (err: Throwable) {
            store.updateDownloadProgress(
                id = downloadId,
                status = DownloadTaskStatus.FAILED,
                progressPct = 0,
                errorMessage = err.message ?: "Error al descargar el video."
            )
            Result.failure()
        } finally {
            runCatching { workDir.deleteRecursively() }
        }
    }

    private fun createForegroundInfo(
        notificationId: Int,
        title: String,
        subtitle: String,
        progressPct: Int
    ): ForegroundInfo {
        val openIntent = Intent(applicationContext, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingOpen = PendingIntent.getActivity(
            applicationContext,
            notificationId,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(applicationContext, PictaApplication.DOWNLOAD_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(title)
            .setContentText(subtitle)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(pendingOpen)
            .setProgress(100, progressPct.coerceIn(0, 100), progressPct <= 1)
            .build()

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(
                notificationId,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            ForegroundInfo(notificationId, notification)
        }
    }

    companion object {
        private const val KEY_DOWNLOAD_ID = "download_id"
        private const val KEY_VIDEO_URL = "video_url"
        private const val KEY_AUDIO_URL = "audio_url"
        private const val KEY_FILENAME = "filename"
        private const val KEY_QUALITY = "quality"
        private const val KEY_DESTINATION = "destination"
        private const val KEY_VIDEO_JSON = "video_json"

        fun enqueueDownload(
            context: Context,
            video: PictaPublicacion,
            videoUrl: String,
            audioUrl: String?,
            qualityLabel: String,
            estimatedSize: String,
            destination: DownloadDestination
        ): String {
            val app = context.applicationContext as PictaApplication
            val downloadId = "${video.id}_${UUID.randomUUID().toString().take(8)}"
            val cleanBase = PictaFormatters.sanitizeFileName(video.nombre)
            val cleanQuality = PictaFormatters.sanitizeFileName(qualityLabel, 16)
            val filename = "${cleanBase}_${cleanQuality}.mp4"

            app.prefsStore.upsertDownload(
                LocalDownloadItem(
                    id = downloadId,
                    video = video,
                    quality = qualityLabel,
                    sizeLabel = estimatedSize,
                    filename = filename,
                    destination = destination,
                    relativePathDisplay = "${destination.folderDisplay}/$filename",
                    status = DownloadTaskStatus.PREPARING,
                    progressPct = 0
                )
            )

            val data = Data.Builder()
                .putString(KEY_DOWNLOAD_ID, downloadId)
                .putString(KEY_VIDEO_URL, videoUrl)
                .putString(KEY_AUDIO_URL, audioUrl.orEmpty())
                .putString(KEY_FILENAME, filename)
                .putString(KEY_QUALITY, qualityLabel)
                .putString(KEY_DESTINATION, destination.name)
                .putString(KEY_VIDEO_JSON, app.prefsStore.json.encodeToString(video))
                .build()

            val request = OneTimeWorkRequestBuilder<DownloadWorker>()
                .setInputData(data)
                .addTag("picta_dl_$downloadId")
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                "picta_dl_$downloadId",
                ExistingWorkPolicy.REPLACE,
                request
            )
            return downloadId
        }

        fun cancelDownload(context: Context, downloadId: String) {
            val app = context.applicationContext as PictaApplication
            WorkManager.getInstance(context).cancelUniqueWork("picta_dl_$downloadId")
            app.prefsStore.updateDownloadProgress(downloadId, DownloadTaskStatus.CANCELLED, 0)
        }

        suspend fun downloadSubtitleOnly(
            context: Context,
            video: PictaPublicacion,
            subUrl: String
        ): MediaStoreSaver.SavedMediaResult = withContext(Dispatchers.IO) {
            val app = context.applicationContext as PictaApplication
            val tempDir = File(context.cacheDir, "sub_${video.id}_${System.currentTimeMillis()}")
            tempDir.mkdirs()
            try {
                val tmp = File(tempDir, "sub.srt")
                HlsMp4Downloader.downloadDirectStreamToFile(app.apiClient.httpClient, subUrl, tmp) {}
                val filename = "${PictaFormatters.sanitizeFileName(video.nombre)}.srt"
                MediaStoreSaver.saveFileToPublicStorage(
                    context = context,
                    sourceFile = tmp,
                    filename = filename,
                    mimeType = "application/x-subrip",
                    destination = DownloadDestination.DOWNLOADS
                )
            } finally {
                tempDir.deleteRecursively()
            }
        }
    }
}
