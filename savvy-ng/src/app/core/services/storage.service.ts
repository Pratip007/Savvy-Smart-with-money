import { Injectable } from '@angular/core';
import { AllData } from '../models/budget.model';

@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly BUDGET_KEY    = 'budgetv3';
  private readonly CURRENCY_KEY  = 'budget_currency';
  private readonly FOLDER_ID_KEY = 'savvy_folder_id';

  getBudget(): AllData {
    try { return JSON.parse(localStorage.getItem(this.BUDGET_KEY) || '{}'); }
    catch { return {}; }
  }
  saveBudget(data: AllData): void { localStorage.setItem(this.BUDGET_KEY, JSON.stringify(data)); }

  getCurrency(): string { return localStorage.getItem(this.CURRENCY_KEY) || 'INR'; }
  setCurrency(c: string): void { localStorage.setItem(this.CURRENCY_KEY, c); }

  // ── Drive folder ────────────────────────────────────────────────────────────
  getFolderId(): string  { return localStorage.getItem(this.FOLDER_ID_KEY) || ''; }
  setFolderId(id: string): void { localStorage.setItem(this.FOLDER_ID_KEY, id); }

  // ── Per-year spreadsheet file ───────────────────────────────────────────────
  getYearFileId(year: number): string { return localStorage.getItem(`savvy_year_${year}`) || ''; }
  setYearFileId(year: number, id: string): void { localStorage.setItem(`savvy_year_${year}`, id); }

  // ── Clear all Drive-related cache on sign-out ───────────────────────────────
  clearAllSyncData(): void {
    localStorage.removeItem(this.FOLDER_ID_KEY);
    const remove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('savvy_year_')) remove.push(k);
    }
    remove.forEach(k => localStorage.removeItem(k));
  }

  // ── Generic helpers ─────────────────────────────────────────────────────────
  get<T>(key: string, fallback: T): T {
    try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  }
  set(key: string, value: unknown): void { localStorage.setItem(key, JSON.stringify(value)); }
  getString(key: string): string | null { return localStorage.getItem(key); }
  setString(key: string, value: string): void { localStorage.setItem(key, value); }
  remove(key: string): void { localStorage.removeItem(key); }
}
