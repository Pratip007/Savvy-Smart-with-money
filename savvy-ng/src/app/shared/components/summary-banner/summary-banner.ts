import { Component, input } from '@angular/core';
import { FmtCurrencyPipe } from '../../pipes/fmt-currency.pipe';

@Component({
  selector: 'app-summary-banner',
  standalone: true,
  imports: [FmtCurrencyPipe],
  template: `
    <div class="summary-banner">
      <div class="summary-item">
        <div class="summary-label">{{ incomeLabel() }}</div>
        <div class="summary-value">{{ income() | fmtCurrency }}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">{{ expenseLabel() }}</div>
        <div class="summary-value">{{ expense() | fmtCurrency }}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Balance</div>
        <div class="summary-value" [class.positive]="net() >= 0" [class.negative]="net() < 0">
          {{ net() | fmtCurrency:true }}
        </div>
      </div>
    </div>
  `
})
export class SummaryBannerComponent {
  income = input(0);
  expense = input(0);
  net = input(0);
  incomeLabel = input('Income');
  expenseLabel = input('Expenses');
}
