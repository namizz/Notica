# Handoff: SMS gateway, decoupled channels, email hardening

Status as of 2026-11-19. Work is on branch **`feat/sms-gateway`** (branched from `feat/notification-idempotency-key`). **Nothing is committed yet**: all changes are in the working tree.

- **Full design:** `C:\Users\Nami\.claude\plans\can-we-implement-sms-polished-key.md`. It holds the protocol, schema, Android app, email and security design. This file only says what is done and what is left.
- **To resume with Claude:** "Continue the SMS gateway work using docs/HANDOFF-sms-gateway.md and the plan file."

---

## 1. Key decisions (do not lose these)

1. **Channels are decoupled** (user request: "don't make it tightly coupled, email-only must work the same as SMS").
   - Every pluggable channel implements `ChannelHandler` (`src/channels/channel-handler.interface.ts`) and registers itself in the global `ChannelRegistry` in its own `onModuleInit`.
   - `NotificationsService` and `NotificationsProcessor` must only use the registry, never `EmailService` or the SMS classes directly. IN_APP and WEB_PUSH stay built into the processor.
   - Removing `SmsModule` from `AppModule` must leave email fully working, and vice versa.
2. **Opt-in config per channel.**
   - `EMAIL_PROVIDER=resend|smtp|console|off`. When unset: SMTP if `SMTP_HOST` is set, otherwise console in dev and off in production.
   - `SMS_PROVIDER=gateway|console|off`. Unset means off.
   - A disabled channel returns `400 CHANNEL_NOT_ENABLED` (`ChannelRegistry.requireEnabled`).
3. **Symmetric request.** `POST /notifications` gets an optional `email` and `phone`. Both are saved on the `RecipientUser`.
   - EMAIL requires an email, SMS requires a phone. If either is missing, the handler's `prepare()` returns a 4xx at request time.
4. **Gateway protocol v1.** The phone connects **out** to socket.io namespace `/gateway` and receives `sms:send` batches. It reports status by **signed HTTPS webhook** `POST /gateway/v1/events`, and pulls `GET /gateway/v1/messages/pending` as a fallback.
   - Leases are 120 s. The phone dedupes by `messageId`. Event dedupe uses `GatewayEvent.id = eventId`.
   - The state machine only moves forward: QUEUED → DISPATCHED → ACCEPTED → SENT → DELIVERED, with FAILED final.
   - Exception: the server-side failures `GATEWAY_UNREACHABLE` and `EXPIRED` can be overridden by a later `sent`/`delivered` report from the phone.
5. **Signing.**
   - Gateway requests carry `X-Notica-Timestamp` and `X-Notica-Signature: v1=<hex HMAC-SHA256(secret, ts + "." + rawBody)>`, with a ±300 s window.
   - The per-device secret is derived, not stored: `ngws_ + base64url(HMAC(GATEWAY_SIGNING_KEY, deviceId))`. The device token `ngw_live_…` is stored only as a sha256 hash.
   - Customer webhooks use `Notica-Signature: t=<ts>,v1=<hex>`. Their secret is `whsec_ + base64url(HMAC(WEBHOOK_SIGNING_KEY, endpointId))`.
   - Shared test vector, also needed in the Android test: secret `ngws_test_secret`, ts `1763546400`, body `{"events":[]}` → `c9b4ad15d1e987dbd3baf516a5aff82622d44f243165b743d4dbe3e995706e43`.

---

## 2. Done (files written, `apps/api`)

