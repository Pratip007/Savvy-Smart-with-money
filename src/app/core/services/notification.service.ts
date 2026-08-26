import { Injectable, signal } from '@angular/core';
import { StorageService } from './storage.service';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly isEnabled = signal(false);
  readonly preferredHour = signal(20);
  private timerId: ReturnType<typeof setTimeout> | null = null;

  constructor(private storage: StorageService) {
    const h = storage.getString('notif_hour');
    if (h) this.preferredHour.set(parseInt(h));
    this.isEnabled.set(!!storage.getString('notif_enabled'));
    if (this.isEnabled()) this.scheduleNext();
  }

  async requestPermission(): Promise<void> {
    if (!('Notification' in window)) { return; }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      this.isEnabled.set(true);
      this.storage.setString('notif_enabled', '1');
      this.scheduleNext();
    }
  }

  setHour(hour: number): void {
    this.preferredHour.set(hour);
    this.storage.setString('notif_hour', String(hour));
    if (this.isEnabled()) this.scheduleNext();
  }

  disable(): void {
    this.isEnabled.set(false);
    this.storage.remove('notif_enabled');
    if (this.timerId) { clearTimeout(this.timerId); this.timerId = null; }
  }

  private scheduleNext(): void {
    if (this.timerId) clearTimeout(this.timerId);
    const now = new Date();
    const target = new Date();
    target.setHours(this.preferredHour(), 0, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    this.timerId = setTimeout(() => {
      if (Notification.permission === 'granted') {
        new Notification('Savvy Reminder', {
          body: "Don't forget to log today's expenses!",
          icon: '/icons/icon-192x192.png'
        });
      }
      this.scheduleNext();
    }, target.getTime() - now.getTime());
  }
}
