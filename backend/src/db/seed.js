import { pool, closePool } from './pool.js';
import {
  registerUser,
  createOrganizationFor,
} from '../modules/auth/auth.service.js';
import { withTenant } from './withTenant.js';

// Données de démonstration : 2 organisations distinctes, pour illustrer
// (et pouvoir vérifier à l'œil) l'isolation multi-tenant.
async function seed() {
  const alice = await registerUser({
    email: 'alice@demo.test',
    password: 'motdepasse123',
    name: 'Alice',
  });
  const orgA = await createOrganizationFor(alice.id, 'Ménage Alice inc.');

  const bob = await registerUser({
    email: 'bob@demo.test',
    password: 'motdepasse123',
    name: 'Bob',
  });
  const orgB = await createOrganizationFor(bob.id, 'Nettoyage Bob ltée');

  await withTenant(orgA.id, (db) =>
    db.query(
      "insert into clients (organization_id, name, email) values ($1, 'Client A-1', 'a1@x.test'), ($1, 'Client A-2', 'a2@x.test')",
      [orgA.id],
    ),
  );
  await withTenant(orgB.id, (db) =>
    db.query(
      "insert into clients (organization_id, name, email) values ($1, 'Client B-1', 'b1@x.test')",
      [orgB.id],
    ),
  );

  console.log('✓ Données de démo créées :');
  console.log('  alice@demo.test / motdepasse123  → Ménage Alice inc. (2 clients)');
  console.log('  bob@demo.test   / motdepasse123  → Nettoyage Bob ltée (1 client)');
}

seed()
  .then(closePool)
  .catch(async (err) => {
    console.error(err);
    await closePool();
    process.exit(1);
  });
