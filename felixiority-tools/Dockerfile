FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 felix && useradd --system --uid 1001 --gid felix felix
COPY --from=build --chown=felix:felix /app/.next/standalone ./
COPY --from=build --chown=felix:felix /app/.next/static ./.next/static
COPY --from=build --chown=felix:felix /app/public ./public
USER felix
EXPOSE 3000
CMD ["node", "server.js"]
