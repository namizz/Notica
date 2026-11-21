package com.notica.gateway.sms

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.SubscriptionInfo
import android.telephony.SubscriptionManager
import androidx.core.content.ContextCompat
import com.notica.gateway.net.SimDto

class SimInfoProvider(private val context: Context) {

    fun hasPhoneStatePermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.READ_PHONE_STATE
        ) == PackageManager.PERMISSION_GRANTED
    }

    @SuppressLint("MissingPermission")
    fun getActiveSims(): List<SimDto> {
        if (!hasPhoneStatePermission()) {
            return emptyList()
        }

        val subscriptionManager = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE)
                as? SubscriptionManager ?: return emptyList()

        val activeList: List<SubscriptionInfo>? = try {
            subscriptionManager.activeSubscriptionInfoList
        } catch (_: Exception) {
            emptyList()
        }
        if (activeList.isNullOrEmpty()) {
            return emptyList()
        }

        return activeList.filter { it.simSlotIndex >= 0 }.map { info ->
            val slot = info.simSlotIndex
            val subId = info.subscriptionId
            val carrier = info.carrierName?.toString()
                ?: info.displayName?.toString()
                ?: "SIM ${slot + 1}"

            SimDto(
                slot = slot,
                subscriptionId = subId,
                carrier = carrier
            )
        }
    }

    @SuppressLint("MissingPermission")
    fun getSubscriptionIdForSlot(slot: Int?): Int? {
        if (slot == null || slot < 0) {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                SubscriptionManager.getDefaultSmsSubscriptionId()
            } else {
                null
            }
        }

        val sims = getActiveSims()
        return sims.find { it.slot == slot }?.subscriptionId
            ?: if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                SubscriptionManager.getDefaultSmsSubscriptionId()
            } else {
                null
            }
    }
}
