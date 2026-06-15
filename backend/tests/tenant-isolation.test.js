import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, closePool } from '../src/db/pool.js';
import { withTenant } from '../src/db/withTenant.js';

// ============================================================
//  LE test de sécurité central : prouver qu'une organisation ne peut
//  JAMAIS voir ni toucher les données d'une autre — garanti par la
//  Row Level Security de PostgreSQL, pas par du code applicatif.
// ============================================================

async function createOrg(name) {
  const { rows } = await pool.query(
    'insert into organizations (name) values ($1) returning id',
    [name],
  );
  return rows[0].id;
}

describe('Isolation multi-tenant (Row Level Security)', () => {
  let orgA;
  let orgB;
  let clientAId;

  beforeAll(async () => {
    orgA = await createOrg(`Org A ${Date.now()}`);
    orgB = await createOrg(`Org B ${Date.now()}`);

    await withTenant(orgA, (db) =>
      db.query("insert into clients (organization_id, name) values ($1, 'A-client')", [orgA]),
    );
    await withTenant(orgB, (db) =>
      db.query("insert into clients (organization_id, name) values ($1, 'B-client')", [orgB]),
    );
    const r = await withTenant(orgA, (db) => db.query('select id from clients'));
    clientAId = r.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('delete from organizations where id = any($1)', [[orgA, orgB]]);
    await closePool();
  });

  it('chaque tenant ne voit que ses propres clients', async () => {
    const a = await withTenant(orgA, (db) => db.query('select name from clients'));
    const b = await withTenant(orgB, (db) => db.query('select name from clients'));
    expect(a.rows.map((r) => r.name)).toEqual(['A-client']);
    expect(b.rows.map((r) => r.name)).toEqual(['B-client']);
  });

  it('un SELECT sans clause WHERE ne fuit pas les autres tenants', async () => {
    const a = await withTenant(orgA, (db) => db.query('select * from clients'));
    expect(a.rows).toHaveLength(1);
    expect(a.rows[0].organization_id).toBe(orgA);
  });

  it('insérer pour une AUTRE organisation est rejeté (WITH CHECK)', async () => {
    await expect(
      withTenant(orgA, (db) =>
        db.query("insert into clients (organization_id, name) values ($1, 'pirate')", [orgB]),
      ),
    ).rejects.toThrow();
  });

  it("mettre à jour le client d'un autre tenant n'affecte aucune ligne", async () => {
    const res = await withTenant(orgB, (db) =>
      db.query("update clients set name = 'hacked' where id = $1", [clientAId]),
    );
    expect(res.rowCount).toBe(0);
    // Le client A est resté intact.
    const a = await withTenant(orgA, (db) =>
      db.query('select name from clients where id = $1', [clientAId]),
    );
    expect(a.rows[0].name).toBe('A-client');
  });

  it("supprimer le client d'un autre tenant n'affecte aucune ligne", async () => {
    const res = await withTenant(orgB, (db) =>
      db.query('delete from clients where id = $1', [clientAId]),
    );
    expect(res.rowCount).toBe(0);
  });

  it('sans organisation active, aucune ligne visible (déni par défaut)', async () => {
    const client = await pool.connect();
    try {
      const res = await client.query('select * from clients');
      expect(res.rows).toHaveLength(0);
    } finally {
      client.release();
    }
  });
});
