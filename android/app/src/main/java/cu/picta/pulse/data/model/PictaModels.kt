package cu.picta.pulse.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

@Serializable
data class SubscriptionPlan(
    val id: Long? = null,
    val nombre: String? = null,
    val descargas: Int? = null,
    val precio: Double? = null
)

@Serializable
data class PictaUser(
    val id: Long,
    val username: String = "",
    @SerialName("first_name") val firstName: String? = null,
    @SerialName("last_name") val lastName: String? = null,
    val email: String? = null,
    @SerialName("phone_number") val phoneNumber: String? = null,
    val avatar: String? = null,
    @SerialName("has_subscription") val hasSubscription: Boolean = false,
    @SerialName("total_downloads") val totalDownloads: Int = 0,
    @SerialName("subscription_plan") val subscriptionPlan: SubscriptionPlan? = null,
    val code: String? = null,
    @SerialName("dias_restantes") val diasRestantes: Int? = null
)

@Serializable
data class PictaAuthSession(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String = "",
    @SerialName("expires_in") val expiresIn: Long? = null,
    @SerialName("device_id") val deviceId: String? = null,
    @SerialName("profile_id") val profileId: Long? = null,
    val user: PictaUser? = null
)

@Serializable
data class TokenResponse(
    @SerialName("access_token") val accessToken: String? = null,
    @SerialName("refresh_token") val refreshToken: String? = null,
    @SerialName("expires_in") val expiresIn: Long? = null,
    val error: String? = null,
    @SerialName("error_description") val errorDescription: String? = null,
    val message: String? = null
)

@Serializable
data class FeaturedPublicacion(
    val prioridad: Int? = null,
    val publicacion: PictaPublicacion? = null
)

@Serializable
data class PictaCanal(
    val id: Long,
    val nombre: String = "",
    val alias: String? = null,
    @SerialName("slug_url") val slugUrl: String? = null,
    @SerialName("url_imagen") val urlImagen: String? = null,
    @SerialName("url_avatar") val urlAvatar: String? = null,
    val descripcion: String? = null,
    @SerialName("cantidad_suscripciones") val cantidadSuscripciones: Long? = null,
    val suscripcion: JsonPrimitive? = null,
    val donar: Boolean? = null,
    val publicado: Boolean? = null,
    @SerialName("publicaciones_destacadas") val publicacionesDestacadas: List<FeaturedPublicacion> = emptyList()
)

@Serializable
data class Tipologia(
    val id: Long? = null,
    val nombre: String? = null,
    val modelo: String? = null
)

@Serializable
data class PeliculaMeta(
    val ano: Int? = null,
    val pais: String? = null,
    val director: String? = null,
    val genero: List<JsonElement> = emptyList()
)

@Serializable
data class SerieRef(
    val nombre: String? = null
)

@Serializable
data class TemporadaRef(
    val id: Long? = null,
    val nombre: String? = null,
    val numero: Int? = null,
    val serie: PictaSerie? = null
)

@Serializable
data class CapituloRef(
    val id: Long? = null,
    val numero: Int? = null,
    val temporada: TemporadaRef? = null
)

@Serializable
data class LiveMeta(
    val finalizado: Boolean? = null
)

@Serializable
data class PictaCategoria(
    val id: Long? = null,
    val tipologia: Tipologia? = null,
    val pelicula: PeliculaMeta? = null,
    val serie: SerieRef? = null,
    val temporada: TemporadaRef? = null,
    val capitulo: CapituloRef? = null,
    @SerialName("numero_capitulo") val numeroCapitulo: Int? = null,
    val live: LiveMeta? = null
)

@Serializable
data class PrecioItem(
    val tipo: String? = null,
    val valor: Double? = null
)

@Serializable
data class KeywordItem(
    val id: Long? = null,
    val nombre: String = ""
)

@Serializable
data class PictaPublicacion(
    val id: Long,
    val nombre: String = "",
    val tipo: String = "",
    @SerialName("slug_url") val slugUrl: String = "",
    @SerialName("url_imagen") val urlImagen: String = "",
    val descripcion: String? = null,
    @SerialName("fecha_publicado") val fechaPublicado: String? = null,
    @SerialName("fecha_creacion") val fechaCreacion: String? = null,
    val duracion: JsonPrimitive? = null,
    @SerialName("url_manifiesto") val urlManifiesto: String? = null,
    @SerialName("url_subtitulo") val urlSubtitulo: String? = null,
    @SerialName("url_descarga") val urlDescarga: String? = null,
    val descarga: String? = null,
    val descargable: Boolean? = null,
    val hd: Boolean? = null,
    val premium: Boolean? = null,
    @SerialName("only_subs") val onlySubs: Boolean? = null,
    val precios: List<PrecioItem> = emptyList(),
    @SerialName("cantidad_visitas") val cantidadVisitas: Long = 0,
    @SerialName("cantidad_reproducciones") val cantidadReproducciones: Long = 0,
    @SerialName("cantidad_me_gusta") val cantidadMeGusta: Long = 0,
    @SerialName("cantidad_no_me_gusta") val cantidadNoMeGusta: Long = 0,
    @SerialName("cantidad_comentarios") val cantidadComentarios: Long = 0,
    @SerialName("cantidad_descargas") val cantidadDescargas: Long = 0,
    @SerialName("mostrar_comentarios") val mostrarComentarios: Boolean = true,
    val canal: PictaCanal? = null,
    val categoria: PictaCategoria? = null,
    @SerialName("palabraClave_data") val palabraClaveData: List<KeywordItem> = emptyList()
) {
    val duracionRaw: String?
        get() = duracion?.contentOrNull
}

