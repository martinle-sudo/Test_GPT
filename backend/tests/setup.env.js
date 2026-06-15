// Chargé avant chaque fichier de test (setupFiles). On charge .env.test
// EN PREMIER : comme dotenv n'écrase pas les variables déjà présentes,
// la config de test l'emporte sur un éventuel .env de développement.
import dotenv from 'dotenv';
dotenv.config({ path: '.env.test' });
