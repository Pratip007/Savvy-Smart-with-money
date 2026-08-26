import { Component, computed, inject, ViewChild } from '@angular/core';
import { BudgetStateService } from '../../core/services/budget-state.service';
import { TransactionService } from '../../core/services/transaction.service';
import { BudgetMathService } from '../../core/services/budget-math.service';
import { ToastService } from '../../core/services/toast.service';
import { SheetsService } from '../../core/services/sheets.service';
import { TransactionItemComponent } from '../../shared/components/transaction-item/transaction-item';
import { TransactionModalComponent } from '../../shared/components/transaction-modal/transaction-modal';
import { SummaryBannerComponent } from '../../shared/components/summary-banner/summary-banner';
import { FmtCurrencyPipe } from '../../shared/pipes/fmt-currency.pipe';
import { Transaction } from '../../core/models/transaction.model';
import { MONTHS } from '../../core/constants/budget-defaults.const';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-transactions-page',
  standalone: true,
  imports: [TransactionItemComponent, TransactionModalComponent, SummaryBannerComponent, FmtCurrencyPipe, FormsModule],
  templateUrl: './transactions-page.html',
  styles: [':host { display: block; padding: 12px; padding-bottom: 80px; }']
})
export class TransactionsPage {
  @ViewChild('txnModal') txnModalRef!: TransactionModalComponent;

  state = inject(BudgetStateService);
  private txnService = inject(TransactionService);
  math = inject(BudgetMathService);
  private toast = inject(ToastService);
  private sheets = inject(SheetsService);

  txns = computed(() => this.txnService.getTxns());
  filter = computed(() => this.state.txnFilter());
  search = computed(() => this.state.txnSearch());

  totalIn = computed(() => this.txns().filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0));
  totalOut = computed(() => this.txns().filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0));
  net = computed(() => this.totalIn() - this.totalOut());

  filtered = computed(() => {
    const f = this.filter(), s = this.search().toLowerCase();
    let txns = [...this.txns()].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    if (f === 'income') txns = txns.filter(t => t.type === 'income');
    if (f === 'expense') txns = txns.filter(t => t.type === 'expense');
    if (s) txns = txns.filter(t => (t.category||'').toLowerCase().includes(s) || (t.item||'').toLowerCase().includes(s) || (t.note||'').toLowerCase().includes(s));
    return txns;
  });

  groups = computed(() => {
    const map: Record<string, Transaction[]> = {};
    this.filtered().forEach(tx => { (map[tx.date] = map[tx.date] || []).push(tx); });
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a)).map(([date, txns]) => ({
      date, label: this.dateLabel(date),
      dayNet: txns.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0),
      txns
    }));
  });

  dateLabel(d: string): string {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (d === today) return 'Today';
    if (d === yesterday) return 'Yesterday';
    const [y, mo, day] = d.split('-');
    return MONTHS[parseInt(mo)-1].slice(0,3) + ' ' + parseInt(day) + ', ' + y;
  }

  setFilter(f: 'all' | 'income' | 'expense'): void { this.state.txnFilter.set(f); }
  setSearch(s: string): void { this.state.txnSearch.set(s); }

  openAdd(): void { this.txnModalRef.open(); }

  onTxnSave(data: any): void {
    const { editId, ...tx } = data;
    if (!tx.date) { this.toast.show('Please select a date'); return; }
    if (!tx.amount) { this.toast.show('Please enter an amount'); return; }
    if (editId) {
      this.txnService.updateTransaction(editId, tx);
      this.toast.show('Transaction updated');
    } else {
      this.txnService.addTransaction(tx);
      this.toast.show('Transaction added');
    }
    this.sheets.schedulePush();
  }

  onDelete(id: string): void {
    if (confirm('Delete this transaction?')) {
      this.txnService.deleteTransaction(id);
      this.toast.show('Transaction deleted');
      this.sheets.schedulePush();
    }
  }
}
