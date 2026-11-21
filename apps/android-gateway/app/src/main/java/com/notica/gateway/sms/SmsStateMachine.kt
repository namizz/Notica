package com.notica.gateway.sms

import android.app.Activity
import android.telephony.SmsManager
import com.notica.gateway.data.LogDao
import com.notica.gateway.data.LogEntry
import com.notica.gateway.data.OutgoingSms
import com.notica.gateway.data.OutgoingSmsDao
import com.notica.gateway.data.PendingEvent
import com.notica.gateway.data.PendingEventDao
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

class SmsStateMachine(
    private val outgoingSmsDao: OutgoingSmsDao,
    private val pendingEventDao: PendingEventDao,
    private val logDao: LogDao
) {
    private val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    private fun nowIso(): String = isoFormat.format(Date())

    suspend fun onMessageAccepted(messageId: String) {
        val event = PendingEvent(
            eventId = UUID.randomUUID().toString(),
            type = "sms:accepted",
            messageId = messageId,
            occurredAt = nowIso(),
            dataJson = null
        )
        pendingEventDao.insert(event)
        logDao.insert(LogEntry(message = "SMS [$messageId] accepted"))
    }

    suspend fun onPartSent(messageId: String, partIndex: Int, totalParts: Int, simSlot: Int) {
        val existing = outgoingSmsDao.get(messageId) ?: return

        // Forward-only state transition: ignore late sent if already delivered
        if (existing.status == OutgoingSms.STATUS_DELIVERED) {
            return
        }

        val newPartsSent = existing.partsSent + 1
        if (newPartsSent >= totalParts) {
            val updated = existing.copy(
                status = OutgoingSms.STATUS_SENT,
                partsSent = newPartsSent,
                sentAt = System.currentTimeMillis()
            )
            outgoingSmsDao.update(updated)

            val data = buildJsonObject {
                put("partsSent", totalParts)
                put("simSlot", simSlot)
            }.toString()

            val event = PendingEvent(
                eventId = UUID.randomUUID().toString(),
                type = "sms:sent",
                messageId = messageId,
                occurredAt = nowIso(),
                dataJson = data
            )
            pendingEventDao.insert(event)
            logDao.insert(LogEntry(message = "SMS [$messageId] sent via SIM slot $simSlot ($totalParts parts)"))
        } else {
            outgoingSmsDao.update(existing.copy(partsSent = newPartsSent, status = OutgoingSms.STATUS_SENDING))
        }
    }

    suspend fun onSendFailed(messageId: String, resultCode: Int, errorMessage: String? = null) {
        val existing = outgoingSmsDao.get(messageId) ?: return

        // Forward-only: don't override already successful states
        if (existing.status == OutgoingSms.STATUS_SENT || existing.status == OutgoingSms.STATUS_DELIVERED) {
            return
        }

        val code = mapResultCodeToErrorCode(resultCode)
        val msg = errorMessage ?: "Send failed with result code $resultCode"

        val updated = existing.copy(
            status = OutgoingSms.STATUS_FAILED,
            failedAt = System.currentTimeMillis(),
            errorCode = code,
            errorMessage = msg
        )
        outgoingSmsDao.update(updated)

        val data = buildJsonObject {
            put("stage", "send")
            put("errorCode", code)
            put("errorMessage", msg)
        }.toString()

        val event = PendingEvent(
            eventId = UUID.randomUUID().toString(),
            type = "sms:failed",
            messageId = messageId,
            occurredAt = nowIso(),
            dataJson = data
        )
        pendingEventDao.insert(event)
        logDao.insert(LogEntry(level = "WARN", message = "SMS [$messageId] failed: $code - $msg"))
    }

    suspend fun onPartDelivered(messageId: String, tpStatus: Int, totalParts: Int) {
        val existing = outgoingSmsDao.get(messageId) ?: return

        // 0x00 - 0x1F: Successful delivery
        if (tpStatus in 0x00..0x1F) {
            val newPartsDelivered = existing.partsDelivered + 1
            if (newPartsDelivered >= totalParts) {
                val updated = existing.copy(
                    status = OutgoingSms.STATUS_DELIVERED,
                    partsDelivered = newPartsDelivered,
                    deliveredAt = System.currentTimeMillis()
                )
                outgoingSmsDao.update(updated)

                val data = buildJsonObject {
                    put("tpStatus", tpStatus)
                }.toString()

                val event = PendingEvent(
                    eventId = UUID.randomUUID().toString(),
                    type = "sms:delivered",
                    messageId = messageId,
                    occurredAt = nowIso(),
                    dataJson = data
                )
                pendingEventDao.insert(event)
                logDao.insert(LogEntry(message = "SMS [$messageId] delivered (TP-Status: 0x${tpStatus.toString(16)})"))
            } else {
                outgoingSmsDao.update(existing.copy(partsDelivered = newPartsDelivered))
            }
        } else if (tpStatus in 0x20..0x3F) {
            // Transient pending attempt: ignore
        } else {
            // >= 0x40: Permanent delivery rejection
            val code = "DELIVERY_REJECTED"
            val msg = "Delivery rejected by carrier with TP-Status 0x${tpStatus.toString(16)}"

            val updated = existing.copy(
                status = OutgoingSms.STATUS_FAILED,
                failedAt = System.currentTimeMillis(),
                errorCode = code,
                errorMessage = msg
            )
            outgoingSmsDao.update(updated)

            val data = buildJsonObject {
                put("stage", "delivery")
                put("errorCode", code)
                put("errorMessage", msg)
            }.toString()

            val event = PendingEvent(
                eventId = UUID.randomUUID().toString(),
                type = "sms:failed",
                messageId = messageId,
                occurredAt = nowIso(),
                dataJson = data
            )
            pendingEventDao.insert(event)
            logDao.insert(LogEntry(level = "WARN", message = "SMS [$messageId] delivery rejected: 0x${tpStatus.toString(16)}"))
        }
    }

    suspend fun onExpired(messageId: String) {
        val existing = outgoingSmsDao.get(messageId) ?: return
        if (existing.status == OutgoingSms.STATUS_SENT || existing.status == OutgoingSms.STATUS_DELIVERED) {
            return
        }

        val code = "EXPIRED"
        val msg = "Message expired before dispatch"

        val updated = existing.copy(
            status = OutgoingSms.STATUS_FAILED,
            failedAt = System.currentTimeMillis(),
            errorCode = code,
            errorMessage = msg
        )
        outgoingSmsDao.update(updated)

        val data = buildJsonObject {
            put("stage", "send")
            put("errorCode", code)
            put("errorMessage", msg)
        }.toString()

        val event = PendingEvent(
            eventId = UUID.randomUUID().toString(),
            type = "sms:failed",
            messageId = messageId,
            occurredAt = nowIso(),
            dataJson = data
        )
        pendingEventDao.insert(event)
        logDao.insert(LogEntry(level = "WARN", message = "SMS [$messageId] expired"))
    }

    companion object {
        fun mapResultCodeToErrorCode(resultCode: Int): String {
            return when (resultCode) {
                Activity.RESULT_OK -> "OK"
                Activity.RESULT_CANCELED -> "CARRIER_REJECTED"
                SmsManager.RESULT_ERROR_RADIO_OFF -> "RADIO_OFF"
                SmsManager.RESULT_ERROR_NO_SERVICE -> "NO_SERVICE"
                SmsManager.RESULT_ERROR_NULL_PDU -> "NULL_PDU"
                SmsManager.RESULT_ERROR_LIMIT_EXCEEDED -> "LIMIT_EXCEEDED"
                else -> "GENERIC_FAILURE"
            }
        }
    }
}
