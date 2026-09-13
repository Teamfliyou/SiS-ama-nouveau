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
RUN npm ci

COPY . .
RUN npx prisma generate \
  && npm run build \
  && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/package.json ./package.json

# npm start = `prisma migrate deploy && node dist/index.js`
CMD ["npm", "start"]