import { withTenant } from '../../db/withTenant.js';

// IMPORTANT : aucune de ces fonctions ne filtre manuellement par
// organization_id. C'est la Row Level Security (via withTenant) qui
// garantit l'isolation. Le code métier reste simple ET sûr.

export function listClients(orgId) {
  return withTenant(orgId, async (db) => {
    const { rows } = await db.query(
      'select id, name, email, phone, created_at from clients order by created_at desc',
    );
    return rows;
  });
}

export function createClient(orgId, { name, email, phone }) {
  return withTenant(orgId, async (db) => {
    const { rows } = await db.query(
      `insert into clients (organization_id, name, email, phone)
       values ($1, $2, $3, $4)
       returning id, name, email, phone, created_at`,
      [orgId, name, email ?? null, phone ?? null],
    );
    return rows[0];
  });
}

export function updateClient(orgId, id, fields) {
  return withTenant(orgId, async (db) => {
    const { rows } = await db.query(
      `update clients set
         name = coalesce($3, name),
         email = coalesce($4, email),
         phone = coalesce($5, phone)
       where id = $2
       returning id, name, email, phone, created_at`,
      [orgId, id, fields.name ?? null, fields.email ?? null, fields.phone ?? null],
    );
    return rows[0] ?? null; // null si la ligne n'existe pas / autre org
  });
}

export function deleteClient(orgId, id) {
  return withTenant(orgId, async (db) => {
    const { rowCount } = await db.query('delete from clients where id = $1', [id]);
    return rowCount > 0;
  });
}
