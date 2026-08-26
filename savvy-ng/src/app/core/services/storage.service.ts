import { Injectable } from '@angular/core';
import { AllData } from '../models/budget.model';

@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly BUDGET_KEY = 'budgetv3';
  private readonly CURRENCY_KEY = 'budget_currency';
  private readonly GS_KEY = 'gs_url_v1';

  getBudget(): AllData {
    try { return JSON.parse(localStorage.getItem(this.BUDGET_KEY) || '{}'); }
    catch { return {}; }
  }
  saveBudget(data: AllData): void { localStorage.setItem(this.BUDGET_KEY, JSON.stringify(data)); }
  getCurrency(): string { return localStorage.getItem(this.CURRENCY_KEY) || 'INR'; }
  setCurrency(c: string): void { localStorage.setItem(this.CURRENCY_KEY, c); }
  getGsUrl(): string { return localStorage.getItem(this.GS_KEY) || ''; }
  setGsUrl(url: string): void { localStorage.setItem(this.GS_KEY, url); }
  removeGsUrl(): void { localStorage.removeItem(this.GS_KEY); }
  get<T>(key: string, fallback: T): T {
    try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  }
  set(key: string, value: unknown): void { localStorage.setItem(key, JSON.stringify(value)); }
  getString(key: string): string | null { return localStorage.getItem(key); }
  setString(key: string, value: string): void { localStorage.setItem(key, value); }
  remove(key: string): void { localStorage.removeItem(key); }
}
