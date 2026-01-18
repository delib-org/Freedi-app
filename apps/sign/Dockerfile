# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Build arguments for Next.js public env vars (inlined at build time)
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_MAIN_APP_URL
ARG NEXT_PUBLIC_GOOGLE_DOCS_SERVICE_ACCOUNT_EMAIL
ARG NEXT_PUBLIC_SENTRY_DSN

# Set as env vars for the build process
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ENV NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID
ENV NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=$NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_MAIN_APP_URL=$NEXT_PUBLIC_MAIN_APP_URL
ENV NEXT_PUBLIC_GOOGLE_DOCS_SERVICE_ACCOUNT_EMAIL=$NEXT_PUBLIC_GOOGLE_DOCS_SERVICE_ACCOUNT_EMAIL
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN

# Copy root package files
COPY package*.json ./
COPY packages/shared-types/package*.json ./packages/shared-types/
COPY packages/shared-i18n/package*.json ./packages/shared-i18n/
COPY apps/sign/package*.json ./apps/sign/

# Install dependencies
RUN npm ci --ignore-scripts

# Copy source code
COPY packages/shared-types ./packages/shared-types
COPY packages/shared-i18n ./packages/shared-i18n
COPY apps/sign ./apps/sign

# Build shared packages
WORKDIR /app/packages/shared-types
RUN npm run build

WORKDIR /app/packages/shared-i18n
RUN npm run build || true

# Build the Next.js app
WORKDIR /app/apps/sign
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application
# The standalone output for a monorepo preserves the directory structure
COPY --from=builder /app/apps/sign/public ./apps/sign/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/sign/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/sign/.next/static ./apps/sign/.next/static

USER nextjs

EXPOSE 8080

# The server.js is located within the apps/sign directory in standalone mode
CMD ["node", "apps/sign/server.js"]