@Serializable
data class PictaGenero(
    val id: Long,
    val nombre: String = "",
    val tipo: String? = null
)

@Serializable
data class PictaSerie(
    @SerialName("pelser_id") val pelserId: Long,
    val nombre: String = "",
    @SerialName("cantidad_temporadas") val cantidadTemporadas: Int? = null,
    @SerialName("cantidad_capitulos") val cantidadCapitulos: Int? = null,
    val ano: Int? = null,
    val pais: String? = null,
    val director: String? = null,
    val reparto: String? = null,
    val genero: List<PictaGenero> = emptyList(),
    val canal: PictaCanal? = null,
    @SerialName("last_update") val lastUpdate: String? = null,
    val sinopsis: String? = null,
    val clasificacion: String? = null,
    @SerialName("url_imagen") val urlImagen: String? = null,
    @SerialName("imagen_secundaria") val imagenSecundaria: String? = null
)

@Serializable
data class PictaTemporada(
    val id: Long,
    val nombre: String = "",
    val numero: Int = 1,
    @SerialName("cantidad_capitulos") val cantidadCapitulos: Int? = null,
    val serie: Long? = null
)

@Serializable
data class ComentarioUser(
    val id: Long? = null,
    val username: String = "",
    val avatar: String? = null
)

@Serializable
data class PictaComentario(
    val id: Long,
    val texto: String = "",
    val fecha: String = "",
    val comentario: JsonElement? = null,
    @SerialName("cantidad_respuestas") val cantidadRespuestas: Int = 0,
    val editado: Boolean = false,
    val publicacion: JsonElement? = null,
    val usuario: ComentarioUser? = null
)

@Serializable
data class PictaVoto(
    val id: Long,
    val valor: Boolean,
    val fecha: String? = null
)

@Serializable
data class PictaSuscripcion(
    val id: Long,
    val fecha: String? = null,
    @SerialName("recibir_notificacion") val recibirNotificacion: Boolean? = null,
    val canal: PictaCanal
)

@Serializable
data class PictaLista(
    val id: Long,
    val nombre: String = "",
    val tipo: String? = null,
    @SerialName("url_imagen") val urlImagen: String? = null,
    @SerialName("fecha_creacion") val fechaCreacion: String? = null,
    val publicaciones: List<Long> = emptyList(),
    val canal: PictaCanal? = null
)

@Serializable
data class ListaItem(
    val id: Long,
    val posicion: Int = 0,
    val publicacion: PictaPublicacion? = null
)

@Serializable
data class PaginatedResponse<T>(
    val count: Int = 0,
    val next: String? = null,
    val previous: String? = null,
    val results: List<T> = emptyList()
)

@Serializable
data class LocalHistoryItem(
    val video: PictaPublicacion,
    val watchedAt: Long,
    val progressSeconds: Long,
    val durationSeconds: Long
)

@Serializable
enum class DownloadDestination(val label: String, val folderDisplay: String) {
    DOWNLOADS("Carpeta Descargas", "Descargas/PictaPulse"),
    MOVIES("Carpeta Películas", "Películas/PictaPulse")
}

@Serializable
enum class DownloadTaskStatus {
    PREPARING,
    DOWNLOADING,
    MUXING,
    COMPLETED,
    FAILED,
    CANCELLED
}

@Serializable
data class LocalDownloadItem(
    val id: String,
    val video: PictaPublicacion,
    val quality: String,
    val sizeLabel: String,
    val sizeBytes: Long = 0L,
    val filename: String,
    val contentUri: String = "",
    val relativePathDisplay: String = "",
    val destination: DownloadDestination = DownloadDestination.DOWNLOADS,
    val status: DownloadTaskStatus = DownloadTaskStatus.COMPLETED,
    val progressPct: Int = 100,
    val errorMessage: String? = null,
    val createdAt: Long = System.currentTimeMillis()
)

data class Mp4VariantOption(
    val id: String,
    val label: String,
    val resolution: String?,
    val bandwidth: Long,
    val estimatedSizeLabel: String,
    val url: String
)

data class Mp4AudioOption(
    val id: String,
    val label: String,
    val language: String?,
    val url: String,
    val isDefault: Boolean
)

data class Mp4VariantsResult(
    val isLive: Boolean,
    val durationSeconds: Long,
    val variants: List<Mp4VariantOption>,
    val audioTracks: List<Mp4AudioOption>
)

data class OfficialDownloadVariant(
    val key: String,
    val label: String,
    val size: String
)
