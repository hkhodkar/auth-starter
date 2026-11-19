import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Page, Role, User, UserQuery, UserStats } from '../models/auth.models';

@Injectable({ providedIn: 'root' })
export class UsersApi {
  private readonly http = inject(HttpClient);

  list(query: UserQuery): Observable<Page<User>> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== null && value !== undefined && value !== '') {
        params = params.set(key, String(value));
      }
    }
    return this.http.get<Page<User>>('/api/users', { params });
  }

  stats(): Observable<UserStats> {
    return this.http.get<UserStats>('/api/users/stats');
  }

  update(id: number, changes: { role?: Role; is_active?: boolean }): Observable<User> {
    return this.http.patch<User>(`/api/users/${id}`, changes);
  }
}
