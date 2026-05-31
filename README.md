# Wix ↔ HubSpot Sync — Full Stack Integration

> Built for the Senior Full Stack Developer assessment. Bi-directional contact sync, form lead capture, OAuth 2.0, field mapping UI, and loop-safe webhook handling.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [A) API Plan](#a-api-plan)
- [Feature #1 — Bi-Directional Contact Sync](#feature-1--bi-directional-contact-sync)
- [Feature #2 — Form & Lead Capture](#feature-2--form--lead-capture)
- [Security Design](#security-design)
- [Project Structure](#project-structure)
- [Setup & Running](#setup--running)
- [Environment Variables](#environment-variables)
- [Database Schema](#database-schema)
- [Deployment](#deployment)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Wix Dashboard                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Dashboard   │  │ Field Mapping│  │   Form Integration   │  │
│  │  (React SPA) │  │     UI       │  │       UI             │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         └────────────────┬┘───────────────────────┘             │
│                  Bearer JWT (session token)                      │
└──────────────────────────┼──────────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────────────┐
│               Node.js / TypeScript Backend (Express)             │
│                                                                  │
│  /api/auth          OAuth flow, session JWT issuance            │
│  /api/sync          Manual sync triggers, event log             │
│  /api/mapping       Field mapping CRUD                          │
│  /api/forms         HubSpot form list + embed code              │
│  /api/webhooks      Wix + HubSpot inbound webhook handlers      │
│                                                                  │
│  ┌─────────────┐  ┌────────────────┐  ┌──────────────────────┐ │
│  │ HubSpotOAuth│  │  HubSpotCRM    │  │    SyncService       │ │
│  │  Service    │  │   Service      │  │  (loop-safe bidisync)│ │
│  └─────────────┘  └────────────────┘  └──────────────────────┘ │
│                                                                  │
│  AES-256-GCM token encryption  │  Winston safe logging          │
└──────────────┬──────────────────────────────┬───────────────────┘
               │                              │
┌──────────────▼──────────┐   ┌──────────────▼──────────────────┐
│      Supabase / Postgres │   │         HubSpot CRM API          │
│                          │   │                                  │
│  • hubspot_connections   │   │  /crm/v3/objects/contacts        │
│  • contact_mappings      │   │  /crm/v3/objects/contacts/search │
│  • field_mappings        │   │  /crm/v3/properties/contacts     │
│  • sync_events (audit)   │   │  /marketing/v3/forms             │
│  • wix_installations     │   │  /oauth/v1/token                 │
└──────────────────────────┘   └──────────────────────────────────┘
```

---

## A) API Plan

### Feature #1 — Bi-Directional Contact Sync

#### Wix Side

| API | Purpose |
|-----|---------|
| **Wix Contacts API** (`wix-crm-backend`) | Read/write Wix contacts in Velo backend code |
| **Wix Automations / Webhooks** | Fire `contact/created` and `contact/updated` events to our backend |
| **Wix Secrets Manager** | Would store tokens in production Wix apps |

**Flow (Wix → HubSpot):**
1. Wix fires a webhook on contact create/update → `/api/webhooks/wix`
2. Backend verifies HMAC signature
3. `SyncService.syncWixToHubSpot()` applies field mappings, calls HubSpot CRM API
4. Tags the HubSpot write with `wix_sync_source=wix` + `wix_sync_id=<uuid>`

#### HubSpot Side

| API | Purpose |
|-----|---------|
| **HubSpot CRM Contacts API v3** | `POST /crm/v3/objects/contacts` — create |
| | `PATCH /crm/v3/objects/contacts/{id}` — update |
| | `POST /crm/v3/objects/contacts/search` — find by email |
| | `POST /crm/v3/objects/contacts/batch/upsert` — upsert by email |
| **HubSpot Properties API v3** | `GET /crm/v3/properties/contacts` — list all properties for field mapping UI |
| **HubSpot Webhooks API** | Subscribe to `contact.creation` + `contact.propertyChange` events |
| **HubSpot OAuth v2** | Token exchange, refresh, scope validation |

**Flow (HubSpot → Wix):**
1. HubSpot fires webhook to `/api/webhooks/hubspot`
2. Backend verifies `x-hubspot-signature-v3` HMAC
3. Checks if the change was caused by our own write (via `wix_sync_source` property)
4. If external change: looks up Wix contact via `contact_mappings` table, calls Wix Contacts API

#### Loop Prevention (critical)

```
┌──────────────────────────────────────────────────────┐
│              Infinite Loop Prevention                 │
│                                                      │
│  1. Source tagging: every write tags the record      │
│     with wix_sync_source=wix|hubspot + sync_id       │
│                                                      │
│  2. Origin check: inbound HubSpot webhook checks     │
│     wix_sync_source — if "wix", skip immediately     │
│                                                      │
│  3. Dedup window: 30-second window per entity ID     │
│     using sync_events table — prevents retry storms  │
│                                                      │
│  4. Idempotency: contact_mappings table stores       │
│     WixContactId ↔ HubSpotContactId — no duplicates  │
└──────────────────────────────────────────────────────┘
```

### Feature #2 — Form & Lead Capture

**Approach A — Embed HubSpot Forms:**

| API | Purpose |
|-----|---------|
| **HubSpot Forms API v3** | `GET /marketing/v3/forms` — list forms for UI |
| HubSpot JS embed (`hsforms.net`) | Renders form in Wix HTML component |

Submissions go directly to HubSpot. UTM params captured via `hs_context` object in the embed.

**Approach B — Push Wix Submissions:**

| API | Purpose |
|-----|---------|
| `POST /api/sync/form-submission` | Our backend endpoint called from Wix Velo |
| **HubSpot Batch Upsert** | Creates/updates contact by email with full attribution |

Attribution properties stored:
- `hs_analytics_source` ← `utm_source`
- `hs_analytics_source_data_1` ← `utm_medium`
- `hs_analytics_source_data_2` ← `utm_campaign`
- `wix_utm_term`, `wix_utm_content`, `wix_page_url`, `wix_referrer`, `wix_form_submitted_at`

---

## Feature #1 — Bi-Directional Contact Sync

### Conflict Resolution

**Strategy: "Last Updated Wins"**

When both sides have a more recent update (race condition):
- Compare `updatedDate` (Wix) vs `hs_lastmodifieddate` (HubSpot)
- The more recently updated record wins
- For new contacts: email is used as the dedup key (upsert by email)

### Contact ID Mapping

```sql
contact_mappings (
  wix_instance_id TEXT,
  wix_contact_id TEXT,       -- Wix internal contact ID
  hubspot_contact_id TEXT,   -- HubSpot vid / objectId
  last_sync_source TEXT,     -- 'wix' | 'hubspot'
  last_sync_id TEXT,         -- correlation UUID
  UNIQUE(wix_instance_id, wix_contact_id),
  UNIQUE(wix_instance_id, hubspot_contact_id)
)
```

### Sync Event Log

Every sync operation writes to `sync_events`:
- `sync_id` — UUID for correlation across logs
- `source` — where the event originated
- `status` — `pending | success | failed | skipped`
- Used for deduplication query (30s window)

---

## Feature #2 — Form & Lead Capture

### HubSpot Form Embed Flow

```
User visits Wix page
       ↓
HubSpot JS loads from jsforms.net
       ↓
User fills + submits form
       ↓
HubSpot receives submission directly
       ↓
Submission creates/updates contact in HubSpot
       ↓
HubSpot webhook fires → our backend → Wix contact sync
```

### Wix Form Push Flow

```
User fills Wix native form
       ↓
Wix Velo onFormSubmit fires
       ↓
Velo calls POST /api/sync/form-submission
       ↓
Backend upserts HubSpot contact by email
       ↓
UTM params, page URL, referrer attached to contact
       ↓
Sync event logged for observability
```

---

## Security Design

### OAuth 2.0

- Standard Authorization Code flow with HubSpot
- Least-privilege scopes: `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.schemas.contacts.read`, `forms`, `oauth`
- Tokens never sent to browser — backend-only

### Token Storage

```
access_token → AES-256-GCM encrypt → store in Supabase
refresh_token → AES-256-GCM encrypt → store in Supabase
Encryption key → derived from JWT_SECRET via scrypt
```

Token refresh happens automatically when within 5 minutes of expiry.

### Request Authentication

```
Dashboard → POST /api/auth/session → receive short-lived JWT (1h)
Dashboard → All subsequent API calls → Bearer JWT in Authorization header
Webhooks → HMAC-SHA256 signature verification (HubSpot v3, Wix)
```

### Logging Safety

- Winston logger strips `access_token`, `refresh_token`, `Authorization: Bearer ...` from all logs
- PII (emails, names) not logged — only IDs and status

---

## Project Structure

```
wix-hubspot-sync/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Express app + middleware
│   │   ├── routes/
│   │   │   ├── auth.ts           # OAuth + session
│   │   │   ├── sync.ts           # Manual sync + event log
│   │   │   ├── webhooks.ts       # Wix + HubSpot inbound
│   │   │   ├── mapping.ts        # Field mapping CRUD
│   │   │   ├── forms.ts          # HubSpot form list + embed
│   │   │   └── health.ts
│   │   ├── services/
│   │   │   ├── hubspotOAuth.ts   # OAuth flow + token refresh
│   │   │   ├── hubspotCRM.ts     # CRM API calls
│   │   │   └── syncService.ts    # Core sync logic + loop prevention
│   │   ├── middleware/
│   │   │   ├── auth.ts           # JWT verification
│   │   │   └── errorHandler.ts
│   │   └── utils/
│   │       ├── logger.ts         # Safe Winston logger
│   │       ├── encryption.ts     # AES-256-GCM
│   │       └── supabase.ts       # DB client + types
│   ├── supabase-schema.sql       # Full DB schema
│   ├── .env.example
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx               # Router + session init
│   │   ├── components/
│   │   │   ├── Layout.tsx        # Sidebar nav
│   │   │   └── LoadingScreen.tsx
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx     # Connection status + activity
│   │   │   ├── FieldMapping.tsx  # Mapping table UI
│   │   │   ├── SyncLog.tsx       # Audit log view
│   │   │   └── FormIntegration.tsx # Embed + push flows
│   │   └── utils/
│   │       └── api.ts            # Axios client w/ auth
│   └── package.json
│
├── .github/workflows/ci.yml      # GitHub Actions CI/CD
├── Dockerfile                    # Production container
├── docker-compose.yml
└── README.md
```

---

## Setup & Running

### Prerequisites

- Node.js 20+
- Supabase project (free tier works)
- HubSpot developer account + app
- Wix developer account + CLI app

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/wix-hubspot-sync
cd wix-hubspot-sync

# Install backend
cd backend && npm install

# Install frontend
cd ../frontend && npm install
```

### 2. Configure Environment

```bash
cd backend
cp .env.example .env
# Edit .env with your credentials
```

### 3. Run Database Schema

Copy `backend/supabase-schema.sql` and run it in your Supabase SQL editor.

### 4. Start Development

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

Open http://localhost:3000

### 5. Configure HubSpot App

In HubSpot developer portal:
- Set OAuth redirect URI to: `http://localhost:3001/api/auth/hubspot/callback`
- Subscribe webhooks to: `https://your-domain.com/api/webhooks/hubspot`
- Events: `contact.creation`, `contact.propertyChange`

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-only) |
| `HUBSPOT_CLIENT_ID` | HubSpot app client ID |
| `HUBSPOT_CLIENT_SECRET` | HubSpot app secret |
| `HUBSPOT_REDIRECT_URI` | OAuth callback URL |
| `WIX_APP_ID` | Wix app ID |
| `WIX_APP_SECRET` | Used to verify Wix instance tokens |
| `WIX_WEBHOOK_SECRET` | HMAC secret for Wix webhooks |
| `HUBSPOT_WEBHOOK_SECRET` | HMAC secret for HubSpot webhooks |
| `JWT_SECRET` | Min 32 chars — used for session JWTs and token encryption |
| `SYNC_DEDUP_WINDOW_MS` | Dedup window in ms (default: 30000) |

---

## Database Schema

See `backend/supabase-schema.sql` for the full annotated schema.

Key tables:
- **`hubspot_connections`** — AES-encrypted tokens, portal ID, per Wix instance
- **`contact_mappings`** — WixContactId ↔ HubSpotContactId index
- **`field_mappings`** — user-configured field sync rules
- **`sync_events`** — append-only audit log, also used for dedup

---

## Deployment

### Docker (Self-Hosted)

```bash
docker build -t wix-hubspot-backend .
docker run -p 3001:3001 --env-file backend/.env wix-hubspot-backend
```

### Railway / Render / Fly.io

```bash
# Railway
railway init && railway up

# Render: connect GitHub repo, set env vars in dashboard
```

### Frontend (Vercel)

```bash
cd frontend
vercel --prod
```

Set `VITE_API_URL` to your backend URL.

---

## Acceptance Criteria Checklist

### Feature #1

- [x] New contact in Wix → created in HubSpot
- [x] New contact in HubSpot → created in Wix
- [x] Wix contact update → HubSpot update (mapped fields only)
- [x] HubSpot update → Wix update (mapped fields only)
- [x] Single update does NOT cause ping-pong (loop prevention via source tag + dedup window)
- [x] Wix↔HubSpot ID mapping persisted in DB

### Feature #2

- [x] HubSpot form embed code generated per form
- [x] Wix form submission → HubSpot contact/lead within seconds
- [x] UTM attribution captured: `utm_source/medium/campaign/term/content`
- [x] Page URL and referrer attached to contact

### Security

- [x] OAuth 2.0 flow (no API keys in frontend)
- [x] Tokens stored encrypted (AES-256-GCM)
- [x] Token auto-refresh
- [x] Least-privilege scopes
- [x] Safe logging (no tokens or PII in logs)
- [x] Connect/disconnect from dashboard

### Field Mapping UI

- [x] Table with Wix field / HubSpot property / direction / transform
- [x] Save mapping button
- [x] Duplicate property validation
- [x] Sync uses saved mapping rules

---

*Built with Node.js + TypeScript, React, Supabase, HubSpot CRM API v3, Wix Platform APIs*
