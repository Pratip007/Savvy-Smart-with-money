import { Injectable, signal, computed, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

declare const google: any;

@Injectable({ providedIn: 'root' })
export class GoogleAuthService {
  private platformId = inject(PLATFORM_ID);
  readonly accessToken = signal<string | null>(null);
  readonly isAuthorized = computed(() => !!this.accessToken());
  private clientId = '';

  setClientId(id: string): void { this.clientId = id; }

  authorize(scopes: string[] = ['https://www.googleapis.com/auth/gmail.readonly']): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (typeof google === 'undefined') { console.error('GIS not loaded'); return; }
    const client = google.accounts.oauth2.initTokenClient({
      client_id: this.clientId,
      scope: scopes.join(' '),
      callback: (response: any) => {
        if (response.access_token) this.accessToken.set(response.access_token);
        else console.error('Auth failed', response);
      }
    });
    client.requestAccessToken();
  }

  signOut(): void { this.accessToken.set(null); }
}
