# ASSO AMA SIS - Système d'Information Scolaire

🚀 Une solution moderne de gestion scolaire pour les associations et écoles.

## ✨ Fonctionnalités

- **Authentification Sécurisée** : Portail de connexion pour l'administration (JWT).
- **Gestion des Classes** : Création et édition de classes avec frais de scolarité associés.
- **Répertoire des Élèves** : Inscription, modification et suivi des élèves.
- **Gestion des Professeurs** : Affectation aux classes et matières.
- **Suivi Financier** : Gestion des paiements (acomptes, solde restant) avec historique complet.
- **Présences** : Pointage quotidien et historique par classe.
- **Import CSV** : Import en masse des élèves depuis un fichier CSV.
- **Dashboard Dynamique** : Vue d'ensemble en temps réel des indicateurs clés (élèves, classes, revenus).

## 🛠️ Stack Technique

- **Frontend** : React + TypeScript + Tailwind CSS + Lucide React.
- **Backend** : Node.js + Express + Prisma (ORM), API REST modulaire (`server/routes/`).
- **Base de Données** : PostgreSQL.

## 🔌 Architecture API

| Module | Endpoints |
|---|---|
| Authentification | `POST /api/auth/login`, `PUT /api/auth/password` |
| Administration | `GET/POST /api/users`, `PUT /api/users/:id/role`, `DELETE /api/users/:id` |
| Élèves | `GET/POST /api/students`, `GET/PUT/DELETE /api/students/:id` |
| Professeurs | `GET/POST /api/teachers`, `PUT/DELETE /api/teachers/:id` |
| Classes | `GET/POST /api/classes`, `PUT/DELETE /api/classes/:id` |
| Années scolaires | `GET/POST /api/school-years`, `PUT/DELETE /api/school-years/:id` |
| Familles | `GET/POST /api/families`, `PUT/DELETE /api/families/:id` |
| Présences | `GET/POST /api/attendance`, `GET /api/attendance/history` |
| Finances | `GET/POST /api/finances`, `PUT/DELETE /api/finances/:id` |
| Import CSV | `POST /api/import-csv/students`, `POST /api/import-csv/teachers` |
| Sauvegardes | `GET /api/export`, `POST /api/import/full` |
| Statistiques | `GET /api/stats` |

Toutes les routes (hors login et bootstrap initial) nécessitent un token JWT via l'en-tête `Authorization: Bearer <token>`.

> 📁 Données : un élève garde un **historique d'inscriptions** (classes suivies,
> automatique à chaque changement de classe), un professeur peut être affecté à
> **plusieurs classes**, les paiements utilisent des méthodes typées (`Espèces`,
> `Carte bancaire`, `Virement`, `Chèque`, `Mobile Money`, `Autre`) et les présences
> sont stockées comme de vraies dates. Les exports JSON sont versionnés
> (`version: "3"`) et l'import accepte aussi les sauvegardes v2.

## 🚀 Démarrage Rapide (PostgreSQL)

### 1. Installer PostgreSQL

Sur **Ubuntu / Debian** :

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
service postgresql start        # ou : sudo systemctl start postgresql
```

### 2. Créer un utilisateur et une base

```bash
sudo -u postgres psql
```

Dans le prompt `psql` :

```sql
CREATE USER sisama_user WITH PASSWORD 'mot_de_passe';
CREATE DATABASE sisama OWNER sisama_user;
GRANT ALL PRIVILEGES ON DATABASE sisama TO sisama_user;
```

> Choisissez un mot de passe fort et gardez-le secret. En local pendant le
> développement `mot_de_passe` suffit, mais il devra être remplacé (et refusé)
> sur un serveur réel.

Pour exécuter les migrations en local (`prisma migrate dev`), l'utilisateur a
aussi besoin de pouvoir créer des bases temporaires (bases "shadow") :

```bash
sudo -u postgres psql -c "ALTER ROLE sisama_user CREATEDB;"
```

Les tests automatisés utilisent une base dédiée `sisama_test` :

```bash
sudo -u postgres psql -c "CREATE DATABASE sisama_test OWNER sisama_user;"
```

### 3. Configurer l'application

```bash
cd server
cp .env.example .env        # puis renseigner JWT_SECRET et DATABASE_URL
```

`DATABASE_URL` doit pointer vers votre base PostgreSQL :

```
DATABASE_URL="postgresql://sisama_user:mot_de_passe@localhost:5432/sisama?schema=public"
```

Format : `postgresql://UTILISATEUR:MOT_DE_PASSE@HOTE:5432/NOM_BASE?schema=public`.

