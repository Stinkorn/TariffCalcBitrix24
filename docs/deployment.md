# Deployment (Single Origin)

## Target

Single-origin deployment where backend and frontend are served from one domain:

- `https://calc.example.com`

NestJS serves React static build from `apps/web/dist`.

## Required env

Create `apps/api/.env` on server:

```env
APP_PORT=9099
APP_PUBLIC_URL=https://calc.example.com
WEB_PUBLIC_URL=https://calc.example.com
DATABASE_URL=postgresql://user:password@host:5432/dbname
BITRIX_PORTAL_DOMAIN=
BITRIX_WEBHOOK_URL=
```

## Build and run on VPS

1. Install Node.js (LTS) and npm.
2. Clone repository.
3. Install dependencies:
   - `npm install`
4. Build frontend:
   - `npm run build:web`
5. Build backend:
   - `npm run build:api`
6. Generate Prisma client:
   - `npm run prisma:generate --workspace @tariffcalc/api`
7. Sync schema:
   - `npm run prisma:push --workspace @tariffcalc/api`
8. Run backend:
   - `npm run start:prod`

## Nginx example

```nginx
server {
    server_name calc.example.com;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:9099;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## HTTPS

Enable TLS certificate for `calc.example.com` (Let's Encrypt or managed cert).

## Bitrix placement registration

After deployment and HTTPS setup:

1. Ensure `APP_PUBLIC_URL` and `WEB_PUBLIC_URL` both point to the same domain.
2. Call:
   - `POST /bitrix/placement/bind`
3. Bitrix handler URL:
   - `https://calc.example.com/bitrix/deal-tab`
