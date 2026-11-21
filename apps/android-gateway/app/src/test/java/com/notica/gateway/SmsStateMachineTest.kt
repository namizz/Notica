package com.notica.gateway

import android.app.Activity
import android.telephony.SmsManager
import com.notica.gateway.data.LogDao
import com.notica.gateway.data.OutgoingSms
import com.notica.gateway.data.OutgoingSmsDao
import com.notica.gateway.data.PendingEvent
import com.notica.gateway.data.PendingEventDao
import com.notica.gateway.sms.SmsStateMachine
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Before
import org.junit.Test

class FakeOutgoingSmsDao : OutgoingSmsDao {
    val storage = mutableMapOf<String, OutgoingSms>()

    override suspend fun insertIgnore(sms: OutgoingSms): Long {
        return if (storage.containsKey(sms.messageId)) {
            -1L
        } else {
            storage[sms.messageId] = sms
            1L
        }
    }

    override suspend fun get(messageId: String): OutgoingSms? = storage[messageId]

    override suspend fun getPendingToSend(now: Long, limit: Int): List<OutgoingSms> {
        return storage.values.filter { it.status == OutgoingSms.STATUS_ACCEPTED && it.expiresAt > now }.take(limit)
    }

    override suspend fun update(sms: OutgoingSms) {
        storage[sms.messageId] = sms
    }

    override suspend fun countSentToday(sinceMs: Long): Int {
        return storage.values.count { it.createdAt >= sinceMs && (it.status == OutgoingSms.STATUS_SENT || it.status == OutgoingSms.STATUS_DELIVERED) }
    }

    override suspend fun countOutboxDepth(): Int {
        return storage.values.count { it.status == OutgoingSms.STATUS_ACCEPTED || it.status == OutgoingSms.STATUS_SENDING }
    }

    override fun observeRecent(limit: Int): Flow<List<OutgoingSms>> = flowOf(storage.values.toList())
}

class FakePendingEventDao : PendingEventDao {
    val events = mutableListOf<PendingEvent>()

    override suspend fun insert(event: PendingEvent) {
        events.add(event)
    }

    override suspend fun getBatch(limit: Int): List<PendingEvent> = events.take(limit)

    override suspend fun deleteByIds(ids: List<String>) {
        events.removeAll { it.eventId in ids }
    }

    override suspend fun incrementAttempts(ids: List<String>) {
        // no-op for tests
    }

    override suspend fun countPending(): Int = events.size
}

class FakeLogDao : LogDao {
    override suspend fun insert(entry: com.notica.gateway.data.LogEntry) {}
    override fun observeRecent(limit: Int) = flowOf(emptyList<com.notica.gateway.data.LogEntry>())
    override suspend fun prune(beforeMs: Long) {}
}

class SmsStateMachineTest {

    private lateinit var smsDao: FakeOutgoingSmsDao
    private lateinit var eventDao: FakePendingEventDao
    private lateinit var logDao: FakeLogDao
    private lateinit var stateMachine: SmsStateMachine

    @Before
    fun setUp() {
        smsDao = FakeOutgoingSmsDao()
        eventDao = FakePendingEventDao()
        logDao = FakeLogDao()
        stateMachine = SmsStateMachine(smsDao, eventDao, logDao)
    }

    @Test
    fun mapResultCodeToErrorCodeReturnsCorrectStrings() {
        assertEquals("OK", SmsStateMachine.mapResultCodeToErrorCode(Activity.RESULT_OK))
        assertEquals("RADIO_OFF", SmsStateMachine.mapResultCodeToErrorCode(SmsManager.RESULT_ERROR_RADIO_OFF))
        assertEquals("NO_SERVICE", SmsStateMachine.mapResultCodeToErrorCode(SmsManager.RESULT_ERROR_NO_SERVICE))
        assertEquals("NULL_PDU", SmsStateMachine.mapResultCodeToErrorCode(SmsManager.RESULT_ERROR_NULL_PDU))
        assertEquals("LIMIT_EXCEEDED", SmsStateMachine.mapResultCodeToErrorCode(SmsManager.RESULT_ERROR_LIMIT_EXCEEDED))
        assertEquals("GENERIC_FAILURE", SmsStateMachine.mapResultCodeToErrorCode(999))
    }

