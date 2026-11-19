import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Icon } from '../../shared/ui/icon';

@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'standalone' },
  template: `
    <section class="card error-page">
      <span class="error-icon"><app-icon name="search" [size]="28" /></span>
      <p class="code-label">Error 404</p>
      <h1>Page not found</h1>
      <p class="text-muted">The page you are looking for doesn't exist or was moved.</p>
      <div class="error-actions">
        <a class="btn btn-primary" [routerLink]="auth.isAuthenticated() ? '/dashboard' : '/login'">
          <app-icon name="arrow-left" [size]="16" />
          {{ auth.isAuthenticated() ? 'Back to dashboard' : 'Go to sign in' }}
        </a>
      </div>
    </section>
  `,
  styleUrl: './error-page.scss',
})
export class NotFoundPage {
  protected readonly auth = inject(AuthService);
}
