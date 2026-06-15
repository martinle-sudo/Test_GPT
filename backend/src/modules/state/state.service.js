import { withTenant } from '../../db/withTenant.js';

// Charge l'état d'une organisation. Crée la ligne si elle n'existe pas
// encore (premier accès après création de l'organisation), de sorte que
// l'app frontend obtient toujours un point de départ stable.
export function loadState(orgId) {
  return withTenant(orgId, async (db) => {
    let res = await db.query(
      'select state, updated_at from app_states where organization_id = $1',
      [orgId],
    );
    if (!res.rows.length) {
      res = await db.query(
        `insert into app_states (organization_id) values ($1)
         returning state, updated_at`,
        [orgId],
      );
    }
    return { state: res.rows[0].state, updatedAt: res.rows[0].updated_at };
  });
}

// Sauvegarde l'état avec verrouillage optimiste. Si `expectedUpdatedAt`
// est fourni et que la base a été modifiée entre-temps (par un autre
// membre ou un autre onglet), on renvoie un conflit au lieu d'écraser.
export function saveState(orgId, state, expectedUpdatedAt) {
  return withTenant(orgId, async (db) => {
    if (expectedUpdatedAt) {
      const current = await db.query(
        'select updated_at from app_states where organization_id = $1',
        [orgId],
      );
      if (current.rows.length) {
        const dbTime = new Date(current.rows[0].updated_at).getTime();
        const clientTime = new Date(expectedUpdatedAt).getTime();
        // Petite tolérance (250 ms) pour ne pas bloquer sur des sauvegardes
        // quasi-simultanées issues du même client.
        if (dbTime > clientTime + 250) {
          return {
            conflict: true,
            current: current.rows[0].updated_at,
          };
        }
      }
    }
    const { rows } = await db.query(
      `insert into app_states (organization_id, state, updated_at)
       values ($1, $2::jsonb, now())
       on conflict (organization_id) do update
         set state = excluded.state,
             updated_at = now()
       returning updated_at`,
      [orgId, JSON.stringify(state ?? {})],
    );
    return { ok: true, updatedAt: rows[0].updated_at };
  });
}
