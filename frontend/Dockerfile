# ── Estágio 1: dependências ───────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ── Estágio 2: build ──────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* são gravadas no bundle em tempo de build
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_D4SIGN_DESK_URL
ENV NEXT_PUBLIC_D4SIGN_DESK_URL=$NEXT_PUBLIC_D4SIGN_DESK_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build && mkdir -p /app/public

# ── Estágio 3: produção (imagem mínima com standalone) ────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3030
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static     ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3030
CMD ["node", "server.js"]
