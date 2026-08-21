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
- **Base de Données** : SQLite (Stockage local rapide et léger).

## 🔌 Architecture API

| Module | Endpoints |
|---|---|
| Authentification | `POST /api/auth/login`, `POST /api/auth/register`, `PUT /api/auth/password` |
| Administration | `GET/POST /api/users`, `PUT /api/users/:id/role`, `DELETE /api/users/:id` |
| Élèves | `GET/POST /api/students`, `PUT/DELETE /api/students/:id` |
| Professeurs | `GET/POST /api/teachers`, `PUT/DELETE /api/teachers/:id` |
| Classes | `GET/POST /api/classes`, `PUT/DELETE /api/classes/:id` |
| Présences | `GET/POST /api/attendance`, `GET /api/attendance/history` |
| Finances | `GET/POST /api/finances`, `PUT/DELETE /api/finances/:id` |
| Import CSV | `POST /api/import-csv/students` |
| Sauvegardes | `GET /api/export`, `POST /api/import/full` |
| Statistiques | `GET /api/stats` |

Toutes les routes (hors login/register) nécessitent un token JWT via l'en-tête `Authorization: Bearer <token>`.

## 🚀 Démarrage Rapide

### Installation

```bash
# Serveur (port 5000)
cd server
cp .env.example .env        # puis renseigner JWT_SECRET, etc.
npm install
npx prisma migrate dev      # crée/applique les migrations sur la base SQLite

# Frontend (port 5173)
cd ../frontend
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

### Scripts utiles (serveur)

```bash
npm run build           # compile le serveur dans dist/
npm start               # lance le serveur compilé (dist/index.js)
npm run prisma:migrate  # migration en développement
npm run prisma:deploy   # application des migrations en production
```

---
*Développé pour L'association Musulmane Audomaroise Par Zayd Fliyou .*
