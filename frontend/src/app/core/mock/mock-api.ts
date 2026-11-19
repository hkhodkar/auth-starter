import { Role, ROLES, TokenPair, User, UserStats } from '../models/auth.models';
import { MockDb, RefreshRow, UserRow, hashPassword } from './mock-db';
import { createMockJwt, hashString, randomToken, verifyMockJwt } from './mock-jwt';

/** Short on purpose, so the refresh flow runs within a minute of using the demo. */
export const ACCESS_TOKEN_SECONDS = 60;
const REFRESH_TOKEN_DAYS = 7;

export interface MockResponse {
  status: number;
  body: unknown;
}

export interface MockRequest {
  method: string;
  url: string;
  body?: unknown;
  authorization?: string | null;
  now?: Date;
}

interface Issue {
  type: string;
  loc: (string | number)[];
  msg: string;
  input: unknown;
}

/** An error answered the way FastAPI would: `{ detail }` with a status code. */
class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly detail: unknown,
  ) {
    super(typeof detail === 'string' ? detail : `HTTP ${status}`);
  }
}

const ok = (body: unknown, status = 200): MockResponse => ({ status, body });
const noContent = (): MockResponse => ({ status: 204, body: null });
const unauthorized = (detail: string) => new HttpError(401, detail);

const SORTS = ['full_name', 'email', 'created_at', 'last_login_at'] as const;
type SortKey = (typeof SORTS)[number];
const SORT_OPTIONS = SORTS.flatMap((s) => [s, `-${s}`]);

// close to the email-validator checks the API runs
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

class Context {
  readonly issues: Issue[] = [];

  constructor(
    readonly db: MockDb,
    readonly now: Date,
    private readonly authorization: string | null,
  ) {}

  get iso(): string {
    return this.now.toISOString();
  }

  get seconds(): number {
    return Math.floor(this.now.getTime() / 1000);
  }

  /** The signed-in user, checked the same way as the API's `get_current_user`. */
  user(): UserRow {
    const [scheme, token] = (this.authorization ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw unauthorized('Not authenticated');
    }
    const result = verifyMockJwt(token, this.seconds);
    if (!result.ok) {
      throw unauthorized(
        result.reason === 'expired' ? 'Access token expired' : 'Invalid access token',
      );
    }
    const user = this.db.data.users.find((u) => u.id === Number(result.claims.sub));
    if (!user || !user.is_active) {
      throw unauthorized('Account is not available');
    }
    return user;
  }

  admin(): UserRow {
    const user = this.user();
    if (user.role !== 'admin') throw new HttpError(403, 'Admin role required');
    return user;
  }

  // body validation, same messages as Pydantic

  body(body: unknown): Record<string, unknown> {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      this.issues.push({
        type: 'model_attributes_type',
        loc: ['body'],
        msg: 'Input should be a valid dictionary or object to extract fields from',
        input: body,
      });
      this.done();
    }
    return body as Record<string, unknown>;
  }

  string(
    body: Record<string, unknown>,
    field: string,
    { min = 0, max = 10_000, required = true, strip = false } = {},
  ): string | undefined {
    let value = body[field];
    if (value === undefined || (value === null && !required)) {
      if (required) {
        this.issues.push({
          type: 'missing',
          loc: ['body', field],
          msg: 'Field required',
          input: body,
        });
      }
      return undefined;
    }
    if (typeof value !== 'string') {
      this.issues.push({
        type: 'string_type',
        loc: ['body', field],
        msg: 'Input should be a valid string',
        input: value,
      });
      return undefined;
    }
    if (strip) value = value.trim();
    const text = value as string;
    if (text.length < min) {
      const unit = min === 1 ? 'character' : 'characters';
      this.issues.push({
        type: 'string_too_short',
        loc: ['body', field],
        msg: `String should have at least ${min} ${unit}`,
        input: text,
      });
      return undefined;
    }
    if (text.length > max) {
      this.issues.push({
        type: 'string_too_long',
        loc: ['body', field],
        msg: `String should have at most ${max} characters`,
        input: text,
      });
      return undefined;
    }
    return text;
  }

  email(body: Record<string, unknown>, field: string, required = true): string | undefined {
    const value = this.string(body, field, { required });
    if (value === undefined) return undefined;
    if (!EMAIL.test(value)) {
      this.issues.push({
        type: 'value_error',
        loc: ['body', field],
        msg: 'value is not a valid email address: The email address is not valid.',
        input: value,
      });
      return undefined;
    }
    return value.toLowerCase();
  }

  newPassword(body: Record<string, unknown>, field: string): string | undefined {
    const value = this.string(body, field, { min: 8, max: 128 });
    if (value !== undefined && !(/[A-Za-z]/.test(value) && /\d/.test(value))) {
      this.issues.push({
        type: 'value_error',
        loc: ['body', field],
        msg: 'Value error, Password must contain at least one letter and one number',
        input: value,
      });
      return undefined;
    }
    return value;
  }

  done(): void {
    if (this.issues.length) {
      throw new HttpError(422, [...this.issues]);
    }
  }
}

