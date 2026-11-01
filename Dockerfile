# NaijaDeals - Dockerfile
# Multi-stage build for Next.js application

FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies only when needed
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# Generate Prisma Client
FROM base AS prisma
COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma/
RUN npx prisma generate

# Build the application
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=prisma /app/node_modules/.prisma ./node_modules/.prisma
COPY . .
RUN npm run build

# Production image
FROM base AS runner
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]