import { Injectable } from '@angular/core';
import { Transaction } from '../models/transaction.model';
import { AllData, BudgetItem } from '../models/budget.model';
import { BudgetStateService } from './budget-state.service';
import { BudgetMathService } from './budget-math.service';

@Injectable({ providedIn: 'root' })
export class TransactionService {
  constructor(private state: BudgetStateService, private math: BudgetMathService) {}

  getTxns(key?: string): Transaction[] {
    const k = key || this.state.currentKey();
    const d = this.state.data()[k];
    if (!d) return [];
    if (!d.transactions) {
      this.state.data.update(data => {
        const copy = { ...data, [k]: { ...data[k], transactions: [] } };
        return copy;
      });
      return [];
    }
    return d.transactions;
  }

  txnSumMap(txns: Transaction[]): { income: any; expenses: any } {
    const m: any = { income: {}, expenses: {} };
    txns.forEach(tx => {
      const t = tx.type === 'income' ? 'income' : 'expenses';
      if (!m[t][tx.category]) m[t][tx.category] = {};
      m[t][tx.category][tx.item] = (m[t][tx.category][tx.item] || 0) + 1;
    });
    return m;
  }

  applyTxnsToFinal(key?: string): void {
    const k = key || this.state.currentKey();
    const txns = this.getTxns(k);
    if (!txns.length) return;
    const totals: any = { income: {}, expenses: {} };
    txns.forEach(tx => {
      const t = tx.type === 'income' ? 'income' : 'expenses';
      if (!totals[t][tx.category]) totals[t][tx.category] = {};
      totals[t][tx.category][tx.item] = (totals[t][tx.category][tx.item] || 0) + (parseFloat(String(tx.amount)) || 0);
    });
    this.state.data.update(data => {
      const d = JSON.parse(JSON.stringify(data)) as AllData;
      if (!d[k]) return data;
      (['income', 'expenses'] as const).forEach(type => {
        Object.entries(totals[type]).forEach(([cat, items]: [string, any]) => {
          if (!d[k].final[type][cat])
            d[k].final[type][cat] = { collapsed: false, items: [] };
          Object.entries(items).forEach(([itemName, total]: [string, any]) => {
            const ex = d[k].final[type][cat].items.find((i: BudgetItem) => i.name === itemName);
            if (ex) ex.amount = total;
            else d[k].final[type][cat].items.push({ id: this.math.uid(), name: itemName, amount: total });
          });
        });
      });
      return d;
    });
  }

  allTxnsFlat(): (Transaction & { monthKey: string })[] {
    const out: (Transaction & { monthKey: string })[] = [];
    Object.entries(this.state.data()).forEach(([monthKey, d]) => {
      (d.transactions || []).forEach(tx => out.push({ ...tx, monthKey }));
    });
    return out;
  }

  txnsFromRows(rows: any[][]): void {
    rows.forEach(r => {
      const [monthKey, id, date, type, category, item, amount, note, source, time] = r.map((c: any) => String(c ?? ''));
      if (!monthKey || !id || !date || !type) return;
      this.state.data.update(data => {
        const d = JSON.parse(JSON.stringify(data)) as AllData;
        if (!d[monthKey]) d[monthKey] = this.state.makeMonth();
        if (!d[monthKey].transactions) d[monthKey].transactions = [];
        if (!d[monthKey].transactions.find(t => t.id === id)) {
          d[monthKey].transactions.push({
            id, date, time: time || undefined, type: type as any, category, item,
            amount: parseFloat(amount) || 0, note: note || '', source: (source || 'bank') as any
          });
        }
        return d;
      });
    });
    Object.keys(this.state.data()).forEach(k => this.applyTxnsToFinal(k));
  }

  addTransaction(tx: Omit<Transaction, 'id'> & { id?: string }): void {
    const k = this.state.currentKey();
    const id = tx.id || ('manual_' + this.math.uid());
    this.state.data.update(data => {
      const d = JSON.parse(JSON.stringify(data)) as AllData;
      if (!d[k]) d[k] = this.state.makeMonth();
      if (!d[k].transactions) d[k].transactions = [];
      if (!d[k].transactions.find(t => t.id === id)) {
        d[k].transactions.push({ ...tx, id, source: tx.source || 'manual' } as Transaction);
      }
      return d;
    });
    this.applyTxnsToFinal(k);
  }

  updateTransaction(id: string, partial: Partial<Transaction>): void {
    const k = this.state.currentKey();
    this.state.data.update(data => {
      const d = JSON.parse(JSON.stringify(data)) as AllData;
      if (!d[k]?.transactions) return data;
      const tx = d[k].transactions.find(t => t.id === id);
      if (tx) Object.assign(tx, partial);
      return d;
    });
    this.applyTxnsToFinal(k);
  }

  deleteTransaction(id: string): void {
    const k = this.state.currentKey();
    this.state.data.update(data => {
      const d = JSON.parse(JSON.stringify(data)) as AllData;
      if (!d[k]?.transactions) return data;
      d[k].transactions = d[k].transactions.filter(t => t.id !== id);
      return d;
    });
    this.applyTxnsToFinal(k);
  }
}
