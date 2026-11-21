package com.notica.gateway.sync

import com.notica.gateway.config.CredentialStore
import com.notica.gateway.data.LogDao
import com.notica.gateway.data.LogEntry
import com.notica.gateway.data.PendingEventDao
import com.notica.gateway.net.ApiClient
import com.notica.gateway.net.DeviceRevokedException
import com.notica.gateway.net.UpgradeRequiredException
import com.notica.gateway.net.WireEvent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

class EventUploader(
    private val apiClient: ApiClient,
    private val credentialStore: CredentialStore,
    private val pendingEventDao: PendingEventDao,
    private val logDao: LogDao,
    private val onDeviceRevoked: (() -> Unit)? = null,
    private val scope: CoroutineScope = CoroutineScope(Dispatchers.IO)
) {
    private val mutex = Mutex()
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun flush(): Boolean = mutex.withLock {
        val creds = credentialStore.credentialsFlow.first() ?: return false
        val batch = pendingEventDao.getBatch(50)
        if (batch.isEmpty()) {
            return true
        }

        val wireEvents = batch.map { pending ->
            val parsedData: JsonElement? = pending.dataJson?.let {
                try {
                    json.parseToJsonElement(it)
                } catch (_: Exception) {
                    null
                }
            }
            WireEvent(
                eventId = pending.eventId,
                type = pending.type,
                messageId = pending.messageId,
                occurredAt = pending.occurredAt,
                data = parsedData
            )
        }

        val result = apiClient.postEvents(
            serverUrl = creds.serverUrl,
            deviceToken = creds.deviceToken,
            signingSecret = creds.signingSecret,
            events = wireEvents
        )

        return result.fold(
            onSuccess = { response ->
                val toDelete = ArrayList<String>()
                toDelete.addAll(response.accepted)
                toDelete.addAll(response.rejected.map { it.eventId })

                if (toDelete.isNotEmpty()) {
                    pendingEventDao.deleteByIds(toDelete)
                }

                // If some were not acknowledged, increment attempt count
                val allBatchIds = batch.map { it.eventId }.toSet()
                val unacked = allBatchIds - toDelete.toSet()
                if (unacked.isNotEmpty()) {
                    pendingEventDao.incrementAttempts(unacked.toList())
                }

                logDao.insert(LogEntry(message = "Uploaded ${response.accepted.size} events to server"))
                true
            },
            onFailure = { error ->
                when (error) {
                    is DeviceRevokedException -> {
                        logDao.insert(LogEntry(level = "ERROR", message = "Device revoked by server! Clearing credentials."))
                        credentialStore.clear()
                        onDeviceRevoked?.invoke()
                    }
                    is UpgradeRequiredException -> {
                        logDao.insert(LogEntry(level = "ERROR", message = "App upgrade required (426). Please update Notica Gateway."))
                    }
                    else -> {
                        logDao.insert(LogEntry(level = "WARN", message = "Failed to upload events: ${error.message}"))
                    }
                }
                false
            }
        )
    }

    fun flushAsync() {
        scope.launch {
            flush()
        }
    }
}
