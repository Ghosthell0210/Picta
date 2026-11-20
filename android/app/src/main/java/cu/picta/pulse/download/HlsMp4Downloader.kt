package cu.picta.pulse.download

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.URL
import java.nio.ByteBuffer
import java.util.Locale
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.max

object HlsMp4Downloader {

    private data class ParsedPlaylist(
        val mapUrl: String?,
        val segmentUrls: List<String>,
        val isFmp4: Boolean
    )

    suspend fun downloadToMp4File(
        client: OkHttpClient,
        videoUrl: String,
        audioUrl: String?,
        workDir: File,
        onProgress: suspend (stage: String, pct: Int) -> Unit
    ): File = withContext(Dispatchers.IO) {
        if (!workDir.exists()) workDir.mkdirs()
        val outputMp4 = File(workDir, "final_output.mp4")

        if (!videoUrl.lowercase(Locale.ROOT).contains(".m3u8")) {
            onProgress("Descargando MP4 directo...", 5)
            downloadDirectStreamToFile(client, videoUrl, outputMp4) { pct ->
                onProgress("Descargando MP4...", pct)
            }
            return@withContext outputMp4
        }

        onProgress("Leyendo lista de reproducción...", 2)
        val videoPlaylist = fetchAndParsePlaylist(client, videoUrl)
        val audioPlaylist = if (!audioUrl.isNullOrBlank()) {
            fetchAndParsePlaylist(client, audioUrl)
        } else {
            null
        }

        val hasAudio = audioPlaylist != null
        val videoWeight = if (hasAudio) 68 else 84
        val audioWeight = if (hasAudio) 16 else 0

        val videoStreamFile = File(
            workDir,
            if (videoPlaylist.isFmp4) "video_combined.mp4" else "video_combined.ts"
        )
        downloadPlaylistSegmentsCombined(
            client = client,
            playlist = videoPlaylist,
            tempDir = File(workDir, "v_segs"),
            combinedOutput = videoStreamFile
        ) { done, total ->
            val pct = 2 + ((done.toFloat() / max(1, total)) * videoWeight).toInt()
            onProgress("Descargando video ($done/$total)...", pct.coerceIn(2, 2 + videoWeight))
        }

        var audioStreamFile: File? = null
        if (audioPlaylist != null) {
            val outAud = File(
                workDir,
                if (audioPlaylist.isFmp4) "audio_combined.mp4" else "audio_combined.ts"
            )
            downloadPlaylistSegmentsCombined(
                client = client,
                playlist = audioPlaylist,
                tempDir = File(workDir, "a_segs"),
                combinedOutput = outAud
            ) { done, total ->
                val base = 2 + videoWeight
                val pct = base + ((done.toFloat() / max(1, total)) * audioWeight).toInt()
                onProgress("Descargando audio ($done/$total)...", pct.coerceIn(base, 86))
            }
            audioStreamFile = outAud
        }

        onProgress("Empaquetando video MP4...", 88)
        if (audioStreamFile == null && videoPlaylist.isFmp4) {
            val muxedOk = runCatching {
                remuxStreamsToMp4(videoStreamFile, null, outputMp4) { p ->
                    onProgress("Finalizando MP4...", 88 + (p * 10 / 100))
                }
            }.isSuccess
            if (!muxedOk || !outputMp4.exists() || outputMp4.length() == 0L) {
                videoStreamFile.copyTo(outputMp4, overwrite = true)
            }
        } else {
            remuxStreamsToMp4(videoStreamFile, audioStreamFile, outputMp4) { p ->
                onProgress("Empaquetando MP4...", 88 + (p * 10 / 100))
            }
        }

        runCatching { videoStreamFile.delete() }
        runCatching { audioStreamFile?.delete() }
        onProgress("Guardando en almacenamiento...", 98)
        outputMp4
    }

