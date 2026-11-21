# Notica SMS Gateway Wire Protocol (v1)

This document specifies the wire contract between Notica and the Android Gateway app (or any compatible gateway client).

All HTTP paths are versioned under `/gateway/v1` with JSON bodies. The app sends `X-Notica-Gateway-Version: 1.0.0`, and the server returns `426 Upgrade Required` if the major protocol version does not match.

---

## 1. Overview of Endpoints and Sockets

| Direction | Transport | Path / Event | Purpose | Authentication |
|---|---|---|---|---|
| Notica → phone | WebSocket (socket.io) | Namespace `/gateway`<br>Event: `sms:send`, `gateway:revoked` | Push outbound SMS batches to phone | `auth.token` = long-lived device token |
| Phone → Notica | WebSocket (socket.io) | Namespace `/gateway`<br>Event: `gateway:heartbeat` | Health, battery, SIM status | Socket session |
| Phone → Notica | HTTP POST | `/gateway/v1/pair` | One-time pairing with code | One-time pairing code |
| Phone → Notica | HTTP GET | `/gateway/v1/me` | Fetch device metadata and settings | Bearer token |
| Phone → Notica | HTTP GET | `/gateway/v1/messages/pending?limit=50` | Pull queued messages (socket fallback) | Bearer token |
| Phone → Notica | HTTP POST | `/gateway/v1/events` | Report status webhooks (accepted, sent, etc.) | Bearer token + HMAC-SHA256 signature |

---

## 2. Pairing Flow

1. **Dashboard User generates a code**:
   `POST /projects/:projectId/gateway-devices` with body `{ "name": "Office Pixel" }`.
   Response includes:
   ```json
   {
     "id": "8c1f93a1-...",
     "name": "Office Pixel",
     "pairingCode": "K7PQ-2XMD",
     "pairingExpiresAt": "2026-11-19T10:10:00.000Z",
     "qr": "notica-gw://pair?server=https://api.notica.app&code=K7PQ-2XMD"
   }
   ```
   The code is 8 Crockford Base32 characters, single-use, valid for 10 minutes, stored as SHA-256 hash.

2. **Phone sends pairing request**:
   `POST /gateway/v1/pair`:
   ```json
   {
     "code": "K7PQ-2XMD",
     "device": {
       "model": "Pixel 7",
       "androidSdk": 34,
       "appVersion": "1.0.0",
       "sims": [
         { "slot": 0, "subscriptionId": 1, "carrier": "Safaricom" },
         { "slot": 1, "subscriptionId": 2, "carrier": "Ethio telecom" }
       ]
     }
   }
   ```

3. **Server response (shown once)**:
   ```json
   {
     "deviceId": "8c1f93a1-...",
     "projectId": "project-uuid-...",
     "deviceToken": "ngw_live_...",
     "signingSecret": "ngws_...",
     "socketUrl": "https://api.notica.app/gateway",
     "heartbeatSeconds": 30,
     "pullIntervalMinutes": 15
   }
   ```
   - `deviceToken`: 32 random bytes base64url. The database stores only its SHA-256 hash (`tokenHash`).
   - `signingSecret`: `ngws_` + base64url(`HMAC-SHA256(GATEWAY_SIGNING_KEY, deviceId)`). It is derived on demand and never stored in plain text.

---

## 3. Realtime Push: `sms:send`

The gateway app connects to socket.io:
```ts
const socket = io("https://api.notica.app/gateway", {
  auth: { token: deviceToken },
  transports: ["websocket"]
});
```

When connected:
- The server validates the token, joins room `gw:device:<deviceId>`, sets presence key in Redis with 90s TTL.
- Outbound messages are leased and pushed via event `sms:send`:

```json
{
  "messages": [
    {
      "messageId": "3b8e192a-...",
      "to": "+251911234567",
      "text": "Your verification code is 482913",
      "simSlot": 0,
      "encoding": "GSM7",
      "parts": 1,
      "deliveryReport": true,
      "expiresAt": "2026-11-19T11:00:00Z"
    }
  ]
}
```

