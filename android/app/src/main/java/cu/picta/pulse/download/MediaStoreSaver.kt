package cu.picta.pulse.download

import android.content.ContentValues
import android.content.Context
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.FileProvider
import cu.picta.pulse.data.model.DownloadDestination
import java.io.File
import java.io.IOException

object MediaStoreSaver {

    data class SavedMediaResult(
        val contentUri: String,
        val displayPath: String,
        val sizeBytes: Long
    )

    fun saveFileToPublicStorage(
        context: Context,
        sourceFile: File,
        filename: String,
        mimeType: String,
        destination: DownloadDestination
    ): SavedMediaResult {
        if (!sourceFile.exists() || sourceFile.length() <= 0L) {
            throw IOException("El archivo generado está vacío.")
        }

        val isVideo = mimeType.startsWith("video/")
        val effectiveDest = if (isVideo) destination else DownloadDestination.DOWNLOADS

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val resolver = context.contentResolver
            val (collection, baseDir) = when (effectiveDest) {
                DownloadDestination.MOVIES ->
                    MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY) to
                        Environment.DIRECTORY_MOVIES
                DownloadDestination.DOWNLOADS ->
                    MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY) to
                        Environment.DIRECTORY_DOWNLOADS
            }

            val relativePath = "$baseDir/PictaPulse"
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
                put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath)
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }

            val uri = resolver.insert(collection, values)
                ?: throw IOException("No se pudo crear el archivo en almacenamiento público.")

            try {
                resolver.openOutputStream(uri)?.use { out ->
                    sourceFile.inputStream().use { input ->
                        input.copyTo(out, bufferSize = 64 * 1024)
                    }
                } ?: throw IOException("No se pudo escribir en MediaStore.")

                val doneValues = ContentValues().apply {
                    put(MediaStore.MediaColumns.IS_PENDING, 0)
                }
                resolver.update(uri, doneValues, null, null)
                return SavedMediaResult(
                    contentUri = uri.toString(),
                    displayPath = "${effectiveDest.folderDisplay}/$filename",
                    sizeBytes = sourceFile.length()
                )
            } catch (err: Throwable) {
                runCatching { resolver.delete(uri, null, null) }
                throw err
            }
        } else {
            @Suppress("DEPRECATION")
            val rootDir = when (effectiveDest) {
                DownloadDestination.MOVIES ->
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES)
                DownloadDestination.DOWNLOADS ->
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            }
            val targetDir = File(rootDir, "PictaPulse")
            if (!targetDir.exists() && !targetDir.mkdirs()) {
                val fallbackDir = File(
                    context.getExternalFilesDir(
                        if (effectiveDest == DownloadDestination.MOVIES) Environment.DIRECTORY_MOVIES
                        else Environment.DIRECTORY_DOWNLOADS
                    ),
                    "PictaPulse"
                )
                fallbackDir.mkdirs()
                val outFile = uniqueTargetFile(fallbackDir, filename)
                sourceFile.copyTo(outFile, overwrite = true)
                val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", outFile)
                return SavedMediaResult(
                    contentUri = uri.toString(),
                    displayPath = outFile.absolutePath,
                    sizeBytes = outFile.length()
                )
            }

            val outFile = uniqueTargetFile(targetDir, filename)
            sourceFile.copyTo(outFile, overwrite = true)
            MediaScannerConnection.scanFile(context, arrayOf(outFile.absolutePath), arrayOf(mimeType), null)
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", outFile)
            return SavedMediaResult(
                contentUri = uri.toString(),
                displayPath = "${effectiveDest.folderDisplay}/${outFile.name}",
                sizeBytes = outFile.length()
            )
        }
    }

    private fun uniqueTargetFile(dir: File, filename: String): File {
        var candidate = File(dir, filename)
        if (!candidate.exists()) return candidate
        val dotIdx = filename.lastIndexOf('.')
        val base = if (dotIdx > 0) filename.substring(0, dotIdx) else filename
        val ext = if (dotIdx > 0) filename.substring(dotIdx) else ""
        var count = 1
        while (candidate.exists() && count < 100) {
            candidate = File(dir, "${base}_$count$ext")
            count++
        }
        return candidate
    }

    fun deleteSavedMedia(context: Context, contentUriString: String) {
        if (contentUriString.isBlank()) return
        runCatching {
            val uri = Uri.parse(contentUriString)
            context.contentResolver.delete(uri, null, null)
        }
    }
}
