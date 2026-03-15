package org.tamx.termigate

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import dagger.hilt.android.HiltAndroidApp
import org.tamx.termigate.service.TerminalForegroundService

@HiltAndroidApp
class App : Application() {
    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        val nm = getSystemService(NotificationManager::class.java)

        val connectionChannel = NotificationChannel(
            TerminalForegroundService.CHANNEL_ID_CONNECTION,
            "Terminal Connection",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Persistent notification while connected to terminal sessions"
        }

        val eventsChannel = NotificationChannel(
            TerminalForegroundService.CHANNEL_ID_EVENTS,
            "Terminal Events",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = "Notifications for pane death, connection loss, and other events"
        }

        nm.createNotificationChannels(listOf(connectionChannel, eventsChannel))
    }
}
