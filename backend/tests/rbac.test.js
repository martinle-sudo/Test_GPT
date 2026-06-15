import { describe, it, expect, vi } from 'vitest';
import { requireRole, ROLE_RANK } from '../src/middleware/auth.js';
import { AppError } from '../src/utils/errors.js';

// Vérifie la hiérarchie des rôles et que requireRole bloque/laisse passer
// correctement. Logique pure : aucun serveur ni base requis.

function run(middleware, membership) {
  const req = { membership };
  const next = vi.fn();
  middleware(req, {}, next);
  return next.mock.calls[0]?.[0]; // l'argument passé à next (erreur ou undefined)
}

describe('Contrôle d\'accès par rôle (RBAC)', () => {
  it('hiérarchie : admin > member > reader', () => {
    expect(ROLE_RANK.admin).toBeGreaterThan(ROLE_RANK.member);
    expect(ROLE_RANK.member).toBeGreaterThan(ROLE_RANK.reader);
  });

  it('un admin passe une exigence admin', () => {
    expect(run(requireRole('admin'), { role: 'admin' })).toBeUndefined();
  });

  it('un member est refusé sur une exigence admin', () => {
    const err = run(requireRole('admin'), { role: 'member' });
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(403);
  });

  it('un member passe une exigence reader (rôle supérieur)', () => {
    expect(run(requireRole('reader'), { role: 'member' })).toBeUndefined();
  });

  it('un reader est refusé sur une exigence member', () => {
    const err = run(requireRole('member'), { role: 'reader' });
    expect(err.status).toBe(403);
  });

  it('sans organisation active : refusé', () => {
    const err = run(requireRole('reader'), null);
    expect(err.status).toBe(403);
  });
});
