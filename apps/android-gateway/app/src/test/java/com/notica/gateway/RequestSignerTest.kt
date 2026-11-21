package com.notica.gateway

import com.notica.gateway.net.RequestSigner
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RequestSignerTest {

    @Test
    fun matchesSharedTestVector() {
        val secret = "ngws_test_secret"
        val timestamp = 1763546400L
        val body = "{\"events\":[]}"
        val expected = "v1=c9b4ad15d1e987dbd3baf516a5aff82622d44f243165b743d4dbe3e995706e43"

        val signature = RequestSigner.sign(secret, timestamp, body)
        assertEquals(expected, signature)
    }

    @Test
    fun buildsCorrectHeaders() {
        val secret = "ngws_test_secret"
        val token = "ngw_live_test_token"
        val timestamp = 1763546400L
        val body = "{\"events\":[]}"

        val headers = RequestSigner.buildEventHeaders(
            deviceToken = token,
            signingSecret = secret,
            rawBody = body,
            timestampSeconds = timestamp
        )

        assertEquals("Bearer ngw_live_test_token", headers["Authorization"])
        assertEquals("1763546400", headers["X-Notica-Timestamp"])
        assertEquals("v1=c9b4ad15d1e987dbd3baf516a5aff82622d44f243165b743d4dbe3e995706e43", headers["X-Notica-Signature"])
        assertEquals("1.0.0", headers["X-Notica-Gateway-Version"])
        assertEquals("application/json", headers["Content-Type"])
    }

    @Test
    fun signatureChangesWhenBodyAltered() {
        val secret = "ngws_test_secret"
        val timestamp = 1763546400L
        val sig1 = RequestSigner.sign(secret, timestamp, "{\"events\":[]}")
        val sig2 = RequestSigner.sign(secret, timestamp, "{\"events\":[1]}")

        assertTrue(sig1 != sig2)
    }
}
