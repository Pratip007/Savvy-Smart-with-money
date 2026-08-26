import { Injectable } from '@angular/core';
import { BudgetSection, CategoryData } from '../models/budget.model';
import { StorageService } from './storage.service';

@Injectable({ providedIn: 'root' })
export class BudgetMathService {
  constructor(private storage: StorageService) {}

  secTotal(sec: BudgetSection): number {
    return Object.values(sec).reduce((s, cat) =>
      s + cat.items.reduce((a, i) => a + (parseFloat(String(i.amount)) || 0), 0), 0);
  }

  catSum(cat: CategoryData): number {
    return cat.items.reduce((s, i) => s + (parseFloat(String(i.amount)) || 0), 0);
  }

  fmt(n: number, sign = false): string {
    const abs = Math.abs(parseFloat(String(n)) || 0);
    const str = new Intl.NumberFormat('en-US', {
      style: 'currency', currency: this.storage.getCurrency(),
      minimumFractionDigits: 0, maximumFractionDigits: 2
    }).format(abs);
    if (sign && n > 0) return '+' + str;
    if (n < 0) return '-' + str;
    return str;
  }

  uid(): string { return Math.random().toString(36).slice(2, 9); }

  mkey(year: number, month: number): string {
    return year + '-' + String(month + 1).padStart(2, '0');
  }
}
