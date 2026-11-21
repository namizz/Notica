package com.notica.gateway.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.notica.gateway.NoticaGatewayApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) {
            return
        }

        val app = context.applicationContext as? NoticaGatewayApp ?: return
        val pendingResult = goAsync()

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val isPaired = app.container.credentialStore.isPairedFlow.first()
                val autoStart = app.container.settings.settingsFlow.first().autoStartOnBoot
                if (isPaired && autoStart) {
                    GatewayService.start(context)
                }
            } finally {
                pendingResult.finish()
            }
        }
    }
}