### Heartbeat
Every 30 seconds, the phone emits `gateway:heartbeat`:
```json
{
  "battery": 88,
  "charging": true,
  "network": "wifi",
  "signalLevel": 4,
  "outboxDepth": 0,
  "pendingEvents": 0
}
```

---

## 4. Fallback Pull: `GET /gateway/v1/messages/pending`

When the socket is disconnected or periodic WorkManager runs:
`GET /gateway/v1/messages/pending?limit=50`
Headers:
`Authorization: Bearer <deviceToken>`

Response:
```json
{
  "messages": [ ... ]
}
```

---

## 5. Status Reporting: `POST /gateway/v1/events`

The app reports status updates with signed POST requests:

### Request Headers
```http
Authorization: Bearer ngw_live_...
X-Notica-Timestamp: 1763546400
X-Notica-Signature: v1=<hex HMAC-SHA256(signingSecret, timestamp + "." + rawBody)>
X-Notica-Gateway-Version: 1.0.0
Content-Type: application/json
```

- Timestamp must be within ±300s of server clock.
- Test vector:
  - `signingSecret`: `ngws_test_secret`
  - `X-Notica-Timestamp`: `1763546400`
  - Raw body: `{"events":[]}`
  - `X-Notica-Signature`: `v1=c9b4ad15d1e987dbd3baf516a5aff82622d44f243165b743d4dbe3e995706e43`

### Request Body
```json
{
  "events": [
    {
      "eventId": "5b0e-uuid-...",
      "type": "sms:accepted",
      "messageId": "3b8e-uuid-...",
      "occurredAt": "2026-11-19T10:00:01Z"
    },
    {
      "eventId": "7c1a-uuid-...",
      "type": "sms:sent",
      "messageId": "3b8e-uuid-...",
      "occurredAt": "2026-11-19T10:00:03Z",
      "data": { "partsSent": 1, "simSlot": 0 }
    },
    {
      "eventId": "9d2f-uuid-...",
      "type": "sms:delivered",
      "messageId": "3b8e-uuid-...",
      "occurredAt": "2026-11-19T10:00:09Z",
      "data": { "tpStatus": 0 }
    }
  ]
}
```

### Event Types
- `sms:accepted`: Saved in the phone's Room outbox. Clears the server lease timer.
- `sms:sent`: All parts handed to cellular base station (`RESULT_OK`).
- `sms:delivered`: Carrier delivery confirmation received (TP-Status 0x00–0x1F).
- `sms:failed`: Final failure. Body data contains `{ "stage": "send"|"delivery", "errorCode": "...", "errorMessage": "..." }`.

### Error Codes
`RADIO_OFF`, `NO_SERVICE`, `NULL_PDU`, `GENERIC_FAILURE`, `LIMIT_EXCEEDED`, `NO_PERMISSION`, `INVALID_NUMBER`, `NO_SIM`, `DELIVERY_REJECTED`, `EXPIRED`, `GATEWAY_UNREACHABLE`.

### Response
```json
{
  "accepted": ["5b0e-uuid-...", "7c1a-uuid-..."],
  "rejected": []
}
```
Rejected reasons: `unknown_message`, `not_owned`, `invalid`.

---

## 6. Guarantees & Deduplication

1. **At-least-once to phone, exactly-once to radio**:
   The phone's SQLite Room table sets `messageId` as primary key. Duplicate pushes are ignored, but the phone will re-emit its current status event to synchronize server state.
2. **Forward-only state machine**:
   `QUEUED → DISPATCHED → ACCEPTED → SENT → DELIVERED`. Late `sms:sent` arriving after `sms:delivered` is safely ignored.
3. **Leasing and Reassignment**:
   Leases last 120s. If unaccepted and unrenewed, the server re-queues the message. If the gateway device remains offline past `reassignAfterSeconds`, the message is reassigned to another online device in the project.
