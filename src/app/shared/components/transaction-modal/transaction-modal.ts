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
      <div class="modal-sheet txn-sheet" role="dialog" aria-modal="true" [attr.data-type]="txType()">

        <div class="modal-drag-handle"></div>

        <!-- ── Type Selector ── -->
        <div class="txn-type-cards">
          <button class="txn-type-card" data-t="expense"
                  [class.active]="txType()==='expense'" (click)="setType('expense')">
            <span class="txn-type-icon"><i class="fa-solid fa-arrow-trend-down"></i></span>
            <span class="txn-type-label">Expense</span>
          </button>
          <button class="txn-type-card" data-t="income"
                  [class.active]="txType()==='income'" (click)="setType('income')">
            <span class="txn-type-icon"><i class="fa-solid fa-arrow-trend-up"></i></span>
            <span class="txn-type-label">Income</span>
          </button>
        </div>

        <!-- ── Amount ── -->
        <div class="txn-amount-wrap">
          <span class="txn-currency">₹</span>
          <input class="txn-amount-big" type="number" [(ngModel)]="amount"
                 placeholder="0" min="0" step="0.01" inputmode="decimal">
        </div>

        <!-- ── Quick Date Picks ── -->
        <div class="txn-date-row">
          <button class="txn-date-chip" [class.active]="dateMode()==='today'"
                  (click)="setDateMode('today')">Today</button>
          <button class="txn-date-chip" [class.active]="dateMode()==='yesterday'"
                  (click)="setDateMode('yesterday')">Yesterday</button>
          <button class="txn-date-chip txn-date-chip--custom"
                  [class.active]="dateMode()==='custom'" (click)="setDateMode('custom')">
            <i class="fa-solid fa-calendar-days"></i>
            {{ dateMode()==='custom' ? shortDate() : 'Custom' }}
          </button>
          @if (dateMode()==='custom') {
            <input class="txn-date-picker" type="date" [(ngModel)]="date">
          }
        </div>

        <!-- ── Category Chips ── -->
        <p class="txn-section-label">Category</p>
        <div class="txn-chips-scroll">
          @for (d of currentDefs(); track d.name) {
            <button class="txn-cat-chip" [class.active]="category===d.name"
                    (click)="setCategory(d.name)">
              <span class="txn-cat-emoji">{{ catIcon(d.name) }}</span>
              {{ d.name }}
            </button>
          }
        </div>

        <!-- ── Item Chips ── -->
        <p class="txn-section-label">Item</p>
        <div class="txn-chips-scroll txn-item-chips-row">
          @for (i of currentItems(); track i) {
            <button class="txn-item-chip" [class.active]="item===i"
                    (click)="item=i">{{ i }}</button>
          }
        </div>

        <!-- ── Note ── -->
        <div class="txn-note-wrap">
          <i class="fa-solid fa-pen-to-square txn-note-icon"></i>
          <input class="txn-note-input" type="text" [(ngModel)]="note"
                 placeholder="Add a note (optional)…" maxlength="80" autocomplete="off"
                 (input)="onNoteInput($event)">
          @if (autoDetected()) {
            <span class="txn-auto-badge">
              <i class="fa-solid fa-wand-magic-sparkles"></i> Auto
            </span>
          }
        </div>

        <!-- ── Save ── -->
        <button class="txn-save-btn" (click)="save.emit(buildTx())">
          <i class="fa-solid fa-check"></i>
          {{ editId() ? 'Update' : 'Save' }} Transaction
        </button>
        <button class="txn-cancel-link" (click)="cancel()">Cancel</button>

      </div>
    </div>
  `
})
export class TransactionModalComponent {
  private categorize = inject(CategorizeService);

  readonly visible      = signal(false);
  readonly editId       = signal<string | null>(null);
  readonly txType       = signal<'income' | 'expense'>('expense');
  readonly dateMode     = signal<'today' | 'yesterday' | 'custom'>('today');
  readonly autoDetected = signal(false);

  date     = new Date().toISOString().slice(0, 10);
  amount   = '';
  category = '';
  item     = '';
  note     = '';

  save      = output<Partial<Transaction> & { editId: string | null }>();
  cancelled = output<void>();

  currentDefs = computed(() => this.txType() === 'income' ? DEF_INCOME : DEF_EXPENSES);
  currentItems = computed(() => {
    const def = this.currentDefs().find(d => d.name === this.category);
    return def ? def.items : ['Other'];
  });

  catIcon(name: string): string {
    return CAT_ICONS[name] ?? '📂';
  }

  shortDate(): string {
    // "YYYY-MM-DD" → "DD/MM"
    const parts = this.date.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}` : this.date;
  }

  open(tx?: Transaction): void {
    this.editId.set(tx?.id ?? null);
    this.txType.set(tx?.type ?? 'expense');
    this.date   = tx?.date ?? new Date().toISOString().slice(0, 10);
    this.amount = tx?.amount ? String(tx.amount) : '';
    this.note   = tx?.note ?? '';
    this.autoDetected.set(false);

    const defs = tx?.type === 'income' ? DEF_INCOME : DEF_EXPENSES;
    this.category = tx?.category ?? defs[0].name;
    this.item     = tx?.item     ?? defs[0].items[0];

    const today     = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    if (!tx || this.date === today)           this.dateMode.set('today');
    else if (this.date === yesterday)         this.dateMode.set('yesterday');
    else                                      this.dateMode.set('custom');

    this.visible.set(true);
  }

  cancel(): void { this.visible.set(false); this.cancelled.emit(); }

  setType(t: 'income' | 'expense'): void {
    this.txType.set(t);
    const defs = t === 'income' ? DEF_INCOME : DEF_EXPENSES;
    this.category = defs[0].name;
    this.item     = defs[0].items[0];
  }

  setCategory(name: string): void {
    this.category = name;
    const def = this.currentDefs().find(d => d.name === name);
    this.item = def ? def.items[0] : 'Other';
  }

  setDateMode(mode: 'today' | 'yesterday' | 'custom'): void {
    this.dateMode.set(mode);
    if (mode === 'today')     this.date = new Date().toISOString().slice(0, 10);
    if (mode === 'yesterday') this.date = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  }

  onCatChange(): void {
    this.item = this.currentItems()[0] ?? 'Other';
  }

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
