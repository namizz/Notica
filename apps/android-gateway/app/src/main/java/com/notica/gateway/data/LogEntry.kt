package com.notica.gateway.data

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.PrimaryKey
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "local_logs")
data class LogEntry(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val timestamp: Long = System.currentTimeMillis(),
    val level: String = "INFO",
    val message: String
)

@Dao
interface LogDao {
    @Insert
    suspend fun insert(entry: LogEntry)

    @Query("SELECT * FROM local_logs ORDER BY id DESC LIMIT :limit")
    fun observeRecent(limit: Int = 200): Flow<List<LogEntry>>

    @Query("DELETE FROM local_logs WHERE timestamp < :beforeMs")
    suspend fun prune(beforeMs: Long)
}
