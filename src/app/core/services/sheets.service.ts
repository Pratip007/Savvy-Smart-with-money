import { Injectable, inject } from '@angular/core';
import { Subject, debounceTime } from 'rxjs';
import { AllData, MonthData } from '../models/budget.model';
import { Transaction } from '../models/transaction.model';
import { BudgetStateService } from './budget-state.service';
import { TransactionService } from './transaction.service';
import { ToastService } from './toast.service';
import { GoogleAuthService } from './google-auth.service';
import { DriveService } from './drive.service';
import { StorageService } from './storage.service';

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

// ── Color palette (RGB 0-1) ────────────────────────────────────────────────────
const C = {
  darkBlue:   { red: 0.118, green: 0.227, blue: 0.541 },   // #1e3a8a
  white:      { red: 1,     green: 1,     blue: 1     },
  lightBlue:  { red: 0.859, green: 0.918, blue: 0.996 },   // #dbeafe
  lightGreen: { red: 0.863, green: 0.988, blue: 0.906 },   // #dcfce7
  lightRed:   { red: 0.996, green: 0.949, blue: 0.949 },   // #fef2f2
  lightYellow:{ red: 0.996, green: 0.976, blue: 0.765 },   // #fef9c3
  incomeRow:  { red: 0.945, green: 0.992, blue: 0.957 },
  expenseRow: { red: 0.998, green: 0.969, blue: 0.969 },
  subtotal:   { red: 0.886, green: 0.910, blue: 0.941 },   // #e2e8f0
  headerBg:   { red: 0.941, green: 0.953, blue: 0.980 },
  altRow:     { red: 0.945, green: 0.961, blue: 0.976 },   // #f1f5f9
  greenText:  { red: 0.086, green: 0.639, blue: 0.290 },   // #16a34a
  redText:    { red: 0.863, green: 0.149, blue: 0.149 },   // #dc2626
};

@Injectable({ providedIn: 'root' })
export class SheetsService {
  private state    = inject(BudgetStateService);
  private txnSvc   = inject(TransactionService);
  private toast    = inject(ToastService);
  private auth     = inject(GoogleAuthService);
  private drive    = inject(DriveService);
  private storage  = inject(StorageService);

  private pushSubject = new Subject<void>();

  constructor() {
    this.pushSubject.pipe(debounceTime(5000)).subscribe(() => this.pushToSheets());
  }

  schedulePush(): void {
    if (!this.auth.isAuthorized()) return;
    this.state.syncState.set('pending');
    this.pushSubject.next();
  }

  // ── Push ─────────────────────────────────────────────────────────────────────

  async pushToSheets(): Promise<void> {
    const token = this.auth.accessToken();
    if (!token) return;
    this.state.syncState.set('spin');
    try {
      const data = this.state.data();
      const byYear = this.groupByYear(Object.keys(data));

      for (const [year, monthKeys] of byYear) {
        const sid = await this.drive.getOrCreateSpreadsheetForYear(year);
        const subset = this.subsetData(data, monthKeys);

        // Internal machine-readable sheets (for pull/sync)
        await this.valuesWrite(token, sid, [
          { range: '_Data!A1',         values: this.dataToRows(subset) },
          { range: '_Transactions!A1', values: this.txnRows(monthKeys) },
        ]);

        // Formatted human-readable sheet per month
        for (const mk of monthKeys.sort()) {
          const label   = this.toMonthLabel(mk);
          const sheetId = await this.drive.ensureMonthSheet(sid, label, token);
          await this.writeFormattedMonth(token, sid, sheetId, mk, label);
        }

        // Year Summary sheet
        const yearSumId = await this.drive.ensureMonthSheet(sid, 'Year Summary', token);
        await this.writeYearSummary(token, sid, yearSumId, year, monthKeys.sort(), subset);
      }

      this.state.syncState.set('ok');
      setTimeout(() => this.state.syncState.set('idle'), 3000);
    } catch (e: any) {
      console.error('SheetsService.pushToSheets', e);
      if (e?.message?.includes('401')) {
        this.auth.signOut();
        this.state.syncState.set('idle');
        this.toast.show('Session expired — please sign in again');
        this.auth.authorize(() => this.pushToSheets());
        return;
      }
      this.state.syncState.set('err');
      this.toast.show('Sync failed');
    }
  }

