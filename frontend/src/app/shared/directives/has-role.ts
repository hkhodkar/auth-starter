import { Directive, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { Role } from '../../core/models/auth.models';

/**
 * Renders its content only for the given role(s), and updates when the role
 * changes. `<a *appHasRole="'admin'">Users</a>`
 */
@Directive({ selector: '[appHasRole]' })
export class HasRole {
  readonly appHasRole = input.required<Role | Role[]>();

  private readonly auth = inject(AuthService);
  private readonly template = inject(TemplateRef);
  private readonly container = inject(ViewContainerRef);
  private shown = false;

  constructor() {
    effect(() => {
      const wanted = this.appHasRole();
      const allowed = this.auth.hasRole(...(Array.isArray(wanted) ? wanted : [wanted]));
      if (allowed && !this.shown) {
        this.container.createEmbeddedView(this.template);
      } else if (!allowed && this.shown) {
        this.container.clear();
      }
      this.shown = allowed;
    });
  }
}
