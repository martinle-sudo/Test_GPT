import { z } from 'zod';
import { validate } from '../../utils/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { notFound } from '../../utils/errors.js';
import * as svc from './client.service.js';

const orgId = (req) => req.membership.organizationId;

export const list = asyncHandler(async (req, res) => {
  res.json({ clients: await svc.listClients(orgId(req)) });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional(),
});
export const create = asyncHandler(async (req, res) => {
  const data = validate(createSchema, req.body);
  res.status(201).json({ client: await svc.createClient(orgId(req), data) });
});

const updateSchema = createSchema.partial();
export const update = asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const data = validate(updateSchema, req.body);
  const updated = await svc.updateClient(orgId(req), id, data);
  if (!updated) throw notFound('Client introuvable');
  res.json({ client: updated });
});

export const remove = asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const ok = await svc.deleteClient(orgId(req), id);
  if (!ok) throw notFound('Client introuvable');
  res.json({ ok: true });
});
