package cu.picta.pulse.data.network

import cu.picta.pulse.data.local.LocalPreferencesStore
import cu.picta.pulse.data.model.ListaItem
import cu.picta.pulse.data.model.Mp4AudioOption
import cu.picta.pulse.data.model.Mp4VariantOption
import cu.picta.pulse.data.model.Mp4VariantsResult
import cu.picta.pulse.data.model.PaginatedResponse
import cu.picta.pulse.data.model.PictaAuthSession
import cu.picta.pulse.data.model.PictaCanal
import cu.picta.pulse.data.model.PictaComentario
import cu.picta.pulse.data.model.PictaGenero
import cu.picta.pulse.data.model.PictaLista
import cu.picta.pulse.data.model.PictaPublicacion
import cu.picta.pulse.data.model.PictaSerie
import cu.picta.pulse.data.model.PictaSuscripcion
import cu.picta.pulse.data.model.PictaTemporada
import cu.picta.pulse.data.model.PictaUser
import cu.picta.pulse.data.model.PictaVoto
import cu.picta.pulse.data.model.TokenResponse
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Call
import okhttp3.Callback
import okhttp3.FormBody
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.net.URL
import java.util.Locale
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class PictaApiClient(private val store: LocalPreferencesStore) {

    val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .writeTimeout(25, TimeUnit.SECONDS)
        .followRedirects(true)
        .build()

    private val json = store.json
    private val refreshMutex = Mutex()

    private data class CacheEntry(val bodyText: String, val expiresAt: Long)

    private val getCache = object : LinkedHashMap<String, CacheEntry>(140, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, CacheEntry>?): Boolean {
            return size > 140
        }
    }

    private fun invalidateCachePrefixes(vararg prefixes: String) {
        synchronized(getCache) {
            val keys = getCache.keys.filter { key -> prefixes.any { key.startsWith(it) } }
            keys.forEach { getCache.remove(it) }
        }
    }

    fun clearCache() {
        synchronized(getCache) {
            getCache.clear()
        }
    }

    private suspend fun executeCall(request: Request): Pair<Int, Pair<Map<String, String>, String>> =
        suspendCancellableCoroutine { cont ->
            val call = httpClient.newCall(request)
            cont.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    if (cont.isActive) cont.resumeWithException(e)
                }

                override fun onResponse(call: Call, response: Response) {
                    response.use { res ->
                        val bodyStr = runCatching { res.body?.string().orEmpty() }.getOrDefault("")
                        val headersMap = HashMap<String, String>()
                        for (i in 0 until res.headers.size) {
                            headersMap[res.headers.name(i).lowercase(Locale.US)] = res.headers.value(i)
                        }
                        if (cont.isActive) {
                            cont.resume(res.code to (headersMap to bodyStr))
                        }
                    }
                }
            })
        }

    suspend fun login(username: String, password: String): PictaAuthSession = withContext(Dispatchers.IO) {
        val trimmed = username.trim()
        val normalized = PictaFormatters.normalizePictaUsername(trimmed)
        val candidates = if (normalized.isNotEmpty() && normalized != trimmed) {
            listOf(normalized, trimmed)
        } else {
            listOf(trimmed)
        }

        var tokenRes: TokenResponse? = null
        var deviceId: String? = null
        var lastError = "Usuario o contraseña incorrectos en Picta."

        for (candidate in candidates) {
            val formBody = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart("grant_type", "password")
                .addFormDataPart("client_id", CLIENT_ID)
                .addFormDataPart("username", candidate)
                .addFormDataPart("password", password)
                .build()

            val req = Request.Builder()
                .url("$API_BASE/o/token/")
                .post(formBody)
                .build()

            val (code, pair) = executeCall(req)
            val (headers, raw) = pair
            val parsed = runCatching { json.decodeFromString<TokenResponse>(raw) }.getOrNull()

            if (code in 200..299 && !parsed?.accessToken.isNullOrBlank()) {
                tokenRes = parsed
                deviceId = headers["x-device-id"]
                break
            } else {
                lastError = parsed?.errorDescription
                    ?: parsed?.message
                    ?: "Usuario o contraseña incorrectos en Picta."
            }
        }

        val finalToken = tokenRes ?: throw IllegalStateException(lastError)
        val initialSession = PictaAuthSession(
            accessToken = finalToken.accessToken.orEmpty(),
            refreshToken = finalToken.refreshToken.orEmpty(),
            expiresIn = finalToken.expiresIn,
            deviceId = deviceId,
            user = null
        )
        store.saveSession(initialSession)

        val user = runCatching { fetchMe() }.getOrNull()
        val latest = store.getCurrentSession() ?: initialSession
        val completed = latest.copy(user = user)
        store.saveSession(completed)
        completed
    }

    private suspend fun refreshAccessToken(): PictaAuthSession? = refreshMutex.withLock {
        val current = store.getCurrentSession() ?: return@withLock null
        if (current.refreshToken.isBlank()) {
            store.saveSession(null)
            return@withLock null
        }

        return@withLock runCatching {
            val formBody = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart("grant_type", "refresh_token")
                .addFormDataPart("client_id", CLIENT_ID)
                .addFormDataPart("refresh_token", current.refreshToken)
                .build()

            val req = Request.Builder()
                .url("$API_BASE/o/token/")
                .post(formBody)
                .build()

            val (code, pair) = executeCall(req)
            val (headers, raw) = pair
            if (code !in 200..299) {
                if (code == 400 || code == 401) {
                    store.saveSession(null)
                }
                return@runCatching null
            }

            val parsed = json.decodeFromString<TokenResponse>(raw)
            val nextToken = parsed.accessToken ?: return@runCatching null
            val updated = current.copy(
                accessToken = nextToken,
                refreshToken = parsed.refreshToken ?: current.refreshToken,
                deviceId = headers["x-device-id"] ?: current.deviceId
            )
            store.saveSession(updated)
            updated
        }.getOrNull()
    }

    private suspend fun requestRaw(
        path: String,
        method: String = "GET",
        params: Map<String, String> = emptyMap(),
        formBody: Map<String, String>? = null,
        jsonBody: String? = null
    ): String {
        val normalizedPath = if (path.startsWith("/")) path else "/$path"
        val urlBuilder = "$API_BASE$normalizedPath".toHttpUrl().newBuilder()
        for ((k, v) in params) {
            if (v.isNotBlank()) urlBuilder.addQueryParameter(k, v)
        }
        val finalUrl = urlBuilder.build()

        fun buildReq(session: PictaAuthSession?): Request {
            val builder = Request.Builder()
                .url(finalUrl)
                .header("Accept", "application/json")

            if (!session?.accessToken.isNullOrBlank()) {
                builder.header("Authorization", "Bearer ${session!!.accessToken}")
            }
            if (!session?.deviceId.isNullOrBlank()) {
                builder.header("X-Device-Id", session!!.deviceId!!)
            }
            if (session?.profileId != null) {
                builder.header("X-Profile-Id", session.profileId.toString())
            }

            val reqBody: RequestBody? = when {
                method == "GET" || method == "HEAD" -> null
                formBody != null -> {
                    val mb = MultipartBody.Builder().setType(MultipartBody.FORM)
                    for ((k, v) in formBody) {
                        mb.addFormDataPart(k, v)
                    }
                    mb.build()
                }
                jsonBody != null -> jsonBody.toRequestBody("application/json; charset=utf-8".toMediaType())
                else -> FormBody.Builder().build()
            }

            when (method) {
                "GET" -> builder.get()
                "POST" -> builder.post(reqBody ?: FormBody.Builder().build())
                "PATCH" -> builder.patch(reqBody ?: FormBody.Builder().build())
                "DELETE" -> if (reqBody != null) builder.delete(reqBody) else builder.delete()
                else -> builder.method(method, reqBody)
            }
            return builder.build()
        }

        var session = store.getCurrentSession()
        var (code, pair) = executeCall(buildReq(session))

        if (code == 401 && !session?.refreshToken.isNullOrBlank()) {
            val refreshed = refreshAccessToken()
            if (refreshed != null) {
                session = refreshed
                val retry = executeCall(buildReq(session))
                code = retry.first
                pair = retry.second
            }
        }

        val (headers, rawBody) = pair
        val respDevice = headers["x-device-id"]
        val respProfile = headers["x-profile-id"]?.toLongOrNull()
        if (session != null && ((respDevice != null && respDevice != session.deviceId) ||
                (respProfile != null && respProfile != session.profileId))
        ) {
            store.saveSession(
                session.copy(
                    deviceId = respDevice ?: session.deviceId,
                    profileId = respProfile ?: session.profileId
                )
            )
        }

        if (code == 204) return "{}"
        if (code !in 200..299) {
            val errMsg = runCatching {
                val obj = json.decodeFromString<JsonObject>(rawBody)
                obj["detail"]?.jsonPrimitive?.content
                    ?: obj["message"]?.jsonPrimitive?.content
                    ?: "Error $code en Picta"
            }.getOrDefault("Error $code conectando con Picta")
            throw IOException(errMsg)
        }
        return rawBody
    }

    private suspend inline fun <reified T> cachedGet(
        path: String,
        params: Map<String, String> = emptyMap(),
        ttlMs: Long = 45_000L
    ): T {
        val key = buildString {
            append(path)
            if (params.isNotEmpty()) {
                append("?")
                append(params.entries.sortedBy { it.key }.joinToString("&") { "${it.key}=${it.value}" })
            }
        }
        val now = System.currentTimeMillis()
        val cached = synchronized(getCache) {
            getCache[key]?.takeIf { it.expiresAt > now }
        }
        if (cached != null) {
            return json.decodeFromString(cached.bodyText)
        }
        val raw = requestRaw(path = path, method = "GET", params = params)
        synchronized(getCache) {
            getCache[key] = CacheEntry(raw, System.currentTimeMillis() + ttlMs)
        }
        return json.decodeFromString(raw)
    }

    suspend fun fetchMe(): PictaUser {
        val raw = requestRaw("/v2/usuario/me/")
        return json.decodeFromString(raw)
    }

    suspend fun fetchPublicaciones(params: Map<String, String>): PaginatedResponse<PictaPublicacion> =
        cachedGet("/v2/publicacion/", params, 45_000L)

    suspend fun fetchRecomendados(idPublicacion: Long): List<PictaPublicacion> =
        runCatching {
            cachedGet<PaginatedResponse<PictaPublicacion>>(
                "/v2/lista_reproduccion_canal/listar_recomendados/",
                mapOf("id_publicacion" to idPublicacion.toString()),
                180_000L
            ).results
        }.getOrDefault(emptyList())

    suspend fun fetchSeries(params: Map<String, String>): PaginatedResponse<PictaSerie> =
        cachedGet("/v2/serie/", params, 60_000L)

    suspend fun fetchTemporadas(serieId: Long): List<PictaTemporada> =
        cachedGet<PaginatedResponse<PictaTemporada>>(
            "/v2/temporada/",
            mapOf("serie_pelser_id" to serieId.toString(), "ordering" to "numero", "page_size" to "50"),
            300_000L
        ).results

    suspend fun fetchEpisodiosByTemporada(temporadaId: Long): List<PictaPublicacion> {
        val items = fetchPublicaciones(mapOf("temporada_id" to temporadaId.toString(), "page_size" to "100")).results
        return items.sortedBy {
            it.categoria?.capitulo?.numero ?: it.categoria?.numeroCapitulo ?: 0
        }
    }

    suspend fun fetchCanales(params: Map<String, String>): PaginatedResponse<PictaCanal> =
        cachedGet("/v2/canal/", params, 60_000L)

    suspend fun fetchCanalById(canalId: Long, fallbackName: String? = null): PictaCanal? {
        val byId = runCatching {
            fetchCanales(mapOf("id" to canalId.toString(), "page_size" to "1")).results.firstOrNull()
        }.getOrNull()
        if (byId != null) return byId
        if (!fallbackName.isNullOrBlank()) {
            val byName = runCatching {
                fetchCanales(mapOf("nombre_raw" to fallbackName, "page_size" to "5")).results
            }.getOrDefault(emptyList())
            return byName.firstOrNull { it.id == canalId } ?: byName.firstOrNull()
        }
        return null
    }

    suspend fun fetchComentarios(publicacionId: Long, page: Int = 1): PaginatedResponse<PictaComentario> =
        cachedGet(
            "/v2/comentario/",
            mapOf("publicacion_id" to publicacionId.toString(), "page" to page.toString(), "page_size" to "20"),
            30_000L
        )

    suspend fun fetchRespuestasComentario(comentarioId: Long): List<PictaComentario> =
        cachedGet<PaginatedResponse<PictaComentario>>(
            "/v2/comentario/",
            mapOf("comentario_id" to comentarioId.toString(), "page_size" to "50"),
            30_000L
        ).results

    suspend fun postComentario(publicacionId: Long, texto: String, parentId: Long? = null): PictaComentario {
        val form = mutableMapOf(
            "publicacion" to publicacionId.toString(),
            "texto" to texto,
            "usuario" to "true"
        )
        if (parentId != null) {
            form["comentario"] = parentId.toString()
        }
        val raw = requestRaw("/v1/comentario/", method = "POST", formBody = form)
        invalidateCachePrefixes("/v2/comentario/")
        return json.decodeFromString(raw)
    }

    suspend fun deleteComentario(comentarioId: Long) {
        requestRaw("/v1/comentario/$comentarioId/", method = "DELETE")
        invalidateCachePrefixes("/v2/comentario/")
    }

    suspend fun fetchUserVote(publicacionId: Long, userId: Long): PictaVoto? =
        runCatching {
            cachedGet<PaginatedResponse<PictaVoto>>(
                "/v2/voto/",
                mapOf("usuario_id" to userId.toString(), "publicacion_id" to publicacionId.toString()),
                30_000L
            ).results.firstOrNull()
        }.getOrNull()

    suspend fun submitVote(publicacionId: Long, valor: Boolean): PictaVoto {
        val raw = requestRaw(
            "/v1/voto/",
            method = "POST",
            formBody = mapOf(
                "usuario" to "true",
                "publicacion" to publicacionId.toString(),
                "valor" to if (valor) "true" else "false"
            )
        )
        invalidateCachePrefixes("/v2/voto/")
        return json.decodeFromString(raw)
    }

    suspend fun updateVote(voteId: Long, valor: Boolean): PictaVoto {
        val raw = requestRaw(
            "/v1/voto/$voteId/",
            method = "PATCH",
            formBody = mapOf("valor" to if (valor) "true" else "false")
        )
        invalidateCachePrefixes("/v2/voto/")
        return json.decodeFromString(raw)
    }

    suspend fun removeVote(voteId: Long) {
        requestRaw("/v1/voto/$voteId/", method = "DELETE")
        invalidateCachePrefixes("/v2/voto/")
    }

    suspend fun fetchUserSuscripciones(username: String): List<PictaSuscripcion> =
        cachedGet<PaginatedResponse<PictaSuscripcion>>(
            "/v2/suscripcion/",
            mapOf("usuario_nombre_raw" to username, "page_size" to "100"),
            60_000L
        ).results

    suspend fun checkCanalSubscription(canalId: Long, username: String): PictaSuscripcion? =
        runCatching {
            cachedGet<PaginatedResponse<PictaSuscripcion>>(
                "/v2/suscripcion/",
                mapOf("canal_id" to canalId.toString(), "usuario_nombre_raw" to username),
                45_000L
            ).results.firstOrNull()
        }.getOrNull()

    suspend fun subscribeCanal(canalId: Long): PictaSuscripcion {
        val raw = requestRaw(
            "/v1/suscripcion/",
            method = "POST",
            formBody = mapOf("canal" to canalId.toString(), "usuario" to "true")
        )
        invalidateCachePrefixes("/v2/suscripcion/")
        return json.decodeFromString(raw)
    }

    suspend fun unsubscribeCanal(suscripcionId: Long) {
        requestRaw("/v1/suscripcion/$suscripcionId/", method = "DELETE")
        invalidateCachePrefixes("/v2/suscripcion/")
    }

    suspend fun fetchListasCanal(canalId: Long? = null, canalName: String? = null): List<PictaLista> {
        val params = mutableMapOf("page_size" to "48")
        if (canalId != null) params["canal_id"] = canalId.toString()
        if (!canalName.isNullOrBlank()) params["canal_nombre_raw"] = canalName
        val results = cachedGet<PaginatedResponse<PictaLista>>("/v2/lista_reproduccion_canal/", params, 120_000L).results
        return if (canalId != null) {
            results.filter { it.canal?.id == null || it.canal.id == canalId }
        } else {
            results
        }
    }

    suspend fun fetchListaPublicaciones(listaId: Long): List<ListaItem> =
        cachedGet<PaginatedResponse<ListaItem>>(
            "/v2/li_re_ca_pub/",
            mapOf("lista_id" to listaId.toString(), "ordering" to "posicion", "page_size" to "50"),
            120_000L
        ).results

    suspend fun registerPlayback(publicacionId: Long) {
        runCatching {
            requestRaw(
                "/v1/reproduccion/",
                method = "POST",
                formBody = mapOf("publicacion" to publicacionId.toString(), "usuario" to "true")
            )
        }
    }

    suspend fun fetchGeneros(): List<PictaGenero> =
        runCatching {
            cachedGet<PaginatedResponse<PictaGenero>>("/v2/genero/", mapOf("page_size" to "60"), 600_000L).results
        }.getOrDefault(emptyList())

    suspend fun generateDownloadLink(publicacionId: Long, calidad: String): String {
        val raw = requestRaw(
            "/v2/publicacion/get_url_descarga/",
            params = mapOf("id_publicacion" to publicacionId.toString(), "calidad" to calidad)
        )
        val obj = json.decodeFromString<JsonObject>(raw)
        return obj["url"]?.jsonPrimitive?.content.orEmpty()
    }

    suspend fun fetchSubscriptionsFeed(username: String): Pair<Int, List<PictaPublicacion>> = coroutineScope {
        val subs = fetchUserSuscripciones(username)
        if (subs.isEmpty()) return@coroutineScope 0 to emptyList()

        val channels = subs.map { it.canal }.filter { it.nombre.isNotBlank() }.take(16)
        val all = mutableListOf<PictaPublicacion>()
        val seen = HashSet<Long>()

        for (chunk in channels.chunked(4)) {
            val batchResults = chunk.map { ch ->
                async {
                    runCatching {
                        fetchPublicaciones(
                            mapOf(
                                "canal_nombre_raw" to ch.nombre,
                                "page" to "1",
                                "page_size" to "8",
                                "ordering" to "-fecha_publicado"
                            )
                        ).results
                    }.getOrDefault(emptyList())
                }
            }.awaitAll()

            for (list in batchResults) {
                for (pub in list) {
                    if (seen.add(pub.id)) {
                        all.add(pub)
                    }
                }
            }
        }

        all.sortByDescending {
            PictaFormatters.parseIsoTime(it.fechaPublicado ?: it.fechaCreacion) ?: 0L
        }
        subs.size to all
    }

    suspend fun fetchMp4Variants(manifestUrl: String, durationRaw: String?): Mp4VariantsResult =
        withContext(Dispatchers.IO) {
            val hlsUrl = PictaFormatters.getDirectHlsUrl(manifestUrl)
            val req = Request.Builder().url(hlsUrl).get().build()
            val (code, pair) = executeCall(req)
            if (code !in 200..299) {
                throw IOException("No se pudieron consultar las calidades de Picta (HTTP $code).")
            }

            val manifestText = pair.second
            val baseUrl = hlsUrl
            val lines = manifestText.lines().map { it.trim() }.filter { it.isNotEmpty() }

            val audioTracks = mutableListOf<Mp4AudioOption>()
            val variants = mutableListOf<Mp4VariantOption>()
            var durationSec = PictaFormatters.parseDurationSeconds(durationRaw)

            for (i in lines.indices) {
                val line = lines[i]
                if (line.startsWith("#EXT-X-MEDIA:")) {
                    val attrs = parseHlsAttrList(line.removePrefix("#EXT-X-MEDIA:"))
                    if (attrs["TYPE"] == "AUDIO" && !attrs["URI"].isNullOrBlank()) {
                        val resolved = URL(URL(baseUrl), attrs["URI"]).toString()
                        audioTracks.add(
                            Mp4AudioOption(
                                id = "aud_${audioTracks.size}",
                                language = attrs["LANGUAGE"],
                                label = formatAudioLabel(attrs["LANGUAGE"], attrs["NAME"], audioTracks.size),
                                url = resolved,
                                isDefault = attrs["DEFAULT"] == "YES" || attrs["AUTOSELECT"] == "YES"
                            )
                        )
                    }
                } else if (line.startsWith("#EXT-X-STREAM-INF:")) {
                    val attrs = parseHlsAttrList(line.removePrefix("#EXT-X-STREAM-INF:"))
                    val nextUri = lines.getOrNull(i + 1)
                    if (!nextUri.isNullOrBlank() && !nextUri.startsWith("#")) {
                        val resolved = URL(URL(baseUrl), nextUri).toString()
                        val bw = (attrs["AVERAGE-BANDWIDTH"] ?: attrs["BANDWIDTH"])?.toLongOrNull() ?: 0L
                        val resolution = attrs["RESOLUTION"]
                        val fnameMatch = Regex("(\\d{3,4}p)\\.m3u8", RegexOption.IGNORE_CASE).find(nextUri)
                        var label = fnameMatch?.groupValues?.getOrNull(1)?.lowercase(Locale.ROOT).orEmpty()
                        if (label.isEmpty() && !resolution.isNullOrBlank()) {
                            val parts = resolution.split("x")
                            if (parts.size == 2) label = "${parts[1]}p"
                        }
                        if (label.isEmpty()) {
                            label = if (bw > 0L) "${bw / 1000L} kbps" else "Calidad ${variants.size + 1}"
                        }
                        variants.add(
                            Mp4VariantOption(
                                id = "var_${variants.size}",
                                label = label,
                                resolution = resolution,
                                bandwidth = bw,
                                estimatedSizeLabel = "",
                                url = resolved
                            )
                        )
                    }
                }
            }

            var isLive = false
            val probeTarget = variants.firstOrNull()?.url ?: baseUrl
            if (variants.isEmpty() && !manifestText.contains("#EXT-X-ENDLIST")) {
                isLive = true
            } else if (variants.isNotEmpty() || durationSec <= 0L) {
                runCatching {
                    val subReq = Request.Builder().url(probeTarget).get().build()
                    val (subCode, subPair) = executeCall(subReq)
                    if (subCode in 200..299) {
                        val subText = subPair.second
                        if (!subText.contains("#EXT-X-ENDLIST")) isLive = true
                        if (durationSec <= 0L) {
                            var sum = 0.0
                            for (m in Regex("#EXTINF:(\\d+(?:\\.\\d+)?)").findAll(subText)) {
                                sum += m.groupValues[1].toDoubleOrNull() ?: 0.0
                            }
                            if (sum > 0.0) durationSec = sum.toLong()
                        }
                    }
                }
            }

            if (variants.isEmpty()) {
                variants.add(
                    Mp4VariantOption(
                        id = "var_0",
                        label = "Original",
                        resolution = null,
                        bandwidth = 0L,
                        estimatedSizeLabel = "",
                        url = baseUrl
                    )
                )
            }

            val enriched = variants.sortedBy { it.bandwidth }.map { v ->
                val est = if (durationSec > 0L && v.bandwidth > 0L) {
                    PictaFormatters.formatEstimatedBytes(((v.bandwidth + 128_000L) * durationSec) / 8L)
                } else {
                    ""
                }
                v.copy(estimatedSizeLabel = est)
            }

            Mp4VariantsResult(
                isLive = isLive,
                durationSeconds = durationSec,
                variants = enriched,
                audioTracks = audioTracks
            )
        }

    private fun parseHlsAttrList(raw: String): Map<String, String> {
        val attrs = HashMap<String, String>()
        val regex = Regex("""([A-Z0-9-]+)=("([^"]*)"|[^,]*)""")
        for (m in regex.findAll(raw)) {
            val key = m.groupValues[1]
            val quoted = m.groups[3]?.value
            attrs[key] = quoted ?: m.groupValues[2]
        }
        return attrs
    }

    private fun formatAudioLabel(lang: String?, name: String?, idx: Int): String {
        val key = (lang ?: name ?: "").lowercase(Locale.ROOT).trim()
        LANG_LABELS[key]?.let { return it }
        if (!name.isNullOrBlank()) return name.trim().uppercase(Locale.ROOT)
        if (!lang.isNullOrBlank()) return lang.trim().uppercase(Locale.ROOT)
        return "Audio ${idx + 1}"
    }

    companion object {
        const val API_BASE = "https://api.picta.cu"
        const val CLIENT_ID = "ebkU3YeFu3So9hesQHrS8AZjEa4v7TiYbS5QZIgO"

        private val LANG_LABELS = mapOf(
            "es" to "Español",
            "spa" to "Español",
            "en" to "Inglés",
            "eng" to "Inglés",
            "fr" to "Francés",
            "fre" to "Francés",
            "fra" to "Francés",
            "pt" to "Portugués",
            "por" to "Portugués",
            "nb" to "Original (NO)",
            "nob" to "Original (NO)",
            "ko" to "Coreano",
            "kor" to "Coreano",
            "ja" to "Japonés",
            "jpn" to "Japonés",
            "de" to "Alemán",
            "deu" to "Alemán",
            "it" to "Italiano",
            "ita" to "Italiano",
            "ru" to "Ruso",
            "rus" to "Ruso",
            "pl" to "Polaco",
            "pol" to "Polaco"
        )
    }
}
