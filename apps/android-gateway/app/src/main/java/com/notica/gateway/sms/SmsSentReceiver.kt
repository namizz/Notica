package com.notica.gateway.sms

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.notica.gateway.NoticaGatewayApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class SmsSentReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pendingResult = goAsync()
        val resultCode = resultCode
        val messageId = intent.getStringExtra(SmsSender.EXTRA_MESSAGE_ID) ?: run {
            pendingResult.finish()
            return
        }
        val partIndex = intent.getIntExtra(SmsSender.EXTRA_PART_INDEX, 0)
        val totalParts = intent.getIntExtra(SmsSender.EXTRA_TOTAL_PARTS, 1)
        val simSlot = intent.getIntExtra(SmsSender.EXTRA_SIM_SLOT, 0)

        val app = context.applicationContext as? NoticaGatewayApp ?: run {
            pendingResult.finish()
            return
        }

        CoroutineScope(Dispatchers.IO).launch {
            try {
                android.util.Log.i("SmsSentReceiver", "Received SMS sent callback: resultCode=$resultCode, messageId=$messageId, part=$partIndex/$totalParts")
                if (resultCode == Activity.RESULT_OK) {
                    app.container.smsStateMachine.onPartSent(
                        messageId = messageId,
                        partIndex = partIndex,
                        totalParts = totalParts,
                        simSlot = simSlot
                    )
                } else {
                    val errorCode = intent.getIntExtra("errorCode", -1)
                    val errorDetail = when (resultCode) {
                        Activity.RESULT_CANCELED -> "Carrier rejected message (insufficient airtime/balance or carrier barring)"
                        android.telephony.SmsManager.RESULT_ERROR_RADIO_OFF -> "Radio is off (Airplane mode or no cellular connection)"
                        android.telephony.SmsManager.RESULT_ERROR_NO_SERVICE -> "No cellular service on selected SIM"
                        android.telephony.SmsManager.RESULT_ERROR_NULL_PDU -> "Null PDU received from carrier network"
                        android.telephony.SmsManager.RESULT_ERROR_LIMIT_EXCEEDED -> "Device SMS sending rate limit exceeded"
                        else -> "Send failed with result code $resultCode (errorCode: $errorCode)"
                    }
                    android.util.Log.w("SmsSentReceiver", "SMS send failed: $errorDetail")
                    app.container.smsStateMachine.onSendFailed(
                        messageId = messageId,
                        resultCode = resultCode,
                        errorMessage = errorDetail
                    )
                }
                // Immediately flush events when online
                app.container.eventUploader.flushAsync()
            } finally {
                pendingResult.finish()
            }
        }
    }
}
