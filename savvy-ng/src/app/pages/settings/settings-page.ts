import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BudgetStateService } from '../../core/services/budget-state.service';
import { StorageService } from '../../core/services/storage.service';
import { SheetsService } from '../../core/services/sheets.service';
import { ImportExportService } from '../../core/services/import-export.service';
import { ToastService } from '../../core/services/toast.service';
import { GoogleAuthService } from '../../core/services/google-auth.service';
import { GmailService } from '../../core/services/gmail.service';
import { NotificationService } from '../../core/services/notification.service';
import { CURRENCIES } from '../../core/constants/currencies.const';
import { GAS_CODE } from '../../core/constants/gas-script.const';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss'
})
export class SettingsPage {
  state = inject(BudgetStateService);
  private storage = inject(StorageService);
  private sheets = inject(SheetsService);
  private importExport = inject(ImportExportService);
  private toast = inject(ToastService);
  googleAuth = inject(GoogleAuthService);
  gmail = inject(GmailService);
  notif = inject(NotificationService);

  readonly CURRENCIES = CURRENCIES;
  readonly GAS_CODE = GAS_CODE;

  gsUrl = signal(this.storage.getGsUrl());
  gsUrlInput = this.storage.getGsUrl();
  showGuide = signal(false);
  currency = this.storage.getCurrency();
  googleClientId = this.storage.getString('google_client_id') || '';
  notifHour = this.notif.preferredHour();

  isConnected = computed(() => !!this.gsUrl());

  gsConnect(): void {
    const url = this.gsUrlInput.trim();
    if (!url.startsWith('https://script.google.com')) { this.toast.show('Invalid URL'); return; }
    this.storage.setGsUrl(url);
    this.gsUrl.set(url);
    this.state.syncState.set('idle');
    this.toast.show('Connected to Google Sheets');
    this.sheets.pushToSheets();
  }
  gsDisconnect(): void {
    if (!confirm('Disconnect? Local data is kept.')) return;
    this.storage.removeGsUrl();
    this.gsUrl.set('');
    this.gsUrlInput = '';
    this.state.syncState.set('off');
    this.toast.show('Disconnected');
  }
  gsPush(): void { this.sheets.pushToSheets(); }
  gsPull(): void {
    if (confirm('Pull from Sheets? Local data will be overwritten.')) this.sheets.pullFromSheets();
  }
  toggleGuide(): void { this.showGuide.update(v => !v); }
  copyScript(): void {
    navigator.clipboard.writeText(this.GAS_CODE).then(() => this.toast.show('Script copied!'));
  }
  setCurrency(c: string): void {
    this.storage.setCurrency(c);
    this.toast.show('Currency updated');
  }
  exportAll(): void { this.importExport.exportAllCSV(); }
  clearAll(): void {
    if (confirm('Clear ALL data? This cannot be undone.')) {
      this.state.data.set({});
      this.toast.show('All data cleared');
    }
  }
  connectGoogle(): void {
    if (this.googleClientId) this.googleAuth.setClientId(this.googleClientId);
    this.googleAuth.authorize(['https://www.googleapis.com/auth/gmail.readonly']);
  }
  syncGmail(): void { this.gmail.syncInbox(); }
  saveClientId(): void {
    this.storage.setString('google_client_id', this.googleClientId);
    this.toast.show('Client ID saved');
  }
  enableNotifications(): void { this.notif.requestPermission(); }
  disableNotifications(): void { this.notif.disable(); }
  setNotifHour(): void { this.notif.setHour(this.notifHour); }
}
