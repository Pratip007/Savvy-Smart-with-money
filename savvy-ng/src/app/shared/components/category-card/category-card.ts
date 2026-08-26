import { Component, input, output, computed, inject } from '@angular/core';
import { CategoryData, BudgetItem } from '../../../core/models/budget.model';
import { BudgetRowComponent } from '../budget-row/budget-row';
import { BudgetMathService } from '../../../core/services/budget-math.service';
import { FmtCurrencyPipe } from '../../pipes/fmt-currency.pipe';
import { CCOLORS } from '../../../core/constants/budget-defaults.const';

@Component({
  selector: 'app-category-card',
  standalone: true,
  imports: [BudgetRowComponent, FmtCurrencyPipe],
  template: `
    <div class="category-card">
      <div class="category-header" (click)="onHeaderClick($event)">
        <span class="category-color-dot" [style.background]="dotColor()"></span>
        <span class="category-name">{{ catName() }}</span>
        <span class="category-total">{{ math.catSum(catData()) | fmtCurrency }}</span>
        <button class="category-delete-btn" (click)="deleteCategory.emit(); $event.stopPropagation()" title="Delete category">
          <i class="fa-solid fa-trash-can"></i>
        </button>
        <i class="fa-solid fa-chevron-down category-chevron" [class.open]="!catData().collapsed"></i>
      </div>
      @if (!catData().collapsed) {
        <div class="category-body open">
          @for (item of catData().items; track item.id) {
            <app-budget-row
              [item]="item"
              [fromTxn]="isFromTxn(item.name)"
              [txCount]="txCountFor(item.name)"
              [varianceText]="varianceText(item)"
              [varianceClass]="varianceClass(item)"
              (nameChange)="onNameChange(item.id, $event)"
              (nameSave)="nameSave.emit({ id: item.id, name: $event })"
              (amountChange)="amountChange.emit({ id: item.id, amount: $event })"
              (deleteItem)="deleteItem.emit(item.id)" />
          }
          <button class="btn-add-item" (click)="addItem.emit()">
            <i class="fa-solid fa-plus"></i> Add item
          </button>
        </div>
      }
    </div>
  `
})
export class CategoryCardComponent {
  catName = input.required<string>();
  catData = input.required<CategoryData>();
  colorIndex = input(0);
  mode = input<'estimates' | 'final'>('estimates');
  type = input<'income' | 'expenses'>('income');
  txCatMap = input<Record<string, number>>({});
  estCatData = input<CategoryData | null>(null);
  math = inject(BudgetMathService);
  dotColor = computed(() => CCOLORS[this.colorIndex() % CCOLORS.length]);
  toggleCollapse = output<void>();
  deleteCategory = output<void>();
  addItem = output<void>();
  deleteItem = output<string>();
  nameChange = output<{ id: string; name: string }>();
  nameSave = output<{ id: string; name: string }>();
  amountChange = output<{ id: string; amount: number }>();

  onHeaderClick(e: Event): void { this.toggleCollapse.emit(); }

  isFromTxn(itemName: string): boolean {
    return this.mode() === 'final' && this.txCatMap()[itemName] !== undefined;
  }

  txCountFor(itemName: string): number { return this.txCatMap()[itemName] ?? 0; }

  onNameChange(id: string, name: string): void { this.nameChange.emit({ id, name }); }

  varianceText(item: BudgetItem): string {
    if (this.mode() !== 'final') return '';
    const estCat = this.estCatData();
    if (!estCat) return '';
    const estItem = estCat.items.find(i => i.name === item.name);
    if (!estItem) return '';
    const diff = (parseFloat(String(item.amount)) || 0) - (parseFloat(String(estItem.amount)) || 0);
    return (diff > 0 ? '+' : '') + this.math.fmt(diff);
  }

  varianceClass(item: BudgetItem): string {
    if (this.mode() !== 'final') return '';
    const estCat = this.estCatData();
    if (!estCat) return '';
    const estItem = estCat.items.find(i => i.name === item.name);
    if (!estItem) return '';
    const diff = (parseFloat(String(item.amount)) || 0) - (parseFloat(String(estItem.amount)) || 0);
    return diff > 0 ? 'variance-over' : diff < 0 ? 'variance-under' : 'variance-exact';
  }
}
