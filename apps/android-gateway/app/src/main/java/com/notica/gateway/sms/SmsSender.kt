package com.notica.gateway.sms

import android.Manifest
import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.SmsManager
import androidx.core.content.ContextCompat
import com.notica.gateway.config.Settings
import com.notica.gateway.data.LogDao
import com.notica.gateway.data.LogEntry
import com.notica.gateway.data.OutgoingSms
import kotlinx.coroutines.flow.first

class SmsSender(
    private val context: Context,
    private val simInfoProvider: SimInfoProvider,
    private val rateLimiter: SendRateLimiter,
    private val settings: Settings,
    private val stateMachine: SmsStateMachine,
    private val logDao: LogDao
) {
    companion object {
        const val ACTION_SMS_SENT = "com.notica.gateway.SMS_SENT"
        const val ACTION_SMS_DELIVERED = "com.notica.gateway.SMS_DELIVERED"

        const val EXTRA_MESSAGE_ID = "extra_message_id"
        const val EXTRA_PART_INDEX = "extra_part_index"
        const val EXTRA_TOTAL_PARTS = "extra_total_parts"
        const val EXTRA_SIM_SLOT = "extra_sim_slot"
    }

    fun hasSendSmsPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.SEND_SMS
        ) == PackageManager.PERMISSION_GRANTED
    }

    @SuppressLint("UnspecifiedImmutableFlag")
    suspend fun send(message: OutgoingSms): Result<Unit> = runCatching {
        if (!hasSendSmsPermission()) {
            stateMachine.onSendFailed(message.messageId, -1, "NO_PERMISSION: SEND_SMS permission missing")
            return@runCatching
        }

        val appSettings = settings.settingsFlow.first()
        val targetSlot = message.simSlot ?: appSettings.defaultSimSlot ?: 0
        val subId = simInfoProvider.getSubscriptionIdForSlot(targetSlot)

        val smsManager: SmsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val baseManager = context.getSystemService(SmsManager::class.java)
            if (subId != null && subId >= 0) {
                baseManager.createForSubscriptionId(subId)
            } else {
                baseManager
            }
        } else {
            if (subId != null && subId >= 0) {
                SmsManager.getSmsManagerForSubscriptionId(subId)
            } else {
                @Suppress("DEPRECATION")
                SmsManager.getDefault()
            }
        }

        // Apply rate limiting per SIM
        rateLimiter.acquire(targetSlot, appSettings.rateLimitPerMinute)

        val parts: ArrayList<String> = smsManager.divideMessage(message.text)
        val sentIntents = ArrayList<PendingIntent>()
        val deliveryIntents = ArrayList<PendingIntent>()

        val wantsDelivery = message.deliveryReport && appSettings.deliveryReportsEnabled

        val piFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }

        for (i in parts.indices) {
            val sentIntent = Intent(context, SmsSentReceiver::class.java).apply {
                action = ACTION_SMS_SENT
                putExtra(EXTRA_MESSAGE_ID, message.messageId)
                putExtra(EXTRA_PART_INDEX, i)
                putExtra(EXTRA_TOTAL_PARTS, parts.size)
                putExtra(EXTRA_SIM_SLOT, targetSlot)
            }
            val sentPI = PendingIntent.getBroadcast(
                context,
                (message.messageId.hashCode() * 31) + i,
                sentIntent,
                piFlags
            )
            sentIntents.add(sentPI)

            if (wantsDelivery) {
                val delIntent = Intent(context, SmsDeliveredReceiver::class.java).apply {
                    action = ACTION_SMS_DELIVERED
                    putExtra(EXTRA_MESSAGE_ID, message.messageId)
                    putExtra(EXTRA_PART_INDEX, i)
                    putExtra(EXTRA_TOTAL_PARTS, parts.size)
                }
                val delPI = PendingIntent.getBroadcast(
                    context,
                    (message.messageId.hashCode() * 67) + i,
                    delIntent,
                    piFlags
                )
                deliveryIntents.add(delPI)
            }
        }

        try {
            android.util.Log.i("SmsSender", "Calling sendMultipartTextMessage to ${message.to} with subId $subId (${parts.size} parts)")
            smsManager.sendMultipartTextMessage(
                message.to,
                null,
                parts,
                sentIntents,
                if (wantsDelivery) deliveryIntents else null
            )
            logDao.insert(LogEntry(message = "Dispatched SMS [${message.messageId}] to radio (${parts.size} parts)"))
        } catch (e: SecurityException) {
            stateMachine.onSendFailed(message.messageId, -1, "NO_PERMISSION")
        } catch (e: IllegalArgumentException) {
            stateMachine.onSendFailed(message.messageId, -1, "INVALID_NUMBER: ${e.message}")
        } catch (e: Exception) {
            stateMachine.onSendFailed(message.messageId, -1, "GENERIC_FAILURE: ${e.message}")
        }
    }
}
