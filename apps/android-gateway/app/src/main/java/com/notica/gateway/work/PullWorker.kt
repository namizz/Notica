package com.notica.gateway.work

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.notica.gateway.NoticaGatewayApp
import kotlinx.coroutines.flow.first
import java.util.concurrent.TimeUnit

class PullWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val app = applicationContext as? NoticaGatewayApp ?: return Result.failure()
        val creds = app.container.credentialStore.credentialsFlow.first() ?: return Result.success()

        val pullResult = app.container.apiClient.pullPending(
            serverUrl = creds.serverUrl,
            deviceToken = creds.deviceToken,
            limit = 50
        )

        pullResult.onSuccess { messages ->
            if (messages.isNotEmpty()) {
                app.container.messageIntake.intakeBatch(messages)
            }
        }

        app.container.eventUploader.flush()
        return Result.success()
    }

    companion object {
        private const val WORK_NAME = "NoticaGatewayPeriodicPull"

        fun schedule(context: Context, intervalMinutes: Long = 15) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = PeriodicWorkRequestBuilder<PullWorker>(
                intervalMinutes,
                TimeUnit.MINUTES
            )
                .setConstraints(constraints)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request
            )
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
        }
    }
}
