# AlphaMail

AlphaMail is an AI-powered Gmail workspace that combines inbox sync, semantic search, smart email tagging, and an agentic inbox triage assistant in one product. It is built as a monorepo with a Next.js frontend, an Express API backend, and a BullMQ worker that processes sync and indexing jobs.



## Table of Contents

- [Product Overview](#product-overview)
- [Core Features](#core-features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Repository Structure](#repository-structure)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
- [Google OAuth and Gmail Setup](#google-oauth-and-gmail-setup)
- [Semantic Search and Embeddings](#semantic-search-and-embeddings)
- [Agentic Inbox Triage Flow](#agentic-inbox-triage-flow)
- [Available Scripts](#available-scripts)
- [Operational Notes](#operational-notes)
- [Troubleshooting](#troubleshooting)
- [Scope Boundaries](#scope-boundaries)

## Product Overview

AlphaMail solves three core problems in modern email workflows:

1. **Inbox overload** through prioritized tags like `needs_reply`, `deadline`, `follow_up`, and `spam`.
2. **Slow retrieval** through semantic search over indexed email content.
3. **Context loss** through account-aware thread reading, attachments, real-time sync updates, and grounded AI triage over live inbox data.

The app supports multiple connected Gmail accounts per user and keeps imported email data in MongoDB for fast filtering, analytics, and search.

## Why This Project Stands Out

- Designed as a full-stack distributed system, not just a UI prototype.
- Implements real-time data ingestion and update propagation using queue + sockets.
- Combines deterministic heuristics with semantic AI search for practical productivity gains.
- Adds an agentic tool-calling layer that turns inbox data into prioritized, actionable summaries.
- Handles end-to-end complexity: OAuth, background jobs, content sanitization, ML embedding pipelines, and AI-assisted triage.

## Core Features

### 1) Authentication and Account Management

- Email/password sign-up and sign-in.
- JWT-based session stored in secure HTTP-only cookie.
- Protected dashboard access using frontend middleware.
- User preferences endpoint for trusted image senders.

### 2) Gmail OAuth Integration

- Google OAuth connect flow with signed state validation.
- OAuth callback exchanges code for tokens and identifies mailbox email.
- Connected account listing and account disconnect support.
- Disconnect cleanup removes related imported email and embeddings.

### 3) Sync Pipeline (Initial + Incremental)

- Manual initial sync endpoint queues full mailbox sync jobs.
- Gmail watch registration enables push-based incremental updates.
- Pub/Sub push endpoint validates JWT and enqueues incremental sync.
- Worker process handles both initial and incremental jobs.
- Real-time events (`sync-start`, `email-added`, `sync-complete`, etc.) update the UI immediately.

### 4) Inbox Experience

- Paginated inbox API with filters:
  - account filter
  - date range filter (`today`, `yesterday`, `week`, `month`, `all`)
  - quick tag filter (`needs_reply`, `deadline`, `follow_up`, `spam`)
- Unread/read status updates reflected in Gmail and local DB.
- Thread-level reader with clean and raw modes.
- Attachment retrieval and download support.
- Inline image handling with trusted sender preferences.

### 5) AI Classification and Rule Learning

- Automatic heuristic classification during sync:
  - tags
  - spam category
  - extracted deadline timestamp
- User feedback endpoint to manually adjust tags.
- Rule persistence based on sender/domain/subject patterns.
- Optional similarity propagation of user tags to semantically close threads.

### 6) Semantic Search

- Query text is embedded using `sentence-transformers/all-MiniLM-L6-v2`.
- Email body text is chunked and indexed into `email_embeddings`.
- MongoDB `$vectorSearch` returns top semantically relevant chunks.
- Search supports account/date/label filtering.
- Frontend displays ranked matches with relevance score.

### 7) Agentic Inbox Triage

- Floating AI assistant in the dashboard for natural-language inbox queries.
- Gemini-powered tool-calling flow grounded in live mailbox data.
- Triage tools currently include:
  - `search_emails`
  - `get_tag_counts`
  - `get_thread`
- Responses are scoped to the active account/date filters and prioritize unread, deadline, follow-up, and reply-needed threads.
- Assistant returns concise summaries and recommended next actions instead of generic chat output.

## Architecture

### Service Layout

- **Frontend (`frontend`)**: Next.js app (dashboard, auth pages, inbox UI, search UI).
- **Backend API (`backend`)**: Express app (auth, Gmail integration, read APIs, search APIs, AI triage APIs).
- **Worker (`backend/workers/emailWorker.js`)**: BullMQ consumer for sync jobs.
- **MongoDB**: Stores users, connected accounts, emails, tag rules, embeddings.
- **Redis**: Queue broker + pub/sub support for worker and socket fanout.
- **Gemini API**: Powers the inbox triage assistant through tool calling.

### Data Flow (High Level)

1. User signs in and connects Gmail account through OAuth.
2. Backend stores account tokens and starts Gmail watch.
3. Initial sync job imports messages and classifies them.
4. Embedding indexing runs for semantic search.
5. Pub/Sub pushes trigger incremental sync jobs.
6. Socket events stream updates to the inbox in real time.
7. User sends a natural-language triage request from the dashboard assistant.
8. Backend invokes Gemini with tool definitions for inbox search, tag counts, and thread retrieval.
9. Tool results are fed back into the model, which returns a grounded priority summary and next actions.

## Tech Stack

### Frontend

- Next.js `16.1.6`
- React `19.2.3`
- Tailwind CSS v4
- Socket.IO client
- TypeScript support enabled

### Backend

- Node.js (ES modules)
- Express `5.2.1`
- Mongoose `9.3.0`
- BullMQ + ioredis
- Socket.IO
- Google APIs SDK
- JWT, bcryptjs, sanitize-html, html-to-text, chrono-node

### AI / NLP

- Python embedding worker
- `sentence-transformers==2.7.0`
- Model: `all-MiniLM-L6-v2` (384 dimensions)
- Gemini API for tool-calling inbox triage

### Infra

- Docker + Docker Compose
- Service definitions for frontend, backend, worker, MongoDB, Redis

## Repository Structure

```text
AlphaMail/
├── frontend/                     # Next.js UI
│   ├── app/
│   │   ├── auth/                 # Sign-in / sign-up pages
│   │   ├── dashboard/            # Inbox + thread UI
│   │   ├── oauth/success/        # OAuth success relay page
│   │   └── utils/                # API and socket helpers
│   └── middleware.ts             # Dashboard auth guard
├── backend/                      # Express API + worker + services
│   ├── config/                   # DB, Redis, app, socket config
│   ├── middlewares/              # Auth middleware
│   ├── models/                   # Mongo models
│   ├── queues/                   # BullMQ queue definitions
│   ├── routes/                   # API routes
│   ├── services/                 # Gmail, embeddings, classification, etc.
│   ├── workers/                  # BullMQ worker + Python embedding worker
│   └── scripts/                  # Data backfill / utility scripts
├── docker-compose.yml            # Local multi-service runtime
└── README.md                     # Primary project documentation
```

## Environment Variables

Create `backend/.env` using `backend/.env.example` as baseline.

### Backend (`backend/.env`)

| Variable | Required | Description |
| --- | --- | --- |
| `NODE_ENV` | Yes | `development` or `production`. |
| `PORT` | Yes | Backend API port (default `9000`). |
| `CLIENT_ORIGIN` | Yes | Allowed frontend origin(s) for CORS/cookies. |
| `MONGO_URL` | Yes | Mongo connection string. |
| `REDIS_URL` | Preferred | Full Redis URL, especially for containers. |
| `REDIS_HOST` | If no `REDIS_URL` | Redis host fallback. |
| `REDIS_PORT` | If no `REDIS_URL` | Redis port fallback. |
| `REDIS_USERNAME` | Optional | Redis username when required. |
| `REDIS_PASSWORD` | Optional | Redis password when required. |
| `JWT_SECRET` | Yes | Signing key for auth tokens and OAuth state. |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client id. |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret. |
| `GOOGLE_REDIRECT_URI` | Yes | OAuth callback URI handled by backend. |
| `PUBSUB_TOPIC` | Yes for incremental sync | Gmail Pub/Sub topic name. |
| `PUBSUB_PUSH_SERVICE_ACCOUNT` | Yes for incremental sync | Expected push signer service account email. |
| `PUBSUB_PUSH_AUDIENCE` | Yes for incremental sync | Expected JWT audience for Pub/Sub pushes. |
| `PUBSUB_LABELS` | Optional | Gmail labels to watch, default `INBOX`. |
| `GEMINI_API_KEY` | Yes for AI triage | Gemini API key used by the inbox triage assistant. |
| `GEMINI_MODEL` | Optional | Gemini model name, default `gemini-2.5-flash`. |

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE` | Yes | Backend base URL (example: `http://localhost:9000`). |

## Local Development

Two supported approaches are available.

### Option A: Docker Compose (recommended for quick start)

From repo root:

```bash
docker compose up --build
```

This starts:

- `frontend` on port `3000`
- `backend` on port `9000`
- `worker` process
- `mongodb` on port `27017`
- `redis` on port `6379`

### Option B: Run services manually

#### 1) Start MongoDB and Redis

Run local instances of Mongo and Redis (native install, containers, or managed services).

#### 2) Start backend API

```bash
cd backend
npm install
npm run dev
```

#### 3) Start worker

In a separate terminal:

```bash
cd backend
npm run worker:dev
```

#### 4) Start frontend

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

#### 5) Open app

Use:

- Frontend: `http://localhost:3000`
- Backend health check: `http://localhost:9000/health`

## Google OAuth and Gmail Setup

To enable account connection and sync:

1. Create OAuth credentials in Google Cloud.
2. Add backend callback URL to authorized redirect URIs:
   - local default: `http://localhost:9000/googleAuth/google/callback`
3. Configure Gmail API scopes (defined in `backend/routes/constants.js`).
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI`.
5. Set up Pub/Sub topic and push subscription for Gmail watch notifications.
6. Configure:
   - `PUBSUB_TOPIC`
   - `PUBSUB_PUSH_SERVICE_ACCOUNT`
   - `PUBSUB_PUSH_AUDIENCE`

Without Pub/Sub configuration, manual/initial sync can still work but push-driven incremental sync will not.

## Semantic Search and Embeddings

Semantic search requires embeddings and vector search support.

### What the system does

- Extracts and normalizes email text.
- Splits text into chunks.
- Generates embeddings through Python worker.
- Stores vectors in `email_embeddings` collection.
- Runs `$vectorSearch` query in search API.

## Agentic Inbox Triage Flow

The inbox assistant is intentionally narrow and grounded. It is designed to answer inbox-prioritization questions using internal tools rather than freeform generation.

### Current flow

1. User opens the floating `AlphaMail AI` assistant in the dashboard.
2. User asks a question such as:
   - `What needs my attention today?`
   - `Show unread emails that need a reply.`
   - `Find deadline-related emails from the last 7 days.`
3. Frontend sends the request to `POST /gmail/agent/triage` along with the current account/date filters and selected thread context when available.
4. Backend invokes Gemini with a system prompt plus tool definitions.
5. Gemini chooses one or more tools such as `search_emails`, `get_tag_counts`, or `get_thread`.
6. Backend executes the selected tools against MongoDB summaries and Gmail thread data.
7. Tool results are returned to Gemini.
8. Gemini responds with a grounded triage summary and recommended next actions.

### Scope of the current assistant

- Focused on inbox understanding, not autonomous execution.
- Read-oriented by default; it does not send emails or take destructive actions.
- Uses real synced inbox data rather than sample prompts or mock context.
- Best suited for prioritization, retrieval, and thread-aware summarization.

### Required vector index

The backend expects a vector index named:

- `email_embeddings_vector`

on the `embedding` field in `email_embeddings`.

If this index does not exist, semantic search endpoints will fail.

### Optional preload

To preload model/artifacts in backend environment:

```bash
cd backend
npm run preload:embeddings
```

## Available Scripts

### Frontend (`frontend/package.json`)

- `npm run dev` - start Next.js dev server.
- `npm run build` - production build.
- `npm run start` - serve production build.
- `npm run dev:container` - container-friendly dev host/port.
- `npm run start:container` - container-friendly prod host/port.
- `npm run lint` - run ESLint.

### Backend (`backend/package.json`)

- `npm run dev` - start backend with nodemon.
- `npm run start` - start backend with node.
- `npm run worker:dev` - start worker with nodemon.
- `npm run worker:start` - start worker with node.
- `npm run preload:embeddings` - preload embedding dependencies/model.

### Utility scripts (`backend/scripts`)

- `backfill-tags.js` - recompute and update tags for existing emails.
- `backfill-received-at.js` - normalize backfilled received timestamps.
- `seed-embedding.js` - seed a dummy embedding record for index/materialization workflows.

Run utility scripts from `backend` with Node (example):

```bash
cd backend
node scripts/backfill-tags.js
```

## Operational Notes

- Frontend calls API with `credentials: include`, so cookie auth and CORS origin setup must match.
- A separate worker process is mandatory for queue jobs (sync and incremental updates).
- First semantic query may be slower if model assets are being loaded.
- Gemini triage requests may occasionally hit transient provider rate limits or temporary `503` model availability spikes; backend includes retry/fallback handling.
- If Gmail history becomes invalid/expired, backend falls back to full account sync logic.

## Troubleshooting

### OAuth callback fails

- Validate `GOOGLE_REDIRECT_URI` exactly matches Google Console configuration.
- Confirm client ID/secret pair belong to same OAuth app.
- Check backend logs for state validation or token exchange errors.

### No incremental updates arriving

- Verify Pub/Sub push subscription points to `/gmail/push`.
- Confirm JWT audience and push signer env vars are correct.
- Ensure backend can verify push JWT and enqueue queue jobs.

### Semantic search returns errors

- Verify Python dependencies are installed in backend runtime.
- Confirm `email_embeddings_vector` index exists.
- Ensure embeddings are present for user/account documents.

### AI triage returns configuration errors

- Confirm `GEMINI_API_KEY` is present in `backend/.env`.
- Optionally set `GEMINI_MODEL`, otherwise the backend defaults to `gemini-2.5-flash`.
- Check `GET /gmail/agent/debug` to confirm the backend detects Gemini configuration.

### AI triage returns generic provider failures

- Retry the request once if Gemini returns a temporary `503` or rate-limit response.
- Confirm outbound internet access from the backend runtime.
- Check backend logs for model-specific quota or availability messages.

### Sync starts but inbox remains empty

- Confirm worker process is running and connected to Redis.
- Check Mongo write permissions and connection string.
- Inspect backend/worker logs for Gmail API or quota errors.

## Scope Boundaries

- Current provider integration is Gmail-focused.
- Payment flows and admin/RBAC are intentionally out of scope for this build.
- Semantic search requires vector index setup in MongoDB for full capability.
- The current AI assistant is intentionally scoped to inbox triage and retrieval, not autonomous reply generation or broad multi-agent workflows.
- Automated test coverage is the next engineering hardening step.
