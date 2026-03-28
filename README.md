# ASSO AMA SIS - Système d'Information Scolaire

🚀 Une solution moderne de gestion scolaire pour les associations et écoles.

## ✨ Fonctionnalités

- **Authentification Sécurisée** : Portail de connexion pour l'administration.
- **Gestion des Classes** : Création et édition de classes avec frais de scolarité associés.
- **Répertoire des Élèves** : Inscription, modification et suivi des élèves.
- **Suivi Financier** : Gestion des paiements (acomptes, solde restant) avec historique complet.
- **Dashboard Dynamique** : Vue d'ensemble en temps réel des indicateurs clés (élèves, classes, revenus).

## 🛠️ Stack Technique

- **Frontend** : React + TypeScript + Tailwind CSS + Lucide React.
- **Backend** : Node.js + Express + Prisma (ORM).
- **Base de Données** : SQLite (Stockage local rapide et léger).

## 🚀 Démarrage Rapide

### Installation

```bash
# Dans le dossier server
cd server
npm install
npx prisma db push
npx prisma generate

# Dans le dossier frontend
cd ../frontend
npm install
```

### Lancement

```bash
# Lancer le serveur (port 5000)
cd server
npm run dev

# Lancer l'interface (port 5173)
cd ../frontend
npm run dev
```

---
*Développé pour ASSO AMA par Antigravity.*
