package com.notica.gateway.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [
        OutgoingSms::class,
        PendingEvent::class,
        LogEntry::class
    ],
    version = 1,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun outgoingSmsDao(): OutgoingSmsDao
    abstract fun pendingEventDao(): PendingEventDao
    abstract fun logDao(): LogDao

    companion object {
        @Volatile
        private var instance: AppDatabase? = null

        fun getInstance(context: Context): AppDatabase {
            return instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "notica_gateway.db"
                ).fallbackToDestructiveMigration().build().also { instance = it }
            }
        }
    }
}
