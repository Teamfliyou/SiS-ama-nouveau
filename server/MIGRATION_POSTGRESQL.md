# Migration SQLite → PostgreSQL

Ce document décrit comment ASSO AMA SIS est passé d'une base de données fichier
SQLite (`dev.db`) à une base PostgreSQL, et comment migrer proprement une
installation existante vers cette branche.

---

## 1. Ce qui a changé

| Domaine | Avant (SQLite) | Après (PostgreSQL) |
|---|---|---|
| Base de données | Fichier local `dev.db` (provider `sqlite`) | Serveur PostgreSQL (provider `postgresql`) |
| Coordonnées | `server/.env` → `DATABASE_URL` Pointe vers un fichier | `server/.env` → `DATABASE_URL` pointe vers `postgresql://…` |
| Configuration | `prisma.config.ts` / `package.json` | Idem, mais connecteur PostgreSQL |
| Rôles utilisateurs | Texte libre (`ADMIN`, `STAFF`) | Enum `UserRole` (`ADMIN`, `STAFF`, `TEACHER`) |
| Statut de présence | Texte (`PRESENT`, `ABSENT`, `LATE`) | Enum `AttendanceStatus` (+ `EXCUSED`) |
| Date de présence | Chaîne `"YYYY-MM-DD"` | `DATE` typée (`DateTime @db.Date`), exposée en `YYYY-MM-DD` |
| Méthode de paiement | Texte (`Espèces`, `Virement`, …) | Enum `PaymentMethod` (`CASH`, `CARD`, `TRANSFER`, `CHEQUE`, `MOBILE_MONEY`, `OTHER`) |
| Paiements | `amountCents`, `date`, `method` | + `reference`, `note`, `updatedAt` |
| Années scolaires | — | Modèle `SchoolYear` (une seule année `active` à la fois) |
| Historique d'inscriptions | — | Modèle `Enrollment` (un seul `Enrollment` actif par élève, synchronisé avec `Student.classId`) |
| Professeurs | Une classe max (`classId`) | Table de liaison `TeacherClass` (multi-classes), `classId` conservé comme classe principale pour compatibilité |
| Familles | — | Modèle `Family` (contact unique rattaché à plusieurs élèves) |
| Audit | `createdAt` | `createdAt` + `updatedAt` sur tout le modèle |
| Index | — (limités) | Index sur `Student(lastName, firstName)`, `Attendance(date, studentId)`, `Attendance(classId, date)`, `Payment(studentId)`, `Payment(date)`, `Class(schoolYearId)`, etc. |

## 2. Compatibilité API / frontend

**Aucun changement cassant** n'a été introduit dans les réponses API utilisées
par le frontend :

- `GET /api/students` renvoie toujours `classId`, `class`, `totalPaidCents`,
  `remainingCents`, `payments[]`… (s'enrichit de `family`, `familyId`,
  `enrollments[]`).
- `GET /api/teachers` renvoie toujours `classId`/`class` (classe principale) et
  s'enrichit de `classes[]`.
- `GET /api/classes` renvoie toujours `_count.students`, `tuitionFee`,
  `tuitionFeeCents`, et s'enrichit de `schoolYearId`/`schoolYear`.
- `payment.method` reste **libellé français** (`Espèces`, `Chèque`, `Mobile
  Money`, …) à l'API : seul le stockage interne est une enum.
- Les dates autorisées à l'API restent `YYYY-MM-DD`.
- Nouvelles routes (ajout seul) : `/api/school-years`, `/api/families`.

## 3. Schéma de migration des données

Les migrations dans `server/prisma/migrations/` sont **non destructives** :

- `20260913084512_enums_dates_indexes` : crée les enums, convertit les colonnes
  texte en enum/date **avec des `USING` explicites** (les valeurs inconnues
  retombent sur des valeurs sûres), backfill `createdAt`/`updatedAt`, reconstruit
  l'index d'unicité des présences sur la date typée.
- `20260913085957_school_years_enrollments` : crée `SchoolYear` et `Enrollment`,
  lie les classes.
