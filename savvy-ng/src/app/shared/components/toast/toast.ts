import { Component, inject, computed } from '@angular/core';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  template: `
    <div id="toast" role="status" aria-live="polite" [class.visible]="!!toast.message()">
      {{ toast.message() }}
    </div>
  `
})
export class ToastComponent {
  toast = inject(ToastService);
}
