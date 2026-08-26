import { Injectable, inject } from '@angular/core';
import { GoogleAuthService } from './google-auth.service';
import { StorageService } from './storage.service';

const FOLDER_NAME  = 'Savvy';
const DRIVE_API    = 'https://www.googleapis.com/drive/v3';
const SHEETS_API   = 'https://sheets.googleapis.com/v4/spreadsheets';
const FOLDER_MIME  = 'application/vnd.google-apps.folder';
const SHEET_MIME   = 'application/vnd.google-apps.spreadsheet';

@Injectable({ providedIn: 'root' })
export class DriveService {
  private auth    = inject(GoogleAuthService);
  private storage = inject(StorageService);

  /**
   * Returns the spreadsheet ID for a given year.
   * Creates the "Savvy" folder and "Savvy YYYY" file on first call.
   * Results are cached in localStorage.
   */
  async getOrCreateSpreadsheetForYear(year: number): Promise<string> {
    const cached = this.storage.getYearFileId(year);
    if (cached) return cached;

    const token = this.auth.accessToken();
    if (!token) throw new Error('Not signed in');

    const folderId = await this.getOrCreateFolder(token);
    const fileId   = await this.findOrCreateYearFile(year, folderId, token);
    this.storage.setYearFileId(year, fileId);
    return fileId;
  }

  /**
   * Ensures a sheet tab named `monthLabel` (e.g. "Aug 2026") exists in the
   * spreadsheet. Returns the numeric sheetId of the tab.
   */
  async ensureMonthSheet(spreadsheetId: string, monthLabel: string, token: string): Promise<number> {
    const meta = await this.get(
      `${SHEETS_API}/${spreadsheetId}?fields=sheets.properties(title,sheetId)`,
      token
    );
    const existing = (meta.sheets as any[]).find(s => s.properties.title === monthLabel);
    if (existing) return existing.properties.sheetId;

    const res = await this.sheetsPost(spreadsheetId, token, {
      requests: [{ addSheet: { properties: { title: monthLabel } } }]
    });
    return res.replies[0].addSheet.properties.sheetId;
  }

  /** Link to open the Savvy folder in Google Drive. */
  getFolderUrl(): string {
    const id = this.storage.getFolderId();
    return id ? `https://drive.google.com/drive/folders/${id}` : '';
  }

  /** Link to open a specific year's spreadsheet. */
  getYearFileUrl(year: number): string {
    const id = this.storage.getYearFileId(year);
    return id ? `https://docs.google.com/spreadsheets/d/${id}` : '';
  }

  /** Clears all cached Drive IDs (call on sign-out). */
  resetAll(): void {
    this.storage.clearAllSyncData();
  }

  // ── Private: folder ─────────────────────────────────────────────────────────

  private async getOrCreateFolder(token: string): Promise<string> {
    const cached = this.storage.getFolderId();
    if (cached) return cached;

    const q = encodeURIComponent(
      `name='${FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and trashed=false`
    );
    const list = await this.get(`${DRIVE_API}/files?q=${q}&fields=files(id)&pageSize=1`, token);

    let folderId: string;
    if (list.files?.length > 0) {
      folderId = list.files[0].id;
    } else {
      const res = await this.drivePost(token, { name: FOLDER_NAME, mimeType: FOLDER_MIME });
      folderId = res.id;
    }

    this.storage.setFolderId(folderId);
    return folderId;
  }

  // ── Private: year file ──────────────────────────────────────────────────────

  private async findOrCreateYearFile(year: number, folderId: string, token: string): Promise<string> {
    const fileName = `Savvy ${year}`;
    const q = encodeURIComponent(
      `name='${fileName}' and mimeType='${SHEET_MIME}' and '${folderId}' in parents and trashed=false`
    );
    const list = await this.get(`${DRIVE_API}/files?q=${q}&fields=files(id)&pageSize=1`, token);
    if (list.files?.length > 0) return list.files[0].id;

    // Create spreadsheet with 3 sheets: two internal data sheets + one always-visible
    // "Overview" sheet. Google forbids hiding ALL sheets, so Overview acts as the anchor.
    const created = await this.fetchWithRetry('Create spreadsheet', () =>
      fetch(SHEETS_API, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          properties: { title: fileName },
          sheets: [
            { properties: { title: '_Data' } },
            { properties: { title: '_Transactions' } },
            { properties: { title: 'Overview' } },
          ],
        }),
      })
    );
    if (!created.ok) throw new Error(`Create spreadsheet ${created.status}: ${await created.text()}`);
    const file = await created.json();
    const fileId: string = file.spreadsheetId;

    // Hide the two internal sheets; Overview stays visible so the batch succeeds.
    const dataSheetId = file.sheets[0].properties.sheetId;
    const txnSheetId  = file.sheets[1].properties.sheetId;
    await this.sheetsPost(fileId, token, {
      requests: [
        { updateSheetProperties: { properties: { sheetId: dataSheetId, hidden: true }, fields: 'hidden' } },
        { updateSheetProperties: { properties: { sheetId: txnSheetId,  hidden: true }, fields: 'hidden' } },
      ],
    });

    // Move into the Savvy folder
    await this.fetchWithRetry('Move file', () =>
      fetch(
        `${DRIVE_API}/files/${fileId}?addParents=${folderId}&removeParents=root&fields=id`,
        { method: 'PATCH', headers: { Authorization: 'Bearer ' + token } }
      )
    );

    return fileId;
  }

  // ── HTTP helpers ─────────────────────────────────────────────────────────────

  private async fetchWithRetry(label: string, fn: () => Promise<Response>): Promise<Response> {
    const RETRYABLE = new Set([429, 500, 502, 503, 504]);
    let delay = 1000;
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fn();
      if (res.ok || !RETRYABLE.has(res.status)) return res;
      if (attempt === 3) return res;
      console.warn(`${label} ${res.status} — retrying in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
    return fn();
  }

  private async get(url: string, token: string): Promise<any> {
    const res = await this.fetchWithRetry(`Drive GET`, () =>
      fetch(url, { headers: { Authorization: 'Bearer ' + token } })
    );
    if (!res.ok) throw new Error(`Drive GET ${res.status}: ${await res.text()}`);
    return res.json();
  }

  private async drivePost(token: string, body: any): Promise<any> {
    const res = await this.fetchWithRetry(`Drive POST`, () =>
      fetch(`${DRIVE_API}/files`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    );
    if (!res.ok) throw new Error(`Drive POST ${res.status}: ${await res.text()}`);
    return res.json();
  }

  private async sheetsPost(spreadsheetId: string, token: string, body: any): Promise<any> {
    const res = await this.fetchWithRetry('Sheets batchUpdate', () =>
      fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    );
    if (!res.ok) throw new Error(`Sheets batchUpdate ${res.status}: ${await res.text()}`);
    return res.json();
  }
}
