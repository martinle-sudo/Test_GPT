import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { env } from '../config/env.js';

// Applique les fichiers SQL de migrations/ dans l'ordre, une seule fois
// chacun (suivi dans la table _migrations). Utilise le compte ADMIN
// (création de rôles, extensions, politiques RLS).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', '..', 'migrations');

export async function runMigrations({ silent = false } = {}) {
  const adminUrl = env.DATABASE_ADMIN_URL || env.DATABASE_URL;
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  const log = (...a) => !silent && console.log(...a);
  try {
    await client.query(`
      create table if not exists _migrations (
        id serial primary key,
        name text unique not null,
        applied_at timestamptz not null default now()
      )`);

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const { rows } = await client.query(
        'select 1 from _migrations where name = $1',
        [file],
      );
      if (rows.length) {
        log('• déjà appliquée :', file);
        continue;
      }
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      log('▸ application :', file);
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into _migrations(name) values ($1)', [file]);
        await client.query('commit');
      } catch (err) {
        await client.query('rollback');
        throw new Error(`Migration ${file} échouée : ${err.message}`);
      }
    }
    log('✓ migrations terminées');
  } finally {
    await client.end();
  }
}

// Exécution directe : `npm run db:migrate`
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
