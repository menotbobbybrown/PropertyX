# PropertyX — Production Deployment Guide

This guide covers deploying PropertyX to a production Linux host (e.g. Hetzner CX22/CX32 for ~$6–$12/month, DigitalOcean, or AWS EC2) using Docker Compose, PostgreSQL 17 + PostGIS, Meilisearch, Redis, and Caddy with automatic SSL.

---

## 1. Architecture Overview

```
                      [ Internet / Cloudflare CDN ]
                                   │
                                   ▼ :80 / :443 (HTTP/3 QUIC)
                       [ Caddy Reverse Proxy ]
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
          [ Next.js 15 Web/API ]        [ Outbox Worker ]
              (Port 3000)                (scripts/worker.ts)
                    │                             │
    ┌───────────────┼───────────────┐             │
    ▼               ▼               ▼             ▼
[ Postgres 17 ]  [ Redis ]   [ Meilisearch ] [ Cloudflare R2 ]
 (PostGIS 3.5)  (Rate limit) (Faceted Search)  (Zero egress)
```

---

## 2. Server Prerequisites

- **OS**: Ubuntu 22.04 LTS or 24.04 LTS
- **Hardware**: Minimum 2 vCPU, 4GB RAM, 40GB NVMe SSD
- **Network**: Ports `80` (HTTP), `443` (HTTPS), and `443/udp` (QUIC) open in your firewall

Install Docker & Docker Compose on your server:
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
sudo systemctl enable --now docker
```

---

## 3. DNS Configuration

Point your domain to your server's public IPv4 (and IPv6 if available):

| Type | Name | Content | Proxy status |
| --- | --- | --- | --- |
| `A` | `@` (or `propertyx.pk`) | `YOUR_SERVER_IP` | DNS only (or Cloudflare proxied) |
| `A` | `www` | `YOUR_SERVER_IP` | DNS only (or Cloudflare proxied) |

---

## 4. Setup & Environment Variables

Clone the repository into `/opt/propertyx`:
```bash
sudo git clone https://github.com/faizanchohan3/PropertyX.git /opt/propertyx
cd /opt/propertyx
```

Create your production environment file `.env`:
```bash
cp .env.example .env
nano .env
```

### Production `.env` Checklist:

```ini
# Domain & App
DOMAIN=propertyx.pk
ACME_EMAIL=admin@propertyx.pk
NEXT_PUBLIC_APP_URL=https://propertyx.pk
NODE_ENV=production

# Security (Generate with: openssl rand -base64 36)
AUTH_SECRET=your-secure-32-char-random-secret-here

# Database credentials for Docker Compose
POSTGRES_USER=propertyx_prod
POSTGRES_PASSWORD=YourStrongDatabasePasswordHere123!
POSTGRES_DB=propertyx
DATABASE_URL=postgresql://propertyx_prod:YourStrongDatabasePasswordHere123!@postgres:5432/propertyx?sslmode=disable
DIRECT_URL=postgresql://propertyx_prod:YourStrongDatabasePasswordHere123!@postgres:5432/propertyx?sslmode=disable

# Cache & Search
REDIS_URL=redis://redis:6379
MEILISEARCH_MASTER_KEY=YourStrongMeiliKeyHere123!

# Storage: Cloudflare R2 (Recommended for zero egress fees)
STORAGE_DRIVER=r2
S3_BUCKET=propertyx-media
S3_REGION=auto
S3_ENDPOINT=https://<your-cloudflare-account-id>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=your-r2-access-key-id
S3_SECRET_ACCESS_KEY=your-r2-secret-access-key
S3_PUBLIC_URL=https://media.propertyx.pk

# WhatsApp Business API (Meta Cloud API or Twilio)
WHATSAPP_PROVIDER=meta
WHATSAPP_PHONE_ID=your-meta-phone-id
WHATSAPP_TOKEN=your-meta-system-user-token

# Email (Resend)
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_your_api_key_here
EMAIL_FROM=PropertyX <no-reply@propertyx.pk>

# Pakistani SMS (PTCL / Telenor / Local Gateway)
SMS_PROVIDER=pk_sms
PK_SMS_ENDPOINT=https://api.bulksms.pk/send
PK_SMS_API_KEY=your-sms-api-key
```

---

## 5. First-Time Launch & Database Initialization

Run the containers:
```bash
docker compose -f docker-compose.prod.yml up -d
```

Run database migrations:
```bash
docker compose -f docker-compose.prod.yml exec app npm run db:migrate
```

Seed initial reference data (cities, roles, pricing plans):
```bash
docker compose -f docker-compose.prod.yml exec app npm run db:reference
```

Verify service health:
```bash
docker compose -f docker-compose.prod.yml ps
curl -I https://propertyx.pk/api/health
```

---

## 6. Cloudflare R2 Setup (Media Storage)

1. Log in to the Cloudflare dashboard → **R2** → **Create Bucket** named `propertyx-media`.
2. Under bucket **Settings** → **CORS Policy**, add:
   ```json
   [
     {
       "AllowedOrigins": ["https://propertyx.pk", "https://www.propertyx.pk"],
       "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
       "AllowedHeaders": ["*"]
     }
   ]
   ```
3. Connect a custom domain (e.g. `media.propertyx.pk`) or use the public R2 dev URL for `S3_PUBLIC_URL`.
4. Go to **Manage R2 API Tokens** → **Create API Token** (Object Read & Write) → copy Access Key ID and Secret Access Key into `.env`.

---

## 7. Zero-Downtime Updates Playbook

When shipping updates:
```bash
cd /opt/propertyx
git pull origin main
docker compose -f docker-compose.prod.yml build app worker
docker compose -f docker-compose.prod.yml exec app npm run db:migrate
docker compose -f docker-compose.prod.yml up -d --no-deps app worker
```

---

## 8. Automated Database Backups

Create a daily cron job:
```bash
sudo crontab -e
```
Add:
```bash
0 3 * * * docker compose -f /opt/propertyx/docker-compose.prod.yml exec -T postgres pg_dump -U propertyx_prod propertyx | gzip > /opt/backups/propertyx_$(date +\%F).sql.gz
```
Keep 14 days of backups with logrotate or an S3 upload script.
