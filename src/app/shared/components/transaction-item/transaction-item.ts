import { Component, input, output } from '@angular/core';
import { Transaction } from '../../../core/models/transaction.model';
import { FmtCurrencyPipe } from '../../pipes/fmt-currency.pipe';

@Component({
  selector: 'app-transaction-item',
  standalone: true,
  imports: [FmtCurrencyPipe],
  template: `
    <div class="txn-item">
      <div class="txn-icon" [class.txn-icon-income]="tx().type === 'income'" [class.txn-icon-expense]="tx().type === 'expense'">
        <i class="fa-solid" [class.fa-arrow-trend-up]="tx().type === 'income'" [class.fa-arrow-trend-down]="tx().type === 'expense'"></i>
      </div>
      <div class="txn-body">
        <div class="txn-name">{{ tx().item }}</div>
        <div class="txn-meta">
          {{ tx().category }}{{ tx().time ? ' · ' + tx().time : '' }}{{ tx().note ? ' · ' + tx().note : '' }}
          @if (tx().source === 'bank') {
            <span class="txn-src-badge"><i class="fa-solid fa-building-columns"></i> Bank</span>
          }
          @if (tx().source === 'gmail') {
            <span class="txn-src-badge"><i class="fa-brands fa-google"></i> Gmail</span>
          }
        </div>
      </div>
      <div class="txn-right">
        <div class="txn-amount" [class.positive]="tx().type === 'income'" [class.negative]="tx().type === 'expense'">
          {{ tx().type === 'income' ? '+' : '-' }}{{ tx().amount | fmtCurrency }}
        </div>
        <button class="txn-del-btn" (click)="delete.emit()">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    </div>
  `
})
export class TransactionItemComponent {
  tx = input.required<Transaction>();
  delete = output<void>();
}
