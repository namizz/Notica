# Notica SMS Gateway for Android

Official Android gateway application for the **Notica** notification infrastructure. Connects Android devices (single and dual-SIM) to Notica over WebSocket and signed HTTPS webhooks to relay automated SMS messages via physical cellular SIMs.

---

## Features

- **Decoupled Gateway Protocol (v1)**: Phone initiates outbound WebSocket connection (`/gateway`) and pushes status webhooks with HMAC-SHA256 signatures (`POST /gateway/v1/events`).
- **Real-Time Dispatch**: Near instantaneous message delivery when connected via WebSocket, with an automated 15-minute WorkManager fallback pull (`GET /gateway/v1/messages/pending`).
- **Foreground Service**: Runs as an ongoing foreground service with Android type `specialUse` (`sms_gateway` subtype), ensuring high reliability even during screen-off and deep sleep.
- **Dual SIM Support**: Automatically detects active SIMs and carriers via `SubscriptionManager`, allowing dynamic per-message or default SIM routing.
- **At-Least-Once Delivery, Exactly-Once Radio**: Local SQLite Room database uses `messageId` as primary key to prevent duplicate cellular transmissions.
- **Full Carrier Lifecycle**: Real-time tracking through `ACCEPTED` → `SENT` (base station ACK) → `DELIVERED` (PDU TP-Status confirmation) → `FAILED`.
- **QR Pairing**: 1-tap onboarding via QR code scanner or manual Crockford-Base32 pairing code.
- **Keystore Encryption**: Device tokens and derived HMAC signing secrets are encrypted with hardware-backed AES-256-GCM in Android Keystore.

---

## Requirements

- **Android Device**: Android 8.0 (API level 26) or higher.
- **Permissions**:
  - `SEND_SMS`: Required to transmit messages via cellular radio.
  - `READ_PHONE_STATE`: Required to detect dual-SIM cards and subscription IDs.
  - `CAMERA`: Required to scan pairing QR codes.
  - `POST_NOTIFICATIONS` (Android 13+): Required for foreground service persistence.
  - `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`: Whitelisting from battery restrictions.

---

## Android OS SMS Rate Limit (IMPORTANT)

By default, Android's `SmsUsageMonitor` restricts third-party applications to **30 SMS messages every 30 minutes**. If exceeded, the OS displays an interactive confirmation dialog or rejects sends with `LIMIT_EXCEEDED`.

For an automated gateway phone, raise this system limit once over USB with ADB:

```bash
# Set limit to 10,000 SMS per minute
adb shell settings put global sms_outgoing_check_max_count 10000
adb shell settings put global sms_outgoing_check_interval_ms 60000
```

Verify the values:
```bash
adb shell settings get global sms_outgoing_check_max_count
adb shell settings get global sms_outgoing_check_interval_ms
```

---

## Battery Optimization

OEM task killers (Samsung, Xiaomi, Huawei, etc.) aggressively terminate background processes. To ensure uninterrupted operation:

1. In the app Settings screen, tap **Disable Battery Restrictions**.
2. Whitelist **Notica Gateway** in your device's battery settings (set to "Unrestricted" or "Never sleeping").
3. For manufacturer-specific instructions, consult [dontkillmyapp.com](https://dontkillmyapp.com).

---

## Building and Testing

### 1. Build Requirements
- Java 21 (JDK / Android Studio JBR).
- Android SDK platforms 31–35.

### 2. Run JVM Unit Tests
From the `apps/android-gateway` directory:
```bash
.\gradlew.bat testDebugUnitTest
```
Tests include:
- `RequestSignerTest`: Validates HMAC-SHA256 signature against the shared test vector with the backend API.
- `SmsStateMachineTest`: Verifies multi-part concatenation, carrier TP-Status range mapping, and forward-only state progression.
- `MessageIntakeTest`: Validates deduplication and expiry rejection.

### 3. Assemble Debug APK
```bash
.\gradlew.bat assembleDebug
```
The output APK is generated at:
`app/build/outputs/apk/debug/app-debug.apk`

### 4. Install on Device
```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

---

## Pairing with Notica

1. Open the Notica Web Dashboard: `/dashboard/gateways`.
2. Click **Add Gateway Device** and enter a name (e.g., "Office Pixel 7").
3. Launch **Notica Gateway** on the phone.
4. Tap **Scan Pairing QR Code** and scan the QR displayed on the dashboard.
5. The device pairs immediately, saves hardware-encrypted credentials, and connects to the realtime socket.
