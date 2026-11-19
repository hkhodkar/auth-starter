import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Icon } from '../ui/icon';
import { passwordStrength } from './password-rules';

@Component({
  selector: 'app-password-strength',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-score]': 'strength().score' },
  template: `
    <div class="meter" aria-hidden="true">
      @for (bar of bars; track bar) {
        <span class="bar" [class.on]="strength().score >= bar"></span>
      }
    </div>
    <p class="summary" aria-live="polite">
      Password strength:
      <strong>{{ strength().label || 'not set' }}</strong>
    </p>
    <ul class="checks">
      @for (check of strength().checks; track check.label) {
        <li [class.passed]="check.passed">
          <app-icon [name]="check.passed ? 'check' : 'dot'" [size]="14" />
          {{ check.label }}
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      --meter: var(--border-strong);
      display: grid;
      gap: 8px;
      font-size: 12px;
      color: var(--text-muted);
    }

    :host([data-score='1']) {
      --meter: var(--danger);
    }

    :host([data-score='2']) {
      --meter: var(--warning);
    }

    :host([data-score='3']) {
      --meter: #2f9e6b;
    }

    :host([data-score='4']) {
      --meter: var(--success);
    }

    .meter {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
    }

    .bar {
      height: 4px;
      border-radius: 4px;
      background: var(--surface-muted);
      transition: background-color 0.2s ease;

      &.on {
        background: var(--meter);
      }
    }

    .summary strong {
      color: var(--meter);
    }

    :host([data-score='0']) .summary strong {
      color: var(--text-subtle);
      font-weight: 500;
    }

    .checks {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px 12px;
      margin: 0;
      padding: 0;
      list-style: none;

      li {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      li.passed {
        color: var(--success);
      }
    }

    @media (max-width: 420px) {
      .checks {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class PasswordStrengthMeter {
  readonly password = input<string | null>('');

  protected readonly bars = [1, 2, 3, 4];
  protected readonly strength = computed(() => passwordStrength(this.password() ?? ''));
}