// tokens

function publicUser(row: UserRow): User {
  const { password_hash: _hash, ...user } = row;
  return user;
}

function hashRefresh(token: string): string {
  return hashString(token, 11) + hashString(token, 13);
}

function issueTokens(ctx: Context, user: UserRow, family?: string): TokenPair {
  const raw = randomToken();
  ctx.db.data.refresh_tokens.push({
    token_hash: hashRefresh(raw),
    user_id: user.id,
    family: family ?? randomToken().slice(0, 16),
    created_at: ctx.iso,
    expires_at: new Date(ctx.now.getTime() + REFRESH_TOKEN_DAYS * 86_400_000).toISOString(),
    revoked_at: null,
  });
  // drop old tokens so storage stays small; used ones stay an hour to catch reuse
  const hourAgo = new Date(ctx.now.getTime() - 3_600_000).toISOString();
  ctx.db.data.refresh_tokens = ctx.db.data.refresh_tokens.filter(
    (t) => t.expires_at > ctx.iso && (t.revoked_at === null || t.revoked_at > hourAgo),
  );
  ctx.db.save();

  const access = createMockJwt({
    sub: String(user.id),
    email: user.email,
    role: user.role,
    type: 'access',
    iat: ctx.seconds,
    exp: ctx.seconds + ACCESS_TOKEN_SECONDS,
    jti: randomToken().slice(0, 22),
  });
  return {
    access_token: access,
    refresh_token: raw,
    token_type: 'bearer',
    expires_in: ACCESS_TOKEN_SECONDS,
    user: publicUser(user),
  };
}

function revoke(ctx: Context, match: (t: RefreshRow) => boolean): void {
  for (const token of ctx.db.data.refresh_tokens) {
    if (match(token) && token.revoked_at === null) token.revoked_at = ctx.iso;
  }
}

function findRefresh(ctx: Context, raw: string): RefreshRow | undefined {
  const hash = hashRefresh(raw);
  return ctx.db.data.refresh_tokens.find((t) => t.token_hash === hash);
}

function emailTaken(ctx: Context, email: string, exceptId?: number): boolean {
  return ctx.db.data.users.some((u) => u.email === email && u.id !== exceptId);
}

// handlers

function register(ctx: Context, body: unknown): MockResponse {
  const data = ctx.body(body);
  const email = ctx.email(data, 'email');
  const fullName = ctx.string(data, 'full_name', { min: 2, max: 100, strip: true });
  const password = ctx.newPassword(data, 'password');
  ctx.done();
  if (emailTaken(ctx, email!)) throw new HttpError(409, 'This email is already registered');

  const id = ctx.db.nextUserId();
  const user: UserRow = {
    id,
    email: email!,
    full_name: fullName!,
    role: 'user',
    is_active: true,
    created_at: ctx.iso,
    updated_at: ctx.iso,
    last_login_at: ctx.iso,
    password_hash: hashPassword(id, password!),
  };
  ctx.db.data.users.push(user);
  return ok(issueTokens(ctx, user), 201);
}

function login(ctx: Context, body: unknown): MockResponse {
  const data = ctx.body(body);
  const email = ctx.email(data, 'email');
  const password = ctx.string(data, 'password', { min: 1, max: 128 });
  ctx.done();
  const user = ctx.db.data.users.find((u) => u.email === email);
  if (!user || user.password_hash !== hashPassword(user.id, password!)) {
    throw unauthorized('Incorrect email or password');
  }
  if (!user.is_active) throw new HttpError(403, 'This account has been deactivated');
  user.last_login_at = ctx.iso;
  user.updated_at = ctx.iso;
  return ok(issueTokens(ctx, user));
}

function refresh(ctx: Context, body: unknown): MockResponse {
  const data = ctx.body(body);
  const raw = ctx.string(data, 'refresh_token', { min: 1, max: 512 });
  ctx.done();

  const token = findRefresh(ctx, raw!);
  if (!token) throw unauthorized('Invalid refresh token');
  if (token.revoked_at !== null) {
    // a used token came back: assume it leaked and end that whole session
    revoke(ctx, (t) => t.family === token.family);
    ctx.db.save();
    throw unauthorized('Refresh token has been revoked');
  }
  if (token.expires_at <= ctx.iso) throw unauthorized('Refresh token expired');

  const user = ctx.db.data.users.find((u) => u.id === token.user_id);
  if (!user || !user.is_active) throw unauthorized('Account is not available');

  token.revoked_at = ctx.iso;
  return ok(issueTokens(ctx, user, token.family));
}

