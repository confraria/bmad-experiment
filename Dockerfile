# syntax=docker/dockerfile:1.7

# ---- deps ----
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# ---- builder ----
FROM node:24-slim AS builder
WORKDIR /app
ARG DATABASE_URL="file:./build.db"
ENV DATABASE_URL=$DATABASE_URL
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ---- runner ----
# Uses Next's standalone output — a minimal traced runtime (~60MB node_modules).
# Migrations run via a small libsql-based script (prisma/migrate.mjs) that uses
# deps already traced by standalone — avoids shipping the Prisma CLI (~600MB).
FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma/migrate.mjs ./prisma/migrate.mjs

# libsql platform-specific native bindings.
# Next's standalone trace misses these because they're resolved via
# dynamic require at runtime, not static import.
COPY --from=builder /app/node_modules/@libsql ./node_modules/@libsql

EXPOSE 3000
CMD ["sh", "-c", "node prisma/migrate.mjs && node server.js"]
