import { Injectable, signal, computed, effect } from '@angular/core';
import { AllData, BudgetSection, CategoryData, BudgetItem, MonthData, BudgetMode } from '../models/budget.model';
import { SyncState } from '../models/sync.model';
import { StorageService } from './storage.service';
import { BudgetMathService } from './budget-math.service';
import { DEF_INCOME, DEF_EXPENSES } from '../constants/budget-defaults.const';

@Injectable({ providedIn: 'root' })
export class BudgetStateService {
  readonly currentYear = signal(new Date().getFullYear());
  readonly currentMonth = signal(new Date().getMonth());
  readonly data = signal<AllData>({});
  readonly txnFilter = signal<'all' | 'income' | 'expense'>('all');
  readonly txnSearch = signal('');
  readonly syncState = signal<SyncState>('off');
  readonly currentKey = computed(() => this.math.mkey(this.currentYear(), this.currentMonth()));
  readonly currentMonthData = computed(() => this.data()[this.currentKey()] ?? this.makeMonth());

  constructor(private storage: StorageService, private math: BudgetMathService) {
    this.data.set(storage.getBudget());
    this.syncState.set(storage.getFolderId() ? 'idle' : 'off');
    effect(() => { storage.saveBudget(this.data()); });
  }

  prevMonth(): void {
    if (this.currentMonth() === 0) { this.currentMonth.set(11); this.currentYear.update(y => y - 1); }
    else this.currentMonth.update(m => m - 1);
  }

  nextMonth(): void {
    if (this.currentMonth() === 11) { this.currentMonth.set(0); this.currentYear.update(y => y + 1); }
    else this.currentMonth.update(m => m + 1);
  }

  getM(key?: string): MonthData {
    const k = key || this.currentKey();
    const existing = this.data()[k];
    if (existing) return existing;
    const fresh = this.makeMonth();
    this.data.update(d => ({ ...d, [k]: fresh }));
    return fresh;
  }

  makeMonth(): MonthData {
    return {
      estimates: { income: this.buildSec(DEF_INCOME), expenses: this.buildSec(DEF_EXPENSES) },
      final: { income: this.buildSec(DEF_INCOME), expenses: this.buildSec(DEF_EXPENSES) },
      transactions: []
    };
  }

  buildSec(defs: { name: string; items: string[] }[]): BudgetSection {
    const o: BudgetSection = {};
    defs.forEach(d => {
      o[d.name] = { collapsed: false, items: d.items.map(n => ({ id: this.math.uid(), name: n, amount: 0 })) };
    });
    return o;
  }

  mutItem(type: string, mode: string, catName: string, id: string, fn: (item: BudgetItem) => void): void {
    this.data.update(data => {
      const d = JSON.parse(JSON.stringify(data)) as AllData;
      const k = this.currentKey();
      if (!d[k]) d[k] = this.makeMonth();
      const sec = (d[k] as any)[mode][type];
      if (!sec?.[catName]) return data;
      const item = sec[catName].items.find((i: BudgetItem) => i.id === id);
      if (item) fn(item);
      return d;
    });
  }

  toggleCat(type: string, mode: string, catName: string): void {
    this.data.update(data => {
      const d = JSON.parse(JSON.stringify(data)) as AllData;
      const k = this.currentKey();
      const cat = (d[k] as any)?.[mode]?.[type]?.[catName];
      if (cat) cat.collapsed = !cat.collapsed;
      return d;
    });
  }

  delCat(type: string, mode: string, catName: string): void {
    this.data.update(data => {
      const d = JSON.parse(JSON.stringify(data)) as AllData;
      const k = this.currentKey();
      const sec = (d[k] as any)?.[mode]?.[type];
      if (sec) delete sec[catName];
      return d;
    });
  }

  addItem(type: string, mode: string, catName: string): void {
    this.data.update(data => {
      const d = JSON.parse(JSON.stringify(data)) as AllData;
      const k = this.currentKey();
      const cat = (d[k] as any)?.[mode]?.[type]?.[catName];
      if (cat) cat.items.push({ id: this.math.uid(), name: 'New Item', amount: 0 });
      return d;
    });
  }

  delItem(type: string, mode: string, catName: string, id: string): void {
    this.data.update(data => {
      const d = JSON.parse(JSON.stringify(data)) as AllData;
      const k = this.currentKey();
      const cat = (d[k] as any)?.[mode]?.[type]?.[catName];
      if (cat) cat.items = cat.items.filter((i: BudgetItem) => i.id !== id);
      return d;
    });
  }

  addCategory(type: string, mode: string, name: string): void {
    this.data.update(data => {
      const d = JSON.parse(JSON.stringify(data)) as AllData;
      const k = this.currentKey();
      if (!d[k]) d[k] = this.makeMonth();
      (d[k] as any)[mode][type][name] = { collapsed: false, items: [] };
      return d;
    });
  }

  copyFromEst(): void {
    this.data.update(data => {
      const d = JSON.parse(JSON.stringify(data)) as AllData;
      const k = this.currentKey();
      if (!d[k]) return data;
      const est = d[k].estimates;
      d[k].final = {
        income: JSON.parse(JSON.stringify(est.income)),
        expenses: JSON.parse(JSON.stringify(est.expenses))
      };
      return d;
    });
  }
}
