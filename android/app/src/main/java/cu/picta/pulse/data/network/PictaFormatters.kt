package cu.picta.pulse.data.network

import cu.picta.pulse.data.model.OfficialDownloadVariant
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import kotlin.math.roundToInt

object PictaFormatters {

    private val sizedMissCache = HashSet<String>(512)

    fun markSizedMiss(url: String, size: String) {
        synchronized(sizedMissCache) {
            if (sizedMissCache.size >= 500) sizedMissCache.clear()
            sizedMissCache.add("$size::$url")
        }
    }

    fun getPictaImageCandidates(rawUrl: String?, size: String = "480x270"): List<String> {
        if (rawUrl.isNullOrBlank()) return emptyList()
        val parts = rawUrl.split("?", limit = 2)
        val basePath = parts[0]
        val query = parts.getOrNull(1)
        val hasImageExt = Regex("\\.(jpe?g|png|webp|gif|svg)$", RegexOption.IGNORE_CASE).containsMatchIn(basePath)
        val isAvatar = Regex("/avatar/", RegexOption.IGNORE_CASE).containsMatchIn(basePath)
        val key = "$size::$rawUrl"
        val isMissed = synchronized(sizedMissCache) { sizedMissCache.contains(key) }

        val candidates = mutableListOf<String>()
        if (!(hasImageExt && isAvatar) && !isMissed) {
            val stripped = basePath.replace(Regex("_\\d+x\\d+$"), "")
            val sized = if (query != null) "${stripped}_$size?$query" else "${stripped}_$size"
            candidates.add(sized)
        }
        candidates.add(rawUrl)
        return candidates
    }

    fun getDirectHlsUrl(manifestUrl: String?): String {
        if (manifestUrl.isNullOrBlank()) return ""
        return if (manifestUrl.endsWith(".mpd", ignoreCase = true)) {
            manifestUrl.replace(Regex("manifest\\.mpd$", RegexOption.IGNORE_CASE), "master.m3u8")
        } else {
            manifestUrl
        }
    }

    fun normalizePictaUsername(raw: String): String {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return ""
        if (trimmed.startsWith("+53")) return trimmed
        if (Regex("^53\\d{8}$").matches(trimmed)) return "+$trimmed"
        if (Regex("^\\d{8}$").matches(trimmed)) return "+53$trimmed"
        return trimmed
    }

    fun parseDurationSeconds(raw: String?): Long {
        if (raw.isNullOrBlank()) return 0L
        val trimmed = raw.trim()
        trimmed.toDoubleOrNull()?.let { return it.toLong().coerceAtLeast(0L) }
        if (trimmed.contains(":")) {
            val nums = trimmed.split(":").mapNotNull { it.trim().toLongOrNull() }
            if (nums.size == 3) return nums[0] * 3600L + nums[1] * 60L + nums[2]
            if (nums.size == 2) return nums[0] * 60L + nums[1]
        }
        return 0L
    }

    fun formatDuration(raw: String?): String {
        if (raw.isNullOrBlank()) return ""
        val trimmed = raw.trim()
        if (trimmed.contains(":")) {
            val parts = trimmed.split(":").map { it.trim() }
            if (parts.size == 3 && parts[0] == "00") {
                return "${parts[1]}:${parts[2]}"
            }
            return trimmed
        }
        val total = trimmed.toDoubleOrNull()?.toLong() ?: return ""
        return formatSeconds(total)
    }

    fun formatSeconds(totalSeconds: Long): String {
        if (totalSeconds <= 0L) return "0:00"
        val hrs = totalSeconds / 3600L
        val mins = (totalSeconds % 3600L) / 60L
        val secs = totalSeconds % 60L
        return if (hrs > 0L) {
            String.format(Locale.US, "%d:%02d:%02d", hrs, mins, secs)
        } else {
            String.format(Locale.US, "%d:%02d", mins, secs)
        }
    }

