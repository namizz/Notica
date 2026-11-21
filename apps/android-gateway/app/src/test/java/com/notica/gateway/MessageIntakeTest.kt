package com.notica.gateway

import com.notica.gateway.data.OutgoingSms
import com.notica.gateway.net.WireMessage
import com.notica.gateway.sms.SmsSender
import com.notica.gateway.sms.SmsStateMachine
import com.notica.gateway.sync.MessageIntake
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Before
import org.junit.Test
import org.mockito.Mockito.mock

class MessageIntakeTest {

    private lateinit var smsDao: FakeOutgoingSmsDao
    private lateinit var eventDao: FakePendingEventDao
    private lateinit var logDao: FakeLogDao
    private lateinit var stateMachine: SmsStateMachine
    private lateinit var smsSender: SmsSender
    private lateinit var messageIntake: MessageIntake

    @Before
    fun setUp() {
        smsDao = FakeOutgoingSmsDao()
        eventDao = FakePendingEventDao()
        logDao = FakeLogDao()
        stateMachine = SmsStateMachine(smsDao, eventDao, logDao)
        smsSender = mock(SmsSender::class.java)
        messageIntake = MessageIntake(
            outgoingSmsDao = smsDao,
            stateMachine = stateMachine,
            smsSender = smsSender,
            logDao = logDao,
            scope = CoroutineScope(Dispatchers.Unconfined)
        )
    }

    @Test
    fun intakeExpiredMessageMarksFailedExpired() = runBlocking {
        val expiredWire = WireMessage(
            messageId = "expired-123",
            to = "+251911000000",
            text = "Expired test",
            expiresAt = "2020-01-01T00:00:00Z" // far in the past
        )

        // Insert first to allow state machine to update it
        smsDao.insertIgnore(
            OutgoingSms(
                messageId = "expired-123",
                to = "+251911000000",
                text = "Expired test",
                expiresAt = 0L
            )
        )

        messageIntake.intakeSingle(expiredWire)

        val stored = smsDao.get("expired-123")
        assertEquals(OutgoingSms.STATUS_FAILED, stored?.status)
        assertEquals("EXPIRED", stored?.errorCode)
        assertEquals(1, eventDao.events.count { it.type == "sms:failed" })
    }

    @Test
    fun intakeNewValidMessageAcceptsAndEnqueues() = runBlocking {
        val validWire = WireMessage(
            messageId = "new-valid-456",
            to = "+251911000000",
            text = "Hello world",
            expiresAt = "2030-01-01T00:00:00Z"
        )

        messageIntake.intakeSingle(validWire)

        val stored = smsDao.get("new-valid-456")
        assertNotNull(stored)
        assertEquals(OutgoingSms.STATUS_ACCEPTED, stored?.status)
        assertEquals(1, eventDao.events.count { it.type == "sms:accepted" })
    }

    @Test
    fun intakeDuplicateMessageReEmitsCurrentState() = runBlocking {
        val wire = WireMessage(
            messageId = "duplicate-789",
            to = "+251911000000",
            text = "Duplicate check",
            expiresAt = "2030-01-01T00:00:00Z"
        )

        // Pre-insert as SENT
        smsDao.insertIgnore(
            OutgoingSms(
                messageId = "duplicate-789",
                to = "+251911000000",
                text = "Duplicate check",
                parts = 1,
                partsSent = 1,
                status = OutgoingSms.STATUS_SENT,
                expiresAt = System.currentTimeMillis() + 60000
            )
        )

        messageIntake.intakeSingle(wire)

        // Should re-emit sent event for server catch-up
        assertEquals(1, eventDao.events.count { it.type == "sms:sent" })
    }
}