- `20260913090157_teacher_classes` : crée `TeacherClass` et **backfill** chaque
  professeur existant avec sa classe principale.
- `20260913090245_families` : crée `Family` et la colonne `Student.familyId`.

> Les enums convertissent les valeurs historiques automatiquement :
>
> | Texte historique | Enum stocké |
> |---|---|
> | `Espèces`, `Liquide` | `CASH` |
> | `Carte bancaire`, `CB`, `Carte` | `CARD` |
> | `Virement`, `Transfert` | `TRANSFER` |
> | `Chèque` | `CHEQUE` |
> | `Mobile Money` | `MOBILE_MONEY` |
> | autre/inconnu | `OTHER` |

## 4. Migrer une installation existante pas à pas

### Étape 0 — Sauvegardez tout (obligatoire)

```
# Ancienne base SQLite (fichier)
cp server/dev.db server/dev.db.bak-$(date +%F)

# Données applicatives (jamais de mots de passe là-dedans)
curl -H "Authorization: Bearer $TOKEN_ADMIN" http://localhost:PORT/api/export -o asso-ama-export.json
```

### Étape 1 — Mettez à jour le code + le schéma

```bash
cd server
npm install
cp .env.example .env        # remplir DATABASE_URL (PostgreSQL) et JWT_SECRET
npx prisma generate
npx prisma migrate deploy   # applique 2026091* (non destructives)
npm run build
```

Les migrations transforment les tables existantes **en place** : aucune donnée
n'est supprimée. Si une table contient déjà des valeurs texte, elles sont
converties (voir le tableau de § 3).

### Étape 2 — Relancez le serveur et vérifiez

```bash
# Variables de contrôle
npm start

GET /api/students   # les totaux (totalPaidCents/remainingCents) sont intacts
GET /api/teachers   # chaque prof retrouve sa classe principale (+ classes[])
GET /api/attendance?classId=1&date=2026-09-09
GET /api/export     # version: "3" ; schoolYears, families, enrollments inclus
```

### Étape 3 — (Optionnel) Transfert de données depuis un autre serveur

Pour déplacer les données d'un serveur SQLite vers une nouvelle installation
PostgreSQL **vide** (recommandé et fiable) :

1. Sur l'ancien serveur : `GET /api/export` → `export-v2.json`.
2. Sur le nouveau : créez l'admin, puis `POST /api/import/full` avec ce fichier.
3. L'import = **merge transactionnel** (atomique, dédupliqué) et accepte aussi
   bien le v2 que le v3. Ré-exécutable sans doublons.

Alternative « brute » pour les superusers : `pg_dump -Fc` / `pg_restore`
(voir `npm run backup` / `npm run restore` dans le README).

## 5. Vérifications recommandées après migration

- Le nombre d'élèves / classes / professeurs est identique.
- La somme des `totalPaidCents` de tous les élèves ≈ `GET /api/stats
  → totalPaymentsCents` (les montants sont stockés en **centimes entiers**,
  jamais de flottants).
- Les présences d'une même date/classe sont restituées avec le même statut.
- `SELECT count(*) FROM "Enrollment"` ≈ nombre d'admissions historiques.

## 6. Fuseaux horaires

Les présences et dates d'année scolaire sont stockées comme de simples `DATE`.
La conversion `YYYY-MM-DD` ⇄ `DATE` est **indépendante du fuseau horaire** du
serveur (`server/lib/dates.ts`), ce qui évite les fameux décalages de ±1 jour.

## 7. Rollback

En cas de problème sur une installation déjà basculée :

1. Les données de l'application transitent par l'export/import JSON :
   `GET /api/export` depuis la version PostgreSQL → sauvegarde.
2. Restaurez l'ancien binaire/ancienne branche, puis remettez le fichier
   `dev.db` sauvegardé à l'étape 0.
3. String à modifier : `DATABASE_URL` → chemin du fichier SQLite.

Il n'y a **jamais eu** de suppression automatique du fichier SQLite : le code
et les scripts ne touchent pas à `dev.db`. La suppression reste une décision
manuelle, uniquement après vérifications de l'étape 5.