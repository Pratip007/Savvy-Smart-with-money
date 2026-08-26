import { Injectable, signal, computed, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../../environments/environment';

declare const google: any;

export interface UserProfile {
  email: string;
  name: string;
  picture: string;
}

@Injectable({ providedIn: 'root' })
export class GoogleAuthService {
  private platformId = inject(PLATFORM_ID);

  readonly accessToken = signal<string | null>(null);
  readonly userProfile = signal<UserProfile | null>(null);
  readonly isAuthorized = computed(() => !!this.accessToken());

  // All scopes needed: Drive file access, Sheets read/write, Gmail read
  private readonly SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/gmail.readonly',
  ].join(' ');

  authorize(onSuccess?: () => void): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (typeof google === 'undefined') { console.error('GIS not loaded'); return; }
    const client = google.accounts.oauth2.initTokenClient({
      client_id: environment.googleClientId,
      scope: this.SCOPES,
      callback: async (response: any) => {
        if (response.access_token) {
          this.accessToken.set(response.access_token);
          await this.fetchUserProfile(response.access_token);
          onSuccess?.();
        } else {
          console.error('Auth failed', response);
        }
      },
    });
    client.requestAccessToken();
  }

  private async fetchUserProfile(token: string): Promise<void> {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: 'Bearer ' + token },
      });
      const data = await res.json();
      this.userProfile.set({ email: data.email, name: data.name, picture: data.picture });
    } catch {}
  }

  signOut(): void {
    this.accessToken.set(null);
    this.userProfile.set(null);
  }

  // kept for backward compatibility — no-op, Client ID now comes from environment.ts
  setClientId(_id: string): void {}
}
