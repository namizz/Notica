package com.notica.gateway.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface OutgoingSmsDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertIgnore(sms: OutgoingSms): Long

    @Query("SELECT * FROM outgoing_sms WHERE messageId = :messageId LIMIT 1")
    suspend fun get(messageId: String): OutgoingSms?

    @Query("SELECT * FROM outgoing_sms WHERE status = 'ACCEPTED' AND expiresAt > :now ORDER BY createdAt ASC LIMIT :limit")
    suspend fun getPendingToSend(now: Long, limit: Int = 50): List<OutgoingSms>

    @Update
    suspend fun update(sms: OutgoingSms)

    @Query("SELECT COUNT(*) FROM outgoing_sms WHERE createdAt >= :sinceMs AND status IN ('SENT', 'DELIVERED')")
    suspend fun countSentToday(sinceMs: Long): Int

    @Query("SELECT COUNT(*) FROM outgoing_sms WHERE status IN ('ACCEPTED', 'SENDING')")
    suspend fun countOutboxDepth(): Int

    @Query("SELECT * FROM outgoing_sms ORDER BY createdAt DESC LIMIT :limit")
    fun observeRecent(limit: Int = 50): Flow<List<OutgoingSms>>
}
