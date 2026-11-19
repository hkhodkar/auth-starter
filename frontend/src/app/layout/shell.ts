import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../core/auth/auth.service';
import { DemoMode } from '../core/mock/demo-mode';
import { HasRole } from '../shared/directives/has-role';
import { Avatar } from '../shared/ui/avatar';
import { DemoBanner } from '../shared/ui/demo-banner';
import { Icon } from '../shared/ui/icon';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, Avatar, DemoBanner, HasRole],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly demo = inject(DemoMode);
  protected readonly menuOpen = signal(false);
  protected readonly signingOut = signal(false);

  constructor() {
    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.menuOpen.set(false));
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected signOut(): void {
    this.signingOut.set(true);
    this.auth.logout().subscribe({ complete: () => this.signingOut.set(false) });
  }
}
