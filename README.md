# KARVEN Backend

Production backend owned by KARVEN.

## Architecture
- Fastify API service
- PostgreSQL persistence
- Redis connectivity
- Protected admin API
- Public storefront API
- Audit history
- Idempotent database migrations
- Railway health/readiness checks
- Docker deployment

## Resources
Customers, Team, Content, Navigation, Legal, Plans, Discounts, Payments, Settings, Audit.

## Local run
```bash
cp .env.example .env
npm install
npm run migrate
npm start
```

## Production
Railway runs database migrations before every deploy, starts the service on `$PORT`, and checks `/ready`.

Required secrets:
- `DATABASE_URL`
- `REDIS_URL`
- `KARVEN_ADMIN_API_KEY`
- `KARVEN_ALLOWED_ORIGINS`

This repository contains no Twenty runtime or Twenty source dependency.
