package com.notica.gateway.sms

import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.ConcurrentHashMap

class SendRateLimiter(
    private val defaultRatePerMinute: Int = 20
) {
    private val mutex = Mutex()
    private val lastSendTimes = ConcurrentHashMap<Int, Long>()

    /**
     * Suspends until a slot token becomes available according to the rate limit.
     */
    suspend fun acquire(simSlot: Int, ratePerMinute: Int = defaultRatePerMinute) {
        val minIntervalMs = (60_000L / ratePerMinute.coerceAtLeast(1))
        mutex.withLock {
            val now = System.currentTimeMillis()
            val lastTime = lastSendTimes[simSlot] ?: 0L
            val elapsed = now - lastTime
            if (elapsed < minIntervalMs) {
                val waitTime = minIntervalMs - elapsed
                delay(waitTime)
            }
            lastSendTimes[simSlot] = System.currentTimeMillis()
        }
    }
}
