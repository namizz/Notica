package com.notica.gateway.net

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

@Serializable
data class SimDto(
    val slot: Int,
    val subscriptionId: Int,
    val carrier: String
)

@Serializable
data class PairDevicePayload(
    val model: String,
    val androidSdk: Int,
    val appVersion: String,
    val sims: List<SimDto>
)

@Serializable
data class PairRequest(
    val code: String,
    val device: PairDevicePayload
)

@Serializable
data class PairResponse(
    val deviceId: String,
    val projectId: String,
    val deviceToken: String,
    val signingSecret: String,
    val socketUrl: String,
    val heartbeatSeconds: Int = 30,
    val pullIntervalMinutes: Int = 15
)

@Serializable
data class WireMessage(
    val messageId: String,
    val to: String,
    val text: String,
    val simSlot: Int? = null,
    val encoding: String = "GSM7",
    val parts: Int = 1,
    val deliveryReport: Boolean = true,
    val expiresAt: String
)

@Serializable
data class MessagesResponse(
    val messages: List<WireMessage> = emptyList()
)

@Serializable
data class HeartbeatPayload(
    val battery: Int,
    val charging: Boolean,
    val network: String,
    val signalLevel: Int,
    val outboxDepth: Int,
    val pendingEvents: Int
)

@Serializable
data class WireEvent(
    val eventId: String,
    val type: String,
    val messageId: String,
    val occurredAt: String,
    val data: JsonElement? = null
)

@Serializable
data class EventsPayload(
    val events: List<WireEvent>
)

@Serializable
data class RejectedEvent(
    val eventId: String,
    val reason: String
)

@Serializable
data class EventsResponse(
    val accepted: List<String> = emptyList(),
    val rejected: List<RejectedEvent> = emptyList()
)