function logout(ctx: Context, body: unknown): MockResponse {
  const data = ctx.body(body);
  const raw = ctx.string(data, 'refresh_token', { min: 1, max: 512 });
  ctx.done();
  const token = findRefresh(ctx, raw!);
  if (token) {
    revoke(ctx, (t) => t.family === token.family);
    ctx.db.save();
  }
  return noContent();
}

function updateMe(ctx: Context, body: unknown): MockResponse {
  const user = ctx.user();
  const data = ctx.body(body);
  const email = ctx.email(data, 'email', false);
  const fullName = ctx.string(data, 'full_name', {
    min: 2,
    max: 100,
    strip: true,
    required: false,
  });
  ctx.done();
  if (email !== undefined && emailTaken(ctx, email, user.id)) {
    throw new HttpError(409, 'This email is already registered');
  }
  if (email !== undefined) user.email = email;
  if (fullName !== undefined) user.full_name = fullName;
  user.updated_at = ctx.iso;
  ctx.db.save();
  return ok(publicUser(user));
}

function changePassword(ctx: Context, body: unknown): MockResponse {
  const user = ctx.user();
  const data = ctx.body(body);
  const current = ctx.string(data, 'current_password', { min: 1, max: 128 });
  const next = ctx.newPassword(data, 'new_password');
  if (current !== undefined && next !== undefined && current === next) {
    ctx.issues.push({
      type: 'value_error',
      loc: ['body'],
      msg: 'Value error, New password must be different from the current one',
      input: data,
    });
  }
  ctx.done();
  if (user.password_hash !== hashPassword(user.id, current!)) {
    throw new HttpError(400, 'Current password is incorrect');
  }
  user.password_hash = hashPassword(user.id, next!);
  user.updated_at = ctx.iso;
  revoke(ctx, (t) => t.user_id === user.id);
  return ok(issueTokens(ctx, user));
}

function listUsers(ctx: Context, params: URLSearchParams): MockResponse {
  ctx.admin();
  const query = (name: string, issue: () => Issue | null) => {
    const problem = issue();
    if (problem) ctx.issues.push(problem);
    return params.get(name);
  };
  const enumIssue = (name: string, values: readonly string[]) => () => {
    const value = params.get(name);
    if (value === null || values.includes(value)) return null;
    const expected = values
      .map((v) => `'${v}'`)
      .join(', ')
      .replace(/, ([^,]*)$/, ' or $1');
    return { type: 'enum', loc: ['query', name], msg: `Input should be ${expected}`, input: value };
  };
  const intIssue = (name: string, min: number, max?: number) => () => {
    const value = params.get(name);
    if (value === null) return null;
    const n = Number(value);
    if (!/^-?\d+$/.test(value)) {
      return {
        type: 'int_parsing',
        loc: ['query', name],
        msg: 'Input should be a valid integer, unable to parse string as an integer',
        input: value,
      };
    }
    if (n < min) {
      return {
        type: 'greater_than_equal',
        loc: ['query', name],
        msg: `Input should be greater than or equal to ${min}`,
        input: value,
      };
    }
    if (max !== undefined && n > max) {
      return {
        type: 'less_than_equal',
        loc: ['query', name],
        msg: `Input should be less than or equal to ${max}`,
        input: value,
      };
    }
    return null;
  };

  const search = query('search', () => null);
  const role = query('role', enumIssue('role', ROLES)) as Role | null;
  const status = query('status', enumIssue('status', ['active', 'inactive']));
  const sort = query('sort', enumIssue('sort', SORT_OPTIONS)) ?? '-created_at';
  const page = Number(query('page', intIssue('page', 1)) ?? 1);
  const pageSize = Number(query('page_size', intIssue('page_size', 1, 100)) ?? 10);
  ctx.done();

  let users = [...ctx.db.data.users];
  const term = search?.trim().toLowerCase();
  if (term) {
    users = users.filter(
      (u) => u.full_name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term),
    );
  }
  if (role) users = users.filter((u) => u.role === role);
  if (status) users = users.filter((u) => u.is_active === (status === 'active'));

  const key = sort.replace(/^-/, '') as SortKey;
  const desc = sort.startsWith('-');
  users.sort((a, b) => {
    const x = a[key];
    const y = b[key];
    // empty values go last whatever the direction, like the API
    if (x === null || y === null) {
      if (x === y) return a.id - b.id;
      return x === null ? 1 : -1;
    }
    if (x === y) return a.id - b.id;
    return (x < y ? -1 : 1) * (desc ? -1 : 1);
  });

  const items = users.slice((page - 1) * pageSize, page * pageSize).map(publicUser);
  return ok({ items, total: users.length, page, page_size: pageSize });
}

