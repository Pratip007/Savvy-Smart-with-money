import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly message = signal<string | null>(null);
  private timerId: ReturnType<typeof setTimeout> | null = null;

  show(msg: string, duration = 2600): void {
    this.message.set(msg);
    if (this.timerId) clearTimeout(this.timerId);
    this.timerId = setTimeout(() => this.message.set(null), duration);
  }
}
