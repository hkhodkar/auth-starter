// JWT-shaped tokens for the in-browser demo API. They decode like real ones,
// but the "signature" is a plain hash: fine for a demo, never for production.

const SECRET = 'auth-starter-demo';

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toBase64Url(text: string): string {
  return bytesToBase64Url(new TextEncoder().encode(text));
}

function fromBase64Url(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** cyrb53, a small fast string hash. */
export function hashString(text: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function sign(data: string): string {
  return toBase64Url([1, 2, 3].map((seed) => hashString(`${SECRET}.${data}`, seed)).join(''));
}

export interface MockClaims {
  sub: string;
  email: string;
  role: string;
  type: 'access';
  iat: number;
  exp: number;
  jti: string;
}

export function createMockJwt(claims: MockClaims): string {
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = toBase64Url(JSON.stringify(claims));
  return `${header}.${payload}.${sign(`${header}.${payload}`)}`;
}

export type VerifyResult =
  { ok: true; claims: MockClaims } | { ok: false; reason: 'expired' | 'invalid' };

export function verifyMockJwt(token: string, nowSeconds: number): VerifyResult {
  const parts = token.split('.');
  if (parts.length !== 3 || sign(`${parts[0]}.${parts[1]}`) !== parts[2]) {
    return { ok: false, reason: 'invalid' };
  }
  let claims: MockClaims;
  try {
    claims = JSON.parse(fromBase64Url(parts[1])) as MockClaims;
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (claims.type !== 'access' || !/^\d+$/.test(claims.sub ?? '')) {
    return { ok: false, reason: 'invalid' };
  }
  if (typeof claims.exp !== 'number' || claims.exp <= nowSeconds) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, claims };
}

export function randomToken(): string {
  const bytes = new Uint8Array(36);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}
