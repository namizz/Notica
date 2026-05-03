# Code Standards

## General
- Language: TypeScript across the stack.
- Strict Typing: `any` is NOT a valid data structure. Always use proper types, interfaces, or `unknown` if truly dynamic.
- Formatting: Prettier + ESLint.
- Style: Consistent naming conventions (camelCase for variables, PascalCase for classes/types).

## Frontend (Next.js)
- Directives: Use `"use client"` ONLY for components that strictly require browser APIs or interactivity. Keep everything else as Server Components by default.

## API Design
- RESTful principles.
- Consistent error handling structure.
- Versioning (e.g., `/api/v1/`).

## Architecture Pattern
- Modular Monolith architecture.
- NestJS framework conventions (Decorators, Dependency Injection, Modules).
- Strict schema validation using Zod or class-validator.

## Database & Queue
- Prisma for ORM with PostgreSQL.
- BullMQ for queues with Redis.

(Add more details as the plan evolves...)
