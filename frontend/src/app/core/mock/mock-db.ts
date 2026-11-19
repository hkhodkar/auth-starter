import { User } from '../models/auth.models';
import { hashString } from './mock-jwt';
import { DEMO_PASSWORD, DEMO_USERS } from './seed';

export interface UserRow extends User {
  password_hash: string;
}

export interface RefreshRow {
  token_hash: string;
  user_id: number;
  family: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface MockData {
  users: UserRow[];
  refresh_tokens: RefreshRow[];
}

export const STORAGE_KEY = 'auth-starter.demo-data';
const STORAGE_VERSION = 1;

const DAY = 24 * 3600 * 1000;
const HOUR = 3600 * 1000;

export function hashPassword(userId: number, password: string): string {
  return `demo$${hashString(`${userId}:${password}`, 7)}`;
}

export function seedData(now: Date): MockData {
  const at = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const users = DEMO_USERS.map(([name, email, role, active, joined, lastLogin], index) => {
    const created = at(joined * DAY + name.length * HOUR);
    return {
      id: index + 1,
      email,
      full_name: name,
      role,
      is_active: active,
      created_at: created,
      updated_at: created,
      last_login_at: lastLogin === null ? null : at(lastLogin * DAY + 2 * HOUR),
      password_hash: hashPassword(index + 1, DEMO_PASSWORD),
    } satisfies UserRow;
  });
  return { users, refresh_tokens: [] };
}

/** In-memory tables, saved to localStorage after every change. */
export class MockDb {
  data: MockData;

  constructor(
    private readonly storage: Storage | null,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.data = this.load() ?? seedData(this.now());
  }

  save(): void {
    try {
      this.storage?.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: STORAGE_VERSION, data: this.data }),
      );
    } catch {
      // storage full or blocked: keep working in memory
    }
  }

  reset(): void {
    this.data = seedData(this.now());
    try {
      this.storage?.removeItem(STORAGE_KEY);
    } catch {
      // nothing to clean up
    }
  }

  nextUserId(): number {
    return this.data.users.reduce((max, u) => Math.max(max, u.id), 0) + 1;
  }

  private load(): MockData | null {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { version?: number; data?: MockData };
      if (parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.data?.users)) return null;
      return parsed.data;
    } catch {
      return null;
    }
  }
}
