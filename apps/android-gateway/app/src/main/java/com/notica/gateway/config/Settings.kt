package com.notica.gateway.config

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.settingsDataStore by preferencesDataStore(name = "notica_settings")

data class AppSettings(
    val defaultSimSlot: Int? = null,
    val rateLimitPerMinute: Int = 20, // ~1 msg every 3 seconds
    val deliveryReportsEnabled: Boolean = true,
    val autoStartOnBoot: Boolean = true
)

class Settings(private val context: Context) {
    companion object {
        private val KEY_DEFAULT_SIM = intPreferencesKey("default_sim_slot")
        private val KEY_RATE_LIMIT = intPreferencesKey("rate_limit_per_minute")
        private val KEY_DELIVERY_REPORTS = booleanPreferencesKey("delivery_reports")
        private val KEY_AUTO_START = booleanPreferencesKey("auto_start_on_boot")
    }

    val settingsFlow: Flow<AppSettings> = context.settingsDataStore.data.map { prefs ->
        AppSettings(
            defaultSimSlot = prefs[KEY_DEFAULT_SIM].takeIf { it != null && it >= 0 },
            rateLimitPerMinute = prefs[KEY_RATE_LIMIT] ?: 20,
            deliveryReportsEnabled = prefs[KEY_DELIVERY_REPORTS] ?: true,
            autoStartOnBoot = prefs[KEY_AUTO_START] ?: true
        )
    }

    suspend fun setDefaultSimSlot(slot: Int?) {
        context.settingsDataStore.edit { prefs ->
            if (slot == null || slot < 0) {
                prefs.remove(KEY_DEFAULT_SIM)
            } else {
                prefs[KEY_DEFAULT_SIM] = slot
            }
        }
    }

    suspend fun setRateLimitPerMinute(rate: Int) {
        context.settingsDataStore.edit { prefs ->
            prefs[KEY_RATE_LIMIT] = rate.coerceIn(1, 120)
        }
    }

    suspend fun setDeliveryReportsEnabled(enabled: Boolean) {
        context.settingsDataStore.edit { prefs ->
            prefs[KEY_DELIVERY_REPORTS] = enabled
        }
    }

    suspend fun setAutoStartOnBoot(enabled: Boolean) {
        context.settingsDataStore.edit { prefs ->
            prefs[KEY_AUTO_START] = enabled
        }
    }
}
