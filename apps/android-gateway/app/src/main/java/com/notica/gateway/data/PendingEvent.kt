package com.notica.gateway.data

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "pending_events",
    indices = [
        Index("createdAt"),
        Index("messageId")
    ]
)
data class PendingEvent(
    @PrimaryKey
    val eventId: String,
    val type: String,
    val messageId: String,
    val occurredAt: String,
    val dataJson: String? = null,
    val attempts: Int = 0,
    val createdAt: Long = System.currentTimeMillis()
)
