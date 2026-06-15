import { describe, it, expect, vi } from 'vitest';
import { csrfProtection } from '../src/middleware/csrf.js';
import { AppError } from '../src/utils/errors.js';

function run({ method, session, header }) {
  const req = {
    method,
    session,
    get: (name) => (name.toLowerCase() === 'x-csrf-token' ? header : undefined),
  };
  const next = vi.fn();
  csrfProtection(req, {}, next);
  return next.mock.calls[0]?.[0];
}

describe('Protection CSRF (synchronizer token)', () => {
  const session = { csrf_secret: 'secret-attendu' };

  it('laisse passer les méthodes sûres (GET) sans jeton', () => {
    expect(run({ method: 'GET', session: null })).toBeUndefined();
  });

  it('accepte une mutation avec le bon jeton', () => {
    expect(
      run({ method: 'POST', session, header: 'secret-attendu' }),
    ).toBeUndefined();
  });

  it('refuse une mutation sans jeton', () => {
    const err = run({ method: 'POST', session, header: undefined });
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(403);
  });

  it('refuse une mutation avec un mauvais jeton', () => {
    const err = run({ method: 'POST', session, header: 'mauvais-jeton' });
    expect(err.status).toBe(403);
  });

  it('refuse une mutation sans session (non authentifié)', () => {
    const err = run({ method: 'POST', session: null, header: 'x' });
    expect(err.status).toBe(401);
  });
});
