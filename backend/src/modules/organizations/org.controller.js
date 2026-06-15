import { z } from 'zod';
import { validate } from '../../utils/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { createOrganizationFor } from '../auth/auth.service.js';
import {
  listOrganizationsForUser,
  listMembers,
  upsertMemberByEmail,
  removeMember,
} from './org.service.js';

// GET /api/orgs — organisations de l'utilisateur courant.
export const myOrganizations = asyncHandler(async (req, res) => {
  res.json({ organizations: await listOrganizationsForUser(req.user.id) });
});

// POST /api/orgs — créer une nouvelle organisation (créateur = admin).
const createSchema = z.object({ name: z.string().trim().min(2).max(120) });
export const createOrg = asyncHandler(async (req, res) => {
  const { name } = validate(createSchema, req.body);
  const org = await createOrganizationFor(req.user.id, name);
  res.status(201).json({ organization: { ...org, role: 'admin' } });
});

// GET /api/orgs/members — membres de l'organisation active.
export const members = asyncHandler(async (req, res) => {
  res.json({ members: await listMembers(req.membership.organizationId) });
});

// POST /api/orgs/members — inviter/ajuster un membre (admin requis).
const memberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member', 'reader']),
});
export const setMember = asyncHandler(async (req, res) => {
  const { email, role } = validate(memberSchema, req.body);
  const result = await upsertMemberByEmail(
    req.membership.organizationId,
    email,
    role,
  );
  if (!result) {
    throw notFound("Aucun compte n'existe avec ce courriel (l'utilisateur doit s'inscrire d'abord)");
  }
  res.json({ member: result });
});

// DELETE /api/orgs/members/:userId — retirer un membre (admin requis).
export const deleteMember = asyncHandler(async (req, res) => {
  const userId = z.string().uuid().parse(req.params.userId);
  const result = await removeMember(req.membership.organizationId, userId);
  if (!result.removed && result.reason === 'last_admin') {
    throw badRequest("Impossible de retirer le dernier administrateur de l'organisation");
  }
  res.json({ ok: true });
});
