# ─── Frontend SiS AMA ───────────────────────────────────────────────────
# Build : npm ci + npm run build (Vite).
# Runtime : nginx sert le build statique et reverse-proxy /api vers le backend.

FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# URL de l'API. Vide = même origine (/api est servi par nginx) :
# le build appelle donc `/api/...` sur le domaine du site.
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

FROM nginx:1.27-alpine AS runtime

RUN rm -f /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]