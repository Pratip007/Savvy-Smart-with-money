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

const EMOJI_OPTIONS = [
  '🛒','🍕','☕','🍜','🍱','🥗','🎮','🎵','🎸','🏋️','🚴',
  '🏖️','🌿','🐾','💡','🎁','🧴','🛋️','🚌','🎓','🏥',
  '🧾','💈','🪴','🎪','🏗️','🔧','🎨','📱','🖨️','💍',
  '🏦','🧳','⛽','🪒','🛁','🍺','🍷','🎭','🏟️','📷',
];

function nowTime(): string  { return new Date().toTimeString().slice(0, 5); }
function todayDate(): string { return new Date().toISOString().slice(0, 10); }
function yesterdayDate(): string { return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10); }

@Component({
  selector: 'app-transaction-modal',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div id="txn-modal" class="modal-overlay" [style.display]="visible() ? 'flex' : 'none'" (click)="onBackdrop($event)">
      <div class="modal-sheet at-sheet" role="dialog" aria-modal="true"
           (touchstart)="onSheetTouchStart($event)"
           (touchmove)="onSheetTouchMove($event)"
           (touchend)="onSheetTouchEnd($event)">
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

        <!-- Category label + manage toggle -->
        <div class="at-label-row">
          <p class="at-label">Category</p>
          <button class="at-manage-btn" (click)="manageCatMode.set(!manageCatMode()); editingCat.set(null)">
            @if (manageCatMode()) { <i class="fa-solid fa-check"></i> Done }
            @else { <i class="fa-solid fa-pen-to-square"></i> Edit }
          </button>
        </div>

        <!-- Category grid -->
        <div class="at-cat-grid"
             [class.at-cat-grid--fill]="!catScrollMode()"
             [class.at-cat-grid--scroll]="catScrollMode()">
          @for (d of currentDefs(); track d.name) {
            @if (manageCatMode()) {
              <div class="at-cat-tile at-cat-tile-edit" [class.active]="category()===d.name">
                <span class="at-cat-emoji">{{ d.emoji ?? catIcon(d.name) }}</span>
                <span class="at-cat-name">{{ d.name }}</span>
                <div class="at-cat-manage-btns">
                  <button class="at-cat-act-btn at-cat-act-edit" (click)="startEditCat(d.name, d.emoji)">
                    <i class="fa-solid fa-pen"></i>
                  </button>
                  <button class="at-cat-act-btn at-cat-act-del" (click)="deleteCat(d.name)">
                    <i class="fa-solid fa-trash-can"></i>
                  </button>
                </div>
              </div>
            } @else {
              <button class="at-cat-tile" [class.active]="category()===d.name"
                      (click)="setCategory(d.name)">
                <span class="at-cat-emoji">{{ d.emoji ?? catIcon(d.name) }}</span>
                <span class="at-cat-name">{{ d.name }}</span>
                @if (category()===d.name) {
                  <span class="at-cat-check"><i class="fa-solid fa-check"></i></span>
                }
              </button>
            }
          }
          @if (!manageCatMode() && !showAddCat()) {
            <button class="at-cat-tile at-cat-add-tile" (click)="showAddCat.set(true)">
              <span class="at-cat-emoji">➕</span>
              <span class="at-cat-name">New</span>
            </button>
          }
        </div>

        @if (catScrollMode()) {
          <p class="at-scroll-hint"><i class="fa-solid fa-arrow-right-long"></i> scroll for more</p>
        }

        <!-- Inline edit category (manage mode) -->
        @if (manageCatMode() && editingCat()) {
          <div class="at-add-cat-row">
            <input class="at-emoji-input" type="text"
                   [ngModel]="editCatEmoji()"
                   (ngModelChange)="editCatEmoji.set($event || '📂')"
                   maxlength="8" placeholder="😀">
            <input class="at-add-cat-input" type="text" [(ngModel)]="editCatName"
                   placeholder="Category name…" maxlength="40"
                   (keyup.enter)="confirmEditCat()">
            <button class="at-add-cat-ok" (click)="confirmEditCat()">
              <i class="fa-solid fa-check"></i>
            </button>
            <button class="at-add-cat-cancel" (click)="editingCat.set(null)">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        }

        <!-- Inline add-category input (normal mode) -->
        @if (!manageCatMode() && showAddCat()) {
          <div class="at-add-cat-row">
            <input class="at-emoji-input" type="text"
                   [ngModel]="newCatEmoji()"
                   (ngModelChange)="newCatEmoji.set($event || '📂')"
                   maxlength="8" placeholder="😀">
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

        <!-- Item label + manage toggle -->
        <div class="at-label-row">
          <p class="at-label">Item</p>
          <button class="at-manage-btn" (click)="managItemMode.set(!managItemMode()); editingItem.set(null)">
            @if (managItemMode()) { <i class="fa-solid fa-check"></i> Done }
            @else { <i class="fa-solid fa-pen-to-square"></i> Edit }
          </button>
        </div>

        <!-- Item chips — reactive to category() -->
        <div class="at-item-chips">
          @for (i of currentItems(); track i) {
            @if (managItemMode()) {
              <div class="at-item-chip at-item-chip-manage">
                @if (editingItem() === i) {
                  <input class="at-item-edit-input" type="text" [(ngModel)]="editItemName"
                         (keyup.enter)="confirmEditItem()">
                  <button class="at-item-act-btn at-item-act-ok" (click)="confirmEditItem()">
                    <i class="fa-solid fa-check"></i>
                  </button>
                } @else {
                  <span class="at-item-chip-label">{{ i }}</span>
                  <button class="at-item-act-btn at-item-act-edit" (click)="startEditItem(i)">
                    <i class="fa-solid fa-pen"></i>
                  </button>
                  <button class="at-item-act-btn at-item-act-del" (click)="deleteItem(i)">
                    <i class="fa-solid fa-xmark"></i>
                  </button>
                }
              </div>
            } @else {
              <button class="at-item-chip" [class.active]="item()===i" (click)="item.set(i)">
                {{ i }}
              </button>
            }
          }
          @if (!managItemMode() && !showAddItem()) {
            <button class="at-item-chip at-item-chip-add" (click)="showAddItem.set(true)">
              ➕ New item
            </button>
          }
        </div>

        <p class="at-scroll-hint"><i class="fa-solid fa-arrow-right-long"></i> scroll for more</p>

        <!-- Inline add-item input -->
        @if (!managItemMode() && showAddItem()) {
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

        <!-- Action row: Cancel | Save | Continue -->
        <div class="at-action-row">
          <button class="at-action-btn at-action-cancel" (click)="cancel()">
            Cancel
          </button>
          <button class="at-action-btn at-action-save" (click)="saveAndClose()">
            <i class="fa-solid fa-check"></i>
            {{ editId() ? 'Update' : 'Save' }}
          </button>
          <button class="at-action-btn at-action-continue" (click)="saveAndContinue()">
            <i class="fa-solid fa-rotate-right"></i> Continue
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
  readonly showAddCat     = signal(false);
  readonly showAddItem    = signal(false);
  readonly showEmojiPick  = signal(false);
  readonly newCatEmoji    = signal('📂');
  readonly emojiOptions   = EMOJI_OPTIONS;
  readonly manageCatMode  = signal(false);
  readonly managItemMode  = signal(false);
  readonly editingCat     = signal<string | null>(null);
  readonly editingItem    = signal<string | null>(null);
  readonly editCatEmoji   = signal('📂');
  editCatName  = '';
  editItemName = '';

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
    const type     = this.txType();
    const section  = type === 'income'
      ? this.budgetState.currentMonthData().estimates.income
      : this.budgetState.currentMonthData().estimates.expenses;
    const defaults = type === 'income' ? DEF_INCOME : DEF_EXPENSES;
    const saved    = Object.entries(section).map(([name, data]) => ({
      name,
      emoji: data.emoji,
      items: data.items.length
        ? data.items.map(i => i.name)
        : (defaults.find(d => d.name === name)?.items ?? ['Other']),
    }));
    if (saved.length === 0) return defaults.map(d => ({ ...d, emoji: undefined as string | undefined }));
    const savedNames = new Set(saved.map(d => d.name));
    return [
      ...saved,
      ...defaults.filter(d => !savedNames.has(d.name)).map(d => ({ ...d, emoji: undefined as string | undefined })),
    ];
  });

  // Reacts to category() signal — updates instantly when category changes
  currentItems = computed(() => {
    const def  = this.currentDefs().find(d => d.name === this.category());
    const list = def?.items ?? [];
    return list.length ? list : ['Other'];
  });

  // Grid mode: fill (≤12 cats) → equal columns span full width; scroll (>12) → column-flow
  catScrollMode  = computed(() => this.currentDefs().length + 1 > 12);
  // Item mode: scroll when >9 chips (3 rows × 3 chips)
  itemScrollMode = computed(() => this.currentItems().length + 1 > 9);

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
    this.showEmojiPick.set(false);
    this.manageCatMode.set(false);
    this.managItemMode.set(false);
    this.editingCat.set(null);
    this.editingItem.set(null);
    this.newCatEmoji.set('📂');
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
    this.editingItem.set(null);
    this.newItemName = '';
    const def = this.currentDefs().find(d => d.name === name);
    this.item.set(def?.items[0] ?? 'Other');
  }

  confirmAddCat(): void {
    const name = this.newCatName.trim();
    if (!name) return;
    const secKey = this.txType() === 'income' ? 'income' : 'expenses';
    this.budgetState.addCategory(secKey, 'estimates', name, this.newCatEmoji());
    this.category.set(name);
    this.item.set('Other');
    this.newCatName = '';
    this.newCatEmoji.set('📂');
    this.showAddCat.set(false);
    this.showEmojiPick.set(false);
  }

  confirmAddItem(): void {
    const name = this.newItemName.trim();
    if (!name) return;
    const secKey   = this.txType() === 'income' ? 'income' : 'expenses';
    const defaults = secKey === 'income' ? DEF_INCOME : DEF_EXPENSES;
    const defItems = defaults.find(d => d.name === this.category())?.items ?? [];
    this.budgetState.addNamedItem(secKey, 'estimates', this.category(), name, defItems);
    this.item.set(name);
    this.newItemName = '';
    this.showAddItem.set(false);
  }

  startEditCat(name: string, emoji?: string): void {
    this.editingCat.set(name);
    this.editCatName = name;
    this.editCatEmoji.set(emoji ?? this.catIcon(name));
  }

  confirmEditCat(): void {
    const oldName = this.editingCat();
    const newName = this.editCatName.trim();
    if (!oldName || !newName) return;
    const secKey = this.txType() === 'income' ? 'income' : 'expenses';
    this.budgetState.renameCategory(secKey, 'estimates', oldName, newName, this.editCatEmoji());
    if (this.category() === oldName) this.category.set(newName);
    this.editingCat.set(null);
  }

  deleteCat(name: string): void {
    const secKey = this.txType() === 'income' ? 'income' : 'expenses';
    this.budgetState.delCat(secKey, 'estimates', name);
    if (this.category() === name) {
      const defs = this.currentDefs();
      this.category.set(defs[0]?.name ?? '');
      this.item.set(defs[0]?.items[0] ?? 'Other');
    }
  }

  startEditItem(name: string): void {
    this.editingItem.set(name);
    this.editItemName = name;
  }

  confirmEditItem(): void {
    const oldName = this.editingItem();
    const newName = this.editItemName.trim();
    if (!oldName || !newName) return;
    const secKey = this.txType() === 'income' ? 'income' : 'expenses';
    this.budgetState.renameItem(secKey, 'estimates', this.category(), oldName, newName);
    if (this.item() === oldName) this.item.set(newName);
    this.editingItem.set(null);
  }

  deleteItem(name: string): void {
    const secKey = this.txType() === 'income' ? 'income' : 'expenses';
    this.budgetState.delItemByName(secKey, 'estimates', this.category(), name);
    if (this.item() === name) {
      const items = this.currentItems();
      this.item.set(items[0] ?? 'Other');
    }
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

  private _touchStartY = 0;
  private _sheetEl: HTMLElement | null = null;

  onSheetTouchStart(e: TouchEvent): void {
    this._touchStartY = e.touches[0].clientY;
    this._sheetEl = e.currentTarget as HTMLElement;
    this._sheetEl.style.transition = 'none';
  }

  onSheetTouchMove(e: TouchEvent): void {
    const delta = e.touches[0].clientY - this._touchStartY;
    if (delta > 0 && this._sheetEl) {
      this._sheetEl.style.transform = `translateY(${delta}px)`;
    }
  }

  onSheetTouchEnd(e: TouchEvent): void {
    const delta = (e.changedTouches[0]?.clientY ?? this._touchStartY) - this._touchStartY;
    if (this._sheetEl) {
      this._sheetEl.style.transition = '';
      this._sheetEl.style.transform = '';
    }
    if (delta > 80) this.cancel();
  }
}
