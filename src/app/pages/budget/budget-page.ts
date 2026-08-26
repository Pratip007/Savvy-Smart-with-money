import { Component, computed, inject, OnInit, signal, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BudgetStateService } from '../../core/services/budget-state.service';
import { TransactionService } from '../../core/services/transaction.service';
import { BudgetMathService } from '../../core/services/budget-math.service';
import { ImportExportService } from '../../core/services/import-export.service';
import { SheetsService } from '../../core/services/sheets.service';
import { ToastService } from '../../core/services/toast.service';
import { SummaryBannerComponent } from '../../shared/components/summary-banner/summary-banner';
import { CategoryCardComponent } from '../../shared/components/category-card/category-card';
import { CategoryModalComponent } from '../../shared/components/category-modal/category-modal';
import { FmtCurrencyPipe } from '../../shared/pipes/fmt-currency.pipe';
import { BudgetSection } from '../../core/models/budget.model';

@Component({
  selector: 'app-budget-page',
  standalone: true,
  imports: [SummaryBannerComponent, CategoryCardComponent, CategoryModalComponent, FmtCurrencyPipe],
  templateUrl: './budget-page.html',
  styleUrl: './budget-page.scss'
})
export class BudgetPage implements OnInit {
  @ViewChild('catModal') catModalRef!: CategoryModalComponent;

  state = inject(BudgetStateService);
  private txnService = inject(TransactionService);
  math = inject(BudgetMathService);
  private importExport = inject(ImportExportService);
  private sheets = inject(SheetsService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  mode = signal<'estimates' | 'final'>('estimates');
  private pendingCatType = signal<'income' | 'expenses'>('income');

  monthData = computed(() => this.state.currentMonthData());
  txns = computed(() => this.txnService.getTxns());
  txMap = computed(() => this.txns().length ? this.txnService.txnSumMap(this.txns()) : null);

  income = computed(() => {
    const sec = (this.monthData() as any)[this.mode()].income as BudgetSection;
    return this.math.secTotal(sec);
  });
  expenses = computed(() => {
    const sec = (this.monthData() as any)[this.mode()].expenses as BudgetSection;
    return this.math.secTotal(sec);
  });
  net = computed(() => this.income() - this.expenses());

  incomeEntries = computed(() =>
    Object.entries((this.monthData() as any)[this.mode()].income as BudgetSection)
  );
  expenseEntries = computed(() =>
    Object.entries((this.monthData() as any)[this.mode()].expenses as BudgetSection)
  );

  estIncome = computed(() => this.math.secTotal(this.monthData().estimates.income));
  estExpenses = computed(() => this.math.secTotal(this.monthData().estimates.expenses));

  incomeP = computed(() => {
    const eI = this.estIncome();
    return eI > 0 ? Math.min(100, Math.round((this.income() / eI) * 100)) : 0;
  });
  expenseP = computed(() => {
    const eE = this.estExpenses();
    return eE > 0 ? Math.min(100, Math.round((this.expenses() / eE) * 100)) : 0;
  });

  ngOnInit(): void {
    const m = this.route.snapshot.data['mode'] as 'estimates' | 'final';
    this.mode.set(m || 'estimates');
  }

  txCatMap(type: 'income' | 'expenses'): Record<string, number> {
    const map = this.txMap();
    if (!map) return {};
    return map[type] || {};
  }

  txItemMap(type: 'income' | 'expenses', catName: string): Record<string, number> {
    const map = this.txMap();
    if (!map) return {};
    return map[type]?.[catName] || {};
  }

  getEstCatData(type: 'income' | 'expenses', catName: string) {
    return this.monthData().estimates[type][catName] || null;
  }

  onToggleCollapse(type: 'income' | 'expenses', catName: string): void {
    this.state.toggleCat(type, this.mode(), catName);
  }
  onDeleteCat(type: 'income' | 'expenses', catName: string): void {
    if (confirm('Delete "' + catName + '" and all its items?'))
      this.state.delCat(type, this.mode(), catName);
  }
  onAddItem(type: 'income' | 'expenses', catName: string): void {
    this.state.addItem(type, this.mode(), catName);
  }
  onDeleteItem(type: 'income' | 'expenses', catName: string, id: string): void {
    this.state.delItem(type, this.mode(), catName, id);
  }
  onNameChange(type: 'income' | 'expenses', catName: string, id: string, name: string): void {
    this.state.mutItem(type, this.mode(), catName, id, item => { item.name = name; });
  }
  onNameSave(type: 'income' | 'expenses', catName: string, id: string, name: string): void {
    this.state.mutItem(type, this.mode(), catName, id, item => { item.name = name; });
    this.sheets.schedulePush();
  }
  onAmountChange(type: 'income' | 'expenses', catName: string, id: string, amount: number): void {
    this.state.mutItem(type, this.mode(), catName, id, item => { item.amount = amount; });
  }

  openAddCat(type: 'income' | 'expenses'): void {
    this.pendingCatType.set(type);
    this.catModalRef.open();
  }
  onCatConfirmed(name: string): void {
    this.state.addCategory(this.pendingCatType(), this.mode(), name);
  }

  onFileDrop(e: DragEvent): void {
    e.preventDefault();
    const f = e.dataTransfer?.files[0];
    if (f) this.importExport.processFile(f);
  }
  onFileBrowse(input: HTMLInputElement): void { input.click(); }
  onFileChange(e: Event): void {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) { this.importExport.processFile(f); (e.target as HTMLInputElement).value = ''; }
  }
  exportCSV(): void { this.importExport.exportCSV(this.mode()); }
  copyFromEst(): void { this.state.copyFromEst(); this.toast.show('Copied from Estimates'); }

  removeZeroItems(): void {
    this.state.removeZeroItems(this.mode());
    this.sheets.schedulePush();
    this.toast.show('Zero-amount items removed');
  }
  resetCategories(): void {
    if (confirm('Reset categories to defaults? Existing amounts are kept.')) {
      this.state.resetCategories(this.mode());
      this.sheets.schedulePush();
    }
  }
  dlTemplate(): void { this.importExport.dlTemplate(); }
  print(): void { window.print(); }
  goToTransactions(): void { this.router.navigate(['/transactions']); }

  hasTxns = computed(() => this.txns().length > 0);
  showCompare = computed(() => this.mode() === 'final' && (this.estIncome() > 0 || this.estExpenses() > 0));
}
