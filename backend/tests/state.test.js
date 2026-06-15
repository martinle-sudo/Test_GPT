import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, closePool } from '../src/db/pool.js';
import { loadState, saveState } from '../src/modules/state/state.service.js';

// Vérifie : isolation entre orgs, init au premier accès, sauvegarde, et
// verrouillage optimiste (deux écritures concurrentes).

async function createOrg(name) {
  const { rows } = await pool.query(
    'insert into organizations (name) values ($1) returning id',
    [name],
  );
  return rows[0].id;
}

describe('Module state — isolation et concurrence', () => {
  let orgA, orgB;

  beforeAll(async () => {
    orgA = await createOrg(`StateA ${Date.now()}`);
    orgB = await createOrg(`StateB ${Date.now()}`);
  });

  afterAll(async () => {
    await pool.query('delete from organizations where id = any($1)', [[orgA, orgB]]);
    await closePool();
  });

  it('crée un état vide au premier accès', async () => {
    const r = await loadState(orgA);
    expect(r.state).toEqual({});
    expect(r.updatedAt).toBeDefined();
  });

  it('sauvegarde et recharge un état arbitraire', async () => {
    await saveState(orgA, { clients: [{ id: '1', name: 'Acme' }] });
    const r = await loadState(orgA);
    expect(r.state.clients[0].name).toBe('Acme');
  });

  it("l'état d'une organisation est invisible depuis une autre", async () => {
    await saveState(orgA, { secret: 'A' });
    await saveState(orgB, { secret: 'B' });
    const a = await loadState(orgA);
    const b = await loadState(orgB);
    expect(a.state.secret).toBe('A');
    expect(b.state.secret).toBe('B');
  });

  it('rejette une sauvegarde basée sur une version périmée (409)', async () => {
    const v1 = await loadState(orgA);
    // Simule une autre session qui a sauvegardé entre-temps
    await new Promise((r) => setTimeout(r, 350));
    await saveState(orgA, { v: 2 });

    const result = await saveState(orgA, { v: 'écrasement' }, v1.updatedAt);
    expect(result.conflict).toBe(true);
    // L'état en base n'a PAS été écrasé
    const after = await loadState(orgA);
    expect(after.state.v).toBe(2);
  });

  it('accepte une sauvegarde avec la bonne version', async () => {
    const v = await loadState(orgA);
    const result = await saveState(orgA, { final: true }, v.updatedAt);
    expect(result.ok).toBe(true);
    const after = await loadState(orgA);
    expect(after.state.final).toBe(true);
  });
});
