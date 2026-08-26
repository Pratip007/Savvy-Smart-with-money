import { Component, input, output } from '@angular/core';
import { BudgetItem } from '../../../core/models/budget.model';
import { FmtCurrencyPipe } from '../../pipes/fmt-currency.pipe';

@Component({
  selector: 'app-budget-row',
  standalone: true,
  imports: [FmtCurrencyPipe],
  template: `
    <div class="budget-row">
      <input class="item-name-input" type="text" [value]="item().name"
        [readonly]="fromTxn()"
        [style.color]="fromTxn() ? 'var(--brand-600)' : ''"
        [style.font-weight]="fromTxn() ? '600' : ''"
        placeholder="Item name"
        (input)="nameChange.emit($any($event.target).value)"
        (change)="nameSave.emit($any($event.target).value)">
      @if (varianceText()) {
        <span class="variance-chip" [class]="varianceClass()">{{ varianceText() }}</span>
      }
      @if (fromTxn()) {
        <div class="item-amount-txn">
          {{ item().amount | fmtCurrency }}
          <span class="txn-count-badge">{{ txCount() }}</span>
        </div>
      } @else {
        <input class="item-amount-input" type="number"
          [value]="(+item().amount) || ''"
          placeholder="0" min="0" step="0.01" inputmode="decimal"
          (input)="amountChange.emit(parseFloat($any($event.target).value) || 0)">
      }
      <button class="item-delete-btn" (click)="deleteItem.emit()">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
  `
})
export class BudgetRowComponent {
  item = input.required<BudgetItem>();
  fromTxn = input(false);
  txCount = input(0);
  varianceText = input('');
  varianceClass = input('');
  nameChange = output<string>();
  nameSave = output<string>();
  amountChange = output<number>();
  deleteItem = output<void>();
  parseFloat = parseFloat;
}
