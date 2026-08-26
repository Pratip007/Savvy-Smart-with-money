import { Component, computed, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { BudgetStateService } from '../../core/services/budget-state.service';
import { SheetsService } from '../../core/services/sheets.service';
import { MONTHS } from '../../core/constants/budget-defaults.const';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [NgClass],
  templateUrl: './header.html',
  styles: [':host { display: contents; }']
})
export class HeaderComponent {
  state = inject(BudgetStateService);
  private sheets = inject(SheetsService);

  gsUrl = computed(() => {
    this.state.syncState();
    return typeof localStorage !== 'undefined' ? localStorage.getItem('gs_url_v1') || '' : '';
  });

  syncState = computed(() => this.state.syncState());

  monthLabel = computed(() => {
    const m = this.state.currentMonth();
    const y = this.state.currentYear();
    return MONTHS[m].slice(0, 3) + ' ' + y;
  });

  syncClasses = computed(() => {
    const s = this.state.syncState() as string;
    const map: Record<string, string> = {
      ok:      'bg-[#86efac] cursor-default',
      idle:    'bg-white/30 cursor-pointer',
      err:     'bg-[#fca5a5] cursor-pointer animate-dot-pulse-slow',
      pending: 'bg-[#fde68a] cursor-default animate-dot-pulse-slow',
      spin:    'bg-[#93c5fd] cursor-default animate-dot-pulse-fast',
    };
    return map[s] ?? 'bg-white/25 cursor-default';
  });

  onSyncClick(): void { this.sheets.pushToSheets(); }
}
