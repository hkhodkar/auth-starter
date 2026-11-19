import { decodeJwt, tokenExpiry } from './jwt';

function encode(value: object): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('jwt helpers', () => {
  const token = `${encode({ alg: 'HS256' })}.${encode({ sub: '7', exp: 1_900_000_000, name: 'Zoë' })}.sig`;

  it('decodes header and claims, including non-ASCII text', () => {
    const decoded = decodeJwt(token);
    expect(decoded?.header['alg']).toBe('HS256');
    expect(decoded?.claims.sub).toBe('7');
    expect(decoded?.claims['name']).toBe('Zoë');
  });

  it('returns the expiry in milliseconds', () => {
    expect(tokenExpiry(token)).toBe(1_900_000_000_000);
  });

  it('returns null for anything that is not a JWT', () => {
    expect(decodeJwt(null)).toBeNull();
    expect(decodeJwt('abc')).toBeNull();
    expect(decodeJwt('a.b.c')).toBeNull();
    expect(tokenExpiry('opaque-refresh-token')).toBeNull();
  });
});
