package com.notica.gateway.config

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private val Context.credentialDataStore by preferencesDataStore(name = "notica_credentials")

data class Credentials(
    val serverUrl: String,
    val deviceId: String,
    val projectId: String,
    val deviceToken: String,
    val signingSecret: String,
    val socketUrl: String
)

class CredentialStore(private val context: Context) {
    private val keyAlias = "NoticaGatewaySecretKey"
    private val transformation = "AES/GCM/NoPadding"
    private val gcmTagLength = 128
    private val ivLength = 12

    companion object {
        private val KEY_SERVER_URL = stringPreferencesKey("server_url")
        private val KEY_DEVICE_ID = stringPreferencesKey("device_id")
        private val KEY_PROJECT_ID = stringPreferencesKey("project_id")
        private val KEY_SOCKET_URL = stringPreferencesKey("socket_url")
        private val KEY_ENC_TOKEN = stringPreferencesKey("enc_token")
        private val KEY_ENC_SECRET = stringPreferencesKey("enc_secret")
    }

    init {
        ensureKey()
    }

    private fun ensureKey() {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (!keyStore.containsAlias(keyAlias)) {
            val keyGenerator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES,
                "AndroidKeyStore"
            )
            val spec = KeyGenParameterSpec.Builder(
                keyAlias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
            keyGenerator.init(spec)
            keyGenerator.generateKey()
        }
    }

    private fun getSecretKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        return keyStore.getKey(keyAlias, null) as SecretKey
    }

    private fun encrypt(plainText: String): String {
        val cipher = Cipher.getInstance(transformation)
        cipher.init(Cipher.ENCRYPT_MODE, getSecretKey())
        val iv = cipher.iv
        val cipherText = cipher.doFinal(plainText.toByteArray(Charsets.UTF_8))
        val combined = ByteArray(iv.size + cipherText.size)
        System.arraycopy(iv, 0, combined, 0, iv.size)
        System.arraycopy(cipherText, 0, combined, iv.size, cipherText.size)
        return Base64.encodeToString(combined, Base64.NO_WRAP)
    }

    private fun decrypt(encryptedBase64: String): String {
        val combined = Base64.decode(encryptedBase64, Base64.NO_WRAP)
        val iv = ByteArray(ivLength)
        val cipherText = ByteArray(combined.size - ivLength)
        System.arraycopy(combined, 0, iv, 0, ivLength)
        System.arraycopy(combined, ivLength, cipherText, 0, cipherText.size)

        val cipher = Cipher.getInstance(transformation)
        val spec = GCMParameterSpec(gcmTagLength, iv)
        cipher.init(Cipher.DECRYPT_MODE, getSecretKey(), spec)
        val plainBytes = cipher.doFinal(cipherText)
        return String(plainBytes, Charsets.UTF_8)
    }

    val credentialsFlow: Flow<Credentials?> = context.credentialDataStore.data.map { prefs ->
        val serverUrl = prefs[KEY_SERVER_URL]
        val deviceId = prefs[KEY_DEVICE_ID]
        val projectId = prefs[KEY_PROJECT_ID]
        val socketUrl = prefs[KEY_SOCKET_URL]
        val encToken = prefs[KEY_ENC_TOKEN]
        val encSecret = prefs[KEY_ENC_SECRET]

        if (serverUrl != null && deviceId != null && projectId != null &&
            socketUrl != null && encToken != null && encSecret != null
        ) {
            try {
                Credentials(
                    serverUrl = serverUrl,
                    deviceId = deviceId,
                    projectId = projectId,
                    deviceToken = decrypt(encToken),
                    signingSecret = decrypt(encSecret),
                    socketUrl = socketUrl
                )
            } catch (_: Exception) {
                null
            }
        } else {
            null
        }
    }

    val isPairedFlow: Flow<Boolean> = credentialsFlow.map { it != null }

    suspend fun saveCredentials(creds: Credentials) {
        val encToken = encrypt(creds.deviceToken)
        val encSecret = encrypt(creds.signingSecret)

        context.credentialDataStore.edit { prefs ->
            prefs[KEY_SERVER_URL] = creds.serverUrl
            prefs[KEY_DEVICE_ID] = creds.deviceId
            prefs[KEY_PROJECT_ID] = creds.projectId
            prefs[KEY_SOCKET_URL] = creds.socketUrl
            prefs[KEY_ENC_TOKEN] = encToken
            prefs[KEY_ENC_SECRET] = encSecret
        }
    }

    suspend fun clear() {
        context.credentialDataStore.edit { it.clear() }
    }
}
