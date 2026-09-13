# Déploiement serveur de SiS AMA (sans Coolify)

Ce dossier contient les scripts qui déploient **l'application complète** sur un
VPS Debian/Ubuntu avec Docker Compose — sans Coolify.

## Commande d'installation (une seule ligne)

```bash
curl -fsSL https://raw.githubusercontent.com/Teamfliyou/SiS-ama-nouveau/main/deploy/install.sh | sudo bash
```

Le script est **rejouable** : relancez la même commande pour mettre à jour le
code, reconstruire les images, appliquer les migrations Prisma et relancer les
conteneurs — **sans jamais toucher aux données**.

> Branche déployée : `feature/postgresql-migration` (la plus complète en
> matière de migration PostgreSQL). Elle bascule automatiquement sur `main` si
> elle n'existe plus.

## Architecture déployée

```
Internet ──► Port 80 : nginx (frontend React buildé)
                 │
                 ├── /api/* ──► backend Express/Prisma (port 5000, réseau interne)
                 │                 │
                 │                 └──► PostgreSQL-16 (réseau interne, port 5432 NON exposé)
                 └── / (fichiers statiques SPA)
```

- **postgres** : volume persistant `sis-ama_postgres_data`, base `sisama`,
  utilisateur `sisama`, mot de passe généré automatiquement.
- **backend** : `npm ci` → `prisma generate` → `npm run build`, puis au
  démarrage `npx prisma migrate deploy` avant de lancer le serveur sur
  `0.0.0.0:5000`.
- **frontend** : `npm run build`, servi par nginx, l'API appelée en
  même-origine (`/api`), donc aucune URL à coder en dur.
- `restart: unless-stopped` sur chaque service, healthchecks Docker partout,
  aucun secret committé (fichier `/opt/sis-ama/.env` en `chmod 600`, ignoré par
  git).

## Ce que fait install.sh

1. Vérifie que le script tourne en root (ou via `sudo`).
2. Installe si besoin : `curl`, `git`, `openssl`, Docker et le plugin
   Docker Compose.
3. Crée `/opt/sis-ama` et clone (ou met à jour) le dépôt dans la bonne branche.
4. Génère un `POSTGRES_PASSWORD` et un `JWT_SECRET` automatiquement dans
   `/opt/sis-ama/.env` (jamais committés ; conservés si ils existent déjà).
5. Détecte l'IP publique pour configurer `FRONTEND_URL`/CORS, ou utilise
   `DOMAIN` si fournie.
6. Lance `docker compose up -d --build`, applique les migrations et attend le
   healthcheck du backend.

### Variables optionnelles

```bash
# Exemple : passer un nom de domaine au lieu de l'IP publique
DOMAIN=sisama.mondomaine.com curl -fsSL https://raw.githubusercontent.com/Teamfliyou/SiS-ama-nouveau/main/deploy/install.sh | sudo bash
```

`.env` généré (exemple du contenu) :

```dotenv
POSTGRES_PASSWORD=<aléatoire>
JWT_SECRET=<aléatoire>
FRONTEND_URL=http://<ip-ou-domaine>
```

## Mise à jour / redéploiement

```bash
sudo bash /opt/sis-ama/deploy/install.sh
# ou, à distance :
curl -fsSL https://raw.githubusercontent.com/Teamfliyou/SiS-ama-nouveau/main/deploy/install.sh | sudo bash
```

## Commandes utiles

```bash
cd /opt/sis-ama
docker compose ps                    # état des conteneurs
docker compose logs -f backend       # logs de l'API
docker compose logs -f frontend      # logs nginx
curl -fsS http://localhost/api/health   # healthcheck (200 = Express + PostgreSQL OK)
docker compose exec backend npm run backup    # sauvegarde PostgreSQL (pg_dump)
```

## Désinstallation

```bash
sudo bash /opt/sis-ama/deploy/uninstall.sh
# ou :
curl -fsSL https://raw.githubusercontent.com/Teamfliyou/SiS-ama-nouveau/main/deploy/uninstall.sh | sudo bash
```

L'uninstall **arrête** les conteneurs et ne supprime les données **qu'après**
avoir tapé `SUPPRIMER` au clavier. Sans cela, le volume PostgreSQL est intact.

## Sécurité

- Port **5432 jamais exposé** sur l'hôte : PostgreSQL n'est joignable que
  depuis le réseau Docker interne.
- `JWT_SECRET` et `POSTGRES_PASSWORD` générés localement sur le serveur,
  jamais dans le dépôt GitHub.
- `NODE_ENV=production`, CORS restreint à `FRONTEND_URL`, rate limiting actif.
- Pour du TLS (HTTPS), placez un reverse proxy (ex. Caddy) devant le port 80,
  ou un tunnel ; l'app suit `X-Forwarded-Proto`.

## Ports

| Port hôte | Service    | Usage                    |
|-----------|------------|--------------------------|
| 80        | frontend   | nginx : UI + `/api`      |
| 5000      | backend    | interne uniquement       |
| 5432      | postgres   | **non exposé**           |