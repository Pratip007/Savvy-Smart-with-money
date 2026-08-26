import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BudgetStateService } from '../../core/services/budget-state.service';
import { BudgetMathService } from '../../core/services/budget-math.service';
import { ImportExportService } from '../../core/services/import-export.service';
import { ChartWrapperComponent } from '../../shared/components/chart-wrapper/chart-wrapper';
import { FmtCurrencyPipe } from '../../shared/pipes/fmt-currency.pipe';
import { MONTHS, CCOLORS } from '../../core/constants/budget-defaults.const';
import { ChartConfiguration } from 'chart.js';

const CF = { family: "'Inter', system-ui, sans-serif" };

@Component({
  selector: 'app-statistics-page',
  standalone: true,
  imports: [ChartWrapperComponent, FmtCurrencyPipe],
  templateUrl: './statistics-page.html',
  styleUrl: './statistics-page.scss',
})
export class StatisticsPage {
  state = inject(BudgetStateService);
  math = inject(BudgetMathService);
  private importExport = inject(ImportExportService);
  private router = inject(Router);

  private validKey(k: string): boolean {
    const p = k.split('-');
    if (p.length < 2) return false;
    const m = parseInt(p[1]);
    return !isNaN(parseInt(p[0])) && !isNaN(m) && m >= 1 && m <= 12;
  }

  allKeys = computed(() =>
    Object.keys(this.state.data()).filter(k => this.validKey(k)).sort()
  );
  hasData = computed(() => this.allKeys().length > 0);

  monthData = computed(() => this.state.currentMonthData());
  fI = computed(() => this.math.secTotal(this.monthData().final.income));
  fE = computed(() => this.math.secTotal(this.monthData().final.expenses));
  fN = computed(() => this.fI() - this.fE());
  eI = computed(() => this.math.secTotal(this.monthData().estimates.income));
  eE = computed(() => this.math.secTotal(this.monthData().estimates.expenses));
  eN = computed(() => this.eI() - this.eE());
  hasFinal = computed(() => this.fI() > 0 || this.fE() > 0);
  hasEst = computed(() => this.eI() > 0 || this.eE() > 0);
  effI = computed(() => this.fI() || this.eI());
  effE = computed(() => this.fE() || this.eE());
  effN = computed(() => this.effI() - this.effE());
  effSr = computed(() => this.effI() > 0 ? Math.round((this.effN() / this.effI()) * 100) : 0);
  sr = computed(() => {
    const fI = this.fI(), fN = this.fN(), eI = this.eI(), eN = this.eN();
    return fI > 0 ? Math.round((fN / fI) * 100) : (eI > 0 ? Math.round((eN / eI) * 100) : 0);
  });
  monthLabel = computed(() => MONTHS[this.state.currentMonth()].slice(0,3) + ' ' + this.state.currentYear());

  expSrc = computed(() => this.hasFinal() ? this.monthData().final.expenses : this.monthData().estimates.expenses);
  incSrc = computed(() => this.hasFinal() ? this.monthData().final.income : this.monthData().estimates.income);
  hasExpData = computed(() => this.math.secTotal(this.expSrc()) > 0);
  hasIncData = computed(() => this.math.secTotal(this.incSrc()) > 0);

  topExpenses = computed(() =>
    Object.entries(this.expSrc())
      .map(([n, c]) => ({ n, v: this.math.catSum(c) }))
      .filter(e => e.v > 0).sort((a, b) => b.v - a.v).slice(0, 5)
  );
  totTopExp = computed(() => this.topExpenses().reduce((s, e) => s + e.v, 0) || 1);

  iP = computed(() => { const eI = this.eI(); return eI > 0 ? Math.min(150, Math.round((this.fI() / eI) * 100)) : 0; });
  eP = computed(() => { const eE = this.eE(); return eE > 0 ? Math.min(150, Math.round((this.fE() / eE) * 100)) : 0; });
  bU = computed(() => { const effI = this.effI(); return effI > 0 ? Math.min(150, Math.round((this.effE() / effI) * 100)) : 0; });

  allMonthsRows = computed(() =>
    this.allKeys().slice().reverse().map(k => {
      const dd = this.state.data()[k];
      if (!dd) return null;
      const inc = this.math.secTotal(dd.final.income) || this.math.secTotal(dd.estimates.income);
      const exp = this.math.secTotal(dd.final.expenses) || this.math.secTotal(dd.estimates.expenses);
      const net = inc - exp;
      const [yr, mo] = k.split('-');
      return { key: k, label: (MONTHS[parseInt(mo)-1] ?? '???').slice(0,3) + ' ' + yr, inc, exp, net, isCurrent: k === this.state.currentKey() };
    }).filter(Boolean)
  );