    @Test
    fun onPartSentAggregatesMultipartAndTransitionsToSent() = runBlocking {
        val messageId = "msg-multipart-1"
        smsDao.insertIgnore(
            OutgoingSms(
                messageId = messageId,
                to = "+251911223344",
                text = "Multi-part test message",
                parts = 2,
                status = OutgoingSms.STATUS_ACCEPTED,
                expiresAt = System.currentTimeMillis() + 60000
            )
        )

        // Part 1 of 2
        stateMachine.onPartSent(messageId, partIndex = 0, totalParts = 2, simSlot = 0)
        assertEquals(OutgoingSms.STATUS_SENDING, smsDao.get(messageId)?.status)
        assertEquals(1, smsDao.get(messageId)?.partsSent)
        assertEquals(0, eventDao.events.count { it.type == "sms:sent" })

        // Part 2 of 2
        stateMachine.onPartSent(messageId, partIndex = 1, totalParts = 2, simSlot = 0)
        assertEquals(OutgoingSms.STATUS_SENT, smsDao.get(messageId)?.status)
        assertEquals(2, smsDao.get(messageId)?.partsSent)
        assertNotNull(smsDao.get(messageId)?.sentAt)
        assertEquals(1, eventDao.events.count { it.type == "sms:sent" })
    }

    @Test
    fun onPartDeliveredTransitionsToDeliveredWhenSuccessful() = runBlocking {
        val messageId = "msg-delivery-1"
        smsDao.insertIgnore(
            OutgoingSms(
                messageId = messageId,
                to = "+251911223344",
                text = "Single part",
                parts = 1,
                status = OutgoingSms.STATUS_SENT,
                expiresAt = System.currentTimeMillis() + 60000
            )
        )

        stateMachine.onPartDelivered(messageId, tpStatus = 0x00, totalParts = 1)
        assertEquals(OutgoingSms.STATUS_DELIVERED, smsDao.get(messageId)?.status)
        assertNotNull(smsDao.get(messageId)?.deliveredAt)
        assertEquals(1, eventDao.events.count { it.type == "sms:delivered" })
    }

    @Test
    fun onPartDeliveredTransitionsToFailedWhenRejected() = runBlocking {
        val messageId = "msg-delivery-fail"
        smsDao.insertIgnore(
            OutgoingSms(
                messageId = messageId,
                to = "+251911223344",
                text = "Single part",
                parts = 1,
                status = OutgoingSms.STATUS_SENT,
                expiresAt = System.currentTimeMillis() + 60000
            )
        )

        stateMachine.onPartDelivered(messageId, tpStatus = 0x42, totalParts = 1)
        assertEquals(OutgoingSms.STATUS_FAILED, smsDao.get(messageId)?.status)
        assertEquals("DELIVERY_REJECTED", smsDao.get(messageId)?.errorCode)
        assertEquals(1, eventDao.events.count { it.type == "sms:failed" })
    }

    @Test
    fun forwardOnlyPreservesDeliveredStateOnLateSent() = runBlocking {
        val messageId = "msg-late-sent"
        smsDao.insertIgnore(
            OutgoingSms(
                messageId = messageId,
                to = "+251911223344",
                text = "Late test",
                parts = 1,
                status = OutgoingSms.STATUS_DELIVERED,
                expiresAt = System.currentTimeMillis() + 60000
            )
        )

        stateMachine.onPartSent(messageId, partIndex = 0, totalParts = 1, simSlot = 0)
        assertEquals(OutgoingSms.STATUS_DELIVERED, smsDao.get(messageId)?.status)
    }
}