Générez un vrai `JWT_SECRET` :

```bash
openssl rand -base64 48
```

### 4. Installer et préparer le backend

```bash
cd server
npm install                  # génère aussi Prisma Client (postinstall)
npx prisma generate
npx prisma migrate deploy    # applique les migrations sur la base PostgreSQL
npm run build                # compile le serveur dans dist/
```

### 5. Frontend

```bash
cd frontend
cp .env.example .env        # VITE_API_URL vide = proxy Vite vers localhost:5000
npm install
```

### Lancement

```bash
# Terminal 1 — API
cd server && npm run dev

# Terminal 2 — Interface
cd frontend && npm run dev
```

En développement, le proxy Vite transmet `/api/*` vers `http://localhost:5000` (configurable via `VITE_PROXY_TARGET`). En production, définir `VITE_API_URL` avec l'URL publique de l'API avant `npm run build`.

## 🧪 Tests (backend)

Les tests vitest s'exécutent contre une base PostgreSQL dédiée `sisama_test`
(sur `localhost:5432`). Elle doit exister et l'utilisateur doit pouvoir s'y
connecter. La base est réinitialisée automatiquement au démarrage de la suite.

```bash
cd server
npm test
```

Si votre mot de passe PostgreSQL local diffère du mot de passe de
développement attendu, définissez `TEST_DATABASE_URL` :

```bash
TEST_DATABASE_URL="postgresql://sisama_user:mot_de_passe@localhost:5432/sisama_test?schema=public" npm test
```

## 💾 Sauvegardes / Restauration (PostgreSQL)

L'endpoint applicatif `GET /api/export` (+ `POST /api/import/full`) exporte
toujours l'intégralité des données métier en JSON (jamais de mots de passe).
Pour une sauvegarde *fiable et automatisable* de la base entière, utilisez
`pg_dump` :

Sauvegarde (format custom compressé) :

```bash
cd server
npm run backup
# équivalent : pg_dump -Fc "$DATABASE_URL" > backups/sisama-backup-$(date +%F).dump
```

Restauration dans une base existante :

```bash
cd server
npm run restore -- backups/sisama-backup-20260912.dump
# équivalent : pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" backups/sisama-backup-20260912.dump
```

Les scripts lisent `DATABASE_URL` depuis `server/.env` — aucun mot de passe
n'est stocké en dur dans le code ni dans Git.

## ☁️ Installation automatisée (futur `install.sh`)

Le projet est prêt pour une installation pilotée par script :
- la base est configurée uniquement via `DATABASE_URL` (aucun chemin de fichier local) ;
- les schémas sont versionnés dans `server/prisma/migrations/` et appliqués avec `prisma migrate deploy` ;
- `npm install` génère Prisma Client (`postinstall`) ;
- le backend démarre avec `npm run build && npm start` ;
- `npm start` applique automatiquement les migrations (`prisma migrate deploy`) avant de lancer le serveur.

Un futur script d'installation pourra donc :
1. installer PostgreSQL, créer l'utilisateur et la base, générer un mot de passe ;
2. renseigner `DATABASE_URL` et `JWT_SECRET` dans `server/.env` ;
3. `npm install`, `npx prisma generate`, `npx prisma migrate deploy`, `npm run build` ;
4. lancer le backend (`npm start`).

### Scripts utiles (serveur)

```bash
npm run build           # compile le serveur dans dist/
npm start               # applique les migrations puis lance le serveur compilé
npm run prisma:generate # génère Prisma Client
npm run prisma:migrate  # migration interactive en développement (créer une nouvelle migration)
npm run prisma:deploy   # application des migrations en production (déploiement)
npm run backup          # sauvegarde PostgreSQL (pg_dump)
npm run restore -- FILE # restauration PostgreSQL (pg_restore)
```

> En production, `prisma migrate deploy` (non interactif) doit être utilisé —
> jamais `prisma migrate dev`.

## 🌍 Déploiement (Railway)

`server/railway.json` configure Railway :
- build : `npm install && npm run build` ;
- start : `npm run start` (`prisma migrate deploy` puis `node dist/index.js`) ;
- healthcheck : `GET /api/setup/status`.

Ajoutez un service PostgreSQL Railway et exposez sa variable
`DATABASE_URL`, ainsi qu'un `JWT_SECRET` fort. Aucune autre configuration
n'est nécessaire.

---
*Développé pour L'association Musulmane Audomaroise Par Zayd Fliyou .*