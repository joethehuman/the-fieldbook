FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
RUN npm install --global pnpm@10.17.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY demo/package.json ./demo/package.json
COPY patches ./patches
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY . .
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG FIELDBOOK_BUILD_REVISION
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV FIELDBOOK_BUILD_REVISION=$FIELDBOOK_BUILD_REVISION
ENV FIELDBOOK_APP_KIND=installed
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/scripts/run-cleanup.mjs ./scripts/run-cleanup.mjs
USER node
EXPOSE 8080
CMD ["node", "server.js"]
