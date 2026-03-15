package org.tamx.termigate.service

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import org.tamx.termigate.ui.MainActivity

class TerminalForegroundService : Service() {

    companion object {
        const val CHANNEL_ID_CONNECTION = "terminal_connection"
        const val CHANNEL_ID_EVENTS = "terminal_events"
        private const val NOTIFICATION_ID_FOREGROUND = 1
        private const val NOTIFICATION_ID_EVENT_BASE = 100

        private const val ACTION_START = "org.tamx.termigate.service.START"
        private const val ACTION_STOP = "org.tamx.termigate.service.STOP"
        private const val ACTION_UPDATE = "org.tamx.termigate.service.UPDATE"
        private const val ACTION_NOTIFY_PANE_DEAD = "org.tamx.termigate.service.PANE_DEAD"
        private const val ACTION_NOTIFY_DISCONNECTED = "org.tamx.termigate.service.DISCONNECTED"
        private const val EXTRA_TARGET = "target"
        private const val EXTRA_COUNT = "count"

        fun start(context: Context, target: String) {
            val intent = Intent(context, TerminalForegroundService::class.java).apply {
                action = ACTION_START
                putExtra(EXTRA_TARGET, target)
            }
            context.startForegroundService(intent)
        }

        fun stop(context: Context) {
            val intent = Intent(context, TerminalForegroundService::class.java).apply {
                action = ACTION_STOP
            }
            context.startService(intent)
        }

        fun updateCount(context: Context, count: Int) {
            val intent = Intent(context, TerminalForegroundService::class.java).apply {
                action = ACTION_UPDATE
                putExtra(EXTRA_COUNT, count)
            }
            context.startService(intent)
        }

        fun notifyPaneDead(context: Context, target: String) {
            val intent = Intent(context, TerminalForegroundService::class.java).apply {
                action = ACTION_NOTIFY_PANE_DEAD
                putExtra(EXTRA_TARGET, target)
            }
            context.startService(intent)
        }

        fun notifyDisconnected(context: Context) {
            val intent = Intent(context, TerminalForegroundService::class.java).apply {
                action = ACTION_NOTIFY_DISCONNECTED
            }
            context.startService(intent)
        }
    }

    private var eventNotificationCounter = 0

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val target = intent.getStringExtra(EXTRA_TARGET) ?: "terminal"
                startForeground(NOTIFICATION_ID_FOREGROUND, buildForegroundNotification(target))
            }
            ACTION_STOP -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
            ACTION_UPDATE -> {
                val count = intent.getIntExtra(EXTRA_COUNT, 0)
                if (count <= 0) {
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf()
                } else {
                    val text = if (count == 1) "Connected to 1 session" else "Connected to $count sessions"
                    val notification = buildForegroundNotification(text)
                    val nm = getSystemService(NotificationManager::class.java)
                    nm.notify(NOTIFICATION_ID_FOREGROUND, notification)
                }
            }
            ACTION_NOTIFY_PANE_DEAD -> {
                val target = intent.getStringExtra(EXTRA_TARGET) ?: "terminal"
                showEventNotification("Session ended", "Pane closed: $target")
            }
            ACTION_NOTIFY_DISCONNECTED -> {
                showEventNotification("Connection lost", "Could not reconnect to server")
            }
        }
        return START_NOT_STICKY
    }

    private fun buildForegroundNotification(contentText: String): Notification {
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID_CONNECTION)
            .setSmallIcon(android.R.drawable.ic_menu_manage)
            .setContentTitle("termigate")
            .setContentText(contentText)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    private fun showEventNotification(title: String, text: String) {
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID_EVENTS)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle(title)
            .setContentText(text)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        val nm = getSystemService(NotificationManager::class.java)
        nm.notify(NOTIFICATION_ID_EVENT_BASE + eventNotificationCounter++, notification)
    }
}