| Area | Files | State |
|---|---|---|
| Schema | `prisma/schema.prisma` | Done and valid. Adds `ChannelType.SMS`, enums `SmsStatus`, `SmsEncoding`, `WebhookDeliveryStatus`. Adds `RecipientUser.phone`, `emailSuppressedAt`, `emailSuppressionReason`, and `NotificationDelivery.providerMessageId`, `deliveredAt`, `updatedAt` plus `sms` relation. New models: `GatewayDevice`, `SmsMessage` (text nullable for retention), `GatewayEvent`, `WebhookEndpoint`, `WebhookDelivery`. `prisma generate` was run. |
| Migration | `prisma/migrations/20261119120000_sms_gateway/migration.sql` | Generated with `prisma migrate diff`. **Not applied yet**; the notica Postgres container (port 5433) was not running. |
| Deps | `package.json` | Added `libphonenumber-js`, dev `socket.io-client`. |
| Utils | `src/common/phone.util.ts` (`normalizeE164`, `maskPhone`), `src/common/sms-segments.util.ts` (`analyzeSms`), `src/common/hmac.util.ts` (sign/verify/derive/randomToken) | Done. **Tests pass**: `src/common/common-utils.spec.ts`, 13 tests. |
| Channel core | `src/channels/channel-handler.interface.ts` (incl. `NotificationJobData`, `DeliveryOutcome`), `channel-registry.ts`, `channel-errors.ts` (`ChannelRequestError` → `{statusCode, error: CODE, message}`), `delivery-log.ts` (`DeliveryLog` helper, `COMPLETED_DELIVERY_STATUSES`), `channels.controller.ts` (`GET /channels`), `channels.module.ts` (@Global) | Written, not compiled yet. |
| Config | `src/config/environment.ts` | Added `isProductionEnv`, `webhookSigningKey`, `gatewaySigningKey` (dev fallbacks), `emailProviderName`, `smsProviderName`, `smsSettings` (all `SMS_*` numbers), `publicApiUrl`, and production validation per channel. |
| Webhooks | `src/webhooks/`: `webhook-events.ts`, `url-guard.ts` (SSRF), `dto/webhook.dto.ts`, `webhooks.service.ts` (CRUD, `publish()` never throws), `webhook-delivery.processor.ts` (queue `webhook-delivery`, 8 attempts, 410 disables), `webhooks.controller.ts` (`/projects/:projectId/webhooks` + `/event-types`, `/:id/secret`, `/:id/test`, `/:id/deliveries`), `webhooks.module.ts` | Written, not compiled. |
| SMS | `src/sms/sms-wire.ts` (protocol constants/types), `sms-outbox.service.ts` (lease via `updateManyAndReturn`, `transition()` CAS state machine, mirrors to Delivery/Notification/log/webhooks), `sms-channel.handler.ts` (prepare: phone, parts, paired device, daily cap; deliver: gateway or console) | Written, not compiled. |
| Gateway | `src/sms/gateway/`: `gateway-presence.service.ts` (Redis `notica:gw:online:<id>`, TTL 90 s), `gateway-dispatcher.service.ts` (`attach(namespace)`, `dispatch`, `dispatchSoon`, `revoke`, `disconnect`), `gateway-devices.service.ts` (create + pairing code `XXXX-XXXX`, list, update, revoke, `pair()`, `authenticate()`, `signingSecret()`), `gateway-router.service.ts` (`activeDevices`, `pick`), `gateway-events.service.ts` (`ingest`), `gateway.socket.ts` (namespace `/gateway`, connect/disconnect/heartbeat), `device-auth.guard.ts` (`DeviceAuthGuard`, `GatewaySignatureGuard`, `@CurrentGatewayDevice`), `gateway-api.controller.ts` (`/gateway/v1/pair`, `/me`, `/messages/pending`, `/events`), `gateway-devices.controller.ts` (`/projects/:projectId/gateway-devices`), `dto/*` | Written, not compiled. |

---

## 3. Remaining work, in order

### 3.1 Finish the SMS backend wiring
1. **`src/sms/sms-maintenance.processor.ts`**:
   - BullMQ queue `sms-maintenance`. A scheduler service, in the worker role only and only when `smsProviderName()==='gateway'`, calls `queue.upsertJobScheduler('sms-maintenance-tick', { every: 30_000 }, { name: 'tick' })` and `('sms-retention', { every: 3_600_000 }, { name: 'retention' })`.
   - On `tick`:
     - (a) `DISPATCHED` with `leaseUntil < now`: if `dispatchAttempts >= smsSettings().maxDispatchAttempts`, call `outbox.transition(id, {kind:'failed', code:'GATEWAY_UNREACHABLE'})`. Otherwise `updateMany({where:{id, status:DISPATCHED}, data:{status:QUEUED, leaseUntil:null}})`.
     - (b) `QUEUED`/`DISPATCHED` with `expiresAt < now` → transition failed `EXPIRED`.
     - (c) `QUEUED` on a device that is revoked, disabled, or offline (not in presence and `lastSeenAt` older than `reassignAfterSeconds`) → `router.pick(projectId, {onlineOnly:true, excludeId})`. Update `gatewayDeviceId` (guarded by status QUEUED) and the delivery's `provider` string.
     - (d) For every online device with QUEUED messages → `dispatcher.dispatch(id)`.
   - On `retention`: delete `GatewayEvent` older than 30 days, and set `SmsMessage.text = null` where `createdAt` is older than `textRetentionDays`.
2. **`src/sms/sms.module.ts`**:
   - Imports: `PrismaModule`, `RealtimeModule`, `WebhooksModule`, `BullModule.registerQueue({name:'sms-maintenance'})`.
   - Providers: `SmsOutboxService`, `SmsChannelHandler`, `GatewayPresenceService`, `GatewayDispatcher`, `GatewayDevicesService`, `GatewayRouter`, `GatewayEventsService`, `GatewaySocket`, `DeviceAuthGuard`, `GatewaySignatureGuard`, plus maintenance and scheduler (worker only, see `webhooks.module.ts`).
   - Controllers: `GatewayApiController`, `GatewayDevicesController`.
