import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Icon } from '../../shared/ui/icon';

@Component({
  selector: 'app-forbidden-page',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card error-page">
      <span class="error-icon"><app-icon name="lock" [size]="28" /></span>
      <p class="code-label">Error 403</p>
      <h1>You don't have access to this page</h1>
      <p class="text-muted">
        This area is for admins. You are signed in as
        <strong>{{ auth.user()?.email }}</strong> with the <strong>{{ auth.role() }}</strong> role.
      </p>
      <div class="error-actions">
        <a class="btn btn-primary" routerLink="/dashboard">
          <app-icon name="arrow-left" [size]="16" />
          Back to dashboard
        </a>
      </div>
    </section>
  `,
  styleUrl: './error-page.scss',
})
export class ForbiddenPage {
  protected readonly auth = inject(AuthService);
}
