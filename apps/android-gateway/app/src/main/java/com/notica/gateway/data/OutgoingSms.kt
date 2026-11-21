package com.notica.gateway.data

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "outgoing_sms",
    indices = [
        Index("status"),
        Index("createdAt"),
        Index("expiresAt")
    ]
)
data class OutgoingSms(
    @PrimaryKey
    val messageId: String,
    val to: String,
    val text: String,
    val simSlot: Int? = null,
    val parts: Int = 1,
    val encoding: String = "GSM7",
    val deliveryReport: Boolean = true,
    val status: String = STATUS_ACCEPTED,
    val partsSent: Int = 0,
    val partsDelivered: Int = 0,
    val attempts: Int = 0,
    val expiresAt: Long,
    val createdAt: Long = System.currentTimeMillis(),
    val sentAt: Long? = null,
    val deliveredAt: Long? = null,
    val failedAt: Long? = null,
    val errorCode: String? = null,
    val errorMessage: String? = null
) {
    companion object {
        const val STATUS_ACCEPTED = "ACCEPTED"
        const val STATUS_SENDING = "SENDING"
        const val STATUS_SENT = "SENT"
        const val STATUS_DELIVERED = "DELIVERED"
        const val STATUS_FAILED = "FAILED"
    }
}
