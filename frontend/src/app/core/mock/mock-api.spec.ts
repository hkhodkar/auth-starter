import { decodeJwt } from '../auth/jwt';
import { Page, TokenPair, User, UserStats } from '../models/auth.models';
import { ACCESS_TOKEN_SECONDS, handleMockRequest } from './mock-api';
import { MockDb } from './mock-db';
import { DEMO_PASSWORD } from './seed';

describe('mock API', () => {
  const start = new Date('2026-06-01T12:00:00Z');
  let db: MockDb;
  let now: Date;

  beforeEach(() => {
    now = start;
    db = new MockDb(null, () => start);
  });

  function call(method: string, url: string, body?: unknown, token?: string) {
    return handleMockRequest(db, {
      method,
      url,
      body,
      authorization: token ? `Bearer ${token}` : null,
      now,
    });
  }

  function login(email = 'admin@demo.dev', password = DEMO_PASSWORD): TokenPair {
    const res = call('POST', '/api/auth/login', { email, password });
    expect(res.status).toBe(200);
    return res.body as TokenPair;
  }

  it('signs in the demo accounts with JWT-shaped tokens that expire', () => {
    const tokens = login('ADMIN@demo.dev');
    expect(tokens.user.role).toBe('admin');
    expect(tokens.expires_in).toBe(ACCESS_TOKEN_SECONDS);

    const decoded = decodeJwt(tokens.access_token);
    expect(decoded?.header['alg']).toBe('HS256');
    expect(decoded?.claims.sub).toBe(String(tokens.user.id));
    expect(decoded!.claims.exp! - decoded!.claims.iat!).toBe(ACCESS_TOKEN_SECONDS);

    expect(login('user@demo.dev').user.role).toBe('user');
  });

  it('rejects bad credentials and deactivated accounts like the API', () => {
    const wrong = call('POST', '/api/auth/login', { email: 'admin@demo.dev', password: 'nope' });
    expect(wrong).toEqual({ status: 401, body: { detail: 'Incorrect email or password' } });

    const inactive = call('POST', '/api/auth/login', {
      email: 'lucas.moreau@demo.dev',
      password: DEMO_PASSWORD,
    });
    expect(inactive.status).toBe(403);
  });

  it('answers 401 once the access token has expired', () => {
    const tokens = login();
    expect(call('GET', '/api/auth/me', undefined, tokens.access_token).status).toBe(200);

    now = new Date(start.getTime() + ACCESS_TOKEN_SECONDS * 1000);
    const expired = call('GET', '/api/auth/me', undefined, tokens.access_token);
    expect(expired).toEqual({ status: 401, body: { detail: 'Access token expired' } });
  });

  it('rejects tampered tokens', () => {
    const [header, payload, signature] = login('user@demo.dev').access_token.split('.');
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    const forged = btoa(JSON.stringify({ ...claims, role: 'admin', sub: '1' })).replace(/=+$/, '');
    const res = call('GET', '/api/users', undefined, `${header}.${forged}.${signature}`);
    expect(res).toEqual({ status: 401, body: { detail: 'Invalid access token' } });
  });

  it('rotates refresh tokens and revokes the session when one is reused', () => {
    const first = login();
    const rotated = call('POST', '/api/auth/refresh', { refresh_token: first.refresh_token });
    expect(rotated.status).toBe(200);
    const second = rotated.body as TokenPair;
    expect(second.refresh_token).not.toBe(first.refresh_token);

    const reuse = call('POST', '/api/auth/refresh', { refresh_token: first.refresh_token });
    expect(reuse.status).toBe(401);

    // the newer token belonged to the same session, so it is gone too
    expect(call('POST', '/api/auth/refresh', { refresh_token: second.refresh_token }).status).toBe(
      401,
    );
  });

  it('logout revokes the refresh token', () => {
    const tokens = login();
    expect(call('POST', '/api/auth/logout', { refresh_token: tokens.refresh_token }).status).toBe(
      204,
    );
    expect(call('POST', '/api/auth/refresh', { refresh_token: tokens.refresh_token }).status).toBe(
      401,
    );
  });

  it('registers users with the API validation rules', () => {
    const invalid = call('POST', '/api/auth/register', {
      email: 'not-an-email',
      full_name: 'A',
      password: 'onlyletters',
    });
    expect(invalid.status).toBe(422);
    const fields = (invalid.body as { detail: { loc: string[] }[] }).detail.map((i) => i.loc[1]);
    expect(fields).toEqual(['email', 'full_name', 'password']);

    const created = call('POST', '/api/auth/register', {
      email: 'New@Example.com',
      full_name: '  New Person ',
      password: 'secret123',
    });
    expect(created.status).toBe(201);
    const user = (created.body as TokenPair).user;
    expect(user).toMatchObject({ email: 'new@example.com', full_name: 'New Person', role: 'user' });

    const duplicate = call('POST', '/api/auth/register', {
      email: 'new@example.com',
      full_name: 'Again',
      password: 'secret123',
    });
    expect(duplicate.status).toBe(409);
  });

  it('changes the password and signs out other sessions', () => {
    const laptop = login('user@demo.dev');
    const phone = login('user@demo.dev');

    const wrong = call(
      'POST',
      '/api/auth/me/password',
      { current_password: 'wrong', new_password: 'brand-new-1' },
      laptop.access_token,
    );
    expect(wrong.status).toBe(400);

    const changed = call(
      'POST',
      '/api/auth/me/password',
      { current_password: DEMO_PASSWORD, new_password: 'brand-new-1' },
      laptop.access_token,
    );
    expect(changed.status).toBe(200);
    expect(call('POST', '/api/auth/refresh', { refresh_token: phone.refresh_token }).status).toBe(
      401,
    );
    expect(login('user@demo.dev', 'brand-new-1').user.email).toBe('user@demo.dev');
  });

  it('keeps the admin routes for admins', () => {
    const user = login('user@demo.dev');
    expect(call('GET', '/api/users', undefined, user.access_token)).toEqual({
      status: 403,
      body: { detail: 'Admin role required' },
    });
    expect(call('GET', '/api/users').status).toBe(401);
  });

  it('filters, sorts and pages users like the API', () => {
    const { access_token } = login();
    const list = (query: string) =>
      call('GET', `/api/users${query}`, undefined, access_token).body as Page<User>;

    const page = list('?page_size=5&page=2');
    expect(page.total).toBe(15);
    expect(page.items.length).toBe(5);

    expect(
      list('?role=admin')
        .items.map((u) => u.email)
        .sort(),
    ).toEqual(['admin@demo.dev', 'sofia.martinez@demo.dev']);
    expect(list('?status=inactive').total).toBe(2);
    expect(list('?search=ROSSI').items.map((u) => u.full_name)).toEqual(['Mia Rossi']);

    const names = list('?sort=full_name&page_size=100').items.map((u) => u.full_name);
    expect(names).toEqual([...names].sort());
    expect(list('?sort=-last_login_at&page_size=100').items.at(-1)?.last_login_at).toBeNull();

    expect(call('GET', '/api/users?sort=password', undefined, access_token).status).toBe(422);

    const stats = call('GET', '/api/users/stats', undefined, access_token).body as UserStats;
    expect(stats).toEqual({ total: 15, active: 13, inactive: 2, admins: 2, new_this_week: 3 });
  });

  it('lets admins change roles and deactivate others, but not themselves', () => {
    const admin = login();
    const user = login('user@demo.dev');

    const promoted = call(
      'PATCH',
      `/api/users/${user.user.id}`,
      { role: 'admin' },
      admin.access_token,
    );
    expect((promoted.body as User).role).toBe('admin');
    // roles come from the database, so the user's existing token now has admin access
    expect(call('GET', '/api/users', undefined, user.access_token).status).toBe(200);

    const self = call('PATCH', `/api/users/${admin.user.id}`, { role: 'user' }, admin.access_token);
    expect(self.status).toBe(400);

    call('PATCH', `/api/users/${user.user.id}`, { is_active: false }, admin.access_token);
    expect(call('GET', '/api/auth/me', undefined, user.access_token).status).toBe(401);
    expect(call('POST', '/api/auth/refresh', { refresh_token: user.refresh_token }).status).toBe(
      401,
    );
    expect(call('PATCH', '/api/users/999', { role: 'user' }, admin.access_token).status).toBe(404);
  });

  it('persists changes and resets to the seed data', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as unknown as Storage;
    db = new MockDb(storage, () => start);
    call('POST', '/api/auth/register', {
      email: 'kept@example.com',
      full_name: 'Kept User',
      password: 'secret123',
    });

    const reloaded = new MockDb(storage, () => start);
    expect(reloaded.data.users.some((u) => u.email === 'kept@example.com')).toBe(true);

    reloaded.reset();
    expect(reloaded.data.users.length).toBe(15);
    expect(new MockDb(storage, () => start).data.users.length).toBe(15);
  });
});