  // ── Pull ─────────────────────────────────────────────────────────────────────

  async pullFromSheets(): Promise<void> {
    const token = this.auth.accessToken();
    if (!token) return;
    this.state.syncState.set('spin');
    try {
      const year = this.state.currentYear();
      const sid  = await this.drive.getOrCreateSpreadsheetForYear(year);

      const res = await this.valuesRead(token, sid, ['_Data', '_Transactions']);
      const [dataRange, txnRange] = res.valueRanges ?? [];

      if ((dataRange?.values?.length ?? 0) > 1) this.state.data.set(this.rowsToData(dataRange.values));
      if ((txnRange?.values?.length ?? 0) > 1) this.txnSvc.txnsFromRows(txnRange.values);

      this.state.syncState.set('ok');
      setTimeout(() => this.state.syncState.set('idle'), 3000);
      this.toast.show('Pulled from Sheets');
    } catch (e: any) {
      console.error('SheetsService.pullFromSheets', e);
      if (e?.message?.includes('401')) {
        this.auth.signOut();
        this.state.syncState.set('idle');
        this.toast.show('Session expired — please sign in again');
        this.auth.authorize(() => this.pullFromSheets());
        return;
      }
      this.state.syncState.set('err');
      this.toast.show('Pull failed');
    }
  }

  // ── Formatted month sheet ─────────────────────────────────────────────────────

  // ── Year Summary sheet ────────────────────────────────────────────────────────

  private async writeYearSummary(
    token: string, sid: string, sheetId: number,
    year: number, monthKeys: string[], data: AllData
  ): Promise<void> {
    await this.formatWrite(token, sid, [{
      updateCells: { range: { sheetId }, fields: 'userEnteredValue,userEnteredFormat' }
    }]);
    const { values, requests } = this.buildYearSummarySheet(year, monthKeys, data, sheetId);
    await this.valuesWrite(token, sid, [{ range: `'Year Summary'!A1`, values }]);
    await this.formatWrite(token, sid, requests);
  }

