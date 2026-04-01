# ── Stage 1: Build frontend ──────────────────────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Backend runtime ─────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache wget

# Backend dependencies
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Backend source
COPY backend/src/ ./src/

# Frontend build output served as static files
COPY --from=frontend-build /frontend/dist ./public/

# Version info baked in at build time
COPY versions.json ./versions.json

EXPOSE 3000
CMD ["node", "src/index.js"]
