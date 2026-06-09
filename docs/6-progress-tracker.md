# Progress Tracker

## Checkpoint 1: Core Monorepo Setup & Infrastructure
* **Goal**: Initialize the core monorepo architecture and infrastructure for Notica.
* **Progress**:
  * [x] Initialized pnpm monorepo workspace.
  * [x] Created `docker-compose.yml` for PostgreSQL and Redis.
  * [x] Scaffolded Next.js frontend (`apps/web`) with Tailwind and shadcn/ui setup ready.
  * [x] Scaffolded NestJS backend (`apps/api`) on port 8000.
  * [x] Configure Prisma ORM for the backend database connection.
  * [x] Configure PostgreSQL database schema (Applied via Prisma migration).
* **Next Goal**: Implement Dashboard Authentication & Multi-Tenant Project Management.

---

## Checkpoint 2: Authentication & Project API Key Management
* **Goal**: Implement dashboard user authentication, multi-tenant project registration, secure API key management/rotation, and a secure frontend dashboard interface with robust security controls.
* **Progress**:
  * [x] Implement Dashboard Authentication (Signup & Login) - Backend.
  * [x] Implement Tenant Isolation logic check endpoints - Backend.
  * [x] Implement Advanced Security (Rate limiting, account lockout) - Backend.
  * [x] Implement Stateful Multi-Session & Password Reset - Backend.
  * [x] Implement Frontend Auth Pages (Signup, Login, Forgot & Reset Password) with Input Validation.
  * [x] Implement Frontend Auth State, Guards, and Silent Token Refresh Interceptor.
  * [x] Implement Frontend Dashboard (Manage Projects, rotate API keys).
  * [x] Implement Frontend Session & Security Management (2FA setup, active sessions revocation).
  * [x] Apply security measures (XSS/CSRF mitigation, client route guards, token rotation, secure local storage management).
* **Next Goal**: Implement Recipient User Management & Redis/BullMQ queue system.


---

## Checkpoint 3: Recipient & Queue Management (Current Goal)
* **Goal**: Establish async notification dispatching queues and manage recipient users.
* **Progress**:
  * [x] Implement Project Management (Create projects, generate and rotate API Keys) - Backend.
  * [x] Implement Recipient User Management (creation and identification of end-users).
  * [x] Set up Redis & BullMQ queue system for async notification dispatching.
  * [x] Implement In-App notification channel endpoints.
  * [x] Implement API Key hashing in Database (Prisma lookup, service creation and rotation).
  * [x] Apply Rate Limiting (ThrottlerGuard) to public routes.
  * [x] Implement HTML input sanitization for notification content.
* **Next Goal**: Implement WebSocket or Web Push realtime notification server and client SDK integrations.

---

## Checkpoint 4: Real-time Notifications & Client SDK (Completed)
* **Goal**: Establish real-time notification broadcasting via WebSockets, configure browser Web Push alerts, and build a unified client SDK.
* **Progress**:
  * [x] Set up NestJS Socket.io WebSocket Gateway and authenticate connection events.
  * [x] Scope Socket connections into tenant-recipient specific rooms for secure broadcasting.
  * [x] Integrate real-time event emission inside the BullMQ `NotificationsProcessor`.
  * [x] Implement Device Token management controller & services to store push subscription credentials.
  * [x] Install and configure `web-push` (VAPID keys) to dispatch native browser alerts.
  * [x] Integrate background browser push delivery inside the BullMQ worker.
  * [x] Create a client-side JavaScript SDK to identify recipients and listen to real-time events.
  * [x] Implement background Service Worker (`sw.js`) inside the client browser context.
  * [x] Integrate real-time log alerts inside the Notica Developer Console.
  * [x] Fix duplicate notification displays in the mock app client-side.
  * [x] Implement dynamic CORS origin matching to support any localhost/127.0.0.1 developer port.
  * [x] Optimize notification dispatches (parallel dispatching, dual payload inspector logs, and permission checks).
* **Next Goal**: Implement Email Notification Channel and integration modules.

---

## Checkpoint 5: Email Notification Channel (Current Goal)
* **Goal**: Implement email notification delivery using an extensible provider/adapter pattern (supporting SMTP and local Console fallback initially, and structurally prepared to add Resend, SendGrid, or other API-based providers in the future) integrated into NestJS and BullMQ.
* **Progress**:
  * [ ] Add `EMAIL` to the Prisma `ChannelType` enum and execute migrations.
  * [ ] Create NestJS `EmailModule` with an extensible `EmailProvider` interface, implementing `SmtpProvider` and `ConsoleProvider`.
  * [ ] Add the `EMAIL` handler to the BullMQ `NotificationsProcessor`.
  * [ ] Document the Email channel usage in the developer **Documentation** tab.
  * [ ] Validate email delivery via console logs or a test SMTP server (Maildev).

