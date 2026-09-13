# ─── Backend SiS AMA ────────────────────────────────────────────────────
# Build : compile TypeScript + génère le client Prisma + retire les devDeps.
# Runtime : ne contient que les dépendances de production + le build.

FROM node:22-bookworm-slim AS build

WORKDIR /app

# Outils de compilation pour les dépendances natives (ex: bcrypt) sur Debian slim.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
# npm ci déclenche le postinstall `prisma generate` :
# le schéma doit donc être présent AVANT l'installation.
RUN npm ci

COPY . .
RUN npx prisma generate \
  && npm run build \
  && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Prisma détecte la version d'OpenSSL installée pour déduire sa libssl.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/package.json ./package.json

# npm start = `prisma migrate deploy && node dist/index.js`
CMD ["npm", "start"]