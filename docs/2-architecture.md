# Notica System Architecture (MVP)

We’ll design this like a real production-oriented SaaS, but still realistic for one developer.

Goal:

* scalable enough
* clean architecture
* not overengineered

---

# 1. High-Level Architecture

```text
                +----------------------+
                |   Client Dashboard   |
                |   (Next.js)          |
                +----------+-----------+
                           |
                           v
                +----------------------+
                |      API Gateway     |
                |  Auth + Validation   |
                +----------+-----------+
                           |
        ---------------------------------------------
        |                  |                        |
        v                  v                        v

+---------------+  +----------------+   +-------------------+
| Notification  |  | Tenant/Auth    |   | Realtime Gateway  |
| Service       |  | Service        |   | WebSocket/SSE      |
+-------+-------+  +--------+-------+   +---------+---------+
        |                   |                       |
        v                   v                       |
+--------------------------------------------------------------+
|                     PostgreSQL Database                      |
+--------------------------------------------------------------+

        |
        v

+-------------------+
| Redis + BullMQ    |
| Queue Processing  |
+---------+---------+
          |
          v

+----------------------------+
| Delivery Workers           |
| Push/In-App/Email Delivery |
+----------------------------+
```

---

# 2. Core Architectural Style

Use:

# Modular Monolith

NOT microservices initially.

Why?

* simpler deployment
* easier debugging
* faster development
* fewer infra costs

But structure modules cleanly so later extraction is possible.

---

# 3. Main Components

# A. API Gateway Layer

This is the public entry point.

Responsibilities:

* authentication
* API key validation
* rate limiting
* request validation
* tenant resolution

Example endpoints:

```http
POST /api/v1/notifications
GET  /api/v1/notifications
```

---

# B. Tenant/Auth Module

Handles:

* organizations
* projects
* API keys
* user accounts
* RBAC

---

# C. Notification Service

Core business logic.

Responsibilities:

* create notifications
* store notifications
* enqueue jobs
* manage statuses

---

# D. Queue System (Redis + BullMQ)

Critical for async processing.

Why queues?
Because notification sending should NOT block API response.

Bad:

```text
API waits for push delivery
```

Good:

```text
API stores job quickly
Worker processes later
```

---

# E. Worker System

Separate background workers.

Responsibilities:

* send push notifications
* retry failed jobs
* dispatch realtime events
* update statuses

---

# F. Realtime Gateway

Using:

* WebSocket
  OR
* SSE

Responsibilities:

* instant notification delivery
* unread count updates
* live dashboard updates

---

# G. Web Push Provider Layer

Abstraction layer.

Why?
Later you may support FCM, native web push, APNs.

Create adapter pattern:

```text
PushProvider Interface
    |
    +--> FCMProvider
    +--> WebPushProvider
```

Very important design decision.

---

# H. Email Provider Layer

Extensible delivery abstraction layer.

Why?
Rather than locking into standard SMTP, the module implements an **Adapter Pattern** to allow introducing API-based third-party email providers (like Resend, SendGrid, Mailgun) in the future.

```text
EmailProvider Interface
    |
    +--> SmtpProvider (active if SMTP_HOST is defined)
    +--> ConsoleProvider (development/testing fallback)
    +--> Future SDK providers (e.g. Resend, SendGrid)
```

The queue processing worker relies strictly on the `EmailProvider` interface contract, keeping email service integrations completely decoupled.

---

# 4. Notification Flow

# Example Flow

User gets payment notification.

```text
Client Backend
    ↓
POST /notifications
    ↓
API validates API key
    ↓
Notification stored in DB
    ↓
Job added to Redis queue
    ↓
API returns fast
    ↓
Worker processes job
    ↓
Realtime, Push, or Email delivered
    ↓
Status updated
```

This is classic event-driven architecture.

---

# 5. Database Design

Use PostgreSQL.

# Core Tables

# tenants
```text
id
name
plan
created_at
```

---

# projects
```text
id
tenant_id
name
api_key
```

---

# dashboard_users
People managing Notica.
```text
id
tenant_id
email
password_hash
role
```

---

# recipient_users
Actual notification receivers.
```text
id
tenant_id
external_user_id
name
email
created_at
```
Key point: `external_user_id` maps to the organization's own user system.

---

# notifications
```text
id
tenant_id
recipient_user_id
title
body
status
channel
created_at
```

