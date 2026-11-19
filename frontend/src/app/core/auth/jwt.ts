export interface JwtClaims {
  sub?: string;
  exp?: number;
  iat?: number;
  [claim: string]: unknown;
}

function decodeSegment(segment: string): unknown {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Reads the header and claims of a JWT. The signature is only checked by the API. */
export function decodeJwt(token: string | null): { header: JwtClaims; claims: JwtClaims } | null {
  const parts = token?.split('.');
  if (!parts || parts.length !== 3) return null;
  try {
    const header = decodeSegment(parts[0]);
    const claims = decodeSegment(parts[1]);
    if (typeof header !== 'object' || typeof claims !== 'object' || !header || !claims) {
      return null;
    }
    return { header: header as JwtClaims, claims: claims as JwtClaims };
  } catch {
    return null;
  }
}

/** Expiry of a JWT in epoch milliseconds, or null if it has none. */
export function tokenExpiry(token: string | null): number | null {
  const exp = decodeJwt(token)?.claims.exp;
  return typeof exp === 'number' ? exp * 1000 : null;
}
