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
  * [x] Store project API keys as SHA-256 digests and display raw keys only once
    during creation or rotation.
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
  * [x] Authenticate the browser SDK with short-lived, project- and recipient-scoped client tokens.
  * [x] Enforce project scope for recipients, notifications, device tokens, dashboard logs, and realtime rooms.
  * [x] Implement background Service Worker (`sw.js`) inside the client browser context.
  * [x] Integrate real-time log alerts inside the Notica Developer Console.
  * [x] Fix duplicate notification displays in the mock app client-side.
  * [x] Implement dynamic CORS origin matching to support any localhost/127.0.0.1 developer port.
  * [x] Optimize notification dispatches (parallel dispatching, dual payload inspector logs, and permission checks).
* **Next Goal**: Implement Email Notification Channel and integration modules.

---

## Checkpoint 5: Email Notification Channel (Completed)
* **Goal**: Implement email notification delivery using an extensible provider/adapter pattern (supporting SMTP and local Console fallback initially, and structurally prepared to add Resend, SendGrid, or other API-based providers in the future) integrated into NestJS and BullMQ.
* **Progress**:
  * [x] Add `EMAIL` to the Prisma `ChannelType` enum and execute migrations.
  * [x] Create NestJS `EmailModule` with an extensible `EmailProvider` interface, implementing `SmtpProvider` and `ConsoleProvider`.
  * [x] Add the `EMAIL` handler to the BullMQ `NotificationsProcessor`.
  * [x] Document the Email channel usage in the developer **Documentation** tab.
  * [x] Distinguish console simulation from real SMTP delivery and cover the simulation path with a unit test.

---

## Checkpoint 6: High-Priority Correctness Remediation (Completed)
* **Goal**: Resolve the high-priority security, isolation, validation, and delivery-status inconsistencies found in the July 24, 2026 audit.
* **Progress**:
  * [x] Add strict runtime validation and typed public DTOs.
  * [x] Add project scope to persisted and realtime notification data.
  * [x] Add recipient-scoped browser tokens without exposing project API keys.
  * [x] Add accurate `SKIPPED` and `SIMULATED` delivery states and per-device Web Push attempts.
  * [x] Verify all migrations on a clean database and upgrade the local development database with no Prisma drift.
  * [x] Add focused browser-token and delivery-outcome tests.

---

## Checkpoint 7: Public SaaS Website & Developer Documentation (Current Goal)
* **Goal**: Present Notica as a production-ready developer SaaS, make product education and documentation public, and reserve authentication for projects, API keys, delivery operations, and account security.
* **Progress**:
  * [x] Replace the root login redirect with a responsive public SaaS landing page.
  * [x] Add shared public navigation and footer with clear Documentation, Get Started, and Sign In paths.
  * [x] Add an interactive notification-delivery demo that explains the API, queue, channel, and recipient flow.
  * [x] Publish developer documentation at `/docs` without requiring authentication.
  * [x] Add documentation navigation, copyable code examples, security callouts, and responsive tables of contents.
  * [x] Document the quickstart, core concepts, REST API, JavaScript SDK, Web Push, client tokens, and API-key security.
  * [x] Keep `/dashboard/**` authenticated and limit it to projects, API keys, logs, console, sessions, and security controls.
  * [x] Point the dashboard Documentation navigation item to the public documentation site.
  * [x] Add page metadata and baseline SEO/accessibility support for public pages.
  * [x] Replace hard-coded localhost links in user-facing integration examples with environment-driven production URLs.
* **Next Goal**: Complete production configuration, deployment packaging, health checks, and release validation.

---

## Checkpoint 8: Production Deployment Readiness (Planned)
* **Goal**: Make the web application, API, queue processing, database, Redis, email, Web Push, and authentication flows safe and repeatable to deploy.
* **Progress**:
  * [ ] Define production environment variables and provide safe example configuration.
  * [ ] Remove hard-coded localhost OAuth callbacks, password-reset links, and frontend redirects.
  * [ ] Configure explicit production CORS origins and API/WebSocket URLs.
  * [ ] Require strong JWT, refresh-token, and client-token secrets in production.
  * [ ] Configure production PostgreSQL, Redis, SMTP, and VAPID credentials.
  * [ ] Add API health/readiness endpoints and deployment smoke checks.
  * [ ] Add production build/container definitions for the web and API applications.
  * [ ] Run Prisma migrations as part of the release process.
  * [ ] Validate frontend build/lint, backend tests, queues, WebSockets, email, and Web Push in the deployed environment.

