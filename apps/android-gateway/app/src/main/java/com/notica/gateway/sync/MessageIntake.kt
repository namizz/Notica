package com.notica.gateway.sync

import com.notica.gateway.data.LogDao
import com.notica.gateway.data.LogEntry
import com.notica.gateway.data.OutgoingSms
import com.notica.gateway.data.OutgoingSmsDao
import com.notica.gateway.net.WireMessage
import com.notica.gateway.sms.SmsSender
import com.notica.gateway.sms.SmsStateMachine
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

class MessageIntake(
    private val outgoingSmsDao: OutgoingSmsDao,
    private val stateMachine: SmsStateMachine,
    private val smsSender: SmsSender,
    private val logDao: LogDao,
    private val scope: CoroutineScope = CoroutineScope(Dispatchers.IO)
) {
    private val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    private fun parseIsoToEpochMs(isoStr: String): Long {
        return try {
            isoFormat.parse(isoStr)?.time ?: (System.currentTimeMillis() + 3_600_000L)
        } catch (_: Exception) {
            System.currentTimeMillis() + 3_600_000L
        }
    }

    suspend fun intakeBatch(messages: List<WireMessage>) {
        for (wire in messages) {
            intakeSingle(wire)
        }
    }

    suspend fun intakeSingle(wire: WireMessage) {
        val expiresAtMs = parseIsoToEpochMs(wire.expiresAt)
        val now = System.currentTimeMillis()

        // 1. Expiry check before inserting
        if (expiresAtMs <= now) {
            stateMachine.onExpired(wire.messageId)
            return
        }

        val entity = OutgoingSms(
            messageId = wire.messageId,
            to = wire.to,
            text = wire.text,
            simSlot = wire.simSlot,
            parts = wire.parts,
            encoding = wire.encoding,
            deliveryReport = wire.deliveryReport,
            status = OutgoingSms.STATUS_ACCEPTED,
            expiresAt = expiresAtMs
        )

        // 2. INSERT OR IGNORE
        val rowId = outgoingSmsDao.insertIgnore(entity)

        if (rowId != -1L) {
            // New message
            stateMachine.onMessageAccepted(wire.messageId)
            // Trigger send in background
            scope.launch {
                smsSender.send(entity)
            }
        } else {
            // Duplicate push: server may have re-leased before receiving ACK.
            // Re-emit latest status so server synchronizes state.
            val existing = outgoingSmsDao.get(wire.messageId) ?: return
            logDao.insert(LogEntry(message = "Duplicate message [${wire.messageId}] received, re-syncing state: ${existing.status}"))

            when (existing.status) {
                OutgoingSms.STATUS_ACCEPTED -> stateMachine.onMessageAccepted(wire.messageId)
                OutgoingSms.STATUS_SENT -> stateMachine.onPartSent(
                    wire.messageId,
                    existing.partsSent,
                    existing.parts,
                    existing.simSlot ?: 0
                )
                OutgoingSms.STATUS_DELIVERED -> stateMachine.onPartDelivered(
                    wire.messageId,
                    0,
                    existing.parts
                )
                OutgoingSms.STATUS_FAILED -> stateMachine.onSendFailed(
                    wire.messageId,
                    -1,
                    existing.errorMessage ?: existing.errorCode
                )
            }
        }
    }
}