3. **`src/app.module.ts`**: import `ChannelsModule`, `WebhooksModule`, `SmsModule` (EmailModule is already imported).
4. **`src/main.ts`**: `NestFactory.create(AppModule, { rawBody: true })`. Needed by `GatewaySignatureGuard` and the email webhook.

### 3.2 Notifications core → registry
- **`dto/send-notification.dto.ts`**: add optional `email` (`@IsEmail`, max 254) and `phone` (`@IsString`, max 32).
- **`notifications.service.ts`** (`sendNotification`):
  - For a non-built-in channel, call `registry.requireEnabled(channel)`.
  - Normalise `dto.phone` with `normalizeE164`. If invalid → `ChannelRequestError(400,'INVALID_PHONE')`. Lowercase and trim the email.
  - Upsert the recipient with `email`/`phone` only when provided. If the email changes, clear `emailSuppressedAt`/`emailSuppressionReason`.
  - Then `handler.prepare({tenantId, projectId, recipient, title, body})` **after** the idempotency replay check and **before** `notification.create`.
  - Add `ChannelRegistry` to the constructor and update `notifications.service.spec.ts`, which constructs it with `(prisma, queue)`.
- **`notifications.processor.ts`**:
  - Remove `EmailService`, `processEmail`, `findCompletedDelivery`/`resumeCompletedDelivery`/`createDelivery` duplicates; use `DeliveryLog` from channels.
  - Switch on IN_APP / WEB_PUSH. `default: const h = registry.get(channel); if (!h) throw new UnrecoverableError(...); return h.deliver(data, attempt)`.
  - Keep `export type { NotificationJobData } from '../channels/channel-handler.interface'` so existing imports still work.
  - The `process()` return type becomes `DeliveryOutcome`.
- **`notifications.module.ts`**: drop the `EmailModule` import, since the registry is global.
- **Specs**:
  - `notifications.processor.spec.ts`: construct with a `{ get: jest.fn() }` registry instead of `emailService`, and move the 3 email cases to an email handler spec.
  - `dto/notification-dtos.spec.ts:14` currently asserts `channel:'SMS'` is invalid → change it to an unknown value like `'FAX'`.

### 3.3 Recipients
- `recipients/dto/identify-recipient.dto.ts` gets an optional `phone`.
- `recipients.service.ts` normalises it with `normalizeE164` (400 if invalid) and saves it.

### 3.4 Email (design §7 in the plan file)
- **`email-provider.interface.ts`**: `send({to, subject, text, html, from, idempotencyKey})` → `{messageId, provider:'smtp'|'resend'|'console', simulated}`. Add `class EmailSendError extends Error { permanent: boolean }`.
- **`smtp.provider.ts`**:
  - `pool:true, maxConnections:3, maxMessages:100`.
  - `secure` from `SMTP_SECURE` (default: port 465), `requireTLS:true` otherwise.
  - `verify()` on init, which throws in production.
  - No `noreply@notica.com` default: from = `EMAIL_FROM || SMTP_FROM`.
  - Classify errors:

    | Error | Result |
    |---|---|
    | `responseCode` 4xx, `ECONNECTION`, `ETIMEDOUT`, `ESOCKET` | Transient |
    | `responseCode` 5xx, `EAUTH` | Permanent |
- **`resend.provider.ts`** (new):
  - `fetch('https://api.resend.com/emails', {method:'POST', headers:{Authorization:'Bearer '+RESEND_API_KEY, 'Content-Type':'application/json', 'Idempotency-Key': notificationId}, body:{from,to:[to],subject,html,text}, signal: AbortSignal.timeout(15000)})` → `{id}`.
  - 429/5xx → transient. Other 4xx → permanent.
- **`templates/basic-email.ts`**: escape HTML, paragraphs and `<br>`, plus a plain-text part.
- **`email.service.ts`**: picks the provider via `emailProviderName()` and exposes `isEnabled()` / `providerName()`.
- **`email-channel.handler.ts`** (new, registers in `onModuleInit`). It holds the logic moved from `processEmail`:
  - `prepare`: no email → 400 `RECIPIENT_HAS_NO_EMAIL`; suppressed → 422 `RECIPIENT_EMAIL_SUPPRESSED`.
  - `deliver`:
    - Completed delivery → resume.
    - Missing email → `UnrecoverableError`. Suppressed → delivery SKIPPED, notification FAILED.
    - Provider accepted → delivery SUCCESS + `providerMessageId`, notification **SENT** (no longer DELIVERED). Console → SIMULATED/SENT.
    - Permanent error → `UnrecoverableError`.
    - Publish webhook `notification.sent` / `notification.failed`.
