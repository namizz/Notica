package com.notica.gateway.service

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.notica.gateway.NoticaGatewayApp
import com.notica.gateway.net.GatewaySocketListener
import com.notica.gateway.net.HeartbeatPayload
import com.notica.gateway.net.WireMessage
import com.notica.gateway.ui.MainActivity
import com.notica.gateway.work.PullWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class GatewayService : Service(), GatewaySocketListener {

    private val serviceScope = CoroutineScope(Dispatchers.IO + Job())
    private var heartbeatJob: Job? = null
    private var wakeLock: PowerManager.WakeLock? = null

    private var currentBattery = 100
    private var isCharging = false
    private var currentNetwork = "none"
    private var isSocketConnected = false

    private val batteryReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
            if (level >= 0 && scale > 0) {
                currentBattery = (level * 100) / scale
            }
            val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
            isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                    status == BatteryManager.BATTERY_STATUS_FULL
        }
    }

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            updateNetworkType()
            reconnectSocketIfNeeded()
        }

        override fun onLost(network: Network) {
            currentNetwork = "none"
            updateNotification()
        }
    }

    override fun onCreate() {
        super.onCreate()
        acquireWakeLock()
        createNotificationChannel()
        registerReceivers()
        startForeground(NOTIFICATION_ID, buildNotification("Starting gateway service..."))
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_START
        if (action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }

        startGatewaySession()
        return START_STICKY
    }

    private fun startGatewaySession() {
        val app = applicationContext as? NoticaGatewayApp ?: return
        serviceScope.launch {
            val creds = app.container.credentialStore.credentialsFlow.first()
            if (creds == null) {
                stopSelf()
                return@launch
            }

            // Schedule fallback periodic worker
            PullWorker.schedule(applicationContext)

            // Connect socket
            app.container.gatewaySocket.connect(creds.socketUrl, creds.deviceToken)

            // Flush pending events on start
            app.container.eventUploader.flush()

            // Start heartbeat loop
            startHeartbeatLoop()
        }
    }

    private fun startHeartbeatLoop() {
        heartbeatJob?.cancel()
        val app = applicationContext as? NoticaGatewayApp ?: return

        heartbeatJob = serviceScope.launch {
            while (isActive) {
                delay(30_000L)
                if (isSocketConnected) {
                    val outboxDepth = app.container.database.outgoingSmsDao().countOutboxDepth()
                    val pendingEvents = app.container.database.pendingEventDao().countPending()
                    val payload = HeartbeatPayload(
                        battery = currentBattery,
                        charging = isCharging,
                        network = currentNetwork,
                        signalLevel = 4,
                        outboxDepth = outboxDepth,
                        pendingEvents = pendingEvents
                    )
                    app.container.gatewaySocket.sendHeartbeat(payload)
                }
            }
        }
    }

    private fun reconnectSocketIfNeeded() {
        val app = applicationContext as? NoticaGatewayApp ?: return
        serviceScope.launch {
            val creds = app.container.credentialStore.credentialsFlow.first() ?: return@launch
            if (!app.container.gatewaySocket.isConnected) {
                app.container.gatewaySocket.connect(creds.socketUrl, creds.deviceToken)
            }
            // Trigger flush and pull
            app.container.eventUploader.flush()
        }
    }

    override fun onConnected() {
        isSocketConnected = true
        updateNotification()
        val app = applicationContext as? NoticaGatewayApp ?: return
        serviceScope.launch {
            app.container.eventUploader.flush()
            // Pull any pending messages upon connection
            val creds = app.container.credentialStore.credentialsFlow.first() ?: return@launch
            app.container.apiClient.pullPending(creds.serverUrl, creds.deviceToken)
                .onSuccess { app.container.messageIntake.intakeBatch(it) }
        }
    }

    override fun onDisconnected(reason: String) {
        isSocketConnected = false
        updateNotification()
    }

    override fun onConnectError(error: String) {
        isSocketConnected = false
        updateNotification()
    }

    override fun onSmsBatchReceived(messages: List<WireMessage>) {
        val app = applicationContext as? NoticaGatewayApp ?: return
        serviceScope.launch {
            app.container.messageIntake.intakeBatch(messages)
            updateNotification()
        }
    }

    override fun onDeviceRevoked() {
        val app = applicationContext as? NoticaGatewayApp ?: return
        serviceScope.launch {
            app.container.credentialStore.clear()
            stopSelf()
        }
    }

    private fun updateNetworkType() {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return
        val activeNet = cm.activeNetwork
        val caps = cm.getNetworkCapabilities(activeNet)
        currentNetwork = when {
            caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true -> "wifi"
            caps?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true -> "cellular"
            caps?.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) == true -> "ethernet"
            else -> "unknown"
        }
        updateNotification()
    }

    private fun updateNotification() {
        val app = applicationContext as? NoticaGatewayApp ?: return
        serviceScope.launch {
            val startOfDay = System.currentTimeMillis() - (System.currentTimeMillis() % 86_400_000L)
            val sentToday = app.container.database.outgoingSmsDao().countSentToday(startOfDay)
            val statusText = if (isSocketConnected) {
                "Connected ($currentNetwork) · $sentToday sent today"
            } else {
                "Reconnecting ($currentNetwork)... · $sentToday sent today"
            }

            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.notify(NOTIFICATION_ID, buildNotification(statusText))
        }
    }

    private fun buildNotification(statusText: String): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Notica SMS Gateway")
            .setContentText(statusText)
            .setSmallIcon(android.R.drawable.ic_dialog_email)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Notica SMS Gateway Foreground Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows real-time status of the SMS Gateway connection"
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    @SuppressLint("WakelockTimeout")
    private fun acquireWakeLock() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "NoticaGateway:ServiceLock").apply {
            setReferenceCounted(false)
            acquire()
        }
    }

    private fun registerReceivers() {
        registerReceiver(batteryReceiver, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        val request = NetworkRequest.Builder().build()
        cm?.registerNetworkCallback(request, networkCallback)
    }

    override fun onDestroy() {
        super.onDestroy()
        heartbeatJob?.cancel()
        val app = applicationContext as? NoticaGatewayApp
        app?.container?.gatewaySocket?.disconnect()

        try {
            unregisterReceiver(batteryReceiver)
            val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            cm?.unregisterNetworkCallback(networkCallback)
        } catch (_: Exception) {
        }

        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
        } catch (_: Exception) {
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        const val CHANNEL_ID = "notica_gateway_service"
        const val NOTIFICATION_ID = 1001

        const val ACTION_START = "com.notica.gateway.service.START"
        const val ACTION_STOP = "com.notica.gateway.service.STOP"

        fun start(context: Context) {
            val intent = Intent(context, GatewayService::class.java).apply {
                action = ACTION_START
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, GatewayService::class.java).apply {
                action = ACTION_STOP
            }
            context.startService(intent)
        }
    }
}
