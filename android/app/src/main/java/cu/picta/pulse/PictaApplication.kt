package cu.picta.pulse

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import cu.picta.pulse.data.local.LocalPreferencesStore
import cu.picta.pulse.data.network.PictaApiClient

class PictaApplication : Application() {
    lateinit var prefsStore: LocalPreferencesStore
        private set

    lateinit var apiClient: PictaApiClient
        private set

    override fun onCreate() {
        super.onCreate()
        prefsStore = LocalPreferencesStore(this)
        apiClient = PictaApiClient(prefsStore)
        createDownloadNotificationChannel()
    }

    private fun createDownloadNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                DOWNLOAD_CHANNEL_ID,
                "Descargas MP4",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Progreso de descargas de videos MP4 de Picta"
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    companion object {
        const val DOWNLOAD_CHANNEL_ID = "picta_downloads_channel"
    }
}
