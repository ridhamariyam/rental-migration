# Rental Migration

Local Next.js app for the bridal rental dashboard.

## Setup

Install dependencies:

```bash
pnpm install
```

Create the local env file:

```bash
cp .env.example .env.local
```

Required local env values:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5435/rental_migration"
SESSION_SECRET="change-me-to-a-long-random-value-min-32-chars"
SUPER_ADMIN_EMAIL="admin@example.com"
SUPER_ADMIN_PASSWORD="change-me-to-a-strong-password"
NODE_ENV="development"
NEXT_PUBLIC_APP_URL="http://localhost:3003"

CLOUDINARY_CLOUD_NAME="change-me"
CLOUDINARY_API_KEY="change-me"
CLOUDINARY_API_SECRET="change-me"

NEXT_PUBLIC_MAPBOX_TOKEN="change-me"

MSG91_AUTHKEY="change-me"
MSG91_WHATSAPP_BASE_URL="https://api.msg91.com/api/v5/whatsapp"
NOTIFICATION_WORKER_SECRET="change-me-to-a-long-random-value-min-32-chars"
WHATSAPP_DEFAULT_COUNTRY_CODE="91"
```

Use real Cloudinary, Mapbox, and MSG91 values when testing those integrations.

## Database

Start local Postgres with Docker:

```bash
docker compose up -d
```

The database runs on:

```text
localhost:5435
```

Run migrations:

```bash
pnpm db:migrate
```

Optional seed data:

```bash
pnpm db:seed:tenants
```

Stop Postgres:

```bash
docker compose down
```

Stop Postgres and delete local data:

```bash
docker compose down -v
```

## Run

Start the dev server:

```bash
pnpm dev
```

Open:

```text
http://localhost:3003
```

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm test
```

## WhatsApp Worker

Dispatch queued MSG91 notifications:

```bash
curl -X POST http://localhost:3003/api/internal/notifications/dispatch \
  -H "x-worker-secret: YOUR_NOTIFICATION_WORKER_SECRET"
```

MSG91 webhook URL:

```text
https://your-domain.com/api/webhooks/msg91/whatsapp
```
