import { z } from 'zod';
import { validate } from '../../utils/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as svc from './state.service.js';

const orgId = (req) => req.membership.organizationId;

// GET /api/state — charge l'état applicatif de l'organisation active.
export const get = asyncHandler(async (req, res) => {
  res.json(await svc.loadState(orgId(req)));
});

// PUT /api/state — remplace l'état (verrouillage optimiste via updatedAt).
// Le payload peut être volumineux : on accepte des objets quelconques mais
// on borde la profondeur via la limite express.json (1 MB) côté app.js.
const putSchema = z.object({
  state: z.unknown(),
  expectedUpdatedAt: z.string().datetime().optional(),
});

export const put = asyncHandler(async (req, res) => {
  const { state, expectedUpdatedAt } = validate(putSchema, req.body);
  const result = await svc.saveState(orgId(req), state, expectedUpdatedAt);
  if (result.conflict) {
    return res.status(409).json({
      error: "L'état a été modifié par un autre membre — rechargez la page.",
      currentUpdatedAt: result.current,
    });
  }
  res.json({ updatedAt: result.updatedAt });
});