  insights = computed(() => {
    const keys = this.allKeys();
    if (keys.length <= 1) return null;
    let totI = 0, totE = 0, bestNet: number | null = null, bestKey = '', worstNet: number | null = null, worstKey = '';
    keys.forEach(k => {
      const dd = this.state.data()[k];
      const inc = this.math.secTotal(dd.final.income) || this.math.secTotal(dd.estimates.income);
      const exp = this.math.secTotal(dd.final.expenses) || this.math.secTotal(dd.estimates.expenses);
      totI += inc; totE += exp;
      const net = inc - exp;
      if (bestNet === null || net > bestNet) { bestNet = net; bestKey = k; }
      if (worstNet === null || net < worstNet) { worstNet = net; worstKey = k; }
    });
    const moLabel = (k: string) => { const [yr, mo] = k.split('-'); return (MONTHS[parseInt(mo)-1] ?? '???').slice(0,3) + ' ' + yr; };
    return { avgI: totI / keys.length, avgE: totE / keys.length, bestNet: bestNet!, bestLabel: moLabel(bestKey), worstNet: worstNet!, worstLabel: moLabel(worstKey), count: keys.length };
  });

  monthlyCircleConfig = computed((): ChartConfiguration | null => {
    const effI = this.effI(), effE = this.effE(), effN = this.effN();
    if (!effI && !effE) return null;
    const saved = effN > 0 ? effN : 0;
    return {
      type: 'doughnut',
      data: {
        labels: ['Income', 'Expenses', ...(saved > 0 ? ['Saved'] : [])],
        datasets: [{ data: [effI, effE, ...(saved > 0 ? [saved] : [])], backgroundColor: ['#059669','#e11d48','#93c5fd'], borderWidth: 2, borderColor: '#ffffff', hoverOffset: 6 }]
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: any) => ' ' + ctx.label + ': ' + this.math.fmt(ctx.raw) } } } } as any
    };
  });

  overviewConfig = computed((): ChartConfiguration | null => {
    const d = this.monthData();
    if (!this.hasFinal() && !this.hasEst()) return null;
    return {
      type: 'bar',
      data: {
        labels: ['Income', 'Expenses', 'Net'],
        datasets: [
          { label: 'Estimated', data: [this.eI(), this.eE(), this.eN()], backgroundColor: 'rgba(37,99,235,.5)', borderColor: '#2563eb', borderWidth: 1, borderRadius: 4 },
          { label: 'Final', data: [this.fI(), this.fE(), this.fN()], backgroundColor: 'rgba(5,150,105,.5)', borderColor: '#059669', borderWidth: 1, borderRadius: 4 }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { font: CF, color: '#475569', boxWidth: 12, boxHeight: 12 } }, tooltip: { callbacks: { label: (ctx: any) => ' ' + ctx.dataset.label + ': ' + this.math.fmt(ctx.raw, true) } } }, scales: { x: { grid: { display: false }, ticks: { font: CF, color: '#475569' } }, y: { grid: { color: '#e2e8f0' }, ticks: { font: CF, color: '#94a3b8', callback: (v: any) => this.math.fmt(v) } } } }
    };
  });

  expPieConfig = computed((): ChartConfiguration | null => {
    if (!this.hasExpData()) return null;
    const entries = Object.entries(this.expSrc()).map(([n, c]) => ({ n, v: this.math.catSum(c) })).filter(e => e.v > 0).sort((a, b) => b.v - a.v);
    if (!entries.length) return null;
    const top = entries.slice(0, 7); const rest = entries.slice(7).reduce((s, e) => s + e.v, 0);
    const labels = rest > 0 ? [...top.map(e => e.n), 'Other'] : top.map(e => e.n);
    const vals = rest > 0 ? [...top.map(e => e.v), rest] : top.map(e => e.v);
    const total = vals.reduce((a, b) => a + b, 0);
    return { type: 'doughnut', data: { labels, datasets: [{ data: vals, backgroundColor: CCOLORS.slice(0, vals.length), borderWidth: 2, borderColor: '#ffffff', hoverOffset: 6 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'right' as const, labels: { font: CF, color: '#475569', padding: 6, boxWidth: 10, boxHeight: 10, generateLabels: (chart: any) => chart.data.labels.map((lbl: string, i: number) => ({ text: lbl.slice(0,11) + ' ' + Math.round(vals[i]/total*100) + '%', fillStyle: CCOLORS[i], hidden: false, index: i })) } }, tooltip: { callbacks: { label: (ctx: any) => ' ' + ctx.label + ': ' + this.math.fmt(ctx.raw) } } } } as any };
  });

  trendConfig = computed((): ChartConfiguration | null => {
    if (this.allKeys().length <= 1) return null;
    const last = this.allKeys().slice(-8);
    const labels = last.map(k => { const [yr, mo] = k.split('-'); return (MONTHS[parseInt(mo)-1] ?? '???').slice(0,3) + "'"+yr.slice(2); });
    const incomes = last.map(k => { const dd = this.state.data()[k]; return this.math.secTotal(dd.final.income) || this.math.secTotal(dd.estimates.income); });
    const expenses = last.map(k => { const dd = this.state.data()[k]; return this.math.secTotal(dd.final.expenses) || this.math.secTotal(dd.estimates.expenses); });
    return { type: 'bar', data: { labels, datasets: [{ label: 'Income', data: incomes, backgroundColor: 'rgba(5,150,105,.6)', borderRadius: 3 }, { label: 'Expenses', data: expenses, backgroundColor: 'rgba(225,29,72,.6)', borderRadius: 3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { font: CF, color: '#475569', boxWidth: 12, boxHeight: 12 } }, tooltip: { callbacks: { label: (ctx: any) => ' ' + ctx.dataset.label + ': ' + this.math.fmt(ctx.raw) } } }, scales: { x: { grid: { display: false }, ticks: { font: { family: CF.family, size: 10 }, color: '#94a3b8' } }, y: { grid: { color: '#e2e8f0' }, ticks: { font: { family: CF.family, size: 10 }, color: '#94a3b8', callback: (v: any) => this.math.fmt(v) } } } } };
  });

  netTrendConfig = computed((): ChartConfiguration | null => {
    if (this.allKeys().length <= 1) return null;
    const last = this.allKeys().slice(-8);
    const labels = last.map(k => { const [yr, mo] = k.split('-'); return (MONTHS[parseInt(mo)-1] ?? '???').slice(0,3) + "'"+yr.slice(2); });
    const nets = last.map(k => { const dd = this.state.data()[k]; return (this.math.secTotal(dd.final.income) || this.math.secTotal(dd.estimates.income)) - (this.math.secTotal(dd.final.expenses) || this.math.secTotal(dd.estimates.expenses)); });
    return { type: 'line', data: { labels, datasets: [{ label: 'Net Balance', data: nets, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,.1)', borderWidth: 2, pointRadius: 4, pointBackgroundColor: nets.map(v => v >= 0 ? '#059669' : '#e11d48'), fill: true, tension: 0.3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: any) => ' Net: ' + this.math.fmt(ctx.raw, true) } } }, scales: { x: { grid: { display: false }, ticks: { font: { family: CF.family, size: 10 }, color: '#94a3b8' } }, y: { grid: { color: '#e2e8f0' }, ticks: { font: { family: CF.family, size: 10 }, color: '#94a3b8', callback: (v: any) => this.math.fmt(v, true) } } } } };
  });

  // ── Year Overview ────────────────────────────────────────────────────────────

  yearKeys = computed(() =>
    Object.keys(this.state.data())
      .filter(k => k.startsWith(String(this.state.currentYear())))
      .sort()
  );
  hasYearData = computed(() => this.yearKeys().length > 0);

  yearInc = computed(() => this.yearKeys().reduce((s, k) => {
    const d = this.state.data()[k];
    return s + (this.math.secTotal(d.final.income) || this.math.secTotal(d.estimates.income));
  }, 0));
  yearExp = computed(() => this.yearKeys().reduce((s, k) => {
    const d = this.state.data()[k];
    return s + (this.math.secTotal(d.final.expenses) || this.math.secTotal(d.estimates.expenses));
  }, 0));
  yearNet = computed(() => this.yearInc() - this.yearExp());
  yearSR  = computed(() => this.yearInc() > 0 ? Math.round(this.yearNet() / this.yearInc() * 100) : 0);

  yearCatExp = computed(() => {
    const cats: Record<string, number> = {};
    this.yearKeys().forEach(k => {
      const d = this.state.data()[k];
      const src = this.math.secTotal(d.final.expenses) > 0 ? d.final.expenses : d.estimates.expenses;
      Object.entries(src).forEach(([cat, cd]) => { cats[cat] = (cats[cat] || 0) + this.math.catSum(cd); });
    });
    return Object.entries(cats).map(([n, v]) => ({ n, v })).filter(e => e.v > 0).sort((a, b) => b.v - a.v);
  });

  yearTrendConfig = computed((): ChartConfiguration | null => {
    if (!this.yearKeys().length) return null;
    const year = this.state.currentYear();
    const labels   = MONTHS.map(m => m.slice(0, 3));
    const incomes  = MONTHS.map((_, i) => { const k = `${year}-${String(i+1).padStart(2,'0')}`; const d = this.state.data()[k]; return d ? (this.math.secTotal(d.final.income)   || this.math.secTotal(d.estimates.income))   : 0; });
    const expenses = MONTHS.map((_, i) => { const k = `${year}-${String(i+1).padStart(2,'0')}`; const d = this.state.data()[k]; return d ? (this.math.secTotal(d.final.expenses) || this.math.secTotal(d.estimates.expenses)) : 0; });
    return { type: 'bar', data: { labels, datasets: [{ label: 'Income', data: incomes, backgroundColor: 'rgba(5,150,105,.6)', borderRadius: 3 }, { label: 'Expenses', data: expenses, backgroundColor: 'rgba(225,29,72,.6)', borderRadius: 3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { font: CF, color: '#475569', boxWidth: 12, boxHeight: 12 } }, tooltip: { callbacks: { label: (ctx: any) => ' ' + ctx.dataset.label + ': ' + this.math.fmt(ctx.raw) } } }, scales: { x: { grid: { display: false }, ticks: { font: { family: CF.family, size: 10 }, color: '#94a3b8' } }, y: { grid: { color: '#e2e8f0' }, ticks: { font: { family: CF.family, size: 10 }, color: '#94a3b8', callback: (v: any) => this.math.fmt(v) } } } } };
  });

  yearCatPieConfig = computed((): ChartConfiguration | null => {
    const cats = this.yearCatExp(); if (!cats.length) return null;
    const total = cats.reduce((s, e) => s + e.v, 0) || 1;
    const top = cats.slice(0, 7); const rest = cats.slice(7).reduce((s, e) => s + e.v, 0);
    const labels = rest > 0 ? [...top.map(e => e.n), 'Other'] : top.map(e => e.n);
    const vals   = rest > 0 ? [...top.map(e => e.v), rest]    : top.map(e => e.v);
    return { type: 'doughnut', data: { labels, datasets: [{ data: vals, backgroundColor: CCOLORS.slice(0, vals.length), borderWidth: 2, borderColor: '#fff', hoverOffset: 6 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '55%', plugins: { legend: { position: 'right' as const, labels: { font: CF, color: '#475569', padding: 6, boxWidth: 10, boxHeight: 10, generateLabels: (chart: any) => chart.data.labels.map((lbl: string, i: number) => ({ text: lbl.slice(0,12)+' '+Math.round(vals[i]/total*100)+'%', fillStyle: CCOLORS[i], hidden: false, index: i })) } }, tooltip: { callbacks: { label: (ctx: any) => ' '+ctx.label+': '+this.math.fmt(ctx.raw) } } } } as any };
  });

  yearCumulConfig = computed((): ChartConfiguration | null => {
    if (this.yearKeys().length < 2) return null;
    const year = this.state.currentYear();
    let cum = 0;
    const labels: string[] = [];
    const data: number[] = [];
    MONTHS.forEach((m, i) => {
      const k = `${year}-${String(i+1).padStart(2,'0')}`;
      const d = this.state.data()[k];
      cum += d ? ((this.math.secTotal(d.final.income) || this.math.secTotal(d.estimates.income)) - (this.math.secTotal(d.final.expenses) || this.math.secTotal(d.estimates.expenses))) : 0;
      labels.push(m.slice(0, 3));
      data.push(cum);
    });
    return { type: 'line', data: { labels, datasets: [{ label: 'Cumulative Net', data, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,.1)', borderWidth: 2, pointRadius: 4, pointBackgroundColor: data.map(v => v >= 0 ? '#059669' : '#e11d48'), fill: true, tension: 0.3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: any) => ' Cumulative: '+this.math.fmt(ctx.raw, true) } } }, scales: { x: { grid: { display: false }, ticks: { font: { family: CF.family, size: 10 }, color: '#94a3b8' } }, y: { grid: { color: '#e2e8f0' }, ticks: { font: { family: CF.family, size: 10 }, color: '#94a3b8', callback: (v: any) => this.math.fmt(v, true) } } } } };
  });

  navigateToMonth(key: string): void {
    const [yr, mo] = key.split('-');
    this.state.currentYear.set(parseInt(yr));
    this.state.currentMonth.set(parseInt(mo) - 1);
    this.router.navigate(['/estimates']);
  }
  dlTemplate(): void { this.importExport.dlTemplate(); }
  CCOLORS = CCOLORS;
  deltaText(final: number, est: number): string { if (!est || !final) return ''; const pct = Math.round(Math.abs((final/est - 1)*100)); return pct === 0 ? '' : (final > est ? '↑' : '↓') + ' ' + pct + '% vs est'; }
  deltaClass(final: number, est: number, isExpense: boolean): string { if (!est || !final) return ''; const up = final > est; const good = isExpense ? !up : up; return good ? 'delta-pos' : 'delta-neg'; }
}
