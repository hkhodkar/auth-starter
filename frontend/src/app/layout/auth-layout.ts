import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DemoBanner } from '../shared/ui/demo-banner';
import { Icon, IconName } from '../shared/ui/icon';

@Component({
  selector: 'app-auth-layout',
  imports: [RouterOutlet, Icon, DemoBanner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './auth-layout.html',
  styleUrl: './auth-layout.scss',
})
export class AuthLayout {
  protected readonly features: { icon: IconName; title: string; text: string }[] = [
    {
      icon: 'key',
      title: 'Short-lived JWTs',
      text: 'Access tokens expire quickly and renew in the background.',
    },
    {
      icon: 'refresh',
      title: 'Rotating refresh tokens',
      text: 'Every refresh issues a new token; a reused one ends the session.',
    },
    {
      icon: 'shield-check',
      title: 'Role-based access',
      text: 'Route guards and role-aware UI for admins and regular users.',
    },
  ];
}