  private buildYearSummarySheet(
    year: number, monthKeys: string[], data: AllData, sheetId: number
  ): { values: any[][], requests: any[] } {
    const sym  = this.storage.getCurrency() === 'INR' ? '₹' : this.storage.getCurrency();
    const fmt  = (n: number) => `${sym}${Math.abs(n).toLocaleString('en-IN')}`;
    const COLS = 6;

    const values: any[][] = [];
    const req: any[]      = [];
    const ri = () => values.length - 1;

    const merge = (r0: number, r1: number, c0 = 0, c1 = COLS) =>
      req.push({ mergeCells: { range: { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 }, mergeType: 'MERGE_ALL' } });
    const style = (r0: number, r1: number, c0: number, c1: number, f: any) =>
      req.push({ repeatCell: { range: { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 }, cell: { userEnteredFormat: f }, fields: 'userEnteredFormat' } });
    const colW = (c0: number, c1: number, px: number) =>
      req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: c0, endIndex: c1 }, properties: { pixelSize: px }, fields: 'pixelSize' } });
    const rowH = (r0: number, r1: number, px: number) =>
      req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: r0, endIndex: r1 }, properties: { pixelSize: px }, fields: 'pixelSize' } });

    // Aggregate totals & category maps
    let totEstInc = 0, totActInc = 0, totEstExp = 0, totActExp = 0;
    const catExpMap: Record<string, { est: number; act: number }> = {};
    const catIncMap: Record<string, { est: number; act: number }> = {};

    monthKeys.forEach(mk => {
      const d = data[mk]; if (!d) return;
      Object.values(d.estimates.income).forEach(c => c.items.forEach(i => totEstInc += i.amount));
      Object.values(d.final.income).forEach(c => c.items.forEach(i => totActInc += i.amount));
      Object.values(d.estimates.expenses).forEach(c => c.items.forEach(i => totEstExp += i.amount));
      Object.values(d.final.expenses).forEach(c => c.items.forEach(i => totActExp += i.amount));
      Object.entries(d.estimates.expenses).forEach(([cat, cd]) => { if (!catExpMap[cat]) catExpMap[cat] = { est: 0, act: 0 }; cd.items.forEach(i => catExpMap[cat].est += i.amount); });
      Object.entries(d.final.expenses).forEach(([cat, cd]) => { if (!catExpMap[cat]) catExpMap[cat] = { est: 0, act: 0 }; cd.items.forEach(i => catExpMap[cat].act += i.amount); });
      Object.entries(d.estimates.income).forEach(([cat, cd]) => { if (!catIncMap[cat]) catIncMap[cat] = { est: 0, act: 0 }; cd.items.forEach(i => catIncMap[cat].est += i.amount); });
      Object.entries(d.final.income).forEach(([cat, cd]) => { if (!catIncMap[cat]) catIncMap[cat] = { est: 0, act: 0 }; cd.items.forEach(i => catIncMap[cat].act += i.amount); });
    });

    const netBalance  = totActInc - totActExp;
    const savingsRate = totActInc > 0 ? Math.round((netBalance / totActInc) * 100) : 0;
    const months      = Math.max(monthKeys.length, 1);

    // ── Title ──────────────────────────────────────────────────────────────────
    values.push([`SAVVY YEAR SUMMARY — ${year}`]);
    merge(0, 1);
    style(0, 1, 0, COLS, { backgroundColor: C.darkBlue, textFormat: { foregroundColor: C.white, bold: true, fontSize: 14 }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' });
    rowH(0, 1, 44);

    values.push([]);

    // ── Summary stats bar ──────────────────────────────────────────────────────
    values.push(['Total Income', fmt(totActInc), 'Total Expenses', fmt(totActExp), 'Net Balance', fmt(netBalance)]);
    const s1 = ri();
    style(s1, s1+1, 0, 2, { backgroundColor: C.lightGreen, textFormat: { bold: true }, horizontalAlignment: 'CENTER' });
    style(s1, s1+1, 2, 4, { backgroundColor: C.lightRed,   textFormat: { bold: true }, horizontalAlignment: 'CENTER' });
    style(s1, s1+1, 4, 6, { backgroundColor: C.lightBlue,  textFormat: { bold: true, foregroundColor: netBalance >= 0 ? C.greenText : C.redText }, horizontalAlignment: 'CENTER' });
    rowH(s1, s1+1, 32);

    values.push(['Avg Monthly Income', fmt(totActInc / months), 'Avg Monthly Expenses', fmt(totActExp / months), 'Savings Rate', `${savingsRate >= 0 ? '+' : ''}${savingsRate}%`]);
    const s2 = ri();
    style(s2, s2+1, 0, 2, { backgroundColor: C.incomeRow,  horizontalAlignment: 'CENTER' });
    style(s2, s2+1, 2, 4, { backgroundColor: C.expenseRow, horizontalAlignment: 'CENTER' });
    style(s2, s2+1, 4, 6, { backgroundColor: C.altRow, textFormat: { bold: true, foregroundColor: savingsRate >= 0 ? C.greenText : C.redText }, horizontalAlignment: 'CENTER' });
    rowH(s2, s2+1, 28);

    values.push([]);

    // ── Monthly breakdown ──────────────────────────────────────────────────────
    values.push(['MONTHLY BREAKDOWN']);
    const mbh = ri();
    merge(mbh, mbh+1);
    style(mbh, mbh+1, 0, COLS, { backgroundColor: C.lightBlue, textFormat: { bold: true, fontSize: 11 }, horizontalAlignment: 'CENTER' });
    rowH(mbh, mbh+1, 30);

    values.push(['Month', 'Est. Income', 'Actual Income', 'Est. Expenses', 'Actual Expenses', 'Net Balance']);
    style(ri(), ri()+1, 0, COLS, { backgroundColor: C.headerBg, textFormat: { bold: true }, horizontalAlignment: 'CENTER' });

    let runEstInc = 0, runActInc = 0, runEstExp = 0, runActExp = 0;
    MONTH_NAMES.forEach((mName, idx) => {
      const mk  = `${year}-${String(idx + 1).padStart(2, '0')}`;
      const d   = data[mk];
      let mEI = 0, mAI = 0, mEE = 0, mAE = 0;
      if (d) {
        Object.values(d.estimates.income).forEach(c => c.items.forEach(i => mEI += i.amount));
        Object.values(d.final.income).forEach(c => c.items.forEach(i => mAI += i.amount));
        Object.values(d.estimates.expenses).forEach(c => c.items.forEach(i => mEE += i.amount));
        Object.values(d.final.expenses).forEach(c => c.items.forEach(i => mAE += i.amount));
      }
      runEstInc += mEI; runActInc += mAI; runEstExp += mEE; runActExp += mAE;
      const net     = mAI - mAE;
      const hasData = mEI > 0 || mAI > 0 || mEE > 0 || mAE > 0;
      values.push([mName.slice(0, 3), hasData ? fmt(mEI) : '—', hasData ? fmt(mAI) : '—', hasData ? fmt(mEE) : '—', hasData ? fmt(mAE) : '—', hasData ? fmt(net) : '—']);
      const r = ri();
      style(r, r+1, 0, COLS, { backgroundColor: idx % 2 === 0 ? C.white : C.altRow });
      if (hasData) {
        style(r, r+1, 1, 6, { horizontalAlignment: 'RIGHT' });
        style(r, r+1, 5, 6, { textFormat: { foregroundColor: net >= 0 ? C.greenText : C.redText }, horizontalAlignment: 'RIGHT' });
      }
    });

    values.push(['YEAR TOTAL', fmt(runEstInc), fmt(runActInc), fmt(runEstExp), fmt(runActExp), fmt(runActInc - runActExp)]);
    const yt = ri();
    style(yt, yt+1, 0, COLS, { backgroundColor: C.subtotal, textFormat: { bold: true } });
    style(yt, yt+1, 1, 6, { backgroundColor: C.subtotal, textFormat: { bold: true }, horizontalAlignment: 'RIGHT' });
    style(yt, yt+1, 5, 6, { textFormat: { bold: true, foregroundColor: (runActInc - runActExp) >= 0 ? C.greenText : C.redText }, horizontalAlignment: 'RIGHT' });
    rowH(yt, yt+1, 28);

    values.push([]);

    // ── Expense categories ─────────────────────────────────────────────────────
    values.push(['EXPENSE CATEGORIES']);
    const ech = ri();
    merge(ech, ech+1);
    style(ech, ech+1, 0, COLS, { backgroundColor: C.lightRed, textFormat: { bold: true, fontSize: 11, foregroundColor: C.redText }, horizontalAlignment: 'CENTER' });
    rowH(ech, ech+1, 30);

    values.push(['Category', 'Budgeted', 'Actual Spent', 'Difference', '% of Annual Exp', '']);
    style(ri(), ri()+1, 0, COLS, { backgroundColor: C.headerBg, textFormat: { bold: true }, horizontalAlignment: 'CENTER' });

    Object.entries(catExpMap).sort((a, b) => b[1].act - a[1].act).forEach(([cat, { est, act }], i) => {
      const diff  = est - act;
      const share = totActExp > 0 ? Math.round((act / totActExp) * 100) : 0;
      values.push([cat, fmt(est), fmt(act), (diff >= 0 ? '+' : '−') + fmt(Math.abs(diff)), `${share}%`, '']);
      const r = ri();
      style(r, r+1, 0, COLS, { backgroundColor: i % 2 === 0 ? C.expenseRow : C.white });
      style(r, r+1, 1, 5, { horizontalAlignment: 'RIGHT' });
      style(r, r+1, 3, 4, { textFormat: { foregroundColor: diff >= 0 ? C.greenText : C.redText } });
    });

    values.push([]);

    // ── Income sources ─────────────────────────────────────────────────────────
    values.push(['INCOME SOURCES']);
    const ish = ri();
    merge(ish, ish+1);
    style(ish, ish+1, 0, COLS, { backgroundColor: C.lightGreen, textFormat: { bold: true, fontSize: 11, foregroundColor: C.greenText }, horizontalAlignment: 'CENTER' });
    rowH(ish, ish+1, 30);

    values.push(['Category', 'Budgeted', 'Actual Earned', 'Difference', '% of Annual Inc', '']);
    style(ri(), ri()+1, 0, COLS, { backgroundColor: C.headerBg, textFormat: { bold: true }, horizontalAlignment: 'CENTER' });

    Object.entries(catIncMap).sort((a, b) => b[1].act - a[1].act).forEach(([cat, { est, act }], i) => {
      const diff  = act - est;
      const share = totActInc > 0 ? Math.round((act / totActInc) * 100) : 0;
      values.push([cat, fmt(est), fmt(act), (diff >= 0 ? '+' : '−') + fmt(Math.abs(diff)), `${share}%`, '']);
      const r = ri();
      style(r, r+1, 0, COLS, { backgroundColor: i % 2 === 0 ? C.incomeRow : C.white });
      style(r, r+1, 1, 5, { horizontalAlignment: 'RIGHT' });
      style(r, r+1, 3, 4, { textFormat: { foregroundColor: diff >= 0 ? C.greenText : C.redText } });
    });

    // ── Column widths & freeze ─────────────────────────────────────────────────
    colW(0, 1, 170); colW(1, 2, 130); colW(2, 3, 130); colW(3, 4, 130); colW(4, 5, 130); colW(5, 6, 40);
    req.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } });

    return { values, requests: req };
  }

  // ─────────────────────────────────────────────────────────────────────────────

  private async writeFormattedMonth(
    token: string, sid: string, sheetId: number, mk: string, label: string
  ): Promise<void> {
    const data = this.state.data()[mk];
    if (!data) return;

    // Clear the sheet first
    await this.formatWrite(token, sid, [{
      updateCells: { range: { sheetId }, fields: 'userEnteredValue,userEnteredFormat' }
    }]);

    const { values, requests } = this.buildMonthSheet(data, mk, sheetId, label);
    await this.valuesWrite(token, sid, [{ range: `'${label}'!A1`, values }]);
    await this.formatWrite(token, sid, requests);
  }

  private buildMonthSheet(
    data: MonthData, mk: string, sheetId: number, label: string
  ): { values: any[][], requests: any[] } {
    const sym  = this.storage.getCurrency() === 'INR' ? '₹' : this.storage.getCurrency();
    const fmt  = (n: number) => `${sym}${Math.abs(n).toLocaleString('en-IN')}`;
    const diff = (n: number) => (n >= 0 ? '+' : '−') + fmt(Math.abs(n));
    const COLS = 6;

    const values: any[][] = [];
    const req: any[] = [];

    // ── Helpers (closures over `values`, `req`, `sheetId`) ────────────────────
    const ri = () => values.length - 1; // 0-based index of last pushed row

    const merge = (r0: number, r1: number, c0 = 0, c1 = COLS) =>
      req.push({ mergeCells: { range: { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 }, mergeType: 'MERGE_ALL' } });

    const style = (r0: number, r1: number, c0: number, c1: number, f: any) =>
      req.push({ repeatCell: { range: { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 }, cell: { userEnteredFormat: f }, fields: 'userEnteredFormat' } });

    const colW = (c0: number, c1: number, px: number) =>
      req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: c0, endIndex: c1 }, properties: { pixelSize: px }, fields: 'pixelSize' } });

    const rowH = (r0: number, r1: number, px: number) =>
      req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: r0, endIndex: r1 }, properties: { pixelSize: px }, fields: 'pixelSize' } });

    // ── Totals ─────────────────────────────────────────────────────────────────
    let estInc = 0, estExp = 0, actInc = 0, actExp = 0;
    Object.values(data.estimates.income).forEach(c => c.items.forEach(i => estInc += i.amount));
    Object.values(data.estimates.expenses).forEach(c => c.items.forEach(i => estExp += i.amount));
    Object.values(data.final.income).forEach(c => c.items.forEach(i => actInc += i.amount));
    Object.values(data.final.expenses).forEach(c => c.items.forEach(i => actExp += i.amount));
    const balance = actInc - actExp;

    // ── Row 0: Main title ──────────────────────────────────────────────────────
    values.push([`SAVVY BUDGET — ${label.toUpperCase()}`]);
    merge(0, 1);
    style(0, 1, 0, COLS, { backgroundColor: C.darkBlue, textFormat: { foregroundColor: C.white, bold: true, fontSize: 14 }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' });
    rowH(0, 1, 44);

    // ── Row 1: empty ──────────────────────────────────────────────────────────
    values.push([]);

    // ── Row 2: Summary bar ────────────────────────────────────────────────────
    values.push(['Total Income', fmt(actInc), 'Total Expenses', fmt(actExp), 'Balance', fmt(balance)]);
    const sr = ri();
    style(sr, sr+1, 0, 2, { backgroundColor: C.lightGreen, textFormat: { bold: true }, horizontalAlignment: 'CENTER' });
    style(sr, sr+1, 2, 4, { backgroundColor: C.lightRed,   textFormat: { bold: true }, horizontalAlignment: 'CENTER' });
    style(sr, sr+1, 4, 6, { backgroundColor: C.lightBlue,  textFormat: { bold: true, foregroundColor: balance >= 0 ? C.greenText : C.redText }, horizontalAlignment: 'CENTER' });
    rowH(sr, sr+1, 32);

    // ── Row 3: empty ──────────────────────────────────────────────────────────
    values.push([]);

    // ── Row 4: Budget section header ──────────────────────────────────────────
    values.push(['BUDGET PLAN']);
    const bhr = ri();
    merge(bhr, bhr+1);
    style(bhr, bhr+1, 0, COLS, { backgroundColor: C.lightBlue, textFormat: { bold: true, fontSize: 11 }, horizontalAlignment: 'CENTER' });
    rowH(bhr, bhr+1, 30);

    // ── Row 5: Column headers ─────────────────────────────────────────────────
    values.push(['Category', 'Item', 'Type', 'Budgeted', 'Actual', 'Difference']);
    style(ri(), ri()+1, 0, COLS, { backgroundColor: C.headerBg, textFormat: { bold: true }, horizontalAlignment: 'CENTER' });

    // ── INCOME sub-header ─────────────────────────────────────────────────────
    values.push(['▲ INCOME']);
    const iLabelRow = ri();
    merge(iLabelRow, iLabelRow+1);
    style(iLabelRow, iLabelRow+1, 0, COLS, { backgroundColor: C.lightGreen, textFormat: { bold: true, foregroundColor: C.greenText } });

    let incEstTot = 0, incActTot = 0;
    Object.entries(data.estimates.income).forEach(([cat, catData]) => {
      catData.items.forEach(item => {
        const act  = data.final.income[cat]?.items.find(i => i.name === item.name)?.amount ?? 0;
        const d    = act - item.amount;
        incEstTot += item.amount; incActTot += act;
        values.push([cat, item.name, 'Income', fmt(item.amount), fmt(act), diff(d)]);
        const r = ri();
        style(r, r+1, 0, COLS, { backgroundColor: C.incomeRow });
        style(r, r+1, 5, 6, { textFormat: { foregroundColor: d >= 0 ? C.greenText : C.redText }, horizontalAlignment: 'RIGHT' });
        style(r, r+1, 3, 6, { horizontalAlignment: 'RIGHT' });
      });
    });

    // Income subtotal
    values.push(['INCOME TOTAL', '', '', fmt(incEstTot), fmt(incActTot), diff(incActTot - incEstTot)]);
    const irs = ri();
    style(irs, irs+1, 0, COLS, { backgroundColor: C.subtotal, textFormat: { bold: true } });
    style(irs, irs+1, 3, 6, { backgroundColor: C.subtotal, textFormat: { bold: true }, horizontalAlignment: 'RIGHT' });

    // ── Empty separator ────────────────────────────────────────────────────────
    values.push([]);

    // ── EXPENSES sub-header ───────────────────────────────────────────────────
    values.push(['▼ EXPENSES']);
    const eLabelRow = ri();
    merge(eLabelRow, eLabelRow+1);
    style(eLabelRow, eLabelRow+1, 0, COLS, { backgroundColor: C.lightRed, textFormat: { bold: true, foregroundColor: C.redText } });

    let expEstTot = 0, expActTot = 0;
    Object.entries(data.estimates.expenses).forEach(([cat, catData]) => {
      catData.items.forEach(item => {
        const act  = data.final.expenses[cat]?.items.find(i => i.name === item.name)?.amount ?? 0;
        const d    = item.amount - act;  // positive = saved money
        expEstTot += item.amount; expActTot += act;
        values.push([cat, item.name, 'Expense', fmt(item.amount), fmt(act), diff(d)]);
        const r = ri();
        style(r, r+1, 0, COLS, { backgroundColor: C.expenseRow });
        style(r, r+1, 5, 6, { textFormat: { foregroundColor: d >= 0 ? C.greenText : C.redText }, horizontalAlignment: 'RIGHT' });
        style(r, r+1, 3, 6, { horizontalAlignment: 'RIGHT' });
      });
    });

    // Expenses subtotal
    values.push(['EXPENSES TOTAL', '', '', fmt(expEstTot), fmt(expActTot), diff(expEstTot - expActTot)]);
    const ers = ri();
    style(ers, ers+1, 0, COLS, { backgroundColor: C.subtotal, textFormat: { bold: true } });
    style(ers, ers+1, 3, 6, { backgroundColor: C.subtotal, textFormat: { bold: true }, horizontalAlignment: 'RIGHT' });

    // ── Transactions section ──────────────────────────────────────────────────
    values.push([]);
    values.push(['TRANSACTIONS']);
    const thr = ri();
    merge(thr, thr+1);
    style(thr, thr+1, 0, COLS, { backgroundColor: C.lightYellow, textFormat: { bold: true, fontSize: 11 }, horizontalAlignment: 'CENTER' });
    rowH(thr, thr+1, 30);

    values.push(['Date', 'Type', 'Category', 'Item / Merchant', 'Amount', 'Note']);
    style(ri(), ri()+1, 0, COLS, { backgroundColor: C.headerBg, textFormat: { bold: true }, horizontalAlignment: 'CENTER' });

    const txns = this.txnSvc.getTxns(mk).slice().sort((a, b) => a.date.localeCompare(b.date));
    txns.forEach((t, i) => {
      values.push([t.date, t.type === 'income' ? '▲ Income' : '▼ Expense', t.category, t.item, fmt(t.amount), t.note || '']);
      const r = ri();
      style(r, r+1, 0, COLS, { backgroundColor: i % 2 === 0 ? C.white : C.altRow });
      style(r, r+1, 1, 2, { textFormat: { foregroundColor: t.type === 'income' ? C.greenText : C.redText } });
      style(r, r+1, 4, 5, { horizontalAlignment: 'RIGHT' });
    });

    // ── Column widths ─────────────────────────────────────────────────────────
    colW(0, 1, 150);  // Category / Date
    colW(1, 2, 90);   // Item / Type
    colW(2, 3, 100);  // Type / Category
    colW(3, 4, 180);  // Budgeted / Item
    colW(4, 5, 110);  // Actual / Amount
    colW(5, 6, 130);  // Difference / Note

    // Freeze first row (title)
    req.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } });

    return { values, requests: req };
  }

  // ── Sheets API calls ──────────────────────────────────────────────────────────

  private async fetchWithRetry(label: string, fn: () => Promise<Response>): Promise<Response> {
    const RETRYABLE = new Set([429, 500, 502, 503, 504]);
    let delay = 1000;
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fn();
      if (res.ok || !RETRYABLE.has(res.status)) return res;
      if (attempt === 3) return res;
      console.warn(`${label} ${res.status} — retrying in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
    return fn();
  }

  private async valuesWrite(token: string, sid: string, data: { range: string; values: any[][] }[]): Promise<void> {
    const res = await this.fetchWithRetry('Values write', () =>
      fetch(`${SHEETS_BASE}/${sid}/values:batchUpdate`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ valueInputOption: 'RAW', data }),
      })
    );
    if (!res.ok) throw new Error(`Values write ${res.status}: ${await res.text()}`);
  }

  private async valuesRead(token: string, sid: string, ranges: string[]): Promise<any> {
    const params = ranges.map(r => `ranges=${encodeURIComponent(r)}`).join('&');
    const res = await this.fetchWithRetry('Values read', () =>
      fetch(`${SHEETS_BASE}/${sid}/values:batchGet?${params}`, {
        headers: { Authorization: 'Bearer ' + token },
      })
    );
    if (!res.ok) throw new Error(`Values read ${res.status}: ${await res.text()}`);
    return res.json();
  }

  private async formatWrite(token: string, sid: string, requests: any[]): Promise<void> {
    const res = await this.fetchWithRetry('Format write', () =>
      fetch(`${SHEETS_BASE}/${sid}:batchUpdate`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests }),
      })
    );
    if (!res.ok) throw new Error(`Format write ${res.status}: ${await res.text()}`);
  }

  // ── Data helpers ──────────────────────────────────────────────────────────────

  private groupByYear(keys: string[]): Map<number, string[]> {
    const map = new Map<number, string[]>();
    keys.forEach(k => {
      const y = parseInt(k.split('-')[0]);
      if (!map.has(y)) map.set(y, []);
      map.get(y)!.push(k);
    });
    return map;
  }

  private subsetData(data: AllData, keys: string[]): AllData {
    return Object.fromEntries(keys.filter(k => data[k]).map(k => [k, data[k]])) as AllData;
  }

  private toMonthLabel(mk: string): string {
    const [, m] = mk.split('-').map(Number);
    const year  = mk.split('-')[0];
    return `${MONTH_NAMES[m - 1].slice(0, 3)} ${year}`;  // "Aug 2026"
  }

  private txnRows(monthKeys: string[]): any[][] {
    const rows: any[][] = [['MonthKey','ID','Date','Type','Category','Item','Amount','Note','Source']];
    this.txnSvc.allTxnsFlat()
      .filter(t => monthKeys.includes(t.monthKey))
      .forEach(t => rows.push([t.monthKey, t.id, t.date, t.type, t.category, t.item, t.amount, t.note, t.source]));
    return rows;
  }

  // ── Data conversion (unchanged logic) ────────────────────────────────────────

  dataToRows(data: AllData): any[][] {
    const rows: any[][] = [['MonthKey','Mode','Type','Category','Item','Amount','ID']];
    Object.entries(data).forEach(([mk, md]) => {
      (['estimates','final'] as const).forEach(mode => {
        (['income','expenses'] as const).forEach(type => {
          Object.entries(md[mode][type]).forEach(([cat, catData]) => {
            catData.items.forEach(item => rows.push([mk, mode, type, cat, item.name, item.amount, item.id]));
          });
        });
      });
    });
    return rows;
  }

  rowsToData(rows: any[][]): AllData {
    const data: AllData = {};
    const modeMap: Record<string,string> = { estimate:'estimates', estimates:'estimates', final:'final' };
    const typeMap: Record<string,string> = { income:'income', expense:'expenses', expenses:'expenses' };
    rows.slice(1).forEach(r => {
      const [mk, mRaw, tRaw, cat, itemName, amount, itemId] = r.map((c:any) => String(c ?? ''));
      const mode = modeMap[mRaw?.toLowerCase()] || mRaw;
      const type = typeMap[tRaw?.toLowerCase()] || tRaw;
      if (!mk || !mode || !type || !cat) return;
      if (!data[mk]) data[mk] = { estimates:{income:{},expenses:{}}, final:{income:{},expenses:{}}, transactions:[] };
      const sec = (data[mk] as any)[mode]?.[type];
      if (!sec) return;
      if (!sec[cat]) sec[cat] = { collapsed: false, items: [] };
      if (itemName) {
        const amt = parseFloat(amount) || 0;
        const byId = itemId ? sec[cat].items.find((i:any) => i.id === itemId) : null;
        if (byId) { if (amt) byId.amount = amt; }
        else {
          const byName = sec[cat].items.find((i:any) => i.name === itemName);
          if (byName) { if (amt) byName.amount = amt; }
          else sec[cat].items.push({ id: itemId || Math.random().toString(36).slice(2,9), name: itemName, amount: amt });
        }
      }
    });
    return data;
  }
}
