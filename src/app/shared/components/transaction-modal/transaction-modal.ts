import { Component, signal, output, inject, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Transaction } from '../../../core/models/transaction.model';
import { DEF_INCOME, DEF_EXPENSES } from '../../../core/constants/budget-defaults.const';
import { CategorizeService } from '../../../core/services/categorize.service';
import { BudgetStateService } from '../../../core/services/budget-state.service';

const CAT_ICONS: Record<string, string> = {
  'Housing': '🏠', 'Food': '🍔', 'Transport': '🚗', 'Health': '💊',
  'Family': '👨‍👩‍👧', 'Entertainment': '🎬', 'Personal Care': '💆',
  'Education': '📚', 'Technology': '💻', 'Travel': '✈️',
  'Savings & Investments': '💰', 'Debt & Loans': '💳',
  'Utilities & Bills': '⚡', 'Misc': '📦',
  'Employment': '💼', 'Business': '🏢', 'Investments': '📈',
  'Freelance': '🖥️', 'Rental': '🏘️', 'Other': '💵',
};

function nowTime(): string  { return new Date().toTimeString().slice(0, 5); }
function todayDate(): string { return new Date().toISOString().slice(0, 10); }
function yesterdayDate(): string { return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10); }

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

        <!-- Date · Time row -->
        <div class="at-meta-row">
          <div class="at-date-wrap">
            <i class="fa-solid fa-calendar-days"></i>
            <span>{{ dateLabel() }}</span>
            <input class="at-date-overlay" type="date" [(ngModel)]="date">
          </div>
          <div class="at-time-wrap">
            <i class="fa-solid fa-clock"></i>
            <input class="at-time-input" type="time" [(ngModel)]="time">
          </div>
        </div>

        <!-- Category grid -->
        <p class="at-label">Category</p>
        <div class="at-cat-grid">
          @for (d of currentDefs(); track d.name) {
            <button class="at-cat-tile" [class.active]="category()===d.name"
                    (click)="setCategory(d.name)">
              <span class="at-cat-emoji">{{ catIcon(d.name) }}</span>
              <span class="at-cat-name">{{ d.name }}</span>
              @if (category()===d.name) {
                <span class="at-cat-check"><i class="fa-solid fa-check"></i></span>
              }
            </button>
          }
          <!-- Add new category tile -->
          @if (!showAddCat()) {
            <button class="at-cat-tile at-cat-add-tile" (click)="showAddCat.set(true)">
              <span class="at-cat-emoji">➕</span>
              <span class="at-cat-name">New</span>
            </button>
          }
        </div>

        <!-- Inline add-category input -->
        @if (showAddCat()) {
          <div class="at-add-cat-row">
            <input class="at-add-cat-input" type="text" [(ngModel)]="newCatName"
                   placeholder="Category name…" maxlength="40"
                   (keyup.enter)="confirmAddCat()">
            <button class="at-add-cat-ok" (click)="confirmAddCat()">
              <i class="fa-solid fa-check"></i>
            </button>
            <button class="at-add-cat-cancel" (click)="showAddCat.set(false); newCatName=''">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        }

        <!-- Item chips — reactive to category() -->
        <p class="at-label">Item</p>
        <div class="at-item-chips">
          @for (i of currentItems(); track i) {
            <button class="at-item-chip" [class.active]="item()===i"
                    (click)="item.set(i)">
              {{ i }}
            </button>
          }
          @if (!showAddItem()) {
            <button class="at-item-chip at-item-chip-add" (click)="showAddItem.set(true)">
              ➕ New item
            </button>
          }
        </div>

        <!-- Inline add-item input -->
        @if (showAddItem()) {
          <div class="at-add-cat-row">
            <input class="at-add-cat-input" type="text" [(ngModel)]="newItemName"
                   placeholder="Item name…" maxlength="40"
                   (keyup.enter)="confirmAddItem()">
            <button class="at-add-cat-ok" (click)="confirmAddItem()">
              <i class="fa-solid fa-check"></i>
            </button>
            <button class="at-add-cat-cancel" (click)="showAddItem.set(false); newItemName=''">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        }

        <!-- Note -->
        <p class="at-label">Note <span class="at-label-opt">(optional)</span></p>
        <div class="at-note-wrap" [class.detected]="autoDetected()">
          <i class="fa-solid fa-pen-to-square"></i>
          <input class="at-note-input" type="text" [(ngModel)]="note"
                 placeholder="e.g. Zomato, Big Bazaar…" maxlength="80" autocomplete="off"
                 (input)="onNoteInput($event)">
          @if (autoDetected()) {
            <i class="fa-solid fa-wand-magic-sparkles at-auto-icon" title="Auto-detected category"></i>
          }
        </div>

        <!-- Primary save button -->
        <button class="at-save-btn" (click)="saveAndClose()">
          <i class="fa-solid fa-check"></i>
          {{ editId() ? 'Update' : 'Save' }} Transaction
        </button>

        <!-- 3-button action row -->
        <div class="at-action-row">
          <button class="at-action-btn at-action-cancel" (click)="cancel()">
            Cancel
          </button>
          <button class="at-action-btn at-action-continue" (click)="saveAndContinue()">
            <i class="fa-solid fa-plus"></i> Continue
          </button>
          <button class="at-action-btn at-action-otherday" (click)="saveAndOtherDay()">
            <i class="fa-solid fa-calendar-days"></i> Other Day
          </button>
        </div>
      </div>
    </div>
  `
})
export class TransactionModalComponent {
  private categorize  = inject(CategorizeService);
  private budgetState = inject(BudgetStateService);

  readonly visible      = signal(false);
  readonly editId       = signal<string | null>(null);
  readonly txType       = signal<'income' | 'expense'>('expense');
  readonly autoDetected = signal(false);
  readonly showAddCat  = signal(false);
  readonly showAddItem = signal(false);

  // category & item are signals so computed(currentItems) reacts to changes
  readonly category = signal('');
  readonly item     = signal('');

  date        = todayDate();
  time        = nowTime();
  amount      = '';
  note        = '';
  newCatName  = '';
  newItemName = '';

  save      = output<Partial<Transaction> & { editId: string | null }>();
  cancelled = output<void>();

  // Categories synced from budget estimation state; falls back to DEF if empty
  currentDefs = computed(() => {
    const type    = this.txType();
    const section = type === 'income'
      ? this.budgetState.currentMonthData().estimates.income
      : this.budgetState.currentMonthData().estimates.expenses;
    const entries = Object.entries(section);
    if (entries.length > 0) {
      return entries.map(([name, data]) => ({
        name,
        items: data.items.length ? data.items.map(i => i.name) : ['Other'],
      }));
    }
    return type === 'income' ? DEF_INCOME : DEF_EXPENSES;
  });

  // Reacts to category() signal — updates instantly when category changes
  currentItems = computed(() => {
    const def  = this.currentDefs().find(d => d.name === this.category());
    const list = def?.items ?? [];
    return list.length ? list : ['Other'];
  });

  catIcon(name: string): string { return CAT_ICONS[name] ?? '📂'; }

  dateLabel(): string {
    if (this.date === todayDate())     return 'Today';
    if (this.date === yesterdayDate()) return 'Yesterday';
    const [y, m, d] = this.date.split('-');
    return `${d}/${m}/${y.slice(2)}`;
  }

  open(tx?: Transaction): void {
    this.editId.set(tx?.id ?? null);
    this.txType.set(tx?.type ?? 'expense');
    this.date   = tx?.date ?? todayDate();
    this.time   = tx?.time ?? nowTime();
    this.amount = tx?.amount ? String(tx.amount) : '';
    this.note   = tx?.note ?? '';
    this.autoDetected.set(false);
    this.showAddCat.set(false);
    this.showAddItem.set(false);
    this.newCatName  = '';
    this.newItemName = '';
    const defs = this.currentDefs();
    this.category.set(tx?.category ?? defs[0]?.name ?? '');
    this.item.set(tx?.item ?? (this.currentItems()[0] ?? 'Other'));
    this.visible.set(true);
  }

  cancel(): void { this.visible.set(false); this.cancelled.emit(); }

  saveAndClose(): void {
    this.save.emit(this.buildTx());
    this.visible.set(false);
  }

  saveAndContinue(): void {
    this.save.emit(this.buildTx());
    const savedDate = this.date;
    this.amount = '';
    this.note   = '';
    this.time   = nowTime();
    this.autoDetected.set(false);
    this.date = savedDate;
    const defs = this.currentDefs();
    this.category.set(defs[0]?.name ?? '');
    this.item.set(defs[0]?.items[0] ?? 'Other');
  }

  saveAndOtherDay(): void {
    this.save.emit(this.buildTx());
    this.amount = '';
    this.note   = '';
    this.time   = nowTime();
    this.autoDetected.set(false);
    this.date = yesterdayDate();
    const defs = this.currentDefs();
    this.category.set(defs[0]?.name ?? '');
    this.item.set(defs[0]?.items[0] ?? 'Other');
  }

  setType(t: 'income' | 'expense'): void {
    this.txType.set(t);
    const defs = this.currentDefs();
    this.category.set(defs[0]?.name ?? '');
    this.item.set(defs[0]?.items[0] ?? 'Other');
  }

  setCategory(name: string): void {
    this.category.set(name);
    this.showAddItem.set(false);
    this.newItemName = '';
    const def = this.currentDefs().find(d => d.name === name);
    this.item.set(def?.items[0] ?? 'Other');
  }

  confirmAddCat(): void {
    const name = this.newCatName.trim();
    if (!name) return;
    const secKey = this.txType() === 'income' ? 'income' : 'expenses';
    this.budgetState.addCategory(secKey, 'estimates', name);
    this.category.set(name);
    this.item.set('Other');
    this.newCatName = '';
    this.showAddCat.set(false);
  }

  confirmAddItem(): void {
    const name = this.newItemName.trim();
    if (!name) return;
    const secKey = this.txType() === 'income' ? 'income' : 'expenses';
    this.budgetState.addNamedItem(secKey, 'estimates', this.category(), name);
    this.item.set(name);
    this.newItemName = '';
    this.showAddItem.set(false);
  }

  onNoteInput(e: Event): void {
    if (this.editId()) return;
    const val   = (e.target as HTMLInputElement).value;
    const guess = this.categorize.categorize(val);
    const match = this.currentDefs().find(d => d.name === guess.cat);
    if (match) {
      this.category.set(guess.cat);
      if (match.items.includes(guess.item)) this.item.set(guess.item);
      this.autoDetected.set(true);
    } else {
      this.autoDetected.set(false);
    }
  }

  buildTx(): Partial<Transaction> & { editId: string | null } {
    return {
      editId:   this.editId(),
      date:     this.date,
      time:     this.time,
      type:     this.txType(),
      category: this.category(),
      item:     this.item(),
      amount:   parseFloat(this.amount) || 0,
      note:     this.note.trim(),
      source:   'manual',
    };
  }

  onBackdrop(e: MouseEvent): void { if (e.target === e.currentTarget) this.cancel(); }
}
