-- Unicité des classes par année scolaire (en remplacement du nom globalement unique).

-- 1) L'ancienne contrainte globale : chaque nom de classe était unique dans toute la base.
--    Elle est retirée pour permettre le même nom dans plusieurs années scolaires.
DROP INDEX "Class_name_key";

-- 2) Unicité par (nom, year scolaire) : dans une MÊME année, le même nom de classe
--    reste interdit. En PostgreSQL, une valeur NULL est ignorée par l'unicité : les
--    classes "sans année scolaire" sont donc défendues par l'index partiel ci-dessous.
CREATE UNIQUE INDEX "Class_name_schoolYearId_key" ON "Class"("name", "schoolYearId");

-- 3) Classes sans année scolaire : une seule occurrence par nom (cela préserve le
--    comportement historique du nom globalement unique pour les données sans année).
CREATE UNIQUE INDEX "Class_name_no_school_year_key" ON "Class"("name") WHERE "schoolYearId" IS NULL;

-- 4) DÉFENSE BASE DE DONNÉES : au plus une année scolaire active à tout moment
--    (index unique partiel sur active = true), en complément de la logique
--    applicative centralisée setActiveSchoolYear().
CREATE UNIQUE INDEX "SchoolYear_single_active_key" ON "SchoolYear"("active") WHERE "active" = true;