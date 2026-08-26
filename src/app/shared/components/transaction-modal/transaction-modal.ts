import { Component, signal, output, inject, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Transaction } from '../../../core/models/transaction.model';
import { DEF_INCOME, DEF_EXPENSES } from '../../../core/constants/budget-defaults.const';
import { CategorizeService } from '../../../core/services/categorize.service';

const CAT_ICONS: Record<string, string> = {
  'Housing': '🏠', 'Food': '🍔', 'Transport': '🚗', 'Health': '💊',
  'Family': '👨‍👩‍👧', 'Entertainment': '🎬', 'Personal Care': '💆',
  'Education': '📚', 'Technology': '💻', 'Travel': '✈️',
  'Savings & Investments': '💰', 'Debt & Loans': '💳',
  'Utilities & Bills': '⚡', 'Misc': '📦',
  'Employment': '💼', 'Business': '🏢', 'Investments': '📈',
  'Freelance': '🖥️', 'Rental': '🏘️', 'Other': '💵',
};

@Component({
  selector: 'app-transaction-modal',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div id="txn-modal" class="modal-overlay" [style.display]="visible() ? 'flex' : 'none'" (click)="onBackdrop($event)">
      <div class="modal-sheet at-sheet" role="dialog" aria-modal="true">
        <div class="modal-drag-handle"></div>

        <!-- Title -->
        <h3 class="at-title">{{ editId() ? 'Edit' : 'New' }} Transaction</h3>

        <!-- Expense / Income toggle -->
        <div class="at-seg">
          <button class="at-seg-btn" [class.active]="txType()==='expense'" (click)="setType('expense')">
            <i class="fa-solid fa-arrow-trend-down"></i> Expense
          </button>
          <button class="at-seg-btn" [class.active]="txType()==='income'" (click)="setType('income')">
            <i class="fa-solid fa-arrow-trend-up"></i> Income
          </button>
        </div>

        <!-- Amount -->
        <div class="at-amount-box">
          <span class="at-rupee">₹</span>
          <input class="at-amount-input" type="number" [(ngModel)]="amount"
                 placeholder="0" min="0" step="0.01" inputmode="decimal">
        </div>

        <!-- Date + Note in one row -->
        <div class="at-meta-row">
          <div class="at-date-wrap">
            <i class="fa-solid fa-calendar-days"></i>
            <span>{{ dateLabel() }}</span>
            <input class="at-date-overlay" type="date" [(ngModel)]="date">
          </div>
          <div class="at-note-wrap" [class.detected]="autoDetected()">
            <i class="fa-solid fa-pen-to-square"></i>
            <input class="at-note-input" type="text" [(ngModel)]="note"
                   placeholder="Note (optional)" maxlength="80" autocomplete="off"
                   (input)="onNoteInput($event)">
            @if (autoDetected()) {
              <i class="fa-solid fa-wand-magic-sparkles at-auto-icon"></i>
            }
          </div>
        </div>

        <!-- Category grid -->
        <p class="at-label">Category</p>
        <div class="at-cat-grid">
          @for (d of currentDefs(); track d.name) {
            <button class="at-cat-tile" [class.active]="category===d.name" (click)="setCategory(d.name)">
              <span class="at-cat-emoji">{{ catIcon(d.name) }}</span>
              <span class="at-cat-name">{{ d.name }}</span>
            </button>
          }
        </div>

        <!-- Item dropdown -->
        <p class="at-label">Item</p>
        <select class="at-select" [(ngModel)]="item">
          @for (i of currentItems(); track i) {
            <option [value]="i">{{ i }}</option>
          }
        </select>

        <!-- Save -->
        <button class="at-save-btn" (click)="save.emit(buildTx())">
          <i class="fa-solid fa-check"></i>
          {{ editId() ? 'Update' : 'Save' }} Transaction
        </button>
        <button class="at-cancel-btn" (click)="cancel()">Cancel</button>
      </div>
    </div>
  `
})
export class TransactionModalComponent {
  private categorize = inject(CategorizeService);

  readonly visible      = signal(false);
  readonly editId       = signal<string | null>(null);
  readonly txType       = signal<'income' | 'expense'>('expense');
  readonly autoDetected = signal(false);

  date     = new Date().toISOString().slice(0, 10);
  amount   = '';
  category = '';
  item     = '';
  note     = '';

  save      = output<Partial<Transaction> & { editId: string | null }>();
  cancelled = output<void>();

  currentDefs  = computed(() => this.txType() === 'income' ? DEF_INCOME : DEF_EXPENSES);
  currentItems = computed(() => {
    const def = this.currentDefs().find(d => d.name === this.category);
    return def ? def.items : ['Other'];
  });

  catIcon(name: string): string { return CAT_ICONS[name] ?? '📂'; }

  dateLabel(): string {
    const today     = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    if (this.date === today)     return 'Today';
    if (this.date === yesterday) return 'Yesterday';
    const [y, m, d] = this.date.split('-');
    return `${d}/${m}/${y.slice(2)}`;
  }

  open(tx?: Transaction): void {
    this.editId.set(tx?.id ?? null);
    this.txType.set(tx?.type ?? 'expense');
    this.date   = tx?.date ?? new Date().toISOString().slice(0, 10);
    this.amount = tx?.amount ? String(tx.amount) : '';
    this.note   = tx?.note ?? '';
    this.autoDetected.set(false);
    const defs    = tx?.type === 'income' ? DEF_INCOME : DEF_EXPENSES;
    this.category = tx?.category ?? defs[0].name;
    this.item     = tx?.item     ?? defs[0].items[0];
    this.visible.set(true);
  }

  cancel(): void { this.visible.set(false); this.cancelled.emit(); }

  setType(t: 'income' | 'expense'): void {
    this.txType.set(t);
    const defs    = t === 'income' ? DEF_INCOME : DEF_EXPENSES;
    this.category = defs[0].name;
    this.item     = defs[0].items[0];
  }

  setCategory(name: string): void {
    this.category = name;
    const def = this.currentDefs().find(d => d.name === name);
    this.item = def ? def.items[0] : 'Other';
  }

  onCatChange(): void { this.item = this.currentItems()[0] ?? 'Other'; }

  onNoteInput(e: Event): void {
    if (this.editId()) return;
    const val   = (e.target as HTMLInputElement).value;
    const guess = this.categorize.categorize(val);
    const match = this.currentDefs().find(d => d.name === guess.cat);
    if (match) {
      this.category = guess.cat;
      if (match.items.includes(guess.item)) this.item = guess.item;
      this.autoDetected.set(true);
    } else {
      this.autoDetected.set(false);
    }
  }

  buildTx(): Partial<Transaction> & { editId: string | null } {
    return {
      editId:   this.editId(),
      date:     this.date,
      type:     this.txType(),
      category: this.category,
      item:     this.item,
      amount:   parseFloat(this.amount) || 0,
      note:     this.note.trim(),
      source:   'manual',
    };
  }

  onBackdrop(e: MouseEvent): void { if (e.target === e.currentTarget) this.cancel(); }
}
