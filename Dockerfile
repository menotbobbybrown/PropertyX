# Multi-stage production Dockerfile for PropertyX (Next.js 15 monorepo)
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Stage 1: Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json tsconfig.json tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/ai/package.json ./packages/ai/
COPY packages/auth/package.json ./packages/auth/
COPY packages/core/package.json ./packages/core/
COPY packages/database/package.json ./packages/database/
COPY packages/notifications/package.json ./packages/notifications/
COPY packages/payments/package.json ./packages/payments/
COPY packages/search/package.json ./packages/search/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/

RUN npm ci

# Stage 2: Build the monorepo
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set production build environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Run build for Next.js web application
RUN npm run build

# Stage 3: Production runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built artifacts and necessary runtime files
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/scripts ./scripts

USER nextjs

EXPOSE 3000

CMD ["npm", "run", "start"]
