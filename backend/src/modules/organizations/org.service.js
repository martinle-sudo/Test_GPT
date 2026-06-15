import { pool } from '../../db/pool.js';

// Liste les organisations auxquelles appartient un utilisateur, avec son rôle.
export async function listOrganizationsForUser(userId) {
  const { rows } = await pool.query(
    `select o.id, o.name, o.created_at, m.role
       from memberships m
       join organizations o on o.id = m.organization_id
      where m.user_id = $1
      order by o.created_at`,
    [userId],
  );
  return rows;
}

// Liste les membres d'une organisation (réservé aux membres de cette org).
export async function listMembers(organizationId) {
  const { rows } = await pool.query(
    `select u.id, u.email, u.name, m.role, m.created_at
       from memberships m
       join users u on u.id = m.user_id
      where m.organization_id = $1
      order by m.created_at`,
    [organizationId],
  );
  return rows;
}

// Ajoute (ou mute) un membre par courriel. L'utilisateur doit déjà avoir
// un compte. Renvoie null si le courriel est inconnu.
export async function upsertMemberByEmail(organizationId, email, role) {
  const u = await pool.query('select id from users where lower(email) = $1', [
    String(email).trim().toLowerCase(),
  ]);
  if (!u.rows.length) return null;
  const userId = u.rows[0].id;
  await pool.query(
    `insert into memberships (user_id, organization_id, role)
     values ($1, $2, $3)
     on conflict (user_id, organization_id) do update set role = excluded.role`,
    [userId, organizationId, role],
  );
  return { userId, role };
}

// Retire un membre. Empêche de supprimer le dernier admin (sécurité :
// on ne veut jamais une organisation orpheline sans administrateur).
export async function removeMember(organizationId, userId) {
  const admins = await pool.query(
    "select user_id from memberships where organization_id = $1 and role = 'admin'",
    [organizationId],
  );
  const isLastAdmin =
    admins.rows.length === 1 && admins.rows[0].user_id === userId;
  if (isLastAdmin) {
    return { removed: false, reason: 'last_admin' };
  }
  await pool.query(
    'delete from memberships where organization_id = $1 and user_id = $2',
    [organizationId, userId],
  );
  return { removed: true };
}
