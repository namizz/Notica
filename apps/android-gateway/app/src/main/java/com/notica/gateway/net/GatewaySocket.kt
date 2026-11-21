package com.notica.gateway.net

import io.socket.client.IO
import io.socket.client.Socket
import io.socket.engineio.client.transports.WebSocket
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.json.JSONObject

interface GatewaySocketListener {
    fun onConnected()
    fun onDisconnected(reason: String)
    fun onConnectError(error: String)
    fun onSmsBatchReceived(messages: List<WireMessage>)
    fun onDeviceRevoked()
}

class GatewaySocket(
    private val listener: GatewaySocketListener
) {
    private var socket: Socket? = null
    private val _isConnectedFlow = kotlinx.coroutines.flow.MutableStateFlow(false)
    val isConnectedFlow: kotlinx.coroutines.flow.StateFlow<Boolean> = _isConnectedFlow

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    val isConnected: Boolean
        get() = _isConnectedFlow.value

    fun connect(socketUrl: String, deviceToken: String) {
        disconnect()

        val options = IO.Options().apply {
            transports = arrayOf(WebSocket.NAME, io.socket.engineio.client.transports.Polling.NAME)
            auth = mapOf("token" to deviceToken, "version" to "1.0.0")
            reconnection = true
            reconnectionDelay = 1000
            reconnectionDelayMax = 60000
            timeout = 20000
        }

        socket = IO.socket(socketUrl, options).apply {
            on(Socket.EVENT_CONNECT) {
                _isConnectedFlow.value = true
                android.util.Log.i("GatewaySocket", "Connected to Notica gateway socket!")
                listener.onConnected()
            }
            on(Socket.EVENT_DISCONNECT) { args ->
                _isConnectedFlow.value = false
                val reason = args.firstOrNull()?.toString() ?: "unknown"
                android.util.Log.w("GatewaySocket", "Disconnected from gateway socket: $reason")
                listener.onDisconnected(reason)
            }
            on(Socket.EVENT_CONNECT_ERROR) { args ->
                _isConnectedFlow.value = false
                val errObj = args.firstOrNull()
                val error = errObj?.toString() ?: "connection error"
                android.util.Log.e("GatewaySocket", "Socket connect error: $error", errObj as? Throwable)
                listener.onConnectError(error)
            }
            on("sms:send") { args ->
                try {
                    val rawObj = args.firstOrNull()
                    if (rawObj != null) {
                        val rawJson = rawObj.toString()
                        val parsed = json.decodeFromString<MessagesResponse>(rawJson)
                        listener.onSmsBatchReceived(parsed.messages)
                    }
                } catch (e: Exception) {
                    listener.onConnectError("Failed to parse sms:send: ${e.message}")
                }
            }
            on("gateway:revoked") {
                listener.onDeviceRevoked()
            }
            connect()
        }
    }

    fun sendHeartbeat(payload: HeartbeatPayload) {
        val s = socket ?: return
        if (!s.connected()) return

        try {
            val jsonString = json.encodeToString(payload)
            val jsonObject = JSONObject(jsonString)
            s.emit("gateway:heartbeat", jsonObject)
        } catch (_: Exception) {
        }
    }

    fun disconnect() {
        try {
            socket?.off()
            socket?.disconnect()
            socket?.close()
        } catch (_: Exception) {
        } finally {
            socket = null
            _isConnectedFlow.value = false
        }
    }
}
