import { Pipe, PipeTransform, inject } from '@angular/core';
import { BudgetMathService } from '../../core/services/budget-math.service';

@Pipe({ name: 'fmtCurrency', standalone: true, pure: false })
export class FmtCurrencyPipe implements PipeTransform {
  private math = inject(BudgetMathService);
  transform(value: number, sign = false): string { return this.math.fmt(value, sign); }
}
