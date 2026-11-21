package com.notica.gateway.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface PendingEventDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(event: PendingEvent)

    @Query("SELECT * FROM pending_events ORDER BY createdAt ASC LIMIT :limit")
    suspend fun getBatch(limit: Int = 100): List<PendingEvent>

    @Query("DELETE FROM pending_events WHERE eventId IN (:ids)")
    suspend fun deleteByIds(ids: List<String>)

    @Query("UPDATE pending_events SET attempts = attempts + 1 WHERE eventId IN (:ids)")
    suspend fun incrementAttempts(ids: List<String>)

    @Query("SELECT COUNT(*) FROM pending_events")
    suspend fun countPending(): Int
}
