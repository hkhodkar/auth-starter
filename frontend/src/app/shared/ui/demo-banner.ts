import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { DemoMode } from '../../core/mock/demo-mode';
import { ConfirmDialog } from './confirm-dialog';
import { Icon } from './icon';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-demo-banner',
  imports: [Icon, ConfirmDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (demo.active()) {
      <aside class="demo-banner" aria-label="Demo mode">
        <app-icon class="demo-icon" name="info" [size]="16" />
        <p><strong>Demo mode</strong> – sample data stored in your browser</p>
        <button type="button" class="btn btn-sm" (click)="askReset()">
          <app-icon name="reset" [size]="14" />
          Reset data
        </button>
      </aside>
    }

    @if (confirming()) {
      <app-confirm-dialog
        title="Reset demo data?"
        message="All accounts and changes made in this browser are removed, the sample users come back and you are signed out."
        confirmLabel="Reset data"
        (confirmed)="reset()"
        (cancelled)="cancelReset()"
      />
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .demo-banner {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 6px 6px 12px;
      border: 1px solid color-mix(in srgb, var(--primary) 24%, transparent);
      border-radius: var(--radius-sm);
      background: var(--primary-soft);
      font-size: 13px;
      line-height: 1.4;
    }

    .demo-icon {
      color: var(--primary);
    }

    p {
      flex: 1;
      min-width: 0;
      margin: 0;
    }

    .btn {
      flex-shrink: 0;
      background: var(--surface);
    }

    @media (max-width: 480px) {
      .demo-banner {
        align-items: flex-start;
        flex-wrap: wrap;
        padding: 8px 8px 8px 12px;
      }

      .demo-icon {
        margin-top: 2px;
      }

      p {
        flex-basis: calc(100% - 30px);
      }

      .btn {
        margin-left: 26px;
      }
    }
  `,
})
export class DemoBanner {
  protected readonly demo = inject(DemoMode);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  protected readonly confirming = signal(false);

  protected askReset(): void {
    this.confirming.set(true);
  }

  protected cancelReset(): void {
    this.confirming.set(false);
  }

  protected reset(): void {
    this.confirming.set(false);
    this.demo.reset();
    this.auth.endSession('reset');
    this.toast.success('Demo data was reset');
  }
}
