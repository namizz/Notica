package com.notica.gateway.net

import java.nio.charset.StandardCharsets
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

object RequestSigner {
    const val GATEWAY_VERSION = "1.0.0"

    /**
     * Signs a request body according to Notica Gateway Protocol v1:
     * v1=<hex HMAC-SHA256(secret, timestampSeconds + "." + rawBody)>
     */
    fun sign(secret: String, timestampSeconds: Long, rawBody: String): String {
        val payload = "$timestampSeconds.$rawBody"
        val mac = Mac.getInstance("HmacSHA256")
        val keySpec = SecretKeySpec(secret.toByteArray(StandardCharsets.UTF_8), "HmacSHA256")
        mac.init(keySpec)
        val hash = mac.doFinal(payload.toByteArray(StandardCharsets.UTF_8))
        return "v1=" + hash.joinToString("") { "%02x".format(it) }
    }

    /**
     * Generates all required HTTP headers for status event submission.
     */
    fun buildEventHeaders(
        deviceToken: String,
        signingSecret: String,
        rawBody: String,
        timestampSeconds: Long = System.currentTimeMillis() / 1000
    ): Map<String, String> {
        val signature = sign(signingSecret, timestampSeconds, rawBody)
        return mapOf(
            "Authorization" to "Bearer $deviceToken",
            "X-Notica-Timestamp" to timestampSeconds.toString(),
            "X-Notica-Signature" to signature,
            "X-Notica-Gateway-Version" to GATEWAY_VERSION,
            "Content-Type" to "application/json"
        )
    }
}
