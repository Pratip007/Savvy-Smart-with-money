import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subject, debounceTime } from 'rxjs';
import { AllData } from '../models/budget.model';
import { SyncState } from '../models/sync.model';
import { StorageService } from './storage.service';
import { BudgetStateService } from './budget-state.service';
import { TransactionService } from './transaction.service';
import { ToastService } from './toast.service';

@Injectable({ providedIn: 'root' })
export class SheetsService {
  private pushSubject = new Subject<void>();

  constructor(
    private http: HttpClient,
    private storage: StorageService,
    private state: BudgetStateService,
    private txnService: TransactionService,
    private toast: ToastService
  ) {
    this.pushSubject.pipe(debounceTime(5000)).subscribe(() => this.pushToSheets());
  }

  schedulePush(): void {
    if (!this.storage.getGsUrl()) return;
    this.state.syncState.set('pending');
    this.pushSubject.next();
  }

  // Convert AllData to flat rows: [monthKey, mode, type, catName, itemName, amount, itemId]
  // Read the exact dataToRows implementation from app.js
  dataToRows(data: AllData): any[][] {
    const rows: any[][] = [['MonthKey','Mode','Type','Category','Item','Amount','ID']];
    Object.entries(data).forEach(([monthKey, md]) => {
      (['estimates','final'] as const).forEach(mode => {
        (['income','expenses'] as const).forEach(type => {
          const sec = md[mode][type];
          Object.entries(sec).forEach(([cat, catData]) => {
            catData.items.forEach(item => {
              rows.push([monthKey, mode, type, cat, item.name, item.amount, item.id]);
            });
          });
        });
      });
    });
    return rows;
  }

  async pushToSheets(): Promise<void> {
    const url = this.storage.getGsUrl();
    if (!url) return;
    this.state.syncState.set('spin');
    try {
      const rows = this.dataToRows(this.state.data());
      const transactions = this.txnService.allTxnsFlat();
      await this.http.post(url, { rows, transactions }).toPromise();
      this.state.syncState.set('ok');
      setTimeout(() => this.state.syncState.set('idle'), 3000);
    } catch {
      this.state.syncState.set('err');
      this.toast.show('Sync failed');
    }
  }

  async pullFromSheets(): Promise<void> {
    const url = this.storage.getGsUrl();
    if (!url) return;
    this.state.syncState.set('spin');
    try {
      const res: any = await this.http.get(url).toPromise();
      if (!res?.ok) throw new Error(res?.error || 'Pull failed');
      if (res.rows?.length) {
        const data = this.rowsToData(res.rows);
        this.state.data.set(data);
      }
      if (res.txnRows?.length) this.txnService.txnsFromRows(res.txnRows);
      this.state.syncState.set('ok');
      setTimeout(() => this.state.syncState.set('idle'), 3000);
      this.toast.show('Pulled from Sheets');
    } catch {
      this.state.syncState.set('err');
      this.toast.show('Pull failed');
    }
  }

  rowsToData(rows: any[][]): AllData {
    const data: AllData = {};
    const modeMap: any = { estimate: 'estimates', estimates: 'estimates', final: 'final' };
    const typeMap: any = { income: 'income', expense: 'expenses', expenses: 'expenses' };
    rows.slice(1).forEach(r => {
      const [monthKey, modeRaw, typeRaw, cat, itemName, amount, itemId] = r.map((c: any) => String(c ?? ''));
      const mode = modeMap[modeRaw?.toLowerCase()] || modeRaw;
      const type = typeMap[typeRaw?.toLowerCase()] || typeRaw;
      if (!monthKey || !mode || !type || !cat) return;
      if (!data[monthKey]) {
        data[monthKey] = {
          estimates: { income: {}, expenses: {} },
          final: { income: {}, expenses: {} },
          transactions: []
        };
      }
      const sec = (data[monthKey] as any)[mode]?.[type];
      if (!sec) return;
      if (!sec[cat]) sec[cat] = { collapsed: false, items: [] };
      if (itemName) {
        const amt = parseFloat(amount) || 0;
        const existing = itemId ? sec[cat].items.find((i: any) => i.id === itemId) : null;
        if (existing) { if (amt) existing.amount = amt; }
        else {
          const byName = sec[cat].items.find((i: any) => i.name === itemName);
          if (byName) { if (amt) byName.amount = amt; }
          else sec[cat].items.push({ id: itemId || Math.random().toString(36).slice(2, 9), name: itemName, amount: amt });
        }
      }
    });
    return data;
  }
}
