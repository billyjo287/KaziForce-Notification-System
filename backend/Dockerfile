# The backend image: ONE image for both Railway services, the API (npm start) and the worker
# (npm run start:worker). Build from the REPOSITORY ROOT (npm workspaces share one lockfile):
#   docker build -f backend/Dockerfile -t kaziforce-backend .
FROM node:22-alpine AS build
WORKDIR /app
# npm 11.20+ (see package.json "engines"; older npm 11 versions mis-install native add-ons).
RUN npm install -g npm@11.20.0

# Install first (cached while only source code changes). Every workspace's package.json must be
# present for `npm ci`; only the backend's dependencies are installed.
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY backend/prisma backend/prisma
COPY backend/prisma.config.ts backend/
# `prisma generate` (run by npm ci) reads prisma.config.ts, which needs a DATABASE_URL; nothing
# connects during the build, so a placeholder is enough (the real one comes at run time).
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build     npm ci --workspace backend --include-workspace-root=false

COPY backend backend
RUN npm run build --workspace backend && mkdir -p backend/node_modules

# ---- Runtime packages only (no test runners, linters or type checker) ----
FROM node:22-alpine AS prod-deps
WORKDIR /app
RUN npm install -g npm@11.20.0
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY backend/prisma backend/prisma
COPY backend/prisma.config.ts backend/
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build     npm ci --workspace backend --include-workspace-root=false --omit=dev     && mkdir -p backend/node_modules

# ---- Runtime ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
# The built backend: dist (the app), prisma (schema and migrations), src (used by the bootstrap
# script, run with tsx) and the runtime packages, which include the Prisma CLI for migrations.
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=prod-deps /app/backend/node_modules backend/node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/backend/package.json backend/
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/backend/src backend/src
COPY --from=build /app/backend/prisma backend/prisma
COPY --from=build /app/backend/prisma.config.ts backend/
WORKDIR /app/backend
USER node
EXPOSE 4000
# The API by default; the worker service overrides the start command (railway.worker.json).
CMD ["node", "dist/server.js"]