---

# notification_deliveries
Tracks attempts.
```text
id
notification_id
provider
status
attempt_count
error_message
sent_at
```

---

# device_tokens
```text
id
tenant_id
recipient_user_id
token
platform
created_at
```

---

# 6. Queue Architecture

BullMQ queues:
```text
notification-send
notification-retry
push-delivery
realtime-dispatch
```

Keep queues separated by responsibility.

---

# 7. Realtime Architecture

# Option A: WebSocket
Good for interactive dashboards, bidirectional communication.

# Option B: SSE
Simpler. Good for notifications only, server → client communication.
Honestly: For MVP, SSE is underrated and simpler.

---

# 8. Multi-Tenant Isolation

VERY important.

Every query scoped by:
```text
tenant_id
```

Never trust frontend tenant IDs. Resolve tenant from API key or JWT.

---

# 9. API Design

## Send Notification
```http
POST /api/v1/notifications
```
Body:
```json
{
  "recipientId": "123",
  "title": "Payment received",
  "body": "Your order is confirmed",
  "channel": "in_app"
}
```

## Get Notifications
```http
GET /api/v1/notifications
```

## Mark Read
```http
PATCH /api/v1/notifications/:id/read
```

---

# 10. SDK Design

# JavaScript SDK
```ts
notica.init({
  apiKey: "pk_xxx"
})

notica.notify({
  title: "Hello",
  body: "World"
})
```

---

# 11. Reliability Design

# A. Retry System
Exponential backoff (e.g., retry after 10s, 1m, 5m).

# B. Idempotency
Prevent duplicate notifications using `Idempotency-Key`. Critical for real systems.

# C. Dead Letter Queue
Failed jobs after max retries go to `failed-notifications` for debugging.

---

# 12. Observability

Track: queue size, failed jobs, latency, delivery rate.
Use: logs, metrics, dashboards. Even simple logging initially is enough.

---

# 13. Security

* **API keys:** Hash them in DB. Never store raw keys. Example: `ntc_live_xxxxx`
* **Rate limiting:** Prevent abuse (e.g., 100 req/min).
* **Validation:** Strict schema validation using Zod or class-validator.

---

# 14. Suggested Tech Stack

# Frontend
* Next.js
* Tailwind
* shadcn/ui

# Backend
* NestJS
Excellent for modular architecture, queues, WebSockets, large backend systems.

# Infra
* **DB:** PostgreSQL + Prisma ORM
* **Queue:** Redis + BullMQ
* **Realtime:** WebSocket/SSE
* **Deployment:** Docker, Render/Railway/Fly.io

---

# 15. Recommended MVP Scope

**DO:**
* multi-tenant
* notification API
* realtime notifications
* queue processing
* retries
* web dashboard

**DO NOT:**
* SMS
* WhatsApp
* workflow builders
* AI
* Kafka
* microservices

---

# Final Architecture Philosophy

Notica should be:
* event-driven
* async-first
* API-first
* tenant-isolated
* reliability-focused

The biggest mistake would be building this like a normal CRUD app. It’s infrastructure software, so queues, failures, retries, delivery guarantees, and observability matter.

---

# Important Note: Two Different User Types

You must clearly separate:

## 1. Notica Platform Users (Dashboard Users)
People who log into the Notica dashboard (organization admins, developers, managers). They manage API keys, projects, analytics.
Stored in `dashboard_users`.

## 2. End Users of Client Applications (Recipient Users)
Actual users receiving notifications (e.g., customers of a fintech company using Notica). These are NOT Notica dashboard users. They belong to the client organization.
Stored in `recipient_users`.

---

# Correct Architecture Conceptual Model

```text
Tenant (organization)
    |
    +--> Dashboard Users
    |
    +--> Recipient Users
              |
              +--> Device Tokens
              |
              +--> Notifications
```

Recipient identity should be: `(tenant_id + external_user_id)`. NOT global user IDs.

---

# Important Design Decision: Stateful vs Stateless Recipients
**Stateful Recipients (Option A - Recommended):** Notica stores recipient profiles. Allows notification history, unread counts, analytics, preferences, subscriptions.

---

# Client SDK Responsibility

SDK should:
1. identify recipient
2. register device token
3. open realtime connection

Example:
```ts
notica.identify("8472")
```
