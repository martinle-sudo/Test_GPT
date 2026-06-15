import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  hashToken,
  generateToken,
} from '../src/modules/auth/auth.service.js';

describe('Service d\'authentification — mots de passe et jetons', () => {
  it('hache puis vérifie correctement un mot de passe (Bcrypt)', async () => {
    const hash = await hashPassword('motdepasse-solide-123');
    expect(hash).not.toBe('motdepasse-solide-123'); // jamais en clair
    expect(hash.startsWith('$2')).toBe(true); // format bcrypt
    expect(await verifyPassword('motdepasse-solide-123', hash)).toBe(true);
    expect(await verifyPassword('mauvais', hash)).toBe(false);
  });

  it('produit un hash différent à chaque fois (sel aléatoire)', async () => {
    const a = await hashPassword('identique');
    const b = await hashPassword('identique');
    expect(a).not.toBe(b);
    expect(await verifyPassword('identique', a)).toBe(true);
    expect(await verifyPassword('identique', b)).toBe(true);
  });

  it('hashToken est déterministe (même entrée → même hash)', () => {
    const t = 'jeton-de-session';
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toBe(t); // on ne stocke jamais le jeton brut
  });

  it('generateToken produit des jetons uniques et longs', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
  });
});
