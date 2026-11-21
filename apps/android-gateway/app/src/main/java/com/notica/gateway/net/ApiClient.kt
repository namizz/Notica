package com.notica.gateway.net

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

class DeviceRevokedException(message: String = "Device token revoked by server") : IOException(message)
class UpgradeRequiredException(message: String = "App upgrade required by server") : IOException(message)

class ApiClient(
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(20, TimeUnit.SECONDS)
        .addInterceptor(okhttp3.logging.HttpLoggingInterceptor { msg ->
            android.util.Log.d("NoticaHttp", msg)
        }.apply {
            level = okhttp3.logging.HttpLoggingInterceptor.Level.BODY
        })
        .build()
) {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    /**
     * One-time device pairing via pairing code.
     */
    suspend fun pair(
        serverUrl: String,
        code: String,
        devicePayload: PairDevicePayload
    ): Result<PairResponse> = withContext(Dispatchers.IO) {
        runCatching {
            val cleanUrl = serverUrl.trimEnd('/')
            val pairReq = PairRequest(code = code.trim(), device = devicePayload)
            val bodyString = json.encodeToString(pairReq)
            val request = Request.Builder()
                .url("$cleanUrl/gateway/v1/pair")
                .post(bodyString.toRequestBody(jsonMediaType))
                .header("X-Notica-Gateway-Version", RequestSigner.GATEWAY_VERSION)
                .build()

            client.newCall(request).execute().use { response ->
                val respBody = response.body?.string() ?: ""
                if (!response.isSuccessful) {
                    throw IOException("Pairing failed (${response.code}): $respBody")
                }
                json.decodeFromString<PairResponse>(respBody)
            }
        }
    }

    /**
     * Pulls queued messages as a fallback or on initial connection.
     */
    suspend fun pullPending(
        serverUrl: String,
        deviceToken: String,
        limit: Int = 50
    ): Result<List<WireMessage>> = withContext(Dispatchers.IO) {
        runCatching {
            val cleanUrl = serverUrl.trimEnd('/')
            val request = Request.Builder()
                .url("$cleanUrl/gateway/v1/messages/pending?limit=$limit")
                .get()
                .header("Authorization", "Bearer $deviceToken")
                .header("X-Notica-Gateway-Version", RequestSigner.GATEWAY_VERSION)
                .build()

            client.newCall(request).execute().use { response ->
                if (response.code == 401) throw DeviceRevokedException()
                if (response.code == 426) throw UpgradeRequiredException()
                val respBody = response.body?.string() ?: ""
                if (!response.isSuccessful) {
                    throw IOException("Pull pending failed (${response.code}): $respBody")
                }
                json.decodeFromString<MessagesResponse>(respBody).messages
            }
        }
    }

    /**
     * Reports status updates via signed webhook POST.
     */
    suspend fun postEvents(
        serverUrl: String,
        deviceToken: String,
        signingSecret: String,
        events: List<WireEvent>
    ): Result<EventsResponse> = withContext(Dispatchers.IO) {
        runCatching {
            if (events.isEmpty()) {
                return@runCatching EventsResponse()
            }
            val cleanUrl = serverUrl.trimEnd('/')
            val payload = EventsPayload(events)
            val rawBody = json.encodeToString(payload)
            val headers = RequestSigner.buildEventHeaders(deviceToken, signingSecret, rawBody)

            val reqBuilder = Request.Builder()
                .url("$cleanUrl/gateway/v1/events")
                .post(rawBody.toRequestBody(jsonMediaType))

            for ((key, value) in headers) {
                reqBuilder.header(key, value)
            }

            client.newCall(reqBuilder.build()).execute().use { response ->
                if (response.code == 401) throw DeviceRevokedException()
                if (response.code == 426) throw UpgradeRequiredException()
                val respBody = response.body?.string() ?: ""
                if (!response.isSuccessful) {
                    throw IOException("Post events failed (${response.code}): $respBody")
                }
                json.decodeFromString<EventsResponse>(respBody)
            }
        }
    }
}
