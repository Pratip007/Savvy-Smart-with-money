import { Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BudgetStateService } from '../../core/services/budget-state.service';
import { StorageService } from '../../core/services/storage.service';
import { SheetsService } from '../../core/services/sheets.service';
import { DriveService } from '../../core/services/drive.service';
import { ImportExportService } from '../../core/services/import-export.service';
import { ToastService } from '../../core/services/toast.service';
import { GoogleAuthService } from '../../core/services/google-auth.service';
import { GmailService } from '../../core/services/gmail.service';
import { NotificationService } from '../../core/services/notification.service';
import { CURRENCIES } from '../../core/constants/currencies.const';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  state = inject(BudgetStateService);
  private storage = inject(StorageService);
  private sheets = inject(SheetsService);
  private drive = inject(DriveService);
  private importExport = inject(ImportExportService);
  private toast = inject(ToastService);
  googleAuth = inject(GoogleAuthService);
  gmail = inject(GmailService);
  notif = inject(NotificationService);

  readonly CURRENCIES = CURRENCIES;

  currency = this.storage.getCurrency();
  notifHour = this.notif.preferredHour();

  readonly spreadsheetUrl = computed(() =>
    this.googleAuth.isAuthorized() ? this.drive.getYearFileUrl(this.state.currentYear()) : ''
  );

  readonly folderUrl = computed(() =>
    this.googleAuth.isAuthorized() ? this.drive.getFolderUrl() : ''
  );

  signIn(): void {
    this.googleAuth.authorize(() => this.sheets.pullFromSheets());
  }

  signOut(): void {
    this.googleAuth.signOut();
    this.drive.resetAll();
    this.state.syncState.set('off');
    this.toast.show('Signed out');
  }

  gsPush(): void { this.sheets.pushToSheets(); }
  gsPull(): void {
    if (confirm('Pull from Sheets? Local data will be overwritten.')) {
      this.sheets.pullFromSheets();
    }
  }

  syncGmail(): void { this.gmail.syncInbox(); }

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

  enableNotifications(): void { this.notif.requestPermission(); }
  disableNotifications(): void { this.notif.disable(); }
  setNotifHour(): void { this.notif.setHour(this.notifHour); }
}