    fun formatCount(num: Long?): String {
        if (num == null || num <= 0L) return "0"
        return when {
            num >= 1_000_000L -> {
                val formatted = String.format(Locale.US, "%.1f", num / 1_000_000.0).removeSuffix(".0")
                "${formatted}M"
            }
            num >= 1_000L -> {
                val formatted = String.format(Locale.US, "%.1f", num / 1_000.0).removeSuffix(".0")
                "${formatted}K"
            }
            else -> num.toString()
        }
    }

    fun formatEstimatedBytes(bytes: Long): String {
        if (bytes <= 0L) return ""
        val mb = bytes / (1024.0 * 1024.0)
        return when {
            mb >= 1024.0 -> String.format(Locale.US, "~%.2f GB", mb / 1024.0)
            mb >= 10.0 -> "~${mb.roundToInt()} MB"
            else -> String.format(Locale.US, "~%.1f MB", mb)
        }
    }

    fun formatFileSize(bytes: Long): String {
        if (bytes <= 0L) return ""
        val mb = bytes / (1024.0 * 1024.0)
        return when {
            mb >= 1024.0 -> String.format(Locale.US, "%.2f GB", mb / 1024.0)
            mb >= 10.0 -> "${mb.roundToInt()} MB"
            else -> String.format(Locale.US, "%.1f MB", mb)
        }
    }

    fun formatRelativeDate(iso: String?): String {
        if (iso.isNullOrBlank()) return ""
        val timestamp = parseIsoTime(iso) ?: return ""
        val diffSec = ((System.currentTimeMillis() - timestamp) / 1000L).coerceAtLeast(0L)
        return when {
            diffSec < 60 -> "ahora"
            diffSec < 3600 -> "hace ${diffSec / 60} min"
            diffSec < 86400 -> "hace ${diffSec / 3600} h"
            diffSec < 86400L * 30 -> "hace ${diffSec / 86400} d"
            diffSec < 86400L * 365 -> "hace ${diffSec / (86400L * 30)} m"
            else -> "hace ${diffSec / (86400L * 365)} a"
        }
    }

    fun parseIsoTime(iso: String?): Long? {
        if (iso.isNullOrBlank()) return null
        val patterns = listOf(
            "yyyy-MM-dd'T'HH:mm:ss.SSSSSSXXX",
            "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
            "yyyy-MM-dd'T'HH:mm:ssXXX",
            "yyyy-MM-dd'T'HH:mm:ss'Z'",
            "yyyy-MM-dd'T'HH:mm:ss"
        )
        for (p in patterns) {
            runCatching {
                val sdf = SimpleDateFormat(p, Locale.US)
                sdf.timeZone = TimeZone.getTimeZone("UTC")
                return sdf.parse(iso)?.time
            }
        }
        return null
    }

    fun sanitizeFileName(raw: String, maxLen: Int = 64): String {
        val clean = raw.lowercase(Locale.ROOT)
            .replace(Regex("[^a-z0-9._-]+"), "-")
            .trim('-')
            .ifBlank { "picta-video" }
        return clean.take(maxLen)
    }

    fun parseDescargaVariants(descargaJson: String?): List<OfficialDownloadVariant> {
        if (descargaJson.isNullOrBlank()) return emptyList()
        val labels = mapOf(
            "low" to "360p (Ligero)",
            "medium" to "480p (Estándar)",
            "high" to "720p (HD)",
            "hd" to "1080p (Full HD)",
            "source" to "Original"
        )
        return runCatching {
            val obj = Json.parseToJsonElement(descargaJson).jsonObject
            obj.entries.mapNotNull { (key, value) ->
                val sizeStr = value.jsonPrimitive.content.trim()
                if (sizeStr.isEmpty()) null
                else OfficialDownloadVariant(
                    key = key,
                    label = labels[key.lowercase(Locale.ROOT)] ?: key.uppercase(Locale.ROOT),
                    size = sizeStr
                )
            }
        }.getOrDefault(emptyList())
    }
}
