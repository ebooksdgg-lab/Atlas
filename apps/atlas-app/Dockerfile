FROM node:22-alpine AS base

# ─── Dependencies ────────────────────────────────────────────────
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ─── Builder ─────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# DATABASE_URL placeholder prevents module-load errors during build analysis
ENV DATABASE_URL=postgresql://build-placeholder/atlas
RUN npm run build

# ─── Runner ──────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
RUN mkdir .next && chown nextjs:nodejs .next
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
# postgres and bcryptjs are bundled by Next.js and absent from standalone node_modules.
# Both are zero-dependency packages so copying from deps stage is sufficient.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/postgres  ./scripts/node_modules/postgres
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/bcryptjs  ./scripts/node_modules/bcryptjs

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
