import { Component, signal, output, inject, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Transaction } from '../../../core/models/transaction.model';
import { DEF_INCOME, DEF_EXPENSES } from '../../../core/constants/budget-defaults.const';
import { CategorizeService } from '../../../core/services/categorize.service';

@Component({
  selector: 'app-transaction-modal',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div id="txn-modal" class="modal-overlay" [style.display]="visible() ? 'flex' : 'none'" (click)="onBackdrop($event)">
      <div class="modal-sheet" role="dialog" aria-modal="true">
        <div class="modal-drag-handle"></div>
        <h3 class="modal-heading">{{ editId() ? 'Edit' : 'Add' }} Transaction</h3>

        <div class="txn-type-toggle">
          <button class="txn-type-btn" [class.active]="txType() === 'expense'" (click)="setType('expense')">
            <i class="fa-solid fa-arrow-trend-down"></i> Expense
          </button>
          <button class="txn-type-btn" [class.active]="txType() === 'income'" (click)="setType('income')">
            <i class="fa-solid fa-arrow-trend-up"></i> Income
          </button>
        </div>

        <div class="txn-form-grid">
          <div class="txn-form-col">
            <label class="txn-form-label">Date</label>
            <input class="form-input" type="date" [(ngModel)]="date">
          </div>
          <div class="txn-form-col">
            <label class="txn-form-label">Amount</label>
            <input class="form-input" type="number" [(ngModel)]="amount" placeholder="0.00"
                   min="0" step="0.01" inputmode="decimal">
          </div>
        </div>

        <div class="txn-form-field">
          <label class="txn-form-label">Category</label>
          <select class="form-select" [(ngModel)]="category" (ngModelChange)="onCatChange()">
            @for (d of currentDefs(); track d.name) {
              <option [value]="d.name">{{ d.name }}</option>
            }
          </select>
        </div>

        <div class="txn-form-field">
          <label class="txn-form-label">Item</label>
          <select class="form-select" [(ngModel)]="item">
            @for (i of currentItems(); track i) {
              <option [value]="i">{{ i }}</option>
            }
          </select>
        </div>

        <div class="txn-form-field">
          <label class="txn-form-label">Note <span class="txn-optional">(optional)</span></label>
          <input class="form-input" type="text" [(ngModel)]="note"
                 placeholder="e.g. Lunch, Zomato order…" maxlength="80" autocomplete="off"
                 (input)="onNoteInput($event)">
        </div>

        <div class="modal-actions">
          <button class="btn btn-ghost" (click)="cancel()">Cancel</button>
          <button class="btn btn-primary" (click)="save.emit(buildTx())">
            <i class="fa-solid fa-check"></i> Save
          </button>
        </div>
      </div>
    </div>
  `
})
export class TransactionModalComponent {
  private categorize = inject(CategorizeService);

  readonly visible = signal(false);
  readonly editId = signal<string | null>(null);
  readonly txType = signal<'income' | 'expense'>('expense');

  date = new Date().toISOString().slice(0, 10);
  amount = '';
  category = '';
  item = '';
  note = '';

  save = output<Partial<Transaction> & { editId: string | null }>();
  cancelled = output<void>();

  currentDefs = computed(() => this.txType() === 'income' ? DEF_INCOME : DEF_EXPENSES);
  currentItems = computed(() => {
    const def = this.currentDefs().find(d => d.name === this.category);
    return def ? def.items : ['Other'];
  });

  open(tx?: Transaction): void {
    this.editId.set(tx?.id ?? null);
    this.txType.set(tx?.type ?? 'expense');
    this.date = tx?.date ?? new Date().toISOString().slice(0, 10);
    this.amount = tx?.amount ? String(tx.amount) : '';
    this.note = tx?.note ?? '';
    const defs = tx?.type === 'income' ? DEF_INCOME : DEF_EXPENSES;
    this.category = tx?.category ?? defs[0].name;
    this.item = tx?.item ?? defs[0].items[0];
    this.visible.set(true);
  }

  cancel(): void { this.visible.set(false); this.cancelled.emit(); }

  setType(t: 'income' | 'expense'): void {
    this.txType.set(t);
    const defs = t === 'income' ? DEF_INCOME : DEF_EXPENSES;
    this.category = defs[0].name;
    this.item = defs[0].items[0];
  }

  onCatChange(): void {
    const items = this.currentItems();
    this.item = items[0] ?? 'Other';
  }

  onNoteInput(e: Event): void {
    if (this.editId()) return;
    const val = (e.target as HTMLInputElement).value;
    const guess = this.categorize.categorize(val);
    const catMatch = this.currentDefs().find(d => d.name === guess.cat);
    if (catMatch) {
      this.category = guess.cat;
      if (catMatch.items.includes(guess.item)) this.item = guess.item;
    }
  }

  buildTx(): Partial<Transaction> & { editId: string | null } {
    return {
      editId: this.editId(),
      date: this.date,
      type: this.txType(),
      category: this.category,
      item: this.item,
      amount: parseFloat(this.amount) || 0,
      note: this.note.trim(),
      source: 'manual'
    };
  }

  onBackdrop(e: MouseEvent): void { if (e.target === e.currentTarget) this.cancel(); }
}