function userStats(ctx: Context): MockResponse {
  ctx.admin();
  const users = ctx.db.data.users;
  const weekAgo = new Date(ctx.now.getTime() - 7 * 86_400_000).toISOString();
  const active = users.filter((u) => u.is_active).length;
  const stats: UserStats = {
    total: users.length,
    active,
    inactive: users.length - active,
    admins: users.filter((u) => u.role === 'admin').length,
    new_this_week: users.filter((u) => u.created_at >= weekAgo).length,
  };
  return ok(stats);
}

function updateUser(ctx: Context, id: number, body: unknown): MockResponse {
  const admin = ctx.admin();
  const data = ctx.body(body);
  const changes: { role?: Role; is_active?: boolean } = {};
  if (data['role'] !== undefined && data['role'] !== null) {
    if (!ROLES.includes(data['role'] as Role)) {
      ctx.issues.push({
        type: 'enum',
        loc: ['body', 'role'],
        msg: "Input should be 'admin' or 'user'",
        input: data['role'],
      });
    } else {
      changes.role = data['role'] as Role;
    }
  }
  if (data['is_active'] !== undefined && data['is_active'] !== null) {
    if (typeof data['is_active'] !== 'boolean') {
      ctx.issues.push({
        type: 'bool_parsing',
        loc: ['body', 'is_active'],
        msg: 'Input should be a valid boolean',
        input: data['is_active'],
      });
    } else {
      changes.is_active = data['is_active'];
    }
  }
  ctx.done();

  const user = ctx.db.data.users.find((u) => u.id === id);
  if (!user) throw new HttpError(404, 'User not found');
  if (user.id === admin.id && Object.keys(changes).length) {
    throw new HttpError(400, "You can't change your own role or status");
  }
  Object.assign(user, changes);
  if (Object.keys(changes).length) user.updated_at = ctx.iso;
  if (changes.is_active === false) revoke(ctx, (t) => t.user_id === user.id);
  ctx.db.save();
  return ok(publicUser(user));
}

// routing

type Handler = (ctx: Context, body: unknown, params: URLSearchParams, id: number) => MockResponse;

const ROUTES: { pattern: RegExp; methods: Record<string, Handler> }[] = [
  { pattern: /^\/api\/health$/, methods: { GET: () => ok({ status: 'ok' }) } },
  { pattern: /^\/api\/auth\/register$/, methods: { POST: (c, b) => register(c, b) } },
  { pattern: /^\/api\/auth\/login$/, methods: { POST: (c, b) => login(c, b) } },
  { pattern: /^\/api\/auth\/refresh$/, methods: { POST: (c, b) => refresh(c, b) } },
  { pattern: /^\/api\/auth\/logout$/, methods: { POST: (c, b) => logout(c, b) } },
  {
    pattern: /^\/api\/auth\/me$/,
    methods: { GET: (c) => ok(publicUser(c.user())), PATCH: (c, b) => updateMe(c, b) },
  },
  { pattern: /^\/api\/auth\/me\/password$/, methods: { POST: (c, b) => changePassword(c, b) } },
  { pattern: /^\/api\/users$/, methods: { GET: (c, _b, p) => listUsers(c, p) } },
  { pattern: /^\/api\/users\/stats$/, methods: { GET: (c) => userStats(c) } },
  {
    pattern: /^\/api\/users\/([^/]+)$/,
    methods: { PATCH: (c, b, _p, id) => updateUser(c, id, b) },
  },
];

/** Answers one API call from the mock database, like the FastAPI backend would. */
export function handleMockRequest(db: MockDb, request: MockRequest): MockResponse {
  const url = new URL(request.url, 'http://mock.local');
  const path = url.pathname.replace(/\/+$/, '');
  const route = ROUTES.find((r) => r.pattern.test(path));
  if (!route) return { status: 404, body: { detail: 'Not Found' } };

  const handler = route.methods[request.method.toUpperCase()];
  if (!handler) return { status: 405, body: { detail: 'Method Not Allowed' } };

  const ctx = new Context(db, request.now ?? new Date(), request.authorization ?? null);
  const rawId = path.match(route.pattern)?.[1];
  try {
    if (rawId !== undefined && !/^\d+$/.test(rawId)) {
      ctx.issues.push({
        type: 'int_parsing',
        loc: ['path', 'user_id'],
        msg: 'Input should be a valid integer, unable to parse string as an integer',
        input: rawId,
      });
      ctx.done();
    }
    return handler(ctx, request.body, url.searchParams, Number(rawId));
  } catch (error) {
    if (error instanceof HttpError) {
      return { status: error.status, body: { detail: error.detail } };
    }
    throw error;
  }
}
