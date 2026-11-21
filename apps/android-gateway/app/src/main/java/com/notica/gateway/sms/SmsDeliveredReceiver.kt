package com.notica.gateway.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.telephony.SmsMessage
import com.notica.gateway.NoticaGatewayApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class SmsDeliveredReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pendingResult = goAsync()
        val messageId = intent.getStringExtra(SmsSender.EXTRA_MESSAGE_ID) ?: run {
            pendingResult.finish()
            return
        }
        val totalParts = intent.getIntExtra(SmsSender.EXTRA_TOTAL_PARTS, 1)

        val app = context.applicationContext as? NoticaGatewayApp ?: run {
            pendingResult.finish()
            return
        }

        val pdu = intent.getByteArrayExtra("pdu")
        val format = intent.getStringExtra("format")

        val tpStatus = if (pdu != null) {
            try {
                val sms = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    SmsMessage.createFromPdu(pdu, format)
                } else {
                    @Suppress("DEPRECATION")
                    SmsMessage.createFromPdu(pdu)
                }
                sms.status
            } catch (_: Exception) {
                0 // fallback to success if status cannot be parsed
            }
        } else {
            0
        }

        CoroutineScope(Dispatchers.IO).launch {
            try {
                app.container.smsStateMachine.onPartDelivered(
                    messageId = messageId,
                    tpStatus = tpStatus,
                    totalParts = totalParts
                )
                app.container.eventUploader.flushAsync()
            } finally {
                pendingResult.finish()
            }
        }
    }
}
