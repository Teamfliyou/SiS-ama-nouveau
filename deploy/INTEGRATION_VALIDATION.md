# Intégration des PR #12 et #13 dans feat/deploy-docker

Base de production examinée : `7e86c00c9c97bed71c591f0dbcf69e98744b2ecc`.
Source main : `bfad43df9d5b26cd1285ff4a642b375ab6435e37`.

Les neuf conflits de la PR #16 sont résolus sur la branche d'intégration.
Les migrations déjà présentes, PostgreSQL, les images Docker, nginx, les années
scolaires, familles, inscriptions, notes, bulletins et paiements groupés sont
conservés. Les nouvelles pages sont accessibles dans Classic et Liquid Glass.
La sauvegarde canonique passe en v5 avec l'enveloppe `data`, en acceptant aussi
les anciennes sauvegardes et les nouvelles sauvegardes plates.

## Vérifications

- Contrôles locaux réussis : fichiers de migrations existants inchangés,
  Dockerfiles/nginx inchangés, aucun marqueur de conflit, syntaxe des scripts,
  normalisation des sauvegardes et garde-fou des bases de tests.
- Installation npm locale bloquée : réseau restreint et cache incomplet.
  Les tests/builds locaux ne sont donc pas validés.
- Workflow `Integration validation` : tests/builds backend et frontend, lint,
  validation Prisma, comparaison migrations/schéma et montée de version depuis
  la base de production avec des données fictives dans PostgreSQL isolé.
  Ce workflow ne contient aucun déploiement ni accès aux secrets de production.

## Conditions avant fusion et déploiement

1. Tous les contrôles GitHub Actions doivent réussir sur le dernier commit.
2. Vérifier dans Coolify que le déploiement automatique de
   `feat/deploy-docker` est désactivé avant la fusion. La configuration active
   de Coolify n'est pas accessible depuis ce dépôt.
3. Produire une sauvegarde PostgreSQL custom (`pg_dump -Fc`), conserver le
   fichier, sa somme SHA-256 et vérifier une restauration complète dans une
   base locale **vide et distincte**. Le script
   `server/scripts/verified-backup.sh` ne touche la source qu'en lecture et
   refuse une cible de vérification déjà occupée.
   Utiliser des URL PostgreSQL natives sans le paramètre Prisma `schema`.
4. Sur une copie isolée restaurée, exécuter `prisma migrate deploy`, vérifier
   l'absence de dérive, les effectifs, soldes, remises familiales, notes,
   bulletins, classes, responsables et historiques d'inscription.
5. Vérifier manuellement les parcours mobile et ordinateur : Liquid Glass,
   Classic, élèves, inscription, paiement familial, pré-inscription publique,
   validation de dossier, emploi du temps, cahier de textes et restauration JSON.
6. Obtenir la validation explicite de l'utilisateur avant tout déploiement
   sur `sis.assoma.fr`.

Ne jamais lancer `prisma migrate reset`, `db push --force-reset`, supprimer des
volumes PostgreSQL, ou restaurer une sauvegarde dans la base de production
pendant cette validation. Les nettoyages de fixtures des tests sont limités
aux bases locales `sisama_*test` par un contrôle obligatoire.
