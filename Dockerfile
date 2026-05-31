FROM node:20-alpine AS builder

WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --only=production

COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm install -D typescript @types/node && npx tsc

# ─── Production image ─────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY backend/package.json ./

# Create logs directory
RUN mkdir -p /app/logs

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "dist/index.js"]
