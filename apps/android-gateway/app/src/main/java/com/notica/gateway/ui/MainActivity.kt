package com.notica.gateway.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.notica.gateway.NoticaGatewayApp
import com.notica.gateway.service.GatewayService
import com.notica.gateway.ui.theme.NoticaGatewayTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val app = applicationContext as NoticaGatewayApp

        setContent {
            NoticaGatewayTheme {
                val isPaired by app.container.credentialStore.isPairedFlow.collectAsState(initial = false)
                var currentScreen by remember { mutableStateOf("status") }

                if (!isPaired) {
                    PairingScreen()
                } else {
                    // Ensure service is running
                    GatewayService.start(this)

                    when (currentScreen) {
                        "settings" -> SettingsScreen(onNavigateBack = { currentScreen = "status" })
                        else -> StatusScreen(onNavigateSettings = { currentScreen = "settings" })
                    }
                }
            }
        }
    }
}
