export type Role = 'admin' | 'user';

export const ROLES: readonly Role[] = ['admin', 'user'];

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  /** access token lifetime in seconds */
  expires_in: number;
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  full_name: string;
  password: string;
}

export interface ProfileUpdate {
  email?: string;
  full_name?: string;
}

export interface PasswordChange {
  current_password: string;
  new_password: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export type UserStatus = 'active' | 'inactive';

export interface UserQuery {
  search?: string | null;
  role?: Role | null;
  status?: UserStatus | null;
  sort?: string | null;
  page?: number;
  page_size?: number;
}

export interface UserStats {
  total: number;
  active: number;
  inactive: number;
  admins: number;
  new_this_week: number;
}
