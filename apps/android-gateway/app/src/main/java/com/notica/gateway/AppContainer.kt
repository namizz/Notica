package com.notica.gateway

import android.content.Context
import com.notica.gateway.config.CredentialStore
import com.notica.gateway.config.Settings
import com.notica.gateway.data.AppDatabase
import com.notica.gateway.net.ApiClient
import com.notica.gateway.net.GatewaySocket
import com.notica.gateway.net.GatewaySocketListener
import com.notica.gateway.net.WireMessage
import com.notica.gateway.sms.SendRateLimiter
import com.notica.gateway.sms.SimInfoProvider
import com.notica.gateway.sms.SmsSender
import com.notica.gateway.sms.SmsStateMachine
import com.notica.gateway.sync.EventUploader
import com.notica.gateway.sync.MessageIntake
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class AppContainer(val context: Context) {
    val database: AppDatabase by lazy { AppDatabase.getInstance(context) }
    val credentialStore: CredentialStore by lazy { CredentialStore(context) }
    val settings: Settings by lazy { Settings(context) }
    val apiClient: ApiClient by lazy { ApiClient() }

    val simInfoProvider: SimInfoProvider by lazy { SimInfoProvider(context) }
    val sendRateLimiter: SendRateLimiter by lazy { SendRateLimiter() }

    val smsStateMachine: SmsStateMachine by lazy {
        SmsStateMachine(
            outgoingSmsDao = database.outgoingSmsDao(),
            pendingEventDao = database.pendingEventDao(),
            logDao = database.logDao()
        )
    }

    val smsSender: SmsSender by lazy {
        SmsSender(
            context = context,
            simInfoProvider = simInfoProvider,
            rateLimiter = sendRateLimiter,
            settings = settings,
            stateMachine = smsStateMachine,
            logDao = database.logDao()
        )
    }

    val messageIntake: MessageIntake by lazy {
        MessageIntake(
            outgoingSmsDao = database.outgoingSmsDao(),
            stateMachine = smsStateMachine,
            smsSender = smsSender,
            logDao = database.logDao()
        )
    }

    val eventUploader: EventUploader by lazy {
        EventUploader(
            apiClient = apiClient,
            credentialStore = credentialStore,
            pendingEventDao = database.pendingEventDao(),
            logDao = database.logDao(),
            onDeviceRevoked = {
                gatewaySocket.disconnect()
            }
        )
    }

    private val socketScope = CoroutineScope(Dispatchers.IO)

    val gatewaySocket: GatewaySocket by lazy {
        GatewaySocket(object : GatewaySocketListener {
            override fun onConnected() {
            }

            override fun onDisconnected(reason: String) {
            }

            override fun onConnectError(error: String) {
            }

            override fun onSmsBatchReceived(messages: List<WireMessage>) {
                socketScope.launch {
                    messageIntake.intakeBatch(messages)
                }
            }

            override fun onDeviceRevoked() {
                socketScope.launch {
                    credentialStore.clear()
                    gatewaySocket.disconnect()
                }
            }
        })
    }
}