    private suspend fun fetchAndParsePlaylist(client: OkHttpClient, playlistUrl: String): ParsedPlaylist {
        val text = fetchTextWithRetry(client, playlistUrl)
        val lines = text.lines().map { it.trim() }.filter { it.isNotEmpty() }
        if (lines.any { it.startsWith("#EXT-X-KEY") && !it.contains("METHOD=NONE") }) {
            throw IOException("El stream tiene cifrado EXT-X-KEY y no puede descargarse directo.")
        }

        val base = URL(playlistUrl)
        var mapUrl: String? = null
        val segments = mutableListOf<String>()

        for (line in lines) {
            if (line.startsWith("#EXT-X-MAP:")) {
                val match = Regex("""URI="([^"]+)"""").find(line)
                if (match != null) {
                    mapUrl = URL(base, match.groupValues[1]).toString()
                }
                continue
            }
            if (line.startsWith("#")) continue
            segments.add(URL(base, line).toString())
        }

        if (segments.isEmpty()) {
            throw IOException("No se encontraron segmentos en la lista HLS.")
        }

        val isFmp4 = mapUrl != null || segments.any {
            Regex("\\.(m4s|mp4)(\\?|$)", RegexOption.IGNORE_CASE).containsMatchIn(it)
        }
        return ParsedPlaylist(mapUrl = mapUrl, segmentUrls = segments, isFmp4 = isFmp4)
    }

    private suspend fun downloadPlaylistSegmentsCombined(
        client: OkHttpClient,
        playlist: ParsedPlaylist,
        tempDir: File,
        combinedOutput: File,
        onSegmentProgress: suspend (done: Int, total: Int) -> Unit
    ) = coroutineScope {
        if (!tempDir.exists()) tempDir.mkdirs()

        val allUrls = if (playlist.mapUrl != null) {
            listOf(playlist.mapUrl) + playlist.segmentUrls
        } else {
            playlist.segmentUrls
        }

        val total = allUrls.size
        val completed = AtomicInteger(0)
        val semaphore = Semaphore(4)
        val segFiles = Array(total) { idx ->
            File(tempDir, String.format(Locale.US, "seg_%05d.bin", idx))
        }

        allUrls.mapIndexed { idx, url ->
            async {
                semaphore.withPermit {
                    if (!isActive) throw CancellationException()
                    downloadBinaryWithRetry(client, url, segFiles[idx])
                    val done = completed.incrementAndGet()
                    onSegmentProgress(done, total)
                }
            }
        }.awaitAll()

        BufferedOutputStream(FileOutputStream(combinedOutput), 128 * 1024).use { out ->
            val buf = ByteArray(64 * 1024)
            for (seg in segFiles) {
                seg.inputStream().use { input ->
                    while (true) {
                        val read = input.read(buf)
                        if (read <= 0) break
                        out.write(buf, 0, read)
                    }
                }
                seg.delete()
            }
            out.flush()
        }
        tempDir.deleteRecursively()
    }

    private fun remuxStreamsToMp4(
        videoFile: File,
        audioFile: File?,
        outputMp4: File,
        onPct: (Int) -> Unit
    ) {
        val videoExtractor = MediaExtractor()
        var audioExtractor: MediaExtractor? = null
        val muxer = MediaMuxer(outputMp4.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)

        var muxerStarted = false
        try {
            videoExtractor.setDataSource(videoFile.absolutePath)

            var srcVideoTrack = -1
            var srcInlineAudioTrack = -1
            for (i in 0 until videoExtractor.trackCount) {
                val fmt = videoExtractor.getTrackFormat(i)
                val mime = fmt.getString(MediaFormat.KEY_MIME).orEmpty()
                if (srcVideoTrack < 0 && mime.startsWith("video/")) {
                    srcVideoTrack = i
                } else if (audioFile == null && srcInlineAudioTrack < 0 && mime.startsWith("audio/")) {
                    srcInlineAudioTrack = i
                }
            }

            var srcSeparateAudioTrack = -1
            if (audioFile != null) {
                audioExtractor = MediaExtractor().apply { setDataSource(audioFile.absolutePath) }
                for (i in 0 until audioExtractor.trackCount) {
                    val mime = audioExtractor.getTrackFormat(i).getString(MediaFormat.KEY_MIME).orEmpty()
                    if (mime.startsWith("audio/")) {
                        srcSeparateAudioTrack = i
                        break
                    }
                }
            }

            if (srcVideoTrack < 0 && srcInlineAudioTrack < 0 && srcSeparateAudioTrack < 0) {
                throw IOException("No se detectaron pistas de audio o video compatibles para MP4.")
            }

            var muxVideoTrack = -1
            var muxAudioTrack = -1
            var totalDurationUs = 0L

            if (srcVideoTrack >= 0) {
                val vFormat = videoExtractor.getTrackFormat(srcVideoTrack)
                if (vFormat.containsKey(MediaFormat.KEY_DURATION)) {
                    totalDurationUs = max(totalDurationUs, vFormat.getLong(MediaFormat.KEY_DURATION))
                }
                videoExtractor.selectTrack(srcVideoTrack)
                muxVideoTrack = muxer.addTrack(vFormat)
            }

            if (audioFile != null && audioExtractor != null && srcSeparateAudioTrack >= 0) {
                val aFormat = audioExtractor.getTrackFormat(srcSeparateAudioTrack)
                if (aFormat.containsKey(MediaFormat.KEY_DURATION)) {
                    totalDurationUs = max(totalDurationUs, aFormat.getLong(MediaFormat.KEY_DURATION))
                }
                audioExtractor.selectTrack(srcSeparateAudioTrack)
                muxAudioTrack = muxer.addTrack(aFormat)
            } else if (srcInlineAudioTrack >= 0) {
                val aFormat = videoExtractor.getTrackFormat(srcInlineAudioTrack)
                if (aFormat.containsKey(MediaFormat.KEY_DURATION)) {
                    totalDurationUs = max(totalDurationUs, aFormat.getLong(MediaFormat.KEY_DURATION))
                }
                videoExtractor.selectTrack(srcInlineAudioTrack)
                muxAudioTrack = muxer.addTrack(aFormat)
            }

            muxer.start()
            muxerStarted = true

            val buffer = ByteBuffer.allocate(2 * 1024 * 1024)
            val bufferInfo = MediaCodec.BufferInfo()
            var lastVideoPts = -1L
            var lastAudioPts = -1L
            var lastReportedPct = -1

            // Copy tracks from primary videoExtractor (and inline audio if present)
            while (true) {
                val trackIndex = videoExtractor.sampleTrackIndex
                if (trackIndex < 0) break

                buffer.clear()
                val sampleSize = videoExtractor.readSampleData(buffer, 0)
                if (sampleSize < 0) break

                val rawPts = videoExtractor.sampleTime
                val flags = videoExtractor.sampleFlags
                val targetTrack = when (trackIndex) {
                    srcVideoTrack -> {
                        val safePts = if (rawPts <= lastVideoPts) lastVideoPts + 1L else rawPts
                        lastVideoPts = safePts
                        bufferInfo.set(0, sampleSize, safePts, flags)
                        muxVideoTrack
                    }
                    srcInlineAudioTrack -> {
                        val safePts = if (rawPts <= lastAudioPts) lastAudioPts + 1L else rawPts
                        lastAudioPts = safePts
                        bufferInfo.set(0, sampleSize, safePts, flags)
                        muxAudioTrack
                    }
                    else -> -1
                }

                if (targetTrack >= 0) {
                    muxer.writeSampleData(targetTrack, buffer, bufferInfo)
                    if (totalDurationUs > 0L) {
                        val pct = ((bufferInfo.presentationTimeUs.toDouble() / totalDurationUs) * 100.0)
                            .toInt()
                            .coerceIn(0, 100)
                        if (pct - lastReportedPct >= 5) {
                            lastReportedPct = pct
                            onPct(if (audioExtractor != null) pct / 2 else pct)
                        }
                    }
                }
                videoExtractor.advance()
            }

            // Copy separate audio track if present
            if (audioExtractor != null && muxAudioTrack >= 0) {
                while (true) {
                    val trackIndex = audioExtractor.sampleTrackIndex
                    if (trackIndex < 0) break
                    if (trackIndex != srcSeparateAudioTrack) {
                        audioExtractor.advance()
                        continue
                    }

                    buffer.clear()
                    val sampleSize = audioExtractor.readSampleData(buffer, 0)
                    if (sampleSize < 0) break

                    val rawPts = audioExtractor.sampleTime
                    val safePts = if (rawPts <= lastAudioPts) lastAudioPts + 1L else rawPts
                    lastAudioPts = safePts
                    bufferInfo.set(0, sampleSize, safePts, audioExtractor.sampleFlags)
                    muxer.writeSampleData(muxAudioTrack, buffer, bufferInfo)

                    if (totalDurationUs > 0L) {
                        val pct = 50 + ((safePts.toDouble() / totalDurationUs) * 50.0)
                            .toInt()
                            .coerceIn(0, 50)
                        if (pct - lastReportedPct >= 5) {
                            lastReportedPct = pct
                            onPct(pct)
                        }
                    }
                    audioExtractor.advance()
                }
            }
            onPct(100)
        } finally {
            runCatching { videoExtractor.release() }
            runCatching { audioExtractor?.release() }
            if (muxerStarted) {
                runCatching { muxer.stop() }
            }
            runCatching { muxer.release() }
        }
    }

    private suspend fun fetchTextWithRetry(client: OkHttpClient, url: String, retries: Int = 3): String {
        var lastError: Throwable? = null
        for (attempt in 0 until retries) {
            try {
                val req = Request.Builder().url(url).get().build()
                client.newCall(req).execute().use { res ->
                    if (!res.isSuccessful) throw IOException("HTTP ${res.code} leyendo $url")
                    return res.body?.string() ?: throw IOException("Respuesta vacía")
                }
            } catch (err: Throwable) {
                if (err is CancellationException) throw err
                lastError = err
                if (attempt < retries - 1) delay(350L * (attempt + 1))
            }
        }
        throw lastError ?: IOException("Error descargando lista HLS")
    }

    private suspend fun downloadBinaryWithRetry(
        client: OkHttpClient,
        url: String,
        target: File,
        retries: Int = 3
    ) {
        var lastError: Throwable? = null
        for (attempt in 0 until retries) {
            try {
                val req = Request.Builder().url(url).get().build()
                client.newCall(req).execute().use { res ->
                    if (!res.isSuccessful) throw IOException("HTTP ${res.code} descargando segmento")
                    val body = res.body ?: throw IOException("Segmento vacío")
                    FileOutputStream(target).use { out ->
                        body.byteStream().use { input ->
                            input.copyTo(out, 32 * 1024)
                        }
                    }
                    return
                }
            } catch (err: Throwable) {
                if (err is CancellationException) throw err
                lastError = err
                if (attempt < retries - 1) delay(400L * (attempt + 1))
            }
        }
        throw lastError ?: IOException("No se pudo descargar el segmento")
    }

    suspend fun downloadDirectStreamToFile(
        client: OkHttpClient,
        url: String,
        target: File,
        onProgress: suspend (Int) -> Unit
    ) = withContext(Dispatchers.IO) {
        val req = Request.Builder().url(url).get().build()
        client.newCall(req).execute().use { res ->
            if (!res.isSuccessful) throw IOException("HTTP ${res.code} descargando archivo")
            val body = res.body ?: throw IOException("Respuesta vacía")
            val total = body.contentLength()
            var received = 0L
            var lastPct = -1
            val buf = ByteArray(64 * 1024)
            BufferedOutputStream(FileOutputStream(target), 64 * 1024).use { out ->
                body.byteStream().use { input ->
                    while (true) {
                        val read = input.read(buf)
                        if (read <= 0) break
                        out.write(buf, 0, read)
                        received += read
                        if (total > 0L) {
                            val pct = ((received * 95L) / total).toInt().coerceIn(1, 95)
                            if (pct - lastPct >= 2) {
                                lastPct = pct
                                onProgress(pct)
                            }
                        }
                    }
                }
                out.flush()
            }
        }
    }
}