- **`email-webhooks.controller.ts`**: `POST /webhooks/email/resend`, public, raw body.
  - Svix verify by hand: headers `svix-id`, `svix-timestamp`, `svix-signature` ("v1,<base64>" list). The key is base64-decoded from `RESEND_WEBHOOK_SECRET` without the `whsec_` prefix. Signed content is `${id}.${ts}.${body}`, HMAC-SHA256, base64.
  - Find the delivery by `providerMessageId = data.email_id`.
  - `email.delivered` → delivery `deliveredAt`, notification DELIVERED, webhook `notification.delivered`.
  - `email.bounced` → FAILED + suppress the recipient (reason `bounce`) + webhook `email.bounced` + `notification.failed`.
  - `email.complained` → suppress (reason `complaint`) + webhook `email.complained`.
  - `email.delivery_delayed` → log only.
- **`email.module.ts`**: imports `PrismaModule`, `RealtimeModule`, `WebhooksModule`; adds the handler and the webhook controller.

### 3.5 Config and docs
- **`.env.example`** gains:
  - `EMAIL_PROVIDER`, `EMAIL_FROM`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `SMTP_SECURE`
  - `SMS_PROVIDER=console`, `GATEWAY_SIGNING_KEY`, `PUBLIC_API_URL`, the `SMS_*` tunables, `WEBHOOK_SIGNING_KEY`
- **`docs/sms-gateway.md`**: copy §3 of the plan (protocol v1).
- **`docs/devops/email-dns.md`**: SPF/DKIM/DMARC.
- **`docs/devops/2-render.md`**: the new env vars.

### 3.6 Tests to add (Jest, hand-mock style like `notifications.processor.spec.ts`)
- `sms-outbox.service`: forward-only transitions, provisional failure override, CAS retry.
- `gateway-events.service`: duplicate eventId accepted, unknown message rejected, failure deletes the event row.
- `gateway-devices.service`: pairing code single use and expiry, revoke.
- `sms-channel.handler`: prepare errors, no double queue on retry.
- `channel-registry`.
- `email-channel.handler`.
- SMTP error classification.
- Svix verify.
- `url-guard` `isPrivateAddress`.
- `webhooks.service.publish`.

### 3.7 Verify the backend
```
docker compose up -d postgres          # notica DB on :5433 (port 6379 is used by another project's redis, which is fine for dev)
cd apps/api && npx prisma migrate deploy && npx tsc --noEmit -p tsconfig.json && npx jest
```
The baseline before this work was 14 suites, 72 tests, all green.

Then write **`apps/api/scripts/fake-gateway.ts`** (socket.io-client + signed fetch). It pairs with a code and auto-replies accepted → sent → delivered, with flags `--fail` and `--drop`. Run it end to end with `SMS_PROVIDER=gateway`.

### 3.8 Android app `apps/android-gateway` (not started)
Follow plan §5 exactly:
- Kotlin, Compose, minSdk 26, targetSdk 35.
- socket.io-client 2.1.1, OkHttp, Room, WorkManager, DataStore + Keystore, zxing-android-embedded.
- Foreground service type `specialUse`.

Build here with `JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"` and `gradlew.bat assembleDebug testDebugUnitTest`. The SDK is at `%LOCALAPPDATA%\Android\Sdk` (platforms 31–36).

`RequestSignerTest` must use the shared vector in §1.

### 3.9 Dashboard `apps/web` (not started)
Plan §8:
- Logs page: add SMS (`app/dashboard/logs/page.tsx` lines ~39, 165-173, 261-263).
- New `dashboard/gateways` page with the QR (`qrcode` package), and a new `dashboard/webhooks` page.
- Use `GET /channels` to show which channels are ready.
- Update `IntegrationGuide.tsx` and `NotificationDemo.tsx`.

### 3.10 Finish
- Commit in the order of plan §10.
- CI job for Android.
- Update the design-doc note on idempotency: the replay check compares recipient, title, body and channel, **not** email/phone.

---

## 4. Gotchas found so far
- `ThrottlerGuard` is applied **per controller** (no global guard), so new controllers are unthrottled unless they add it. `/gateway/v1/pair` does (5/min).
- The global `ValidationPipe` uses `whitelist` + `forbidNonWhitelisted`, so every body field needs a class-validator decorator.
- Every app role runs the socket.io server with the Redis adapter, so the worker can emit to phones connected to API instances.
- Android limits an app to 30 SMS per 30 min by default. Raise it with `adb shell settings put global sms_outgoing_check_max_count 10000`. Document this in the app README.
- `src/generated/` is gitignored, stale output; the code uses `@prisma/client`.
- A user memory was saved: write design docs before big features, then implement without repeated confirmation prompts.
