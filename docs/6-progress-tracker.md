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
  * [x] Implement Project Management (Create projects, generate and rotate API Keys) - Backend.
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
  * [ ] Implement Recipient User Management (creation and identification of end-users).
  * [ ] Set up Redis & BullMQ queue system for async notification dispatching.
  * [ ] Implement In-App notification channel endpoints.
* **Next Goal**: Implement WebSocket or SSE realtime notification server and client SDK integrations.
